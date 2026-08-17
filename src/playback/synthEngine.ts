import * as abcjs from 'abcjs';
import { parseTune } from '../abc/parseTune';
import { flattenTune } from '../abc/flatten';
import { computeTimingTable, type TimedEvent } from '../abc/timing';
import { extractKeyMarkers } from '../abc/keyMarkers';
import { extractChordGrips } from '../abc/chordGrips';
import type { EventRef, FlattenedTune } from '../abc/types';

type CursorListener = (ref: EventRef | null) => void;
type EndedListener = () => void;

interface LoopRegion {
  startSec: number;
  endSec: number;
}

function getAudioContextCtor(): typeof AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!ctor) throw new Error('Web Audio API is not supported in this browser.');
  return ctor;
}

/**
 * Thin imperative wrapper around abcjs's synth, driven off a parse-only
 * TuneObject (no abcjs-rendered SVG involved).
 *
 * abcjs's own cursor mechanism (`TimingCallbacks`) turns out to require a
 * *rendered* TuneObject: internally it calls `tune.setTiming()`, which bails
 * out (`"setTiming cannot be called before the tune is drawn"`, returning no
 * timings at all) unless `tune.engraver.staffgroups` exists — which only
 * `abcjs.renderAbc` populates. Since this app never renders via abcjs, that
 * path is unusable. Cursor position is instead computed locally: a
 * duration+tempo timing table (see `abc/timing.ts`) is walked against the
 * AudioContext's own clock on every animation frame, fully independent of
 * abcjs's internal timing/cursor code — only its synth is used, for audio.
 */
class SynthEngine {
  private audioContext: AudioContext | null = null;
  private synth: abcjs.MidiBuffer | null = null;
  private synthGeneration = 0;
  private currentTune: abcjs.TuneObject | null = null;
  private timingTable: TimedEvent[] = [];
  private cursorListeners = new Set<CursorListener>();
  private endedListeners = new Set<EndedListener>();
  private loopRegion: LoopRegion | null = null;

  private rafHandle: number | null = null;
  private isRunning = false;
  /**
   * abcjs's synth fires its onEnded callback whenever the underlying
   * AudioBufferSourceNode stops for *any* reason — including a
   * programmatic seek/pause/stop while still playing, not just a natural
   * end-of-tune. Set right before such a call so the resulting phantom
   * onEnded (if the browser fires one) is swallowed instead of being
   * misread as the tune finishing and re-triggering loop/ended handling.
   */
  private ignoreNextEnded = false;
  /** Tune-time (seconds) already elapsed as of the last start/resume/seek. */
  private elapsedAtLastStart = 0;
  /** AudioContext.currentTime at the last start/resume/seek. */
  private audioContextTimeAtLastStart = 0;

  /**
   * Eighth-note swing amount, in abcjs's own units: <=50 is straight, 66 is
   * classic 2:1 triplet swing, 75 (its max) is dotted-eighth/sixteenth. Only
   * affects eighth notes in X/4 and X/8 meters — abcjs's own restriction.
   * Persists across tune switches (it's a playback preference, not per-tune).
   */
  private swingAmount = 50;

  onCursor(cb: CursorListener): () => void {
    this.cursorListeners.add(cb);
    return () => this.cursorListeners.delete(cb);
  }

  onEnded(cb: EndedListener): () => void {
    this.endedListeners.add(cb);
    return () => this.endedListeners.delete(cb);
  }

  async load(abcSource: string): Promise<FlattenedTune> {
    this.teardown();

    // Strip **K** key-root markers and $...$ chord-grip markers before
    // handing the source to abcjs, same as SheetView.tsx's parseSheet() —
    // otherwise abcjs parses the leftover marker text as real
    // notes/characters, desyncing this timing table's event sequence from
    // the one actually rendered on screen.
    const { cleanAbc: afterKeyMarkers } = extractKeyMarkers(abcSource);
    const { cleanAbc } = extractChordGrips(afterKeyMarkers);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    this.timingTable = computeTimingTable(tune, flattened);
    this.currentTune = tune;

    if (!this.audioContext) {
      this.audioContext = new (getAudioContextCtor())();
    }

    this.synth = await this.createSynth(tune);

    this.elapsedAtLastStart = 0;
    return flattened;
  }

  private async createSynth(tune: abcjs.TuneObject): Promise<abcjs.MidiBuffer> {
    if (!this.audioContext) throw new Error('createSynth called before an AudioContext exists.');
    // A synth replaced mid-playback (e.g. by setSwing) can still fire its
    // stale onEnded after being stopped; a generation token stops that from
    // being misattributed to whatever synth is current by the time it fires.
    const generation = ++this.synthGeneration;
    const synth = new abcjs.synth.CreateSynth();
    await synth.init({
      audioContext: this.audioContext,
      visualObj: tune,
      options: {
        soundFontUrl: '/sf/FluidR3_GM/',
        swing: this.swingAmount,
        onEnded: () => {
          if (generation !== this.synthGeneration) return;
          if (this.ignoreNextEnded) {
            this.ignoreNextEnded = false;
            return;
          }
          this.handleEnded();
        },
      },
    });
    await synth.prime();
    return synth;
  }

