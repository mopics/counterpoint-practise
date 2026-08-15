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
