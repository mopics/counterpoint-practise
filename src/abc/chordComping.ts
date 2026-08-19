import type * as abcjs from 'abcjs';
import type { FlattenedTune } from './types';
import type { ChordGripOverlay, ChordGripSpec } from './chordGrips';

export interface CompingEvent {
  kind: 'note' | 'rest';
  startChar: number;
  endChar: number;
  duration: number;
}

export interface CompingLine {
  lineIndex: number;
  events: CompingEvent[];
}

export interface CompingVoice {
  lines: CompingLine[];
}

interface RawCompingItem {
  el_type: string;
  startChar: number;
  endChar: number;
  duration: number;
  rest?: { type: string };
}

/**
 * Extracts the rhythm-only comping voice (V:2) from a parsed tune, ignoring
 * its pitch entirely (V:2 notes carry a placeholder pitch the author picks
 * for typing convenience — only kind/duration/char-range matter here).
 * Mirrors flatten.ts's line-skip logic (subtitle lines skipped, lineIndex
 * incremented only for staff-bearing lines) so lineIndex numbering stays in
 * sync with FlattenedTune.lines, which callers rely on to correlate the two.
 * Returns null when the tune has no second voice — abcjs puts V:2 on its own
 * staff (tuneLine.staff[1]), not as a second voice of staff[0] (verified
 * empirically; see this plan's Global Constraints).
 */
export function extractCompingVoice(tune: abcjs.TuneObject): CompingVoice | null {
  const hasSecondVoice = tune.lines.some((l) => !l.subtitle && (l.staff?.length ?? 0) > 1);
  if (!hasSecondVoice) return null;

  const lines: CompingLine[] = [];
  let lineIndex = 0;
  for (const tuneLine of tune.lines) {
    if (tuneLine.subtitle) continue;
    if (!tuneLine.staff?.length) continue;

    const events: CompingEvent[] = [];
    const voice = tuneLine.staff[1]?.voices?.[0];
    if (voice) {
      for (const item of voice as unknown as RawCompingItem[]) {
        if (item.el_type !== 'note') continue;
        events.push({
          kind: item.rest ? 'rest' : 'note',
          startChar: item.startChar,
          endChar: item.endChar,
          duration: item.duration,
        });
      }
    }
    lines.push({ lineIndex, events });
    lineIndex++;
  }
  return { lines };
}

export interface CompingAlignmentLine {
  grips: (ChordGripSpec | null)[];
}

export interface CompingAlignment {
  lines: CompingAlignmentLine[];
}

/**
 * For each V:2 comping event, finds the chord grip active at that moment in
 * V:1 — "active" means the most recently written grip at or before the
 * comping event's time position, held forward until the next one (a chord
 * holds until the next chord symbol). Time position is cumulative `duration`
 * from the tune's start, walked in written order across all lines (not real
 * seconds, so it's tempo-independent) — both voices share one written bar
 * structure, so this stays correct without unrolling repeats.
 *
 * `active` is intentionally declared outside the per-event loop and only
 * updated when an actual grip-onset event is encountered (i.e., when the
 * melody-timeline entry carries a non-null grip). This allows a held grip to
 * survive walking past intervening melody events that carry no grip of their
 * own, so a grip correctly persists across several consecutive comping notes
 * even when none of them coincide with a new V:1 grip-onset event.
 */
export function alignCompingToGrips(
  compingVoice: CompingVoice,
  flattened: FlattenedTune,
  chordGripOverlay: ChordGripOverlay,
): CompingAlignment {
  const melodyTimeline: { time: number; grip: ChordGripSpec | null }[] = [];
  let melodyTime = 0;
  flattened.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      melodyTimeline.push({ time: melodyTime, grip: chordGripOverlay.lines[lineIndex]?.grips[eventIndex] ?? null });
      melodyTime += event.duration;
    });
  });

  const linesOut: CompingAlignmentLine[] = compingVoice.lines.map((line) => ({
    grips: new Array<ChordGripSpec | null>(line.events.length).fill(null),
  }));

  let melodyIdx = 0;
  let compingTime = 0;
  let active: ChordGripSpec | null = null;
  compingVoice.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      while (melodyIdx < melodyTimeline.length && melodyTimeline[melodyIdx].time <= compingTime) {
        if (melodyTimeline[melodyIdx].grip !== null) active = melodyTimeline[melodyIdx].grip;
        melodyIdx++;
      }
      linesOut[lineIndex].grips[eventIndex] = active;
      compingTime += event.duration;
    });
  });

  return { lines: linesOut };
}
