import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Deliberately not imported from src/content — that file's extensionless
// relative imports are only valid under the app project's bundler module
// resolution, not the server project's nodenext resolution, so pulling it
// into the server's TS program would break `tsc -b`. Shape matches
// AbcData['video'] in src/content/index.ts by convention, not by reference.
export interface VideoRef {
  url: string;
  start: string;
  end: string;
}

export interface OverrideRecord {
  key: string;
  title: string;
  data: string;
  video?: VideoRef;
  updatedAt: string;
}

export interface TuneRecord {
  key: string;
  id: string;
  title: string;
  data: string;
  video?: VideoRef;
  createdAt: string;
  updatedAt: string;
}

export interface TuneInput {
  title: string;
  data: string;
  video?: VideoRef;
}

export interface TuneStore {
  listOverrides(): Promise<OverrideRecord[]>;
  listTunes(): Promise<TuneRecord[]>;
  upsertOverride(key: string, input: TuneInput): Promise<OverrideRecord>;
  deleteOverride(key: string): Promise<void>;
  createTune(input: TuneInput): Promise<TuneRecord>;
  findTuneByKey(key: string): Promise<TuneRecord | undefined>;
  updateTune(key: string, input: TuneInput): Promise<TuneRecord | undefined>;
  deleteTune(key: string): Promise<boolean>;
}

export class InvalidKeyError extends Error {}

const KEY_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * `key` comes straight from a URL param on an unauthenticated server, so it's
 * untrusted input. Reject anything outside the shape assignKeys() actually
 * produces (slash-separated segments of safe characters, no "." / ".."
 * segments) before it ever reaches a filesystem path.
 */
export function isValidKey(key: string): boolean {
  if (!key) return false;
  const segments = key.split('/');
  return segments.every((segment) => KEY_SEGMENT.test(segment) && segment !== '.' && segment !== '..');
}

/** Override filenames are the static tree `key` with "/" swapped for "__" (reversible; existing ids never contain "__"). */
function overrideFilename(key: string): string {
  if (!isValidKey(key)) throw new InvalidKeyError(`invalid key: ${key}`);
  return `${key.replace(/\//g, '__')}.json`;
}

/** Defense in depth: even a validated key must resolve to a path inside `dir`. */
async function resolveWithin(dir: string, filename: string): Promise<string> {
  const full = path.resolve(dir, filename);
  const base = path.resolve(dir) + path.sep;
  if (!full.startsWith(base)) throw new InvalidKeyError(`path escapes data directory: ${filename}`);
  return full;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tune';
}

export function createTuneStore(dataDir: string): TuneStore {
  const overridesDir = path.join(dataDir, 'overrides');
  const tunesDir = path.join(dataDir, 'tunes');

  async function ensureDirs(): Promise<void> {
    await mkdir(overridesDir, { recursive: true });
    await mkdir(tunesDir, { recursive: true });
  }

  async function readJsonFiles<T>(dir: string): Promise<T[]> {
    await ensureDirs();
    const entries = await readdir(dir);
    const records: T[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(dir, entry), 'utf-8');
        records.push(JSON.parse(raw) as T);
      } catch {
        // Skip a malformed/unreadable file rather than failing the whole list.
      }
    }
    return records;
  }

  async function findTuneByKey(key: string): Promise<TuneRecord | undefined> {
    const tunes = await readJsonFiles<TuneRecord>(tunesDir);
    return tunes.find((tune) => tune.key === key);
  }

  return {
    listOverrides: () => readJsonFiles<OverrideRecord>(overridesDir),
    listTunes: () => readJsonFiles<TuneRecord>(tunesDir),

    async upsertOverride(key, input) {
      await ensureDirs();
      const filePath = await resolveWithin(overridesDir, overrideFilename(key));
      const record: OverrideRecord = {
        key,
        title: input.title,
        data: input.data,
        video: input.video,
        updatedAt: new Date().toISOString(),
      };
      await writeFile(filePath, JSON.stringify(record, null, 2));
      return record;
    },

    async deleteOverride(key) {
      await ensureDirs();
      const filePath = await resolveWithin(overridesDir, overrideFilename(key));
      await rm(filePath, { force: true });
    },

    async createTune(input) {
      await ensureDirs();
      const id = `${slugify(input.title)}-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const record: TuneRecord = {
        key: `lib/my-tunes/${id}`,
        id,
        title: input.title,
        data: input.data,
        video: input.video,
        createdAt: now,
        updatedAt: now,
      };
      await writeFile(path.join(tunesDir, `${id}.json`), JSON.stringify(record, null, 2));
      return record;
    },

    findTuneByKey,

    async updateTune(key, input) {
      const existing = await findTuneByKey(key);
      if (!existing) return undefined;
      const record: TuneRecord = {
        ...existing,
        title: input.title,
        data: input.data,
        video: input.video,
        updatedAt: new Date().toISOString(),
      };
      await writeFile(path.join(tunesDir, `${existing.id}.json`), JSON.stringify(record, null, 2));
      return record;
    },

    async deleteTune(key) {
      const existing = await findTuneByKey(key);
      if (!existing) return false;
      await rm(path.join(tunesDir, `${existing.id}.json`), { force: true });
      return true;
    },
  };
}
