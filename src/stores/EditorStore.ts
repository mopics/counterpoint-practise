import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { AbcData } from '../content';

const COMMIT_DEBOUNCE_MS = 400;

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

  constructor() {
    makeObservable(this, {
      setText: actionBound,
      resetText: actionBound,
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

    const existingTimer = this.commitDebounce.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    this.commitDebounce.set(key, setTimeout(() => {
      runInAction(() => this.commit(entry, text));
    }, COMMIT_DEBOUNCE_MS));
  }

  resetText(entry: AbcData): void {
    const key = keyFor(entry);
    this.edits.delete(key);
    this.committed.delete(key);
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
