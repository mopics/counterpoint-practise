import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { TuneRecord } from '../api/tunesClient';
import { parseTimeInput } from '../video/timeFormat';

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

/**
 * Fallback used only when nothing has been saved for this tune yet — mirrors
 * EditorStore's original-text fallback. An abc-object's `video` field (e.g.
 * `{ url, start: "0:14", end: "0:24" }`) seeds the panel until the user
 * makes their own edit, at which point the persisted edit takes over and
 * this fallback is never consulted again for that tune.
 */
function defaultFromAbcData(entry: TuneRecord): VideoLoopEntry {
  if (!entry.video) return defaultEntry();
  return {
    url: entry.video.url,
    loopStart: parseTimeInput(entry.video.start),
    loopEnd: parseTimeInput(entry.video.end),
    loopEnabled: false,
  };
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

  entryFor(entry: TuneRecord): VideoLoopEntry {
    return this.entries.get(entry.id) ?? defaultFromAbcData(entry);
  }

  setUrl(entry: TuneRecord, url: string): void {
    this.update(entry, { url });
  }

  setLoopStart(entry: TuneRecord, loopStart: number | null): void {
    this.update(entry, { loopStart });
  }

  setLoopEnd(entry: TuneRecord, loopEnd: number | null): void {
    this.update(entry, { loopEnd });
  }

  toggleLoopEnabled(entry: TuneRecord): void {
    const current = this.entryFor(entry);
    if (current.loopStart === null || current.loopEnd === null) return;
    this.update(entry, { loopEnabled: !current.loopEnabled });
  }

  private update(entry: TuneRecord, patch: Partial<VideoLoopEntry>): void {
    const key = entry.id;
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
