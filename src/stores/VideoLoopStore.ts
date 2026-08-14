import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { AbcData } from '../content';

const STORAGE_KEY = 'videoLoopEntries';

export interface VideoLoopEntry {
  url: string;
  loopStart: number | null;
  loopEnd: number | null;
  loopEnabled: boolean;
}

function defaultEntry(): VideoLoopEntry {
  return { url: '', loopStart: null, loopEnd: null, loopEnabled: false };
}

function keyFor(entry: AbcData): string {
  return entry.key ?? entry.id;
}

function loadEntries(): Record<string, VideoLoopEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, VideoLoopEntry>) : {};
  } catch {
    return {};
  }
}

/** Per-tune persisted video URL + loop region, keyed the same way EditorStore keys its edit maps. */
class VideoLoopStore {
  private entries = observable.map<string, VideoLoopEntry>(loadEntries());

  constructor() {
    makeObservable(this, {
      setUrl: actionBound,
      setLoopStart: actionBound,
      setLoopEnd: actionBound,
      toggleLoopEnabled: actionBound,
    });
  }

  entryFor(entry: AbcData): VideoLoopEntry {
    return this.entries.get(keyFor(entry)) ?? defaultEntry();
  }

  setUrl(entry: AbcData, url: string): void {
    this.update(entry, { url });
  }

  setLoopStart(entry: AbcData, loopStart: number | null): void {
    this.update(entry, { loopStart });
  }

  setLoopEnd(entry: AbcData, loopEnd: number | null): void {
    this.update(entry, { loopEnd });
  }

  toggleLoopEnabled(entry: AbcData): void {
    const current = this.entryFor(entry);
    if (current.loopStart === null || current.loopEnd === null) return;
    this.update(entry, { loopEnabled: !current.loopEnabled });
  }

  private update(entry: AbcData, patch: Partial<VideoLoopEntry>): void {
    const key = keyFor(entry);
    const next = { ...this.entryFor(entry), ...patch };
    runInAction(() => {
      this.entries.set(key, next);
      this.persist();
    });
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.entries)));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }
}

export default new VideoLoopStore();
