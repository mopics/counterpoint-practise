import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbcData } from '../content';

const tunesClientMocks = vi.hoisted(() => ({
  saveOverride: vi.fn(),
  saveTune: vi.fn(),
  deleteOverride: vi.fn(),
}));
vi.mock('../api/tunesClient', () => tunesClientMocks);

const libraryStoreMock = vi.hoisted(() => ({
  applyOverride: vi.fn(),
  applyNewTune: vi.fn(),
  removeOverride: vi.fn(),
  hasOverride: vi.fn().mockReturnValue(false),
}));
vi.mock('./LibraryStore', () => ({ default: libraryStoreMock }));

const { default: editorStore } = await import('./EditorStore');

const STATIC_ENTRY: AbcData = { id: 'cherokee', key: 'lib/tunes/cherokee', title: 'Cherokee', data: 'ORIGINAL' };
const NEW_TUNE_ENTRY: AbcData = { id: 'x', key: 'lib/my-tunes/x', title: 'X', data: '' };

function key(entry: AbcData): string {
  return entry.key ?? entry.id;
}

describe('EditorStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    libraryStoreMock.hasOverride.mockReturnValue(false);
    await editorStore.resetText(STATIC_ENTRY);
    await editorStore.resetText(NEW_TUNE_ENTRY);
  });

  it('setText tracks an edit and marks the entry as edited', () => {
    editorStore.setText(STATIC_ENTRY, 'EDITED');
    expect(editorStore.textFor(STATIC_ENTRY)).toBe('EDITED');
    expect(editorStore.isEdited(STATIC_ENTRY)).toBe(true);
  });

  it('setText back to the original clears the edit', () => {
    editorStore.setText(STATIC_ENTRY, 'EDITED');
    editorStore.setText(STATIC_ENTRY, 'ORIGINAL');
    expect(editorStore.isEdited(STATIC_ENTRY)).toBe(false);
  });

  it('save() on an existing tune calls saveOverride and applies the result on success', async () => {
    editorStore.setText(STATIC_ENTRY, 'EDITED');
    tunesClientMocks.saveOverride.mockResolvedValue({
      key: key(STATIC_ENTRY),
      title: 'Cherokee',
      data: 'EDITED',
      updatedAt: 'now',
    });

    await editorStore.save(STATIC_ENTRY);

    expect(tunesClientMocks.saveOverride).toHaveBeenCalledWith(
      key(STATIC_ENTRY),
      expect.objectContaining({ title: 'Cherokee', data: 'EDITED' }),
    );
    expect(libraryStoreMock.applyOverride).toHaveBeenCalledTimes(1);
    expect(editorStore.saveStatus.get(key(STATIC_ENTRY))).toBe('saved');
    // A successful save clears the in-progress edit (it's now the persisted baseline).
    expect(editorStore.isEdited(STATIC_ENTRY)).toBe(false);
  });

  it('save() on a new tune calls saveTune and applies the result via applyNewTune', async () => {
    editorStore.setText(NEW_TUNE_ENTRY, 'X:1\n');
    tunesClientMocks.saveTune.mockResolvedValue({
      key: key(NEW_TUNE_ENTRY),
      id: 'x',
      title: 'X',
      data: 'X:1\n',
      createdAt: 'now',
      updatedAt: 'now',
    });

    await editorStore.save(NEW_TUNE_ENTRY);

    expect(tunesClientMocks.saveTune).toHaveBeenCalledWith(key(NEW_TUNE_ENTRY), expect.objectContaining({ data: 'X:1\n' }));
    expect(libraryStoreMock.applyNewTune).toHaveBeenCalledTimes(1);
    expect(editorStore.saveStatus.get(key(NEW_TUNE_ENTRY))).toBe('saved');
  });

  it('save() failure sets error status and leaves the edit untouched', async () => {
    editorStore.setText(STATIC_ENTRY, 'EDITED');
    tunesClientMocks.saveOverride.mockResolvedValue(null);

    await editorStore.save(STATIC_ENTRY);

    expect(editorStore.saveStatus.get(key(STATIC_ENTRY))).toBe('error');
    expect(editorStore.saveError.get(key(STATIC_ENTRY))).toBeTruthy();
    // Nothing typed should be lost on a failed save.
    expect(editorStore.textFor(STATIC_ENTRY)).toBe('EDITED');
    expect(editorStore.isEdited(STATIC_ENTRY)).toBe(true);
    expect(libraryStoreMock.applyOverride).not.toHaveBeenCalled();
  });

  it('setText after a save/error clears the stale status indicator', async () => {
    editorStore.setText(STATIC_ENTRY, 'EDITED');
    tunesClientMocks.saveOverride.mockResolvedValue(null);
    await editorStore.save(STATIC_ENTRY);
    expect(editorStore.saveStatus.get(key(STATIC_ENTRY))).toBe('error');

    editorStore.setText(STATIC_ENTRY, 'EDITED AGAIN');
    expect(editorStore.saveStatus.get(key(STATIC_ENTRY))).toBeUndefined();
    expect(editorStore.saveError.get(key(STATIC_ENTRY))).toBeUndefined();
  });

  it('resetText does not call the server when there is no persisted override', async () => {
    libraryStoreMock.hasOverride.mockReturnValue(false);
    editorStore.setText(STATIC_ENTRY, 'EDITED');

    await editorStore.resetText(STATIC_ENTRY);

    expect(tunesClientMocks.deleteOverride).not.toHaveBeenCalled();
    expect(editorStore.isEdited(STATIC_ENTRY)).toBe(false);
  });

  it('resetText deletes the server override when one exists, and removes it locally on success', async () => {
    libraryStoreMock.hasOverride.mockReturnValue(true);
    tunesClientMocks.deleteOverride.mockResolvedValue(true);

    await editorStore.resetText(STATIC_ENTRY);

    expect(tunesClientMocks.deleteOverride).toHaveBeenCalledWith(key(STATIC_ENTRY));
    expect(libraryStoreMock.removeOverride).toHaveBeenCalledWith(key(STATIC_ENTRY));
  });

  it('resetText leaves the override in place locally if the server delete fails', async () => {
    libraryStoreMock.hasOverride.mockReturnValue(true);
    tunesClientMocks.deleteOverride.mockResolvedValue(false);

    await editorStore.resetText(STATIC_ENTRY);

    expect(libraryStoreMock.removeOverride).not.toHaveBeenCalled();
  });
});
