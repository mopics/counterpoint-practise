import { reaction } from 'mobx';
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
    localStorage.clear();
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

  it('childrenOf(null) is MobX-reactive to createFolder even though it only mutates the node index maps', async () => {
    const libraryStore = await freshStore([]);
    const created = folder({ id: 'new-f', title: 'New Folder', parentId: null });
    tunesClientMocks.createFolder.mockResolvedValue(created);

    const seen: string[][] = [];
    const dispose = reaction(
      () => libraryStore.childrenOf(null).map((n) => n.id),
      (ids) => seen.push(ids),
    );

    // createFolder only touches nodesById/childrenByParent - it never assigns
    // currentFolderId or selected - so this only proves reactivity if the
    // index maps themselves are observable.
    await libraryStore.createFolder('New Folder');

    dispose();
    expect(seen).toEqual([['new-f']]);
  });

  it('breadcrumb is MobX-reactive to rename() of a folder in the trail, which only mutates the node index maps', async () => {
    const outer = folder({ id: 'outer', title: 'Outer', parentId: null });
    const inner = folder({ id: 'inner', title: 'Inner', parentId: 'outer' });
    const libraryStore = await freshStore([outer, inner]);
    libraryStore.navigateTo('inner');
    const renamedOuter = folder({ id: 'outer', title: 'Renamed Outer', parentId: null });
    tunesClientMocks.renameFolder.mockResolvedValue(renamedOuter);

    const seen: string[][] = [];
    const dispose = reaction(
      () => libraryStore.breadcrumb.map((f) => f.title),
      (titles) => seen.push(titles),
    );

    // rename() on a folder that isn't currentFolderId/selected only touches
    // nodesById/childrenByParent - proves breadcrumb reacts to node index changes.
    await libraryStore.rename('outer', 'Renamed Outer');

    dispose();
    expect(seen).toEqual([['Renamed Outer', 'Inner']]);
  });

  it('createFolder returns true and adds the node locally on success', async () => {
    const libraryStore = await freshStore([]);
    const created = folder({ id: 'new-f', title: 'New Folder', parentId: null });
    tunesClientMocks.createFolder.mockResolvedValue(created);

    const result = await libraryStore.createFolder('New Folder');

    expect(result).toBe(true);
  });

  it('createFolder is a no-op locally and returns false when the API call fails', async () => {
    const libraryStore = await freshStore([]);
    tunesClientMocks.createFolder.mockResolvedValue(null);

    const result = await libraryStore.createFolder('New Folder');

    expect(result).toBe(false);
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

  it('createTune is a no-op locally and returns null when the API call fails', async () => {
    const libraryStore = await freshStore([]);
    tunesClientMocks.createTune.mockResolvedValue(null);

    const result = await libraryStore.createTune('New Tune');

    expect(result).toBeNull();
    expect(libraryStore.childrenOf(null)).toEqual([]);
  });

  it('createTune defaults data to an empty string when omitted', async () => {
    const libraryStore = await freshStore([]);
    tunesClientMocks.createTune.mockResolvedValue(tune({ id: 'new-t', title: 'New Tune', parentId: null }));

    await libraryStore.createTune('New Tune');

    expect(tunesClientMocks.createTune).toHaveBeenCalledWith({ parentId: null, title: 'New Tune', data: '' });
  });

  it('createTune passes through a given data string (e.g. generated ABC)', async () => {
    const libraryStore = await freshStore([]);
    tunesClientMocks.createTune.mockResolvedValue(tune({ id: 'new-t', title: 'New Tune', parentId: null }));

    await libraryStore.createTune('New Tune', 'X:1\nT:New Tune\nK:C\nCDEF|\n');

    expect(tunesClientMocks.createTune).toHaveBeenCalledWith({
      parentId: null,
      title: 'New Tune',
      data: 'X:1\nT:New Tune\nK:C\nCDEF|\n',
    });
  });

  it('rename on a folder calls renameFolder and patches the local node', async () => {
    const f = folder({ id: 'f1', title: 'Old Name' });
    const libraryStore = await freshStore([f]);
    const renamed = folder({ id: 'f1', title: 'New Name' });
    tunesClientMocks.renameFolder.mockResolvedValue(renamed);

    const result = await libraryStore.rename('f1', 'New Name');

    expect(result).toBe(true);
    expect(tunesClientMocks.renameFolder).toHaveBeenCalledWith('f1', { title: 'New Name' });
    expect(libraryStore.childrenOf(null).find((n) => n.id === 'f1')?.title).toBe('New Name');
  });

  it('rename returns false and leaves the node unchanged when the API call fails', async () => {
    const f = folder({ id: 'f1', title: 'Old Name' });
    const libraryStore = await freshStore([f]);
    tunesClientMocks.renameFolder.mockResolvedValue(null);

    const result = await libraryStore.rename('f1', 'New Name');

    expect(result).toBe(false);
    expect(libraryStore.childrenOf(null).find((n) => n.id === 'f1')?.title).toBe('Old Name');
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

  it('remove surfaces "error" and keeps the node locally when the API call fails', async () => {
    const t = tune({ id: 't1', title: 'Tune', parentId: null });
    const libraryStore = await freshStore([t]);
    tunesClientMocks.deleteTune.mockResolvedValue(false);

    const result = await libraryStore.remove('t1');

    expect(result).toBe('error');
    expect(libraryStore.childrenOf(null).map((n) => n.id)).toEqual(['t1']);
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

  it('setSelected persists the tune id to localStorage', async () => {
    const f = folder({ id: 'f1', title: 'Folder' });
    const t = tune({ id: 't1', title: 'Tune', parentId: 'f1' });
    const libraryStore = await freshStore([f, t]);

    libraryStore.setSelected(t);

    expect(localStorage.getItem('lastSelectedTuneId')).toBe('t1');
  });

  it('restores the persisted tune as selected on load, overriding the depth-first default', async () => {
    localStorage.setItem('lastSelectedTuneId', 't2');
    const t1 = tune({ id: 't1', title: 'A Tune', parentId: null });
    const t2 = tune({ id: 't2', title: 'Z Tune', parentId: null });
    const libraryStore = await freshStore([t1, t2]);

    expect(libraryStore.selected?.id).toBe('t2');
    expect(libraryStore.currentFolderId).toBe(null);
  });

  it('falls back to the depth-first default when the persisted tune id no longer exists', async () => {
    localStorage.setItem('lastSelectedTuneId', 'does-not-exist');
    const t = tune({ id: 't1', title: 'Only Tune', parentId: null });
    const libraryStore = await freshStore([t]);

    expect(libraryStore.selected?.id).toBe('t1');
  });

  it('falls back to the depth-first default when nothing is persisted', async () => {
    const t = tune({ id: 't1', title: 'Only Tune', parentId: null });
    const libraryStore = await freshStore([t]);

    expect(libraryStore.selected?.id).toBe('t1');
  });

  it("remove()'s auto-reselect persists the new selection", async () => {
    const t1 = tune({ id: 't1', title: 'A Tune', parentId: null });
    const t2 = tune({ id: 't2', title: 'B Tune', parentId: null });
    const libraryStore = await freshStore([t1, t2]);
    tunesClientMocks.deleteTune.mockResolvedValue(true);

    await libraryStore.remove('t1');

    expect(localStorage.getItem('lastSelectedTuneId')).toBe('t2');
  });

  it('remove() on the last tune clears the persisted selection', async () => {
    const t1 = tune({ id: 't1', title: 'Only Tune', parentId: null });
    const libraryStore = await freshStore([t1]);
    tunesClientMocks.deleteTune.mockResolvedValue(true);

    await libraryStore.remove('t1');

    expect(localStorage.getItem('lastSelectedTuneId')).toBeNull();
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
