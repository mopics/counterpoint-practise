import { actionBound, makeObservable, observable, observableRef, reaction, runInAction } from 'mobx';
import { synthEngine } from '../playback/synthEngine';
import type { AbcData } from '../content';
import type { EventRef, FlattenedTune } from '../abc/types';
import { orderedRange } from '../abc/eventRef';
import { endSecondsForRef, secondsForRef } from '../abc/timing';
import libraryStore from './LibraryStore';
import editorStore from './EditorStore';

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

class PlaybackStore {
  status: PlaybackStatus = 'idle';
  cursor: EventRef | null = null;
  loopStart: EventRef | null = null;
  loopEnd: EventRef | null = null;
  loopEnabled = false;
  flattened: FlattenedTune | null = null;
  swing = synthEngine.getSwing();

  private swingDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastLoadedEntry: AbcData | null = null;

  constructor() {
    makeObservable(this, {
      status: observable,
      cursor: observableRef,
      loopStart: observableRef,
      loopEnd: observableRef,
      loopEnabled: observable,
      flattened: observableRef,
      swing: observable,
      loadSelected: actionBound,
      play: actionBound,
      pause: actionBound,
      stop: actionBound,
      setSelectionRange: actionBound,
      clearLoop: actionBound,
      toggleLoopEnabled: actionBound,
      setCursor: actionBound,
      handleEnded: actionBound,
      setSwing: actionBound,
    });

    synthEngine.onCursor((ref) => this.setCursor(ref));
    synthEngine.onEnded(() => this.handleEnded());

    reaction(
      () => ({
        entry: libraryStore.selected,
        abcSource: editorStore.currentAbcSource(libraryStore.selected),
      }),
      ({ entry, abcSource }) => {
        const isEntrySwitch = entry !== this.lastLoadedEntry;
        this.lastLoadedEntry = entry;
        void this.loadSelected(abcSource, isEntrySwitch);
      },
      { fireImmediately: true },
    );
  }

  setCursor(ref: EventRef | null): void {
    this.cursor = ref;
  }

  async loadSelected(abcSource: string, isEntrySwitch: boolean): Promise<void> {
    if (!abcSource) return;

    const wasPlaying = this.status === 'playing';
    this.status = 'loading';
    if (isEntrySwitch) {
      this.loopStart = null;
      this.loopEnd = null;
      this.loopEnabled = false;
    }
    this.cursor = null;

    try {
      const flattened = await synthEngine.load(abcSource);
      runInAction(() => {
        this.flattened = flattened;
        this.status = 'idle';
        if (!isEntrySwitch && wasPlaying) this.play();
      });
    } catch (err) {
      console.error('Failed to load tune for playback:', err);
      runInAction(() => {
        this.status = 'idle';
      });
    }
  }

  play(): void {
    if (this.status === 'loading') return;
    this.applyLoopRegion();
    synthEngine.play();
    this.status = 'playing';
  }

  pause(): void {
    synthEngine.pause();
    this.status = 'paused';
  }

  stop(): void {
    synthEngine.stop();
    this.status = 'idle';
    this.cursor = null;
  }

  handleEnded(): void {
    this.status = 'idle';
    this.cursor = null;
  }

  setSelectionRange(start: EventRef | null, end: EventRef | null): void {
    this.loopStart = start;
    this.loopEnd = end;
    this.loopEnabled = !!(start && end);
  }

  clearLoop(): void {
    this.loopStart = null;
    this.loopEnd = null;
    this.loopEnabled = false;
    synthEngine.setLoopRegion(null);
  }

  toggleLoopEnabled(): void {
    if (!this.loopStart || !this.loopEnd) return;
    this.loopEnabled = !this.loopEnabled;
    if (this.status === 'playing') this.applyLoopRegion();
  }

  /** Updates the swing readout immediately; the (re-priming) engine call is debounced so dragging the slider doesn't thrash it. */
  setSwing(value: number): void {
    this.swing = value;
    if (this.swingDebounce) clearTimeout(this.swingDebounce);
    this.swingDebounce = setTimeout(() => {
      void synthEngine.setSwing(value);
    }, 200);
  }

  private applyLoopRegion(): void {
    if (!this.loopEnabled || !this.loopStart || !this.loopEnd) {
      synthEngine.setLoopRegion(null);
      return;
    }
    const [lo, hi] = orderedRange(this.loopStart, this.loopEnd);
    const table = synthEngine.getTimingTable();
    const startSec = secondsForRef(table, lo);
    const endSec = endSecondsForRef(table, hi);
    synthEngine.setLoopRegion(startSec !== null && endSec !== null ? { startSec, endSec } : null);
  }
}

export default new PlaybackStore();
