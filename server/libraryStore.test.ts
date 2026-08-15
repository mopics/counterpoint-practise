// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLibraryStore, isValidId, type LibraryStore } from './libraryStore.ts';

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
