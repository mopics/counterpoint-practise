# Content Library Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `src/content/**` tune files and the override-layer persistence server with a fully server-owned content library that has first-class, browsable folders (create/rename/delete) and a breadcrumb-navigated sidebar.

**Architecture:** The server's storage moves from `{overrides, tunes}` (path-keyed, layered on static content) to a single flat directory of `{folder, tune}` records identified by permanent server-generated `id`s and linked via `parentId` pointers. The frontend fetches the whole library once, builds an in-memory id/parent index, and drives a folder-at-a-time sidebar off it — no more static-tree merge logic. A one-time migration script ports today's `FILE_TREE` into that format before the static files are deleted.

**Tech Stack:** Same as the prior persistence-server work — Express (server), MobX (frontend stores), Vitest + Supertest (tests), `tsx` for running server-side TS.

**Spec:** `docs/superpowers/specs/2026-08-15-content-library-folders-design.md`

## Global Constraints

- Every mutating server route resolves a record by `id` lookup against the already-loaded listing before touching the filesystem — never build a path directly from `req.params.id`. (Spec: API surface)
- `id` is permanent once generated; only `title` changes on rename. (Spec: Data model & storage)
- Folder delete is rejected (409) if the folder has any children — no cascading delete. (Spec: Non-goals, API surface)
- The `key`/`AbcData` dual-identifier system is retired; every consumer uses `TuneRecord.id` as the sole identifier. (Spec: Data model & storage)
- `server/migrate.ts` and its test must be excluded from `tsconfig.server.json`'s type-checked file set (same cross-project resolution conflict the original `tuneStore.ts` hit), but must still run correctly under `tsx` and be tested under Vitest.
- Migrated content (`server/data/library/*.json`) gets committed to git — it becomes the only copy of this content once `src/content/**` is deleted.

---

## Task 1: Server — `libraryStore.ts` (folder + tune CRUD)

**Files:**
- Create: `server/libraryStore.ts`
- Test: `server/libraryStore.test.ts`

**Interfaces:**
- Produces: `VideoRef`, `FolderRecord`, `TuneRecord`, `LibraryNode = FolderRecord | TuneRecord`, `FolderInput { parentId: string | null; title: string }`, `FolderEditInput { title: string }`, `TuneInput { parentId: string | null; title: string; data: string; video?: VideoRef }`, `TuneEditInput { title: string; data: string; video?: VideoRef }`, `LibraryStore` interface, `createLibraryStore(dataDir: string): LibraryStore`, `isValidId(id: string): boolean`, `InvalidIdError`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/libraryStore.test.ts
// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryStore, InvalidIdError, isValidId, type LibraryStore } from './libraryStore.ts';

