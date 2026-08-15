// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTuneStore, InvalidKeyError, isValidKey, type TuneStore } from './tuneStore.ts';

describe('tuneStore', () => {
  let dataDir: string;
  let store: TuneStore;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'tune-store-test-'));
    store = createTuneStore(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('lists nothing before anything is written', async () => {
    expect(await store.listOverrides()).toEqual([]);
    expect(await store.listTunes()).toEqual([]);
  });

  it('round-trips an override: upsert, list, delete', async () => {
    const record = await store.upsertOverride('lib/tunes/cherokee', { title: 'Cherokee', data: 'X:1\n' });
    expect(record).toMatchObject({ key: 'lib/tunes/cherokee', title: 'Cherokee', data: 'X:1\n' });

    expect(await store.listOverrides()).toEqual([record]);

    await store.deleteOverride('lib/tunes/cherokee');
    expect(await store.listOverrides()).toEqual([]);
  });

  it('overrides with slashes in the key do not collide across folders', async () => {
    await store.upsertOverride('lib/tunes/cherokee', { title: 'A', data: '' });
    await store.upsertOverride('lib/sonny-rollins/cherokee', { title: 'B', data: '' });
    const overrides = await store.listOverrides();
    expect(overrides).toHaveLength(2);
  });

  it('deleteOverride is idempotent for a key that was never written', async () => {
    await expect(store.deleteOverride('lib/tunes/never-existed')).resolves.toBeUndefined();
  });

  it('creates a tune with a generated id/key and finds it by key', async () => {
    const record = await store.createTune({ title: 'My Blues Lick', data: 'X:1\n' });
    expect(record.id).toMatch(/^my-blues-lick-[0-9a-f]{8}$/);
    expect(record.key).toBe(`lib/my-tunes/${record.id}`);

    const found = await store.findTuneByKey(record.key);
    expect(found).toEqual(record);
  });

  it('creating two tunes with the same title yields distinct ids', async () => {
    const a = await store.createTune({ title: 'Blues', data: '' });
    const b = await store.createTune({ title: 'Blues', data: '' });
    expect(a.id).not.toBe(b.id);
    expect(await store.listTunes()).toHaveLength(2);
  });

  it('updates an existing tune in place, preserving id/key/createdAt', async () => {
    const created = await store.createTune({ title: 'Draft', data: 'X:1\n' });
    const updated = await store.updateTune(created.key, { title: 'Final', data: 'X:1\nT:Final\n' });
    expect(updated).toMatchObject({ id: created.id, key: created.key, createdAt: created.createdAt, title: 'Final' });
    expect(await store.listTunes()).toEqual([updated]);
  });

  it('updateTune returns undefined for an unknown key', async () => {
    const result = await store.updateTune('lib/my-tunes/does-not-exist', { title: 'X', data: '' });
    expect(result).toBeUndefined();
  });

  it('deleteTune returns false for an unknown key and true when it removes a real tune', async () => {
    expect(await store.deleteTune('lib/my-tunes/does-not-exist')).toBe(false);
    const created = await store.createTune({ title: 'Temp', data: '' });
    expect(await store.deleteTune(created.key)).toBe(true);
    expect(await store.listTunes()).toEqual([]);
  });

  it('skips a malformed JSON file instead of failing the whole list', async () => {
    await store.upsertOverride('lib/tunes/good', { title: 'Good', data: '' });
    await writeFile(path.join(dataDir, 'overrides', 'lib__tunes__bad.json'), '{not valid json');

    const overrides = await store.listOverrides();
    expect(overrides).toHaveLength(1);
    expect(overrides[0]?.key).toBe('lib/tunes/good');
  });

  describe('isValidKey', () => {
    it('accepts real-shaped keys', () => {
      expect(isValidKey('lib/tunes/cherokee')).toBe(true);
      expect(isValidKey('lib/tunes/cherokee-1')).toBe(true);
      expect(isValidKey('lib/my-tunes/my-blues-lick-abcd1234')).toBe(true);
    });

    it('rejects empty, dot, and dot-dot segments', () => {
      expect(isValidKey('')).toBe(false);
      expect(isValidKey('lib/../etc/passwd')).toBe(false);
      expect(isValidKey('lib/./tunes')).toBe(false);
      expect(isValidKey('..')).toBe(false);
    });

    it('rejects backslashes and other path-control characters', () => {
      expect(isValidKey('..\\..\\..\\windows\\win.ini')).toBe(false);
      expect(isValidKey('lib\\tunes\\cherokee')).toBe(false);
      expect(isValidKey('lib/tunes/\0nul')).toBe(false);
    });
  });

  describe('path traversal hardening', () => {
    it('upsertOverride rejects a backslash-based traversal key rather than writing outside overridesDir', async () => {
      await expect(
        store.upsertOverride('..\\..\\..\\evil', { title: 'x', data: '' }),
      ).rejects.toBeInstanceOf(InvalidKeyError);
    });

    it('deleteOverride rejects a dot-dot traversal key', async () => {
      await expect(store.deleteOverride('lib/../../evil')).rejects.toBeInstanceOf(InvalidKeyError);
    });

    it('a rejected key leaves overridesDir empty (validation happens before any write)', async () => {
      await expect(
        store.upsertOverride('..\\..\\..\\evil', { title: 'x', data: '' }),
      ).rejects.toThrow();

      expect(await store.listOverrides()).toEqual([]);
    });
  });
});