  setLoopRegion(region: LoopRegion | null): void {
    this.loopRegion = region;
  }

  /** The audio-accurate (repeat-resolved, triplet-compressed) timing table for the current tune. */
  getTimingTable(): TimedEvent[] {
    return this.timingTable;
  }

  getSwing(): number {
    return this.swingAmount;
  }

  /**
   * Re-primes the synth with the new swing amount, preserving playback
   * position and running/paused state — swing is baked into the scheduled
   * note sequence at prime()-time, so it can't be tweaked on a live synth.
   */
  async setSwing(amount: number): Promise<void> {
    this.swingAmount = amount;
    if (!this.currentTune || !this.audioContext) return;

    const wasRunning = this.isRunning;
    const resumeAt = this.currentElapsed();

    this.synth?.stop();
    this.cancelTick();
    this.isRunning = false;

    this.synth = await this.createSynth(this.currentTune);

    this.elapsedAtLastStart = resumeAt;
    this.audioContextTimeAtLastStart = this.audioContext.currentTime;
    if (resumeAt > 0) this.synth.seek(resumeAt, 'seconds');

    if (wasRunning) {
      this.synth.start();
      this.isRunning = true;
      this.scheduleTick();
    }
  }

  play(): void {
    if (!this.synth || !this.audioContext) return;
    const resumeFrom =
      this.loopRegion && this.elapsedAtLastStart < this.loopRegion.startSec
        ? this.loopRegion.startSec
        : this.elapsedAtLastStart;

    if (resumeFrom > 0) this.synth.seek(resumeFrom, 'seconds');
    this.synth.start();
    this.elapsedAtLastStart = resumeFrom;
    this.audioContextTimeAtLastStart = this.audioContext.currentTime;
    this.isRunning = true;
    this.scheduleTick();
  }

  pause(): void {
    if (!this.isRunning) return;
    this.elapsedAtLastStart = this.currentElapsed();
    this.ignoreNextEnded = true;
    this.synth?.pause();
    this.isRunning = false;
    this.cancelTick();
  }

  stop(): void {
    if (this.isRunning) this.ignoreNextEnded = true;
    this.synth?.stop();
    this.isRunning = false;
    this.cancelTick();
    this.elapsedAtLastStart = 0;
    this.emitCursor(null);
  }

  seekSeconds(sec: number): void {
    this.elapsedAtLastStart = sec;
    this.audioContextTimeAtLastStart = this.audioContext?.currentTime ?? 0;
    this.synth?.seek(sec, 'seconds');
  }

  private handleEnded(): void {
    if (this.loopRegion) {
      // seekSeconds() already restarts audio at the loop start: since the
      // synth is still marked running, its own seek() internally stops the
      // finished source and kicks off a fresh one at the new position — no
      // separate start() call needed (that used to fire a second, overlapping
      // source on every loop restart).
      this.seekSeconds(this.loopRegion.startSec);
      this.isRunning = true;
      this.scheduleTick();
      return;
    }
    this.isRunning = false;
    this.cancelTick();
    this.emitCursor(null);
    for (const cb of this.endedListeners) cb();
  }

  private currentElapsed(): number {
    if (!this.isRunning || !this.audioContext) return this.elapsedAtLastStart;
    return this.elapsedAtLastStart + (this.audioContext.currentTime - this.audioContextTimeAtLastStart);
  }

  private findEventAt(sec: number): EventRef | null {
    let found: TimedEvent | null = null;
    for (const entry of this.timingTable) {
      if (entry.startSec <= sec) found = entry;
      else break;
    }
    return found?.ref ?? null;
  }

  private emitCursor(ref: EventRef | null): void {
    for (const cb of this.cursorListeners) cb(ref);
  }

  private scheduleTick(): void {
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  private cancelTick(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private tick = (): void => {
    if (!this.isRunning) return;
    const elapsed = this.currentElapsed();

    if (this.loopRegion && elapsed >= this.loopRegion.endSec) {
      this.ignoreNextEnded = true;
      this.seekSeconds(this.loopRegion.startSec);
      this.scheduleTick();
      return;
    }

    this.emitCursor(this.findEventAt(elapsed));
    this.scheduleTick();
  };

  private teardown(): void {
    this.synth?.stop();
    this.cancelTick();
    this.synth = null;
    this.isRunning = false;
    this.loopRegion = null;
    this.elapsedAtLastStart = 0;
  }
}

export const synthEngine = new SynthEngine();