describe('libraryStore', () => {
  let dataDir: string;
  let store: LibraryStore;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'library-store-test-'));
    store = createLibraryStore(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('lists nothing before anything is written', async () => {
    expect(await store.listNodes()).toEqual([]);
  });

  it('creates a folder at the root and lists it', async () => {
    const record = await store.createFolder({ parentId: null, title: 'Tunes' });
    expect(record).toMatchObject({ type: 'folder', parentId: null, title: 'Tunes' });
    expect(record.id).toMatch(/^tunes-[0-9a-f]{8}$/);
    expect(await store.listNodes()).toEqual([record]);
  });

  it('creates a tune under a folder', async () => {
    const folder = await store.createFolder({ parentId: null, title: 'Tunes' });
    const tune = await store.createTune({ parentId: folder.id, title: 'Cherokee', data: 'X:1\n' });
    expect(tune).toMatchObject({ type: 'tune', parentId: folder.id, title: 'Cherokee', data: 'X:1\n' });
    const nodes = await store.listNodes();
    expect(nodes).toHaveLength(2);
  });

  it('two folders with the same title get distinct ids', async () => {
    const a = await store.createFolder({ parentId: null, title: 'Tunes' });
    const b = await store.createFolder({ parentId: null, title: 'Tunes' });
    expect(a.id).not.toBe(b.id);
  });

  it('renameFolder updates title, preserves id/parentId/createdAt', async () => {
    const folder = await store.createFolder({ parentId: null, title: 'Tunes' });
    const renamed = await store.renameFolder(folder.id, { title: 'Jazz Standards' });
    expect(renamed).toMatchObject({ id: folder.id, parentId: null, title: 'Jazz Standards', createdAt: folder.createdAt });
  });

  it('renameFolder returns undefined for an unknown id', async () => {
    expect(await store.renameFolder('does-not-exist', { title: 'X' })).toBeUndefined();
  });

  it('renameFolder returns undefined when the id belongs to a tune, not a folder', async () => {
    const tune = await store.createTune({ parentId: null, title: 'Cherokee', data: '' });
    expect(await store.renameFolder(tune.id, { title: 'X' })).toBeUndefined();
  });

  it('updateTune edits title/data/video in place, preserving id/parentId/createdAt', async () => {
    const tune = await store.createTune({ parentId: null, title: 'Draft', data: 'X:1\n' });
    const updated = await store.updateTune(tune.id, { title: 'Final', data: 'X:1\nT:Final\n' });
    expect(updated).toMatchObject({ id: tune.id, parentId: null, title: 'Final', data: 'X:1\nT:Final\n', createdAt: tune.createdAt });
  });

  it('updateTune returns undefined for an unknown id', async () => {
    expect(await store.updateTune('does-not-exist', { title: 'X', data: '' })).toBeUndefined();
  });

  it('updateTune returns undefined when the id belongs to a folder, not a tune', async () => {
    const folder = await store.createFolder({ parentId: null, title: 'Tunes' });
    expect(await store.updateTune(folder.id, { title: 'X', data: '' })).toBeUndefined();
  });

  it('deleteFolder removes an empty folder', async () => {
    const folder = await store.createFolder({ parentId: null, title: 'Tunes' });
    expect(await store.deleteFolder(folder.id)).toBe('deleted');
    expect(await store.listNodes()).toEqual([]);
  });

  it('deleteFolder rejects a non-empty folder without deleting anything', async () => {
    const folder = await store.createFolder({ parentId: null, title: 'Tunes' });
    await store.createTune({ parentId: folder.id, title: 'Cherokee', data: '' });
    expect(await store.deleteFolder(folder.id)).toBe('not-empty');
    expect(await store.listNodes()).toHaveLength(2);
  });

  it('deleteFolder returns not-found for an unknown id, and for a tune id', async () => {
    expect(await store.deleteFolder('does-not-exist')).toBe('not-found');
    const tune = await store.createTune({ parentId: null, title: 'Cherokee', data: '' });
    expect(await store.deleteFolder(tune.id)).toBe('not-found');
  });

  it('deleteTune removes a tune; false for an unknown id or a folder id', async () => {
    const tune = await store.createTune({ parentId: null, title: 'Cherokee', data: '' });
    expect(await store.deleteTune(tune.id)).toBe(true);
    expect(await store.listNodes()).toEqual([]);
    expect(await store.deleteTune('does-not-exist')).toBe(false);
    const folder = await store.createFolder({ parentId: null, title: 'Tunes' });
    expect(await store.deleteTune(folder.id)).toBe(false);
  });

  it('skips a malformed JSON file instead of failing the whole list', async () => {
    await store.createTune({ parentId: null, title: 'Good', data: '' });
    await writeFile(path.join(dataDir, 'zzz-bad.json'), '{not valid json');
    const nodes = await store.listNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.title).toBe('Good');
  });

  describe('isValidId', () => {
    it('accepts server-generated-shaped ids', () => {
      expect(isValidId('tunes-4f3a9c2b')).toBe(true);
      expect(isValidId('cherokee-1a2b3c4d')).toBe(true);
    });

    it('rejects empty, dot, dot-dot, slash, and backslash', () => {
      expect(isValidId('')).toBe(false);
      expect(isValidId('.')).toBe(false);
      expect(isValidId('..')).toBe(false);
      expect(isValidId('a/b')).toBe(false);
      expect(isValidId('..\\..\\evil')).toBe(false);
    });
  });

  describe('path traversal hardening', () => {
    it('an id-lookup miss never touches the filesystem outside dataDir — updateTune with a crafted id 404s cleanly', async () => {
      const result = await store.updateTune('..\\..\\..\\evil', { title: 'x', data: '' });
      expect(result).toBeUndefined();
    });

    it('deleteTune with a crafted id returns false rather than throwing or deleting anything', async () => {
      await expect(store.deleteTune('..\\..\\..\\evil')).resolves.toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/libraryStore.test.ts`
Expected: FAIL — `./libraryStore.ts` does not exist yet.

- [ ] **Step 3: Implement `server/libraryStore.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface VideoRef {
  url: string;
  start: string;
  end: string;
}

export interface FolderRecord {
  id: string;
  type: 'folder';
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TuneRecord {
  id: string;
  type: 'tune';
  parentId: string | null;
  title: string;
  data: string;
  video?: VideoRef;
  createdAt: string;
  updatedAt: string;
}

export type LibraryNode = FolderRecord | TuneRecord;

export interface FolderInput {
  parentId: string | null;
  title: string;
}

export interface FolderEditInput {
  title: string;
}

export interface TuneInput {
  parentId: string | null;
  title: string;
  data: string;
  video?: VideoRef;
}

export interface TuneEditInput {
  title: string;
  data: string;
  video?: VideoRef;
}

export interface LibraryStore {
  listNodes(): Promise<LibraryNode[]>;
  createFolder(input: FolderInput): Promise<FolderRecord>;
  renameFolder(id: string, input: FolderEditInput): Promise<FolderRecord | undefined>;
  deleteFolder(id: string): Promise<'deleted' | 'not-found' | 'not-empty'>;
  createTune(input: TuneInput): Promise<TuneRecord>;
  updateTune(id: string, input: TuneEditInput): Promise<TuneRecord | undefined>;
  deleteTune(id: string): Promise<boolean>;
}

export class InvalidIdError extends Error {}

const ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * `id` comes straight from a URL param on an unauthenticated server, so it's
 * untrusted input wherever it's used to build a filename. Real ids are always
 * server-generated (see generateId below); this just rejects anything that
 * couldn't possibly be one before it ever reaches a filesystem path.
 */
export function isValidId(id: string): boolean {
  return !!id && id !== '.' && id !== '..' && ID_PATTERN.test(id);
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

function generateId(title: string): string {
  return `${slugify(title)}-${randomUUID().slice(0, 8)}`;
}

function nodeFilename(id: string): string {
  if (!isValidId(id)) throw new InvalidIdError(`invalid id: ${id}`);
  return `${id}.json`;
}

/** Defense in depth: even a validated id must resolve to a path inside `dataDir`. */
function resolveWithin(dataDir: string, filename: string): string {
  const full = path.resolve(dataDir, filename);
  const base = path.resolve(dataDir) + path.sep;
  if (!full.startsWith(base)) throw new InvalidIdError(`path escapes data directory: ${filename}`);
  return full;
}

export function createLibraryStore(dataDir: string): LibraryStore {
  async function ensureDir(): Promise<void> {
    await mkdir(dataDir, { recursive: true });
  }

  async function readAll(): Promise<LibraryNode[]> {
    await ensureDir();
    const entries = await readdir(dataDir);
    const nodes: LibraryNode[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(dataDir, entry), 'utf-8');
        nodes.push(JSON.parse(raw) as LibraryNode);
      } catch {
        // Skip a malformed/unreadable file rather than failing the whole list.
      }
    }
    return nodes;
  }

  async function writeNode(node: LibraryNode): Promise<void> {
    await ensureDir();
    const filePath = resolveWithin(dataDir, nodeFilename(node.id));
    await writeFile(filePath, JSON.stringify(node, null, 2));
  }

  // Never builds a path directly from a caller-supplied id — every mutating
  // method below looks the id up in the current listing first, and only
  // ever acts on the *found* record's own (always-valid, self-generated) id.
  async function findById(id: string): Promise<LibraryNode | undefined> {
    const nodes = await readAll();
    return nodes.find((n) => n.id === id);
  }

  return {
    listNodes: readAll,

    async createFolder(input) {
      const now = new Date().toISOString();
      const record: FolderRecord = {
        id: generateId(input.title),
        type: 'folder',
        parentId: input.parentId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      };
      await writeNode(record);
      return record;
    },

    async renameFolder(id, input) {
      const existing = await findById(id);
      if (!existing || existing.type !== 'folder') return undefined;
      const record: FolderRecord = { ...existing, title: input.title, updatedAt: new Date().toISOString() };
      await writeNode(record);
      return record;
    },

    async deleteFolder(id) {
      const existing = await findById(id);
      if (!existing || existing.type !== 'folder') return 'not-found';
      const nodes = await readAll();
      if (nodes.some((n) => n.parentId === id)) return 'not-empty';
      await ensureDir();
      await rm(resolveWithin(dataDir, nodeFilename(existing.id)), { force: true });
      return 'deleted';
    },

    async createTune(input) {
      const now = new Date().toISOString();
      const record: TuneRecord = {
        id: generateId(input.title),
        type: 'tune',
        parentId: input.parentId,
        title: input.title,
        data: input.data,
        video: input.video,
        createdAt: now,
        updatedAt: now,
      };
      await writeNode(record);
      return record;
    },

    async updateTune(id, input) {
      const existing = await findById(id);
      if (!existing || existing.type !== 'tune') return undefined;
      const record: TuneRecord = {
        ...existing,
        title: input.title,
        data: input.data,
        video: input.video,
        updatedAt: new Date().toISOString(),
      };
      await writeNode(record);
      return record;
    },

    async deleteTune(id) {
      const existing = await findById(id);
      if (!existing || existing.type !== 'tune') return false;
      await ensureDir();
      await rm(resolveWithin(dataDir, nodeFilename(existing.id)), { force: true });
      return true;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/libraryStore.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add server/libraryStore.ts server/libraryStore.test.ts
git commit -m "Add server-side folder/tune library store with id-based CRUD"
```

---

## Task 2: Server — request validation for the library API

**Files:**
- Create: `server/validation.ts` (this replaces the existing file of the same name — see Task 4 for deleting the old `tuneStore.ts`-based version; here you're writing its full replacement content)

**Interfaces:**
- Consumes: `FolderInput`, `FolderEditInput`, `TuneInput`, `TuneEditInput` from `./libraryStore.ts` (Task 1)
- Produces: `parseFolderInput(body: unknown): FolderInput | null`, `parseFolderEditInput(body: unknown): FolderEditInput | null`, `parseTuneInput(body: unknown): TuneInput | null`, `parseTuneEditInput(body: unknown): TuneEditInput | null` — consumed by Task 3's routes.

This task has no standalone test file — its behavior is exercised end-to-end by Task 3's route tests (a validation function with no I/O of its own is thin enough that testing it only through the HTTP layer that calls it avoids duplicate coverage).

- [ ] **Step 1: Write `server/validation.ts`**

```ts
import type { FolderEditInput, FolderInput, TuneEditInput, TuneInput } from './libraryStore.ts';

function isValidVideo(video: unknown): video is NonNullable<TuneInput['video']> {
  if (typeof video !== 'object' || video === null) return false;
  const { url, start, end } = video as Record<string, unknown>;
  return typeof url === 'string' && typeof start === 'string' && typeof end === 'string';
}

function parseParentId(value: unknown): { ok: true; parentId: string | null } | { ok: false } {
  if (value === null) return { ok: true, parentId: null };
  if (typeof value === 'string' && value.trim() !== '') return { ok: true, parentId: value };
  return { ok: false };
}

export function parseFolderInput(body: unknown): FolderInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { parentId, title } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  const parsedParent = parseParentId(parentId);
  if (!parsedParent.ok) return null;
  return { parentId: parsedParent.parentId, title };
}

export function parseFolderEditInput(body: unknown): FolderEditInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { title } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  return { title };
}

export function parseTuneInput(body: unknown): TuneInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { parentId, title, data, video } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof data !== 'string') return null;
  const parsedParent = parseParentId(parentId);
  if (!parsedParent.ok) return null;
  if (video !== undefined && !isValidVideo(video)) return null;
  return { parentId: parsedParent.parentId, title, data, video: video as TuneInput['video'] };
}

export function parseTuneEditInput(body: unknown): TuneEditInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const { title, data, video } = body as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (typeof data !== 'string') return null;
  if (video !== undefined && !isValidVideo(video)) return null;
  return { title, data, video: video as TuneEditInput['video'] };
}
```

- [ ] **Step 2: Commit** (bundled with Task 3, since this file has no independent test — commit both together after Task 3's tests pass)

---

## Task 3: Server — `routes/library.ts` (Express router)

**Files:**
- Create: `server/routes/library.ts`
- Test: `server/routes/library.test.ts`

**Interfaces:**
- Consumes: `LibraryStore` type from `./libraryStore.ts` (Task 1); `parseFolderInput`, `parseFolderEditInput`, `parseTuneInput`, `parseTuneEditInput` from `./validation.ts` (Task 2)
- Produces: `createLibraryRouter(store: LibraryStore): Router` — consumed by Task 4's `app.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/routes/library.test.ts
// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultApp } from '../app.ts';

describe('library routes', () => {
  let dataDir: string;
  let app: Express;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'library-routes-test-'));
    app = createDefaultApp(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('GET /api/library returns an empty node list initially', async () => {
    const res = await request(app).get('/api/library');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nodes: [] });
  });

  it('POST /api/library/folders creates a root folder', async () => {
    const res = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'folder', parentId: null, title: 'Tunes' });
  });

  it('POST /api/library/folders rejects a missing title', async () => {
    const res = await request(app).post('/api/library/folders').send({ parentId: null });
    expect(res.status).toBe(400);
  });

  it('POST /api/library/tunes creates a tune under a folder, and GET reflects it', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    const tune = await request(app)
      .post('/api/library/tunes')
      .send({ parentId: folder.body.id, title: 'Cherokee', data: 'X:1\n' });
    expect(tune.status).toBe(201);
    expect(tune.body).toMatchObject({ type: 'tune', parentId: folder.body.id, title: 'Cherokee' });

    const list = await request(app).get('/api/library');
    expect(list.body.nodes).toHaveLength(2);
  });

  it('POST /api/library/tunes rejects a body missing data', async () => {
    const res = await request(app).post('/api/library/tunes').send({ parentId: null, title: 'No data' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/library/folders/:id renames a folder', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    const renamed = await request(app).put(`/api/library/folders/${folder.body.id}`).send({ title: 'Jazz Standards' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: folder.body.id, title: 'Jazz Standards' });
  });

  it('PUT /api/library/folders/:id 404s for an unknown id', async () => {
    const res = await request(app).put('/api/library/folders/does-not-exist').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/library/folders/:id removes an empty folder', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    const res = await request(app).delete(`/api/library/folders/${folder.body.id}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/library/folders/:id returns 409 for a non-empty folder', async () => {
    const folder = await request(app).post('/api/library/folders').send({ parentId: null, title: 'Tunes' });
    await request(app).post('/api/library/tunes').send({ parentId: folder.body.id, title: 'Cherokee', data: '' });
    const res = await request(app).delete(`/api/library/folders/${folder.body.id}`);
    expect(res.status).toBe(409);
  });

  it('DELETE /api/library/folders/:id 404s for an unknown id', async () => {
    const res = await request(app).delete('/api/library/folders/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('PUT /api/library/tunes/:id edits an existing tune', async () => {
    const created = await request(app).post('/api/library/tunes').send({ parentId: null, title: 'Draft', data: 'X:1\n' });
    const edited = await request(app)
      .put(`/api/library/tunes/${created.body.id}`)
      .send({ title: 'Final', data: 'X:1\nT:Final\n' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id: created.body.id, title: 'Final' });
  });

  it('PUT /api/library/tunes/:id 404s for an unknown id', async () => {
    const res = await request(app).put('/api/library/tunes/does-not-exist').send({ title: 'X', data: '' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/library/tunes/:id removes a tune, 404s the second time', async () => {
    const created = await request(app).post('/api/library/tunes').send({ parentId: null, title: 'Temp', data: '' });
    const first = await request(app).delete(`/api/library/tunes/${created.body.id}`);
    expect(first.status).toBe(204);
    const second = await request(app).delete(`/api/library/tunes/${created.body.id}`);
    expect(second.status).toBe(404);
  });

  it('a path-traversal id on PUT /api/library/tunes/:id is rejected with 400 or 404, not a filesystem write', async () => {
    const res = await request(app)
      .put(`/api/library/tunes/${encodeURIComponent('..\\..\\..\\evil')}`)
      .send({ title: 'x', data: '' });
    expect([400, 404]).toContain(res.status);
  });

  it('malformed JSON body yields 400, not a crash', async () => {
    const res = await request(app)
      .post('/api/library/tunes')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/library.test.ts`
Expected: FAIL — `../app.ts` doesn't yet export a working `createDefaultApp` wired to this router (Task 4 does that wiring; for now this task's own router file doesn't exist yet either).

- [ ] **Step 3: Implement `server/routes/library.ts`**

```ts
import { Router } from 'express';
import type { LibraryStore } from '../libraryStore.ts';
import { parseFolderEditInput, parseFolderInput, parseTuneEditInput, parseTuneInput } from '../validation.ts';

export function createLibraryRouter(store: LibraryStore): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const nodes = await store.listNodes();
      res.json({ nodes });
    } catch (err) {
      next(err);
    }
  });

  router.post('/folders', async (req, res, next) => {
    try {
      const input = parseFolderInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'parentId and title are required' });
        return;
      }
      const record = await store.createFolder(input);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.put('/folders/:id', async (req, res, next) => {
    try {
      const input = parseFolderEditInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      const record = await store.renameFolder(req.params.id, input);
      if (!record) {
        res.status(404).json({ error: 'folder not found' });
        return;
      }
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/folders/:id', async (req, res, next) => {
    try {
      const result = await store.deleteFolder(req.params.id);
      if (result === 'not-found') {
        res.status(404).json({ error: 'folder not found' });
        return;
      }
      if (result === 'not-empty') {
        res.status(409).json({ error: 'folder is not empty' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/tunes', async (req, res, next) => {
    try {
      const input = parseTuneInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'parentId, title, and data are required' });
        return;
      }
      const record = await store.createTune(input);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.put('/tunes/:id', async (req, res, next) => {
    try {
      const input = parseTuneEditInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'title and data are required' });
        return;
      }
      const record = await store.updateTune(req.params.id, input);
      if (!record) {
        res.status(404).json({ error: 'tune not found' });
        return;
      }
      res.json(record);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tunes/:id', async (req, res, next) => {
    try {
      const deleted = await store.deleteTune(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'tune not found' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Run tests to verify they pass (after Task 4 wires `app.ts`)**

This task's tests depend on Task 4's `app.ts` changes to pass. Implement Task 4 immediately after this step, then run:

Run: `npx vitest run server/routes/library.test.ts server/validation.ts`
Expected: PASS

- [ ] **Step 5: Commit** (bundled with Task 4 — see that task's commit step)

---

## Task 4: Server — rewire `app.ts`/`index.ts`, delete the old override-based server code

**Files:**
- Modify: `server/app.ts`
- Modify: `server/index.ts`
- Modify: `tsconfig.server.json`
- Delete: `server/tuneStore.ts`
- Delete: `server/tuneStore.test.ts`
- Delete: `server/routes/tunes.ts`
- Delete: `server/routes/tunes.test.ts`
- Delete: `server/data/overrides/.gitkeep`
- Delete: `server/data/tunes/.gitkeep`

**Interfaces:**
- Consumes: `createLibraryRouter` from `./routes/library.ts` (Task 3), `createLibraryStore`, `InvalidIdError`, `LibraryStore` from `./libraryStore.ts` (Task 1)
- Produces: `createApp(store: LibraryStore): express.Express`, `createDefaultApp(dataDir: string): express.Express` — consumed by `server/index.ts` and by Task 3's tests.

- [ ] **Step 1: Delete the old server files**

```bash
rm server/tuneStore.ts server/tuneStore.test.ts server/routes/tunes.ts server/routes/tunes.test.ts
rm server/data/overrides/.gitkeep server/data/tunes/.gitkeep
rmdir server/data/overrides server/data/tunes 2>/dev/null || true
```

- [ ] **Step 2: Rewrite `server/app.ts`**

```ts
import express, { type ErrorRequestHandler } from 'express';
import { createLibraryRouter } from './routes/library.ts';
import { createLibraryStore, InvalidIdError, type LibraryStore } from './libraryStore.ts';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: unknown }).status === 400) {
    res.status(400).json({ error: 'malformed JSON body' });
    return;
  }
  if (err instanceof InvalidIdError) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
};

export function createApp(store: LibraryStore): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/library', createLibraryRouter(store));
  app.use(errorHandler);
  return app;
}

export function createDefaultApp(dataDir: string): express.Express {
  return createApp(createLibraryStore(dataDir));
}
```

- [ ] **Step 3: Rewrite `server/index.ts`**

```ts
import path from 'node:path';
import { createDefaultApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = path.join(process.cwd(), 'server', 'data', 'library');

const app = createDefaultApp(DATA_DIR);

app.listen(PORT, () => {
  console.log(`Library persistence server listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Update `tsconfig.server.json` to exclude the migration script (added in Task 5)**

```json
{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo"
  },
  "include": ["server"],
  "exclude": ["server/migrate.ts", "server/migrate.test.ts"]
}
```

- [ ] **Step 5: Run the server test suite**

Run: `npx vitest run server/`
Expected: PASS — `libraryStore.test.ts` and `library.test.ts` (Tasks 1 and 3) both green now that `app.ts` wires them together.

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b --force`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/app.ts server/index.ts server/validation.ts server/routes/library.ts server/routes/library.test.ts tsconfig.server.json
git add -u server/tuneStore.ts server/tuneStore.test.ts server/routes/tunes.ts server/routes/tunes.test.ts server/data
git commit -m "Replace override-based server API with folder/tune library API"
```

---

## Task 5: Server — migration script

**Files:**
- Create: `server/migrate.ts`
- Test: `server/migrate.test.ts`

**Interfaces:**
- Consumes: `FolderRecord`, `TuneRecord`, `LibraryNode` from `./libraryStore.ts` (Task 1); `FILE_TREE`, `AbcData` from `../src/content/index.ts` (still present at this point — deleted only in Task 12)
- Produces: `slugify(title: string): string`, `buildRecords(tree: AbcData[], generateId: (title: string) => string, now?: () => string): LibraryNode[]` — a pure, testable core, separate from the script's `main()` I/O wrapper.

This file (and its test) are excluded from `tsconfig.server.json` (Task 4, Step 4) because `../src/content/index.ts` uses extensionless relative imports that are only valid under the app project's bundler resolution, not this project's `nodenext` resolution — the same conflict the original `tuneStore.ts` hit and avoided. `tsx` (running the script) and Vitest (running its test) both resolve modules independently of that tsconfig, so this works at runtime and under test despite never being type-checked by `tsc -b`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/migrate.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AbcData } from '../src/content/index.ts';
import { buildRecords, slugify } from './migrate.ts';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Jens Larsen - Coltrane Patterns')).toBe('jens-larsen-coltrane-patterns');
  });

  it('falls back to "item" for a title with no alphanumeric characters', () => {
    expect(slugify('***')).toBe('item');
  });
});

describe('buildRecords', () => {
  const FIXED_TIME = () => '2026-01-01T00:00:00.000Z';

  it('converts root-level leaves into root-level tune records, in order', () => {
    const tree: AbcData[] = [
      { id: 'a', title: 'Tune A', data: 'X:1\nA\n' },
      { id: 'b', title: 'Tune B', data: 'X:1\nB\n' },
    ];
    let counter = 0;
    const records = buildRecords(tree, () => `id-${counter++}`, FIXED_TIME);

    expect(records).toEqual([
      { id: 'id-0', type: 'tune', parentId: null, title: 'Tune A', data: 'X:1\nA\n', video: undefined, createdAt: FIXED_TIME(), updatedAt: FIXED_TIME() },
      { id: 'id-1', type: 'tune', parentId: null, title: 'Tune B', data: 'X:1\nB\n', video: undefined, createdAt: FIXED_TIME(), updatedAt: FIXED_TIME() },
    ]);
  });

  it('preserves nesting: a folder record is created and its children get parentId set to it', () => {
    const tree: AbcData[] = [
      {
        id: 'folder', title: 'A Folder', children: [
          { id: 'leaf', title: 'A Tune', data: 'X:1\n' },
        ],
      },
    ];
    let counter = 0;
    const records = buildRecords(tree, () => `id-${counter++}`, FIXED_TIME);

    expect(records).toHaveLength(2);
    const folder = records.find((r) => r.type === 'folder');
    const tune = records.find((r) => r.type === 'tune');
    expect(folder).toMatchObject({ id: 'id-0', type: 'folder', title: 'A Folder', parentId: null });
    expect(tune).toMatchObject({ id: 'id-1', type: 'tune', title: 'A Tune', parentId: 'id-0' });
  });

  it('handles multiple levels of nesting, wiring each level to its immediate parent', () => {
    const tree: AbcData[] = [
      {
        id: 'outer', title: 'Outer', children: [
          {
            id: 'inner', title: 'Inner', children: [
              { id: 'leaf', title: 'Deep Tune', data: 'X:1\n' },
            ],
          },
        ],
      },
    ];
    let counter = 0;
    const records = buildRecords(tree, () => `id-${counter++}`, FIXED_TIME);

    const outer = records.find((r) => r.title === 'Outer');
    const inner = records.find((r) => r.title === 'Inner');
    const leaf = records.find((r) => r.title === 'Deep Tune');
    expect(outer?.parentId).toBeNull();
    expect(inner?.parentId).toBe(outer?.id);
    expect(leaf?.parentId).toBe(inner?.id);
  });

  it('carries the video field through when present, and leaves it undefined when absent', () => {
    const tree: AbcData[] = [
      { id: 'a', title: 'Tune A', data: 'X:1\n', video: { url: 'https://youtu.be/x', start: '0:00', end: '1:00' } },
      { id: 'b', title: 'Tune B', data: 'X:1\n' },
    ];
    const records = buildRecords(tree, (title) => slugify(title), FIXED_TIME);
    expect(records[0]).toMatchObject({ video: { url: 'https://youtu.be/x', start: '0:00', end: '1:00' } });
    expect(records[1]).toMatchObject({ video: undefined });
  });

  it('defaults a leaf with no data field to an empty string', () => {
    const tree: AbcData[] = [{ id: 'a', title: 'Empty Tune' }];
    const records = buildRecords(tree, (title) => slugify(title), FIXED_TIME);
    expect(records[0]).toMatchObject({ type: 'tune', data: '' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/migrate.test.ts`
Expected: FAIL — `./migrate.ts` does not exist yet.

- [ ] **Step 3: Implement `server/migrate.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FILE_TREE, type AbcData } from '../src/content/index.ts';
import type { FolderRecord, LibraryNode, TuneRecord } from './libraryStore.ts';

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

/**
 * Pure conversion of the static content tree into flat, parentId-linked
 * library records. `generateId` and `now` are injected so this is fully
 * deterministic under test; `main()` below supplies the real ones.
 */
export function buildRecords(
  tree: AbcData[],
  generateId: (title: string) => string,
  now: () => string = () => new Date().toISOString(),
): LibraryNode[] {
  const records: LibraryNode[] = [];

  function walk(nodes: AbcData[], parentId: string | null): void {
    for (const node of nodes) {
      const id = generateId(node.title);
      const timestamp = now();
      if (node.children) {
        const record: FolderRecord = { id, type: 'folder', parentId, title: node.title, createdAt: timestamp, updatedAt: timestamp };
        records.push(record);
        walk(node.children, id);
      } else {
        const record: TuneRecord = {
          id,
          type: 'tune',
          parentId,
          title: node.title,
          data: node.data ?? '',
          video: node.video,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        records.push(record);
      }
    }
  }

  walk(tree, null);
  return records;
}

async function main(): Promise<void> {
  const dataDir = path.join(process.cwd(), 'server', 'data', 'library');
  await mkdir(dataDir, { recursive: true });

  const existing = await readdir(dataDir);
  if (existing.length > 0) {
    console.error(`Refusing to migrate: ${dataDir} already contains ${existing.length} file(s). Delete them first if you really want to re-run this.`);
    process.exitCode = 1;
    return;
  }

  const records = buildRecords(FILE_TREE, (title) => `${slugify(title)}-${randomUUID().slice(0, 8)}`);
  for (const record of records) {
    await writeFile(path.join(dataDir, `${record.id}.json`), JSON.stringify(record, null, 2));
  }

  const folderCount = records.filter((r) => r.type === 'folder').length;
  const tuneCount = records.filter((r) => r.type === 'tune').length;
  console.log(`Migrated ${folderCount} folder(s) and ${tuneCount} tune(s) into ${dataDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/migrate.test.ts`
Expected: PASS

- [ ] **Step 5: Confirm `tsc -b` still ignores this file**

Run: `npx tsc -b --force`
Expected: no errors (the `exclude` added in Task 4 keeps `migrate.ts`/`migrate.test.ts` out of the type-checked set).

- [ ] **Step 6: Commit**

```bash
git add server/migrate.ts server/migrate.test.ts
git commit -m "Add one-time migration script from static content to the library store"
```

---

## Task 6: Frontend — rewrite `src/api/tunesClient.ts`

**Files:**
- Modify: `src/api/tunesClient.ts`
- Modify: `src/api/tunesClient.test.ts`

**Interfaces:**
- Produces: `VideoRef`, `FolderRecord`, `TuneRecord`, `LibraryNode`, `LibraryListing { nodes: LibraryNode[] }`, `CreateFolderInput { parentId: string | null; title: string }`, `RenameFolderInput { title: string }`, `CreateTuneInput { parentId: string | null; title: string; data: string; video?: VideoRef }`, `SaveTuneInput { title: string; data: string; video?: VideoRef }`, and functions `fetchLibrary()`, `createFolder()`, `renameFolder()`, `deleteFolder()`, `createTune()`, `saveTune()`, `deleteTune()` — consumed by Task 7's `LibraryStore` and Task 8's `EditorStore`.

This is the new canonical home for the tune/folder record types (replacing `AbcData`, which lived in `src/content/index.ts` and is deleted in Task 12).

- [ ] **Step 1: Write the failing tests**

```ts
// src/api/tunesClient.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolder, createTune, deleteFolder, deleteTune, fetchLibrary, renameFolder, saveTune } from './tunesClient';

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => impl());
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('tunesClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchLibrary', () => {
    it('returns the parsed listing on success', async () => {
      const listing = { nodes: [] };
      mockFetchOnce(() => jsonResponse(listing));
      await expect(fetchLibrary()).resolves.toEqual(listing);
    });

    it('returns null when fetch rejects', async () => {
      mockFetchOnce(() => Promise.reject(new Error('network down')));
      await expect(fetchLibrary()).resolves.toBeNull();
    });

    it('returns null on a non-2xx response', async () => {
      mockFetchOnce(() => new Response('', { status: 500 }));
      await expect(fetchLibrary()).resolves.toBeNull();
    });
  });

  describe('createFolder / renameFolder / deleteFolder', () => {
    it('createFolder returns the created record', async () => {
      const record = { id: 'tunes-abcd1234', type: 'folder', parentId: null, title: 'Tunes', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record, 201));
      await expect(createFolder({ parentId: null, title: 'Tunes' })).resolves.toEqual(record);
    });

    it('createFolder returns null when unreachable', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(createFolder({ parentId: null, title: 'Tunes' })).resolves.toBeNull();
    });

    it('renameFolder returns the updated record', async () => {
      const record = { id: 'tunes-abcd1234', type: 'folder', parentId: null, title: 'Jazz', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record));
      await expect(renameFolder('tunes-abcd1234', { title: 'Jazz' })).resolves.toEqual(record);
    });

    it('deleteFolder returns "deleted" on 204', async () => {
      mockFetchOnce(() => new Response(null, { status: 204 }));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('deleted');
    });

    it('deleteFolder returns "not-empty" on 409', async () => {
      mockFetchOnce(() => new Response('', { status: 409 }));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('not-empty');
    });

    it('deleteFolder returns "error" when unreachable or on any other non-2xx status', async () => {
      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('error');
      mockFetchOnce(() => new Response('', { status: 404 }));
      await expect(deleteFolder('tunes-abcd1234')).resolves.toBe('error');
    });
  });

  describe('createTune / saveTune / deleteTune', () => {
    it('createTune returns the created record', async () => {
      const record = { id: 'x-1234abcd', type: 'tune', parentId: null, title: 'X', data: '', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record, 201));
      await expect(createTune({ parentId: null, title: 'X', data: '' })).resolves.toEqual(record);
    });

    it('saveTune returns the updated record on success, null on 404', async () => {
      const record = { id: 'x-1234abcd', type: 'tune', parentId: null, title: 'X', data: 'edited', createdAt: 'now', updatedAt: 'now' };
      mockFetchOnce(() => jsonResponse(record));
      await expect(saveTune('x-1234abcd', { title: 'X', data: 'edited' })).resolves.toEqual(record);

      mockFetchOnce(() => new Response('', { status: 404 }));
      await expect(saveTune('unknown', { title: 'X', data: '' })).resolves.toBeNull();
    });

    it('deleteTune returns true on 204 and false when unreachable', async () => {
      mockFetchOnce(() => new Response(null, { status: 204 }));
      await expect(deleteTune('x-1234abcd')).resolves.toBe(true);

      mockFetchOnce(() => Promise.reject(new Error('offline')));
      await expect(deleteTune('x-1234abcd')).resolves.toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/tunesClient.test.ts`
Expected: FAIL — current `tunesClient.ts` doesn't export `createFolder`/`renameFolder`/`deleteFolder`/`fetchLibrary`.

- [ ] **Step 3: Rewrite `src/api/tunesClient.ts`**

```ts
export interface VideoRef {
  url: string;
  start: string;
  end: string;
}

export interface FolderRecord {
  id: string;
  type: 'folder';
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TuneRecord {
  id: string;
  type: 'tune';
  parentId: string | null;
  title: string;
  data: string;
  video?: VideoRef;
  createdAt: string;
  updatedAt: string;
}

export type LibraryNode = FolderRecord | TuneRecord;

export interface LibraryListing {
  nodes: LibraryNode[];
}

export interface CreateFolderInput {
  parentId: string | null;
  title: string;
}

export interface RenameFolderInput {
  title: string;
}

export interface CreateTuneInput {
  parentId: string | null;
  title: string;
  data: string;
  video?: VideoRef;
}

export interface SaveTuneInput {
  title: string;
  data: string;
  video?: VideoRef;
}

const BASE_URL = '/api/library';

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Every export here swallows network/parse failures and returns a sentinel
 * instead of throwing, mirroring printHandoff.ts's defensive style — a
 * missing/unreachable server should never crash the app. Callers that need
 * to tell the user an action failed track that themselves (see
 * EditorStore.save), since this layer only reports success/failure.
 */
export async function fetchLibrary(): Promise<LibraryListing | null> {
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) return null;
    return await parseJson<LibraryListing>(response);
  } catch {
    return null;
  }
}

export async function createFolder(input: CreateFolderInput): Promise<FolderRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<FolderRecord>(response);
  } catch {
    return null;
  }
}

export async function renameFolder(id: string, input: RenameFolderInput): Promise<FolderRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<FolderRecord>(response);
  } catch {
    return null;
  }
}

export async function deleteFolder(id: string): Promise<'deleted' | 'not-empty' | 'error'> {
  try {
    const response = await fetch(`${BASE_URL}/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.status === 204) return 'deleted';
    if (response.status === 409) return 'not-empty';
    return 'error';
  } catch {
    return 'error';
  }
}

export async function createTune(input: CreateTuneInput): Promise<TuneRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/tunes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<TuneRecord>(response);
  } catch {
    return null;
  }
}

export async function saveTune(id: string, input: SaveTuneInput): Promise<TuneRecord | null> {
  try {
    const response = await fetch(`${BASE_URL}/tunes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    return await parseJson<TuneRecord>(response);
  } catch {
    return null;
  }
}

export async function deleteTune(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/tunes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return response.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/tunesClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/tunesClient.ts src/api/tunesClient.test.ts
git commit -m "Rewrite tunesClient for the folder-aware library API"
```

---

## Task 7: Frontend — rewrite `LibraryStore`

**Files:**
- Modify: `src/stores/LibraryStore.ts`
- Modify: `src/stores/LibraryStore.test.ts`

**Interfaces:**
- Consumes: `fetchLibrary`, `createFolder`, `renameFolder`, `deleteFolder`, `createTune`, `saveTune`, `deleteTune`, `FolderRecord`, `TuneRecord`, `LibraryNode` from `../api/tunesClient` (Task 6)
- Produces: default-exported singleton with `currentFolderId: string | null`, `selected: TuneRecord | undefined`, `loaded: boolean`, `loadError: boolean`, `breadcrumb: FolderRecord[]` (computed), `childrenOf(folderId: string | null): LibraryNode[]`, `navigateTo(folderId: string | null): void`, `setSelected(tune: TuneRecord): void`, `createFolder(title: string): Promise<void>`, `createTune(title: string): Promise<TuneRecord | null>`, `rename(id: string, title: string): Promise<void>`, `remove(id: string): Promise<'deleted' | 'not-empty' | 'error'>`, `applyTuneEdit(record: TuneRecord): void` — consumed by Task 8's `EditorStore`, Task 9's `PlaybackStore`, Task 11's `Sidebar`, Task 13's `App.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/stores/LibraryStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderRecord, TuneRecord } from '../api/tunesClient';

const tunesClientMocks = vi.hoisted(() => ({
  fetchLibrary: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createTune: vi.fn(),
  saveTune: vi.fn(),
  deleteTune: vi.fn(),
}));
vi.mock('../api/tunesClient', () => tunesClientMocks);

function folder(overrides: Partial<FolderRecord> & { id: string; title: string }): FolderRecord {
  return { type: 'folder', parentId: null, createdAt: 'now', updatedAt: 'now', ...overrides };
}

function tune(overrides: Partial<TuneRecord> & { id: string; title: string }): TuneRecord {
  return { type: 'tune', parentId: null, data: '', createdAt: 'now', updatedAt: 'now', ...overrides };
}

describe('LibraryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function freshStore(nodes: (FolderRecord | TuneRecord)[]) {
    tunesClientMocks.fetchLibrary.mockResolvedValue({ nodes });
    vi.resetModules();
    const { default: libraryStore } = await import('./LibraryStore');
    // Allow the constructor's fire-and-forget load() to resolve.
    await Promise.resolve();
    await Promise.resolve();
    return libraryStore;
  }

  it('loadError is set and nothing crashes when the server is unreachable', async () => {
    tunesClientMocks.fetchLibrary.mockResolvedValue(null);
    vi.resetModules();
    const { default: libraryStore } = await import('./LibraryStore');
    await Promise.resolve();
    await Promise.resolve();
    expect(libraryStore.loadError).toBe(true);
    expect(libraryStore.selected).toBeUndefined();
  });

  it('after a successful load, selects the first tune depth-first and sets currentFolderId to its parent', async () => {
    const root = folder({ id: 'f1', title: 'Tunes' });
    const t = tune({ id: 't1', title: 'Cherokee', parentId: 'f1' });
    const libraryStore = await freshStore([root, t]);

    expect(libraryStore.loaded).toBe(true);
    expect(libraryStore.loadError).toBe(false);
    expect(libraryStore.selected?.id).toBe('t1');
    expect(libraryStore.currentFolderId).toBe('f1');
  });

  it('childrenOf(null) returns root-level nodes, folders before tunes, alphabetical within each group', async () => {
    const libraryStore = await freshStore([
      tune({ id: 't-z', title: 'Zebra Blues', parentId: null }),
      folder({ id: 'f-b', title: 'B Folder', parentId: null }),
      folder({ id: 'f-a', title: 'A Folder', parentId: null }),
      tune({ id: 't-a', title: 'Autumn Leaves', parentId: null }),
    ]);

    const children = libraryStore.childrenOf(null);
    expect(children.map((n) => n.id)).toEqual(['f-a', 'f-b', 't-a', 't-z']);
  });

  it('breadcrumb walks parentId up to root', async () => {
    const outer = folder({ id: 'outer', title: 'Outer', parentId: null });
    const inner = folder({ id: 'inner', title: 'Inner', parentId: 'outer' });
    const t = tune({ id: 't1', title: 'Leaf', parentId: 'inner' });
    const libraryStore = await freshStore([outer, inner, t]);

    libraryStore.navigateTo('inner');
    expect(libraryStore.breadcrumb.map((f) => f.id)).toEqual(['outer', 'inner']);
  });

  it('navigateTo updates currentFolderId without touching selected', async () => {
    const f = folder({ id: 'f1', title: 'Folder' });
    const t = tune({ id: 't1', title: 'Tune', parentId: null });
    const libraryStore = await freshStore([f, t]);

    const before = libraryStore.selected;
    libraryStore.navigateTo('f1');
    expect(libraryStore.currentFolderId).toBe('f1');
    expect(libraryStore.selected).toBe(before);
  });

  it('setSelected sets both selected and currentFolderId to the tune\'s parent', async () => {
    const f = folder({ id: 'f1', title: 'Folder' });
    const t = tune({ id: 't1', title: 'Tune', parentId: 'f1' });
    const libraryStore = await freshStore([f, t]);

    libraryStore.navigateTo(null);
    libraryStore.setSelected(t);
    expect(libraryStore.selected).toBe(t);
    expect(libraryStore.currentFolderId).toBe('f1');
  });

  it('createFolder posts under currentFolderId and adds the result to childrenOf', async () => {
    const libraryStore = await freshStore([]);
    const created = folder({ id: 'new-f', title: 'New Folder', parentId: null });
    tunesClientMocks.createFolder.mockResolvedValue(created);

    await libraryStore.createFolder('New Folder');

    expect(tunesClientMocks.createFolder).toHaveBeenCalledWith({ parentId: null, title: 'New Folder' });
    expect(libraryStore.childrenOf(null).map((n) => n.id)).toContain('new-f');
  });

  it('createFolder is a no-op locally when the API call fails', async () => {
    const libraryStore = await freshStore([]);
    tunesClientMocks.createFolder.mockResolvedValue(null);

    await libraryStore.createFolder('New Folder');

    expect(libraryStore.childrenOf(null)).toEqual([]);
  });

  it('createTune posts under currentFolderId, adds it, and selects it', async () => {
    const libraryStore = await freshStore([]);
    const created = tune({ id: 'new-t', title: 'New Tune', parentId: null });
    tunesClientMocks.createTune.mockResolvedValue(created);

    const result = await libraryStore.createTune('New Tune');

    expect(result).toEqual(created);
    expect(libraryStore.selected).toEqual(created);
    expect(libraryStore.childrenOf(null).map((n) => n.id)).toContain('new-t');
  });

  it('rename on a folder calls renameFolder and patches the local node', async () => {
    const f = folder({ id: 'f1', title: 'Old Name' });
    const libraryStore = await freshStore([f]);
    const renamed = folder({ id: 'f1', title: 'New Name' });
    tunesClientMocks.renameFolder.mockResolvedValue(renamed);

    await libraryStore.rename('f1', 'New Name');

    expect(tunesClientMocks.renameFolder).toHaveBeenCalledWith('f1', { title: 'New Name' });
    expect(libraryStore.childrenOf(null).find((n) => n.id === 'f1')?.title).toBe('New Name');
  });

  it('rename on a tune calls saveTune with its existing data/video, and updates `selected` if it was selected', async () => {
    const t = tune({ id: 't1', title: 'Old Title', data: 'X:1\n', parentId: null });
    const libraryStore = await freshStore([t]);
    const renamed = tune({ id: 't1', title: 'New Title', data: 'X:1\n', parentId: null });
    tunesClientMocks.saveTune.mockResolvedValue(renamed);

    await libraryStore.rename('t1', 'New Title');

    expect(tunesClientMocks.saveTune).toHaveBeenCalledWith('t1', { title: 'New Title', data: 'X:1\n', video: undefined });
    expect(libraryStore.selected?.title).toBe('New Title');
  });

  it('remove deletes a tune via the API and drops it locally', async () => {
    const t = tune({ id: 't1', title: 'Tune', parentId: null });
    const other = tune({ id: 't2', title: 'Other', parentId: null });
    const libraryStore = await freshStore([t, other]);
    tunesClientMocks.deleteTune.mockResolvedValue(true);

    const result = await libraryStore.remove('t1');

    expect(result).toBe('deleted');
    expect(libraryStore.childrenOf(null).map((n) => n.id)).toEqual(['t2']);
  });

  it('remove on the currently-selected tune re-selects another tune if one exists', async () => {
    const t1 = tune({ id: 't1', title: 'A Tune', parentId: null });
    const t2 = tune({ id: 't2', title: 'B Tune', parentId: null });
    const libraryStore = await freshStore([t1, t2]);
    tunesClientMocks.deleteTune.mockResolvedValue(true);

    expect(libraryStore.selected?.id).toBe('t1');
    await libraryStore.remove('t1');

    expect(libraryStore.selected?.id).toBe('t2');
  });

  it('remove on the last tune leaves `selected` undefined', async () => {
    const t1 = tune({ id: 't1', title: 'Only Tune', parentId: null });
    const libraryStore = await freshStore([t1]);
    tunesClientMocks.deleteTune.mockResolvedValue(true);

    await libraryStore.remove('t1');

    expect(libraryStore.selected).toBeUndefined();
  });

  it('remove surfaces "not-empty" for a non-empty folder without deleting anything locally', async () => {
    const f = folder({ id: 'f1', title: 'Folder' });
    const t = tune({ id: 't1', title: 'Tune', parentId: 'f1' });
    const libraryStore = await freshStore([f, t]);
    tunesClientMocks.deleteFolder.mockResolvedValue('not-empty');

    const result = await libraryStore.remove('f1');

    expect(result).toBe('not-empty');
    expect(libraryStore.childrenOf(null).map((n) => n.id)).toContain('f1');
  });

  it('applyTuneEdit patches the node in place and updates `selected` when it matches', async () => {
    const t = tune({ id: 't1', title: 'Original', data: 'X:1\n', parentId: null });
    const libraryStore = await freshStore([t]);
    const edited = tune({ id: 't1', title: 'Original', data: 'X:1\nEdited\n', parentId: null });

    libraryStore.applyTuneEdit(edited);

    expect(libraryStore.selected?.data).toBe('X:1\nEdited\n');
    expect(libraryStore.childrenOf(null).find((n) => n.id === 't1')).toEqual(edited);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/LibraryStore.test.ts`
Expected: FAIL — current `LibraryStore.ts` has none of this API yet.

- [ ] **Step 3: Rewrite `src/stores/LibraryStore.ts`**

```ts
import { actionBound, makeObservable, observable, observableRef, runInAction } from 'mobx';
import {
  createFolder as apiCreateFolder,
  createTune as apiCreateTune,
  deleteFolder as apiDeleteFolder,
  deleteTune as apiDeleteTune,
  fetchLibrary,
  renameFolder as apiRenameFolder,
  saveTune as apiSaveTune,
  type FolderRecord,
  type LibraryNode,
  type TuneRecord,
} from '../api/tunesClient';

function isFolder(node: LibraryNode): node is FolderRecord {
  return node.type === 'folder';
}

function byTitle(a: LibraryNode, b: LibraryNode): number {
  return a.title.localeCompare(b.title);
}

function firstTuneDepthFirst(parentId: string | null, byParent: Map<string | null, LibraryNode[]>): TuneRecord | undefined {
  const siblings = [...(byParent.get(parentId) ?? [])].sort(byTitle);
  for (const node of siblings) {
    if (!isFolder(node)) return node;
    const found = firstTuneDepthFirst(node.id, byParent);
    if (found) return found;
  }
  return undefined;
}

class LibraryStore {
  currentFolderId: string | null = null;
  selected: TuneRecord | undefined = undefined;
  loaded = false;
  loadError = false;

  private nodesById = new Map<string, LibraryNode>();
  private childrenByParent = new Map<string | null, LibraryNode[]>();

  constructor() {
    makeObservable(this, {
      currentFolderId: observable,
      selected: observableRef,
      loaded: observable,
      loadError: observable,
      navigateTo: actionBound,
      setSelected: actionBound,
      createFolder: actionBound,
      createTune: actionBound,
      rename: actionBound,
      remove: actionBound,
      applyTuneEdit: actionBound,
    });

    void this.load();
  }

  private async load(): Promise<void> {
    const listing = await fetchLibrary();
    runInAction(() => {
      if (!listing) {
        this.loadError = true;
        return;
      }
      this.loadError = false;
      this.loaded = true;
      this.rebuildIndexes(listing.nodes);
      const first = firstTuneDepthFirst(null, this.childrenByParent);
      this.selected = first;
      this.currentFolderId = first ? first.parentId : null;
    });
  }

  private rebuildIndexes(nodes: LibraryNode[]): void {
    this.nodesById = new Map(nodes.map((n) => [n.id, n]));
    this.childrenByParent = new Map();
    for (const node of nodes) {
      const siblings = this.childrenByParent.get(node.parentId) ?? [];
      siblings.push(node);
      this.childrenByParent.set(node.parentId, siblings);
    }
  }

  childrenOf(folderId: string | null): LibraryNode[] {
    return [...(this.childrenByParent.get(folderId) ?? [])].sort((a, b) => {
      if (isFolder(a) !== isFolder(b)) return isFolder(a) ? -1 : 1;
      return byTitle(a, b);
    });
  }

  get breadcrumb(): FolderRecord[] {
    const trail: FolderRecord[] = [];
    let current = this.currentFolderId;
    while (current) {
      const node = this.nodesById.get(current);
      if (!node || !isFolder(node)) break;
      trail.unshift(node);
      current = node.parentId;
    }
    return trail;
  }

  navigateTo(folderId: string | null): void {
    this.currentFolderId = folderId;
  }

  setSelected(tune: TuneRecord): void {
    this.selected = tune;
    this.currentFolderId = tune.parentId;
  }

  async createFolder(title: string): Promise<void> {
    const record = await apiCreateFolder({ parentId: this.currentFolderId, title });
    if (!record) return;
    runInAction(() => this.insertNode(record));
  }

  async createTune(title: string): Promise<TuneRecord | null> {
    const record = await apiCreateTune({ parentId: this.currentFolderId, title, data: '' });
    if (!record) return null;
    runInAction(() => {
      this.insertNode(record);
      this.setSelected(record);
    });
    return record;
  }

  async rename(id: string, title: string): Promise<void> {
    const node = this.nodesById.get(id);
    if (!node) return;
    const record = isFolder(node)
      ? await apiRenameFolder(id, { title })
      : await apiSaveTune(id, { title, data: node.data, video: node.video });
    if (!record) return;
    runInAction(() => this.replaceNode(record));
  }

  async remove(id: string): Promise<'deleted' | 'not-empty' | 'error'> {
    const node = this.nodesById.get(id);
    if (!node) return 'error';

    if (isFolder(node)) {
      const result = await apiDeleteFolder(id);
      if (result === 'deleted') runInAction(() => this.removeNode(node));
      return result;
    }
    const ok = await apiDeleteTune(id);
    if (!ok) return 'error';
    runInAction(() => this.removeNode(node));
    return 'deleted';
  }

  applyTuneEdit(record: TuneRecord): void {
    this.replaceNode(record);
  }

  private insertNode(node: LibraryNode): void {
    this.nodesById.set(node.id, node);
    const siblings = this.childrenByParent.get(node.parentId) ?? [];
    this.childrenByParent.set(node.parentId, [...siblings, node]);
  }

  private replaceNode(node: LibraryNode): void {
    this.nodesById.set(node.id, node);
    const siblings = this.childrenByParent.get(node.parentId) ?? [];
    const index = siblings.findIndex((n) => n.id === node.id);
    this.childrenByParent.set(
      node.parentId,
      index === -1 ? [...siblings, node] : siblings.map((n, i) => (i === index ? node : n)),
    );
    if (this.selected?.id === node.id && node.type === 'tune') this.selected = node;
  }

  private removeNode(node: LibraryNode): void {
    this.nodesById.delete(node.id);
    const siblings = this.childrenByParent.get(node.parentId) ?? [];
    this.childrenByParent.set(node.parentId, siblings.filter((n) => n.id !== node.id));

    if (this.currentFolderId === node.id) this.currentFolderId = node.parentId;

    if (this.selected?.id === node.id) {
      const replacement = firstTuneDepthFirst(null, this.childrenByParent);
      this.selected = replacement;
      if (replacement) this.currentFolderId = replacement.parentId;
    }
  }
}

export default new LibraryStore();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/LibraryStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/LibraryStore.ts src/stores/LibraryStore.test.ts
git commit -m "Rewrite LibraryStore around a flat, parentId-linked node index"
```

---

## Task 8: Frontend — simplify `EditorStore`

**Files:**
- Modify: `src/stores/EditorStore.ts`
- Modify: `src/stores/EditorStore.test.ts`

**Interfaces:**
- Consumes: `TuneRecord` and `saveTune` from `../api/tunesClient` (Task 6); `applyTuneEdit` from `./LibraryStore` default export (Task 7)
- Produces: same public surface as before (`textFor`, `currentAbcSource`, `isEdited`, `setText`, `resetText`, `save`, `saveStatus`, `saveError`) but keyed by `entry.id` instead of `entry.key ?? entry.id`, and with `save`/`resetText` no longer branching on override-vs-new-tune — consumed by Task 13's `App.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/stores/EditorStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TuneRecord } from '../api/tunesClient';

const tunesClientMocks = vi.hoisted(() => ({
  saveTune: vi.fn(),
}));
vi.mock('../api/tunesClient', () => tunesClientMocks);

const libraryStoreMock = vi.hoisted(() => ({
  applyTuneEdit: vi.fn(),
}));
vi.mock('./LibraryStore', () => ({ default: libraryStoreMock }));

const { default: editorStore } = await import('./EditorStore');

function tune(overrides: Partial<TuneRecord> & { id: string; title: string }): TuneRecord {
  return { type: 'tune', parentId: null, data: '', createdAt: 'now', updatedAt: 'now', ...overrides };
}

const ENTRY = tune({ id: 'cherokee-1a2b3c4d', title: 'Cherokee', data: 'ORIGINAL' });

describe('EditorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorStore.resetText(ENTRY);
  });

  it('setText tracks an edit and marks the entry as edited', () => {
    editorStore.setText(ENTRY, 'EDITED');
    expect(editorStore.textFor(ENTRY)).toBe('EDITED');
    expect(editorStore.isEdited(ENTRY)).toBe(true);
  });

  it('setText back to the original clears the edit', () => {
    editorStore.setText(ENTRY, 'EDITED');
    editorStore.setText(ENTRY, 'ORIGINAL');
    expect(editorStore.isEdited(ENTRY)).toBe(false);
  });

  it('save() calls saveTune with the live edit (not the debounced commit) and applies the result on success', async () => {
    editorStore.setText(ENTRY, 'EDITED');
    tunesClientMocks.saveTune.mockResolvedValue({ ...ENTRY, data: 'EDITED' });

    await editorStore.save(ENTRY);

    expect(tunesClientMocks.saveTune).toHaveBeenCalledWith(ENTRY.id, { title: 'Cherokee', data: 'EDITED', video: undefined });
    expect(libraryStoreMock.applyTuneEdit).toHaveBeenCalledWith({ ...ENTRY, data: 'EDITED' });
    expect(editorStore.saveStatus.get(ENTRY.id)).toBe('saved');
    expect(editorStore.isEdited(ENTRY)).toBe(false);
  });

  it('save() failure sets error status and leaves the edit untouched', async () => {
    editorStore.setText(ENTRY, 'EDITED');
    tunesClientMocks.saveTune.mockResolvedValue(null);

    await editorStore.save(ENTRY);

    expect(editorStore.saveStatus.get(ENTRY.id)).toBe('error');
    expect(editorStore.saveError.get(ENTRY.id)).toBeTruthy();
    expect(editorStore.textFor(ENTRY)).toBe('EDITED');
    expect(editorStore.isEdited(ENTRY)).toBe(true);
    expect(libraryStoreMock.applyTuneEdit).not.toHaveBeenCalled();
  });

  it('setText after a save/error clears the stale status indicator', async () => {
    editorStore.setText(ENTRY, 'EDITED');
    tunesClientMocks.saveTune.mockResolvedValue(null);
    await editorStore.save(ENTRY);
    expect(editorStore.saveStatus.get(ENTRY.id)).toBe('error');

    editorStore.setText(ENTRY, 'EDITED AGAIN');
    expect(editorStore.saveStatus.get(ENTRY.id)).toBeUndefined();
    expect(editorStore.saveError.get(ENTRY.id)).toBeUndefined();
  });

  it('resetText discards the in-progress edit without calling the server', () => {
    editorStore.setText(ENTRY, 'EDITED');
    editorStore.resetText(ENTRY);
    expect(editorStore.isEdited(ENTRY)).toBe(false);
    expect(tunesClientMocks.saveTune).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/EditorStore.test.ts`
Expected: FAIL — current `EditorStore.ts` imports `AbcData`/`saveOverride`/`deleteOverride` and branches on a `MY_TUNES_PREFIX` that no longer applies.

- [ ] **Step 3: Rewrite `src/stores/EditorStore.ts`**

```ts
import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { TuneRecord } from '../api/tunesClient';
import { saveTune } from '../api/tunesClient';
import libraryStore from './LibraryStore';

const COMMIT_DEBOUNCE_MS = 400;

export type SaveStatus = 'saving' | 'saved' | 'error';

/**
 * Session-only editing state for library tunes. Two maps per tune id:
 * `edits` updates on every keystroke and drives the textarea directly;
 * `committed` updates ~400ms after typing pauses and is what SheetView and
 * PlaybackStore consume, so re-parsing/re-priming the synth doesn't happen
 * on every keystroke. A tune is only present in either map while its text
 * differs from the tune's saved `data` — reverting clears it out.
 */
class EditorStore {
  private edits = observable.map<string, string>();
  private committed = observable.map<string, string>();
  private commitDebounce = new Map<string, ReturnType<typeof setTimeout>>();

  saveStatus = observable.map<string, SaveStatus>();
  saveError = observable.map<string, string>();

  constructor() {
    makeObservable(this, {
      setText: actionBound,
      resetText: actionBound,
      save: actionBound,
    });
  }

  /** The text for the textarea: the in-progress edit, or the tune's saved source. */
  textFor(entry: TuneRecord): string {
    return this.edits.get(entry.id) ?? entry.data;
  }

  /** The text SheetView/PlaybackStore should render/play: the debounced edit, or the saved source. */
  currentAbcSource(entry: TuneRecord): string {
    return this.committed.get(entry.id) ?? entry.data;
  }

  isEdited(entry: TuneRecord): boolean {
    return this.edits.has(entry.id);
  }

  setText(entry: TuneRecord, text: string): void {
    const id = entry.id;
    if (text === entry.data) this.edits.delete(id);
    else this.edits.set(id, text);
    // A fresh edit invalidates whatever the last save/error indicator said.
    this.saveStatus.delete(id);
    this.saveError.delete(id);

    const existingTimer = this.commitDebounce.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    this.commitDebounce.set(id, setTimeout(() => {
      runInAction(() => this.commit(entry, text));
    }, COMMIT_DEBOUNCE_MS));
  }

  /** Discards the in-progress edit. There's no server "original" to revert to anymore — this only ever undoes unsaved typing. */
  resetText(entry: TuneRecord): void {
    this.clearLocalEdit(entry.id);
  }

  /** Persists the current text as the tune's new canonical content. */
  async save(entry: TuneRecord): Promise<void> {
    const id = entry.id;
    this.saveStatus.set(id, 'saving');
    this.saveError.delete(id);
    // textFor(), not currentAbcSource(): the latter lags behind the live edit by
    // up to the 400ms commit debounce, so saving right after typing could persist stale text.
    const input = { title: entry.title, data: this.textFor(entry), video: entry.video };

    const record = await saveTune(id, input);
    runInAction(() => {
      if (!record) {
        this.saveStatus.set(id, 'error');
        this.saveError.set(id, 'Could not reach the server — your edit is still here, try again.');
        return;
      }
      libraryStore.applyTuneEdit(record);
      this.clearLocalEdit(id);
      this.saveStatus.set(id, 'saved');
    });
  }

  private clearLocalEdit(id: string): void {
    this.edits.delete(id);
    this.committed.delete(id);
    this.saveStatus.delete(id);
    this.saveError.delete(id);
    const existingTimer = this.commitDebounce.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.commitDebounce.delete(id);
    }
  }

  private commit(entry: TuneRecord, text: string): void {
    const id = entry.id;
    if (text === entry.data) this.committed.delete(id);
    else this.committed.set(id, text);
    this.commitDebounce.delete(id);
  }
}

export default new EditorStore();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/EditorStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/EditorStore.ts src/stores/EditorStore.test.ts
git commit -m "Simplify EditorStore now that tune edits have no override layer"
```

---

## Task 9: Frontend — swap `AbcData` for `TuneRecord` in the video/playback consumers

**Files:**
- Modify: `src/stores/VideoLoopStore.ts`
- Modify: `src/stores/VideoLoopStore.test.ts`
- Modify: `src/components/VideoLoopPanel.tsx`
- Modify: `src/stores/PlaybackStore.ts`

None of these files' *logic* changes — only the type they operate on (`AbcData` → `TuneRecord`, imported from `../api/tunesClient` instead of `../content`) and, in `VideoLoopStore.ts`, dropping the now-nonexistent `key` fallback. `PlaybackStore.ts` additionally needs to handle `libraryStore.selected` now being possibly `undefined` (Task 7 changed its type).

**Interfaces:**
- Consumes: `TuneRecord` from `../api/tunesClient` (Task 6); `LibraryStore.selected: TuneRecord | undefined` (Task 7)

- [ ] **Step 1: Update `src/stores/VideoLoopStore.ts`**

Replace the import and drop `keyFor`'s fallback (every `TuneRecord.id` is already globally unique, so there's no more second identifier to fall back to):

```diff
 import { actionBound, makeObservable, observable, runInAction } from 'mobx';
-import type { AbcData } from '../content';
+import type { TuneRecord } from '../api/tunesClient';
 import { parseTimeInput } from '../video/timeFormat';
```

```diff
-function defaultFromAbcData(entry: AbcData): VideoLoopEntry {
+function defaultFromAbcData(entry: TuneRecord): VideoLoopEntry {
   if (!entry.video) return defaultEntry();
   return {
     url: entry.video.url,
     loopStart: parseTimeInput(entry.video.start),
     loopEnd: parseTimeInput(entry.video.end),
     loopEnabled: false,
   };
 }

-function keyFor(entry: AbcData): string {
-  return entry.key ?? entry.id;
-}
-
 function loadEntries(): Record<string, VideoLoopEntry> {
```

Replace every remaining `entry: AbcData` parameter type with `entry: TuneRecord`, and every `keyFor(entry)` call with `entry.id` directly. The full set of call sites to change: `entryFor`, `setUrl`, `setLoopStart`, `setLoopEnd`, `toggleLoopEnabled`, and the private `update` method. For example:

```diff
-  entryFor(entry: AbcData): VideoLoopEntry {
-    return this.entries.get(keyFor(entry)) ?? defaultFromAbcData(entry);
+  entryFor(entry: TuneRecord): VideoLoopEntry {
+    return this.entries.get(entry.id) ?? defaultFromAbcData(entry);
   }
```

```diff
-  private update(entry: AbcData, patch: Partial<VideoLoopEntry>): void {
-    const key = keyFor(entry);
+  private update(entry: TuneRecord, patch: Partial<VideoLoopEntry>): void {
+    const key = entry.id;
     const next = { ...this.entryFor(entry), ...patch };
```

(Apply the same `AbcData` → `TuneRecord` type swap to `setUrl`, `setLoopStart`, `setLoopEnd`, `toggleLoopEnabled`'s `entry` parameters — their bodies are unchanged.)

- [ ] **Step 2: Update `src/stores/VideoLoopStore.test.ts`**

Replace the `AbcData` import and fixture shapes with `TuneRecord`-shaped ones (now requiring `type`, `parentId`, `data`, `createdAt`, `updatedAt`), and delete the test that specifically exercised the now-removed `key` fallback:

```diff
 import { describe, it, expect, beforeEach, vi } from 'vitest';
-import type { AbcData } from '../content';
+import type { TuneRecord } from '../api/tunesClient';
 
-const ENTRY: AbcData = { id: 'tune-1', title: 'Tune One' };
-const OTHER_ENTRY: AbcData = { id: 'tune-2', title: 'Tune Two' };
+function tune(overrides: Partial<TuneRecord> & { id: string; title: string }): TuneRecord {
+  return { type: 'tune', parentId: null, data: '', createdAt: 'now', updatedAt: 'now', ...overrides };
+}
+
+const ENTRY: TuneRecord = tune({ id: 'tune-1', title: 'Tune One' });
+const OTHER_ENTRY: TuneRecord = tune({ id: 'tune-2', title: 'Tune Two' });
```

Update every other `AbcData` annotation in this file (`entryWithVideo: AbcData` appears three times, `keyedEntry: AbcData` once) to `TuneRecord`, built via the `tune()` helper, e.g.:

```diff
-    const entryWithVideo: AbcData = {
-      id: 'tune-with-video',
-      title: 'Tune With Video',
-      video: { url: 'https://youtu.be/abc12345678', start: '0:14', end: '0:24' },
-    };
+    const entryWithVideo = tune({
+      id: 'tune-with-video',
+      title: 'Tune With Video',
+      video: { url: 'https://youtu.be/abc12345678', start: '0:14', end: '0:24' },
+    });
```

Delete this entire test (it exercised the now-removed key/id fallback):

```ts
  it('uses entry.key over entry.id when both are present', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const keyedEntry: AbcData = { id: 'internal-id', key: 'display-key', title: 'Keyed Tune' };
    videoLoopStore.setUrl(keyedEntry, 'https://youtu.be/abc12345678');
    const raw = JSON.parse(localStorage.getItem('videoLoopEntries')!);
    expect(raw['display-key']).toBeDefined();
    expect(raw['internal-id']).toBeUndefined();
  });
```

Update the docstring-comment test title that references the old key convention:

```diff
-  it('persists entries to localStorage keyed by entry.key ?? entry.id', async () => {
+  it('persists entries to localStorage keyed by entry.id', async () => {
```

- [ ] **Step 3: Update `src/components/VideoLoopPanel.tsx`**

```diff
 import { useRef, useState } from 'react';
 import { observer } from 'mobx-react-lite';
-import type { AbcData } from '../content';
+import type { TuneRecord } from '../api/tunesClient';
 import { videoLoopStore, uiStore } from '../stores';
 import { extractYouTubeVideoId } from '../video/youtubeUrl';
 import { shouldSeekToLoopStart } from '../video/loopEnforcement';
 import { YouTubePlayer, type YouTubePlayerHandle } from '../video/YouTubePlayer';
 import { LoopControls } from './LoopControls';
 
 interface Props {
-  entry: AbcData;
+  entry: TuneRecord;
 }
```

- [ ] **Step 4: Update `src/stores/PlaybackStore.ts`**

Swap the type import, and guard the reaction against `libraryStore.selected` being `undefined` (previously it was always defined):

```diff
 import { actionBound, makeObservable, observable, observableRef, reaction, runInAction } from 'mobx';
 import { synthEngine } from '../playback/synthEngine';
-import type { AbcData } from '../content';
+import type { TuneRecord } from '../api/tunesClient';
 import type { EventRef, FlattenedTune } from '../abc/types';
```

```diff
   private swingDebounce: ReturnType<typeof setTimeout> | null = null;
-  private lastLoadedEntry: AbcData | null = null;
+  private lastLoadedEntry: TuneRecord | null = null;
   private loadGeneration = 0;
```

```diff
     reaction(
       () => ({
         entry: libraryStore.selected,
-        abcSource: editorStore.currentAbcSource(libraryStore.selected),
+        abcSource: libraryStore.selected ? editorStore.currentAbcSource(libraryStore.selected) : undefined,
       }),
       ({ entry, abcSource }) => {
+        if (!entry || abcSource === undefined) return;
         const isEntrySwitch = entry !== this.lastLoadedEntry;
         this.lastLoadedEntry = entry;
         void this.loadSelected(abcSource, isEntrySwitch);
       },
       { fireImmediately: true },
     );
```

- [ ] **Step 5: Run the affected tests**

Run: `npx vitest run src/stores/VideoLoopStore.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b --force`
Expected: no errors in these four files (other files still reference `../content` until later tasks — ignore those for now, they're addressed in Tasks 10–13).

- [ ] **Step 7: Commit**

```bash
git add src/stores/VideoLoopStore.ts src/stores/VideoLoopStore.test.ts src/components/VideoLoopPanel.tsx src/stores/PlaybackStore.ts
git commit -m "Swap AbcData for TuneRecord in video/playback stores"
```

---

## Task 10: Frontend — simplify `AbcEditorPanel`

**Files:**
- Modify: `src/components/AbcEditorPanel.tsx`

No test file (consistent with this codebase's existing convention — no component-test infrastructure; verified by typecheck + manual browser check in Task 15).

**Interfaces:**
- Consumes: `TuneRecord` from `../api/tunesClient` (Task 6)

- [ ] **Step 1: Rewrite `src/components/AbcEditorPanel.tsx`**

Drop the `hasOverride` prop entirely — with overrides gone, "Reset to original" only ever means "discard my unsaved edit," which is exactly what `edited` already tracks.

```tsx
import type { TuneRecord } from '../api/tunesClient';
import type { SaveStatus } from '../stores/EditorStore';
import { VideoLoopPanel } from './VideoLoopPanel';

interface Props {
  entry: TuneRecord;
  value: string;
  edited: boolean;
  saveStatus?: SaveStatus;
  saveError?: string;
  onChange: (text: string) => void;
  onReset: () => void;
  onSave: () => void;
}

export function AbcEditorPanel({ entry, value, edited, saveStatus, saveError, onChange, onReset, onSave }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">ABC source</span>
        {edited && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Edited
          </span>
        )}
        {saveStatus === 'saving' && <span className="text-xs text-slate-500">Saving…</span>}
        {saveStatus === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
        {saveStatus === 'error' && (
          <span className="text-xs text-red-600" title={saveError}>
            Save failed
          </span>
        )}
        {edited && (
          <button
            type="button"
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            className="ml-auto text-xs font-medium text-blue-600 underline hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        )}
        {edited && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-slate-500 underline hover:text-slate-800"
          >
            Reset to original
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none p-3 font-mono text-sm text-slate-800 outline-none"
      />
      <VideoLoopPanel key={entry.id} entry={entry} />
    </div>
  );
}
```

- [ ] **Step 2: Commit** (bundled with Task 13 — `App.tsx` is the only caller, and it's still passing the old props until that task runs; commit these together once both compile)

---

## Task 11: Frontend — `Breadcrumb` component

**Files:**
- Create: `src/components/Breadcrumb.tsx`

No test file (presentational component, same convention as Task 10).

**Interfaces:**
- Consumes: `FolderRecord` from `../api/tunesClient` (Task 6)
- Produces: `Breadcrumb` component — consumed by Task 12's `Sidebar`.

- [ ] **Step 1: Write `src/components/Breadcrumb.tsx`**

```tsx
import type { FolderRecord } from '../api/tunesClient';

interface Props {
  trail: FolderRecord[];
  onNavigate: (folderId: string | null) => void;
}

export function Breadcrumb({ trail, onNavigate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
      <button type="button" onClick={() => onNavigate(null)} className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900">
        Library
      </button>
      {trail.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span className="text-slate-400">/</span>
          <button
            type="button"
            onClick={() => onNavigate(folder.id)}
            className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900"
          >
            {folder.title}
          </button>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit** (bundled with Task 12, since `Breadcrumb` has no caller until then)

---

## Task 12: Frontend — rewrite `Sidebar` for folder-at-a-time browsing

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Delete: `src/components/TreeNode.tsx`

No test file (same convention as Tasks 10–11).

**Interfaces:**
- Consumes: `libraryStore` (Task 7) — `currentFolderId`, `breadcrumb`, `childrenOf`, `navigateTo`, `setSelected`, `createFolder`, `createTune`, `rename`, `remove`; `LibraryNode`, `FolderRecord`, `TuneRecord` from `../api/tunesClient` (Task 6); `Breadcrumb` from `./Breadcrumb` (Task 11)

- [ ] **Step 1: Delete `src/components/TreeNode.tsx`**

```bash
rm src/components/TreeNode.tsx
```

- [ ] **Step 2: Rewrite `src/components/Sidebar.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { useRef, useState } from 'react';
import { libraryStore, uiStore } from '../stores';
import type { FolderRecord, LibraryNode } from '../api/tunesClient';
import { Breadcrumb } from './Breadcrumb';

const COLLAPSED_WIDTH = 40;

function isFolder(node: LibraryNode): node is FolderRecord {
  return node.type === 'folder';
}

const LibraryRow = observer(function LibraryRow({ node }: { node: LibraryNode }) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);

  const isSelected = node.type === 'tune' && libraryStore.selected?.id === node.id;

  const commitRename = () => {
    const title = draftTitle.trim();
    setRenaming(false);
    if (title && title !== node.title) void libraryStore.rename(node.id, title);
    else setDraftTitle(node.title);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${node.title}"?`)) return;
    const result = await libraryStore.remove(node.id);
    if (result === 'not-empty') alert('This folder isn\'t empty — remove its contents first.');
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1">
        <input
          autoFocus
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftTitle(node.title);
              setRenaming(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-blue-400 px-1.5 py-0.5 text-sm text-slate-800 outline-none"
        />
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${isSelected ? 'bg-blue-100 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`}>
      <button
        type="button"
        onClick={() => {
          if (isFolder(node)) libraryStore.navigateTo(node.id);
          else libraryStore.setSelected(node);
        }}
        className="min-w-0 flex-1 truncate text-left"
      >
        {isFolder(node) ? '📁 ' : ''}
        {node.title}
      </button>
      <button
        type="button"
        onClick={() => setRenaming(true)}
        aria-label={`Rename ${node.title}`}
        className="hidden shrink-0 text-xs text-slate-400 hover:text-slate-700 group-hover:block"
      >
        ✎
      </button>
      <button
        type="button"
        onClick={() => void handleDelete()}
        aria-label={`Delete ${node.title}`}
        className="hidden shrink-0 text-xs text-slate-400 hover:text-red-600 group-hover:block"
      >
        🗑
      </button>
    </div>
  );
});

export const Sidebar = observer(function Sidebar() {
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [newTuneTitle, setNewTuneTitle] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingTune, setCreatingTune] = useState(false);

  const handleCreateFolder = async () => {
    const title = newFolderTitle.trim();
    if (!title || creatingFolder) return;
    setCreatingFolder(true);
    await libraryStore.createFolder(title);
    setCreatingFolder(false);
    setNewFolderTitle('');
  };

  const handleCreateTune = async () => {
    const title = newTuneTitle.trim();
    if (!title || creatingTune) return;
    setCreatingTune(true);
    await libraryStore.createTune(title);
    setCreatingTune(false);
    setNewTuneTitle('');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = uiStore.sidebarWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = e.clientX - dragStartX.current;
    uiStore.setSidebarWidth(dragStartWidth.current + delta);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  if (uiStore.sidebarCollapsed) {
    return (
      <aside
        className="flex h-full shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50 py-3"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          onClick={() => uiStore.toggleSidebarCollapsed()}
          aria-label="Expand sidebar"
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <div className="flex h-full shrink-0">
      <aside
        className="flex h-full min-w-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50"
        style={{ width: uiStore.sidebarWidth }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-wide text-slate-900">Jazz Solo Transcriptions</h1>
            <p className="text-xs text-slate-500">Lick &amp; solo library</p>
          </div>
          <button
            type="button"
            onClick={() => uiStore.toggleSidebarCollapsed()}
            aria-label="Collapse sidebar"
            className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            «
          </button>
        </div>
        <Breadcrumb trail={libraryStore.breadcrumb} onNavigate={(id) => libraryStore.navigateTo(id)} />
        <nav className="flex-1 py-2">
          {libraryStore.childrenOf(libraryStore.currentFolderId).map((node) => (
            <LibraryRow key={node.id} node={node} />
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-slate-200 p-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFolder();
              }}
              placeholder="New folder name…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              disabled={!newFolderTitle.trim() || creatingFolder}
              className="shrink-0 rounded bg-slate-600 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Folder
            </button>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTuneTitle}
              onChange={(e) => setNewTuneTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateTune();
              }}
              placeholder="New tune title…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => void handleCreateTune()}
              disabled={!newTuneTitle.trim() || creatingTune}
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Tune
            </button>
          </div>
        </div>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400 active:bg-blue-500"
      />
    </div>
  );
});
```

- [ ] **Step 3: Commit** (bundled with Task 13's `App.tsx` changes, since `App.tsx` is what finally makes everything compile together — run the full typecheck there before committing)

---

## Task 13: Frontend — update `App.tsx` for loading/error states and `entry.id`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `libraryStore.selected: TuneRecord | undefined`, `libraryStore.loaded`, `libraryStore.loadError` (Task 7); `AbcEditorPanel`'s simplified props (Task 10)

- [ ] **Step 1: Rewrite `src/App.tsx`**

```tsx
import { observer } from 'mobx-react-lite';
import { Sidebar } from './components/Sidebar';
import { TransportBar } from './components/TransportBar';
import { AbcEditorPanel } from './components/AbcEditorPanel';
import { SplitPane } from './components/SplitPane';
import { SheetView } from './notation/SheetView';
import { libraryStore, playbackStore, editorStore, uiStore } from './stores';

const App = observer(function App() {
  const selected = libraryStore.selected;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TransportBar />
        {libraryStore.loadError ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
            Can&apos;t reach the persistence server. Start it with{' '}
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono">npm run server</code>, then reload.
          </div>
        ) : !libraryStore.loaded ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading your library…</div>
        ) : !selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            No tunes yet — create one from the sidebar.
          </div>
        ) : (
          <SplitPane
            left={
              <SheetView
                abcSource={editorStore.currentAbcSource(selected)}
                cursor={playbackStore.cursor}
                selectionStart={playbackStore.loopStart}
                selectionEnd={playbackStore.loopEnd}
                numeralMode={uiStore.numeralMode}
                onSelectionChange={playbackStore.setSelectionRange}
              />
            }
            right={
              <AbcEditorPanel
                entry={selected}
                value={editorStore.textFor(selected)}
                edited={editorStore.isEdited(selected)}
                saveStatus={editorStore.saveStatus.get(selected.id)}
                saveError={editorStore.saveError.get(selected.id)}
                onChange={(text) => editorStore.setText(selected, text)}
                onReset={() => editorStore.resetText(selected)}
                onSave={() => editorStore.save(selected)}
              />
            }
          />
        )}
      </div>
    </div>
  );
});

export default App;
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all suites pass except any still referencing `src/content` (Task 14's `TransportBar.tsx` print flow, if it imports `AbcData`, would already have been swept in Task 9 — double check no other file still imports from `../content` besides `src/content/**` itself; see Task 14 Step 1 for the authoritative grep).

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --force`
Expected: no errors. If there are still errors referencing `../content`, that means some consumer was missed in Tasks 9–13 — find it via `grep -rn "from '.*content'" src` and fix it using the same `AbcData` → `TuneRecord` pattern as Task 9 before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/AbcEditorPanel.tsx src/components/Breadcrumb.tsx src/components/Sidebar.tsx
git add -u src/components/TreeNode.tsx
git commit -m "Rewrite sidebar for folder-at-a-time browsing with breadcrumb navigation"
```

---

## Task 14: Verify everything compiles and passes before touching real content

**Files:** none (verification only)

- [ ] **Step 1: Confirm no file outside `src/content/**` still imports from it**

Run: `grep -rn "from '\.\./content'\|from '\./content'" src --include=*.ts --include=*.tsx | grep -v '^src/content/'`
Expected: no output. If anything shows up, fix it before proceeding (it means Tasks 9–13 missed a consumer).

- [ ] **Step 2: Full typecheck**

Run: `npx tsc -b --force`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new warnings beyond the two pre-existing ones (`TransportBar.tsx`, `TieSlur.tsx` — unrelated to this work).

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: succeeds. (`src/content/**` is still present and still bundled at this point — that's expected, it's only deleted in Task 16 after migration is verified.)

---

## Task 15: Run the real migration and verify manually

**Files:** none (this task populates `server/data/library/` with real data, verified manually — no source changes)

- [ ] **Step 1: Confirm the target directory is empty**

Run: `ls server/data/library/ 2>/dev/null` (Linux/macOS) or `Get-ChildItem server\data\library\ -ErrorAction SilentlyContinue` (PowerShell)
Expected: empty or "does not exist" — if it has files already from earlier manual testing, delete them first (`rm -rf server/data/library/*` or the PowerShell equivalent) so the migration script's own guard doesn't refuse to run.

- [ ] **Step 2: Run the migration script**

Run: `npx tsx server/migrate.ts`
Expected: prints `Migrated <N> folder(s) and <M> tune(s) into .../server/data/library` with `N` and `M` both greater than zero, matching the folder/tune counts visible in `src/content/index.ts`'s `FILE_TREE` today.

- [ ] **Step 3: Start both processes**

Run `npm run server` in one terminal and `npm run dev` in another.

- [ ] **Step 4: Manually verify in the browser**

Open the app. Confirm:
- The sidebar shows the same top-level folders that `FILE_TREE` had (David Baker, Carapax, Tunes, etc.), now browsable one level at a time with a working breadcrumb.
- Navigating into a few folders shows the same tunes that used to be there, and selecting one shows correct ABC content (spot-check 2–3 tunes against what you remember, or against `git show HEAD~N:src/content/.../SomeFile.ts` for a specific one).
- A tune's video field (for one you know has one, e.g. Jens Larsen's Coltrane Patterns) survived the migration — check the Video panel shows the right URL.
- Create a new folder, create a new tune inside it, edit and save it, rename both, then delete the tune and the (now-empty) folder — confirm each step works and the UI updates correctly.
- Stop the server process and reload the page — confirm the "Can't reach the persistence server" message appears instead of a blank/broken page.

If anything looks wrong, fix the migration script (Task 5) or the affected consumer and re-run from Step 1 — do not proceed to Task 16 until this step is clean.

---

## Task 16: Commit the migrated content

**Files:**
- Create (many): `server/data/library/*.json` (one file per migrated folder/tune)

This is the only copy of this content once `src/content/**` is deleted in Task 17 — it must be committed, not left as local-only untracked state.

- [ ] **Step 1: Review what's about to be committed**

Run: `git status server/data/library/`
Expected: a large number of new `.json` files, roughly matching the folder+tune count printed in Task 15.

- [ ] **Step 2: Commit**

```bash
git add server/data/library/
git commit -m "Migrate static content library into server-side folder/tune records"
```

---

## Task 17: Delete the static content source

**Files:**
- Delete: `src/content/**` (all 56 tune files + `index.ts`)
- Delete: `server/migrate.ts`
- Delete: `server/migrate.test.ts`
- Modify: `tsconfig.server.json` (remove the now-unnecessary `exclude`)

Only do this after Task 15's manual verification passed and Task 16's commit is in place — `src/content/**` is otherwise your only recovery path if the migration turns out to have a bug.

- [ ] **Step 1: Delete the content directory and the now-obsolete migration script**

```bash
rm -rf src/content
rm server/migrate.ts server/migrate.test.ts
```

- [ ] **Step 2: Remove the `exclude` from `tsconfig.server.json`** (nothing left in `server/` needs it)

```json
{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo"
  },
  "include": ["server"]
}
```

- [ ] **Step 3: Full typecheck**

Run: `npx tsc -b --force`
Expected: no errors. (This is the definitive confirmation that nothing outside `src/content/**` depended on it anymore — if this fails, something was missed in Tasks 9–13.)

- [ ] **Step 4: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (the deleted `server/migrate.test.ts` simply stops running — that's expected, its subject no longer exists).

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: succeeds, and the bundle no longer includes the 56 static tune files (worth a quick sanity check on the build output size vs. before, though not a hard assertion).

- [ ] **Step 6: Commit**

```bash
git add -u src/content server/migrate.ts server/migrate.test.ts tsconfig.server.json
git commit -m "Delete static content source now that it lives in the library store"
```

---

## Task 18: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "Persisting tunes" section**

Find the section added by the prior persistence-server work (titled "Persisting tunes (optional local server)") and replace it to reflect that the server is no longer optional, and that folders are now part of the model:

```markdown
## Content library (server-required)

All tunes and folders live in server-side storage under `server/data/library/`, edited from the browser — there's no more static content baked into the app. **The server must be running for the app to show anything.**

In a second terminal, alongside `npm run dev`:

```bash
npm run server
```

This starts a local API on `http://localhost:3001`, which Vite proxies at `/api`. It's a personal local tool — localhost only, no authentication. If the server isn't running, the app shows a "can't reach the persistence server" message instead of the library.

Folders and tunes support create, rename, and delete (a folder must be empty before it can be deleted) via the sidebar's breadcrumb-navigated browser.
```

Replace the "To use the persistence server against a production build" line under `## Build` similarly — it's still accurate (both `server.proxy` and `preview.proxy` point at the same server), just update it to note the server is now required rather than optional:

```diff
-To use the persistence server against a production build, run `npm run server` alongside
-`npm run preview` (both proxy configs point at `http://localhost:3001`).
+The server is required in every mode, including a production build — run `npm run server`
+alongside `npm run preview` (both proxy configs point at `http://localhost:3001`).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README for the server-required content library"
```

---

## Task 19: Final full verification

**Files:** none

- [ ] **Step 1: Typecheck, lint, test, build — all from a clean state**

```bash
npx tsc -b --force
npm run lint
npx vitest run
npm run build
```

Expected: all four succeed with no errors and no new warnings.

- [ ] **Step 2: One more manual pass through the app**

With `npm run server` and `npm run dev` both running: browse a few folders via breadcrumb, select a tune, edit and save it, reload the page and confirm the edit persisted, create and delete a folder, and confirm playback/video/print (the features untouched by this plan) still work on a migrated tune.

- [ ] **Step 3: Stop, then restart just `npm run dev` without the server**

Confirm the app shows the "can't reach the persistence server" message rather than crashing or showing a blank page — this is the one deliberate behavior change from the prior spec's "always degrades gracefully to static content."
