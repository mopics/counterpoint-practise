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
