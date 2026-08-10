import type * as abcjs from 'abcjs';
import type { EventRef, FlattenedTune } from './types';
import { compareEventRef } from './eventRef';

export interface TimedEvent {
  ref: EventRef;
  startSec: number;
  durationSec: number;
}

/** Maps each event's source `startChar` to its rendered (line, event) coordinate. */
function buildStartCharIndex(flattened: FlattenedTune): Map<number, EventRef> {
  const index = new Map<number, EventRef>();
  for (const line of flattened.lines) {
    line.events.forEach((event, eventIndex) => {
      index.set(event.startChar, { lineIndex: line.lineIndex, eventIndex });
    });
  }
  return index;
}

/**
 * Builds the cursor/loop timing table from `tune.setUpAudio()` — the exact
 * repeat-resolved, triplet-compressed, tempo-scaled note schedule abcjs's
 * own synth uses to actually schedule audio (`create-synth.js` calls this
 * same method internally). A hand-rolled walk of the raw parsed durations
 * (the previous approach here) silently desyncs on both repeat signs (the
 * real audio replays repeated sections; a naive duration walk counts them
 * once) and triplets (abcjs leaves a triplet note's parsed `duration` at
 * its nominal, pre-compression value — the real scheduled duration is
 * `duration * tripletMultiplier`, applied only inside this audio-track
 * resolution, not in the plain parsed voice data this app renders from).
 *
 * `setUpAudio()`'s own `start`/`duration` fields are in whole-note-fraction
 * units (not seconds) — converted here via `240 / tempo`, matching the same
 * qpm-to-seconds formula abcjs uses internally.
 *
 * Rests never appear in the audio track (there's no note to schedule), so
 * they get no table entry; during a rest the cursor simply holds on the
 * previously sounded note until the next real note's start time.
 */
export function computeTimingTable(tune: abcjs.TuneObject, flattened: FlattenedTune): TimedEvent[] {
  const startCharIndex = buildStartCharIndex(flattened);
  const audio = tune.setUpAudio({});
  const secondsPerUnit = 240 / (audio.tempo || flattened.qpm || 120);
  const melodyTrack = audio.tracks[0] ?? [];

  const table: TimedEvent[] = [];
  for (const item of melodyTrack) {
    if (item.cmd !== 'note') continue;
    const ref = startCharIndex.get(item.startChar);
    if (!ref) continue; // grace notes and similar synthetic entries carry no startChar
    table.push({
      ref,
      startSec: item.start * secondsPerUnit,
      durationSec: item.duration * secondsPerUnit,
    });
  }

  table.sort((a, b) => a.startSec - b.startSec);
  return table;
}

function findEntry(table: TimedEvent[], ref: EventRef): TimedEvent | undefined {
  return table.find((e) => e.ref.lineIndex === ref.lineIndex && e.ref.eventIndex === ref.eventIndex);
}

/** The table entry at or after `ref` (in score order) that's nearest to it — `ref` itself has none, e.g. it's a rest. */
function nearestEntryAtOrAfter(table: TimedEvent[], ref: EventRef): TimedEvent | undefined {
  let best: TimedEvent | undefined;
  for (const entry of table) {
    if (compareEventRef(entry.ref, ref) >= 0 && (!best || compareEventRef(entry.ref, best.ref) < 0)) best = entry;
  }
  return best;
}

/** The table entry at or before `ref` (in score order) that's nearest to it — `ref` itself has none, e.g. it's a rest. */
function nearestEntryAtOrBefore(table: TimedEvent[], ref: EventRef): TimedEvent | undefined {
  let best: TimedEvent | undefined;
  for (const entry of table) {
    if (compareEventRef(entry.ref, ref) <= 0 && (!best || compareEventRef(entry.ref, best.ref) > 0)) best = entry;
  }
  return best;
}

/**
 * A loop-region endpoint picked by dragging on the staff can land on a rest,
 * which (per the note above) has no table entry of its own. Rather than
 * treat that as "no timing available" and silently drop the whole loop
 * region, resolve it to the nearest note that actually sounds — the next
 * one for a start bound, the previous one for an end bound.
 */
export function secondsForRef(table: TimedEvent[], ref: EventRef): number | null {
  const entry = findEntry(table, ref) ?? nearestEntryAtOrAfter(table, ref);
  return entry?.startSec ?? null;
}

export function endSecondsForRef(table: TimedEvent[], ref: EventRef): number | null {
  const entry = findEntry(table, ref) ?? nearestEntryAtOrBefore(table, ref);
  return entry ? entry.startSec + entry.durationSec : null;
}
