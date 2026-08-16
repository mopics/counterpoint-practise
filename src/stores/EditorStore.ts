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
