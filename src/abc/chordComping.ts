import type * as abcjs from 'abcjs';
import type { FlattenedTune } from './types';
import type { ChordGripOverlay, ChordGripSpec, ChordGripMarker } from './chordGrips';
import { computeChordGripOverlay } from './chordGrips';

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

/** Low-to-high open-string MIDI numbers, matching ChordGripSpec.frets' own string-index convention. */
const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

export function gripToMidiNotes(spec: ChordGripSpec): number[] {
  const notes: number[] = [];
  spec.frets.forEach((fretOffset, stringIndex) => {
    if (fretOffset === null) return;
    notes.push(STANDARD_TUNING_MIDI[stringIndex] + spec.startFret + fretOffset);
  });
  return notes;
}

const CHROMATIC_LETTERS = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];

/**
 * MIDI note number -> ABC pitch token, using ABC's octave convention (bare
 * uppercase = the octave containing middle C, MIDI 60 = C4 = bare "C";
 * commas drop an octave, apostrophes on the lowercase form raise one) —
 * matches the conventional ABC spelling of open guitar strings (E2 = "E,,").
 */
export function midiToAbcNote(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const letter = CHROMATIC_LETTERS[pitchClass];
  if (octave >= 5) return letter.toLowerCase() + "'".repeat(octave - 5);
  return letter + ','.repeat(4 - octave);
}

function chordClusterAbc(spec: ChordGripSpec): string | null {
  const notes = gripToMidiNotes(spec);
  if (notes.length === 0) return null; // fully-muted grip -> no pitches to sound
  return `[${notes.map(midiToAbcNote).join('')}]`;
}

const PITCH_TOKEN_RE = /^[\^=_]*[A-Ga-g][,']*/;

function durationSuffixOf(sourceText: string): string {
  const match = PITCH_TOKEN_RE.exec(sourceText);
  return match ? sourceText.slice(match[0].length) : sourceText;
}

/**
 * Splices real chord-cluster pitches into V:2's placeholder notes, replacing
 * only the pitch token and preserving each note's original duration suffix
 * verbatim. Edits are applied back-to-front by startChar so earlier offsets
 * stay valid even though replacement text length can differ from the
 * original. Already-rest events are left untouched; a note event with no
 * active grip (or only a fully-muted one) becomes a plain rest.
 */
export function expandCompingVoice(cleanAbc: string, compingVoice: CompingVoice, alignment: CompingAlignment): string {
  const edits: { startChar: number; endChar: number; replacement: string }[] = [];
  compingVoice.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      if (event.kind === 'rest') return;
      const original = cleanAbc.slice(event.startChar, event.endChar);
      const grip = alignment.lines[lineIndex]?.grips[eventIndex] ?? null;
      const cluster = grip ? chordClusterAbc(grip) : null;
      const replacement = cluster ? cluster + durationSuffixOf(original) : 'z' + durationSuffixOf(original);
      edits.push({ startChar: event.startChar, endChar: event.endChar, replacement });
    });
  });

  edits.sort((a, b) => b.startChar - a.startChar);
  let result = cleanAbc;
  for (const { startChar, endChar, replacement } of edits) {
    result = result.slice(0, startChar) + replacement + result.slice(endChar);
  }
  return result;
}

/**
 * Single entry point for playback/print consumers: expands V:2 to real
 * chord pitches when present, otherwise returns cleanAbc unchanged (checked
 * by reference-equal callers to skip a redundant re-parse).
 */
export function expandTuneForPlayback(
  cleanAbc: string,
  tune: abcjs.TuneObject,
  grips: ChordGripMarker[],
  flattened: FlattenedTune,
): string {
  const compingVoice = extractCompingVoice(tune);
  if (!compingVoice) return cleanAbc;
  const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
  const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
  return expandCompingVoice(cleanAbc, compingVoice, alignment);
}
