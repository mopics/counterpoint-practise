import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { AbcData } from '../content';
import { deleteOverride, saveOverride, saveTune } from '../api/tunesClient';
import libraryStore from './LibraryStore';

const COMMIT_DEBOUNCE_MS = 400;
const MY_TUNES_PREFIX = 'lib/my-tunes/';

export type SaveStatus = 'saving' | 'saved' | 'error';

function keyFor(entry: AbcData): string {
  return entry.key ?? entry.id;
}

/**
 * Session-only editing state for library entries. Two maps per entry:
 * `edits` updates on every keystroke and drives the textarea directly;
 * `committed` updates ~400ms after typing pauses and is what SheetView and
 * PlaybackStore consume, so re-parsing/re-priming the synth doesn't happen
 * on every keystroke. An entry is only present in either map while its text
 * differs from the original — reverting to the original clears it out.
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

  /** The text for the textarea: the in-progress edit, or the entry's original source. */
  textFor(entry: AbcData): string {
    return this.edits.get(keyFor(entry)) ?? entry.data ?? '';
  }

  /** The text SheetView/PlaybackStore should render/play: the debounced edit, or the original. */
  currentAbcSource(entry: AbcData): string {
    return this.committed.get(keyFor(entry)) ?? entry.data ?? '';
  }

  isEdited(entry: AbcData): boolean {
    return this.edits.has(keyFor(entry));
  }

  setText(entry: AbcData, text: string): void {
    const key = keyFor(entry);
    const original = entry.data ?? '';
    if (text === original) this.edits.delete(key);
    else this.edits.set(key, text);
    // A fresh edit invalidates whatever the last save/error indicator said.
    this.saveStatus.delete(key);
    this.saveError.delete(key);

    const existingTimer = this.commitDebounce.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    this.commitDebounce.set(key, setTimeout(() => {
      runInAction(() => this.commit(entry, text));
    }, COMMIT_DEBOUNCE_MS));
  }

  /** Clears in-progress edit state. Reverting a *saved* override also asks the server to drop it. */
  async resetText(entry: AbcData): Promise<void> {
    const key = keyFor(entry);
    this.clearLocalEdit(key);
    if (libraryStore.hasOverride(key)) {
      const ok = await deleteOverride(key);
      if (ok) runInAction(() => libraryStore.removeOverride(key));
    }
  }

  /** Persists the current text as a new tune or an override of an existing one. */
  async save(entry: AbcData): Promise<void> {
    const key = keyFor(entry);
    this.saveStatus.set(key, 'saving');
    this.saveError.delete(key);
    // textFor(), not currentAbcSource(): the latter lags behind the live edit by
    // up to the 400ms commit debounce, so saving right after typing could persist stale text.
    const input = { title: entry.title, data: this.textFor(entry), video: entry.video };

    if (key.startsWith(MY_TUNES_PREFIX)) {
      const record = await saveTune(key, input);
      this.finishSave(key, record, (r) => libraryStore.applyNewTune(r));
      return;
    }
    const record = await saveOverride(key, input);
    this.finishSave(key, record, (r) => libraryStore.applyOverride(r));
  }

  private finishSave<T>(key: string, record: T | null, apply: (record: T) => void): void {
    runInAction(() => {
      if (!record) {
        this.saveStatus.set(key, 'error');
        this.saveError.set(key, 'Could not reach the server — your edit is still here, try again.');
        return;
      }
      apply(record);
      this.clearLocalEdit(key);
      this.saveStatus.set(key, 'saved');
    });
  }

  private clearLocalEdit(key: string): void {
    this.edits.delete(key);
    this.committed.delete(key);
    this.saveStatus.delete(key);
    this.saveError.delete(key);
    const existingTimer = this.commitDebounce.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.commitDebounce.delete(key);
    }
  }

  private commit(entry: AbcData, text: string): void {
    const key = keyFor(entry);
    const original = entry.data ?? '';
    if (text === original) this.committed.delete(key);
    else this.committed.set(key, text);
    this.commitDebounce.delete(key);
  }
}

export default new EditorStore();
