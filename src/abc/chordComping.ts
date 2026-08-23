import type * as abcjs from 'abcjs';
import type { FlattenedTune } from './types';
import type { ChordGripSpec, ChordGripMarker } from './chordGrips';
import { noteOnsetChar } from './scaleDegrees';

export interface CompingEvent {
  kind: 'note' | 'rest';
  startChar: number;
  endChar: number;
  /** Nominal (uncompressed) duration as a fraction of a whole note, abcjs convention. */
  duration: number;
  /** Present on the first note of a triplet group; `multiplier` scales `duration` to real time. */
  tripletStart?: { r: number; multiplier: number };
  tripletEnd: boolean;
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
  startTriplet?: number;
  endTriplet?: true;
  tripletMultiplier?: number;
  tripletR?: number;
}

/**
 * Explicit opt-in header for the comping voice: the voice must literally be
 * named `comp` (`V:comp`). A second staff on its own is NOT a safe signal —
 * real tunes in this library already use `V:2` for unrelated, hand-written
 * bass lines with real pitches, and treating those as comping voices would
 * rewrite their notes into structurally invalid ABC.
 */
const COMPING_VOICE_HEADER_RE = /^V:\s*comp\b/m;

/**
 * Extracts the rhythm-only comping voice (`V:comp`) from a parsed tune,
 * ignoring its pitch entirely (its notes carry a placeholder pitch the author
 * picks for typing convenience — only kind/duration/char-range matter here).
 * Mirrors flatten.ts's line-skip logic (subtitle lines skipped, lineIndex
 * incremented only for staff-bearing lines) so lineIndex numbering stays in
 * sync with FlattenedTune.lines, which callers rely on to correlate the two.
 * Returns null when the tune has no second voice — abcjs puts the second voice
 * on its own staff (tuneLine.staff[1]), not as a second voice of staff[0]
 * (verified empirically; see this plan's Global Constraints) — and also when
 * the raw ABC doesn't opt in via a `V:comp` voice header.
 */
export function extractCompingVoice(tune: abcjs.TuneObject, cleanAbc: string): CompingVoice | null {
  const hasSecondVoice = tune.lines.some((l) => !l.subtitle && (l.staff?.length ?? 0) > 1);
  if (!hasSecondVoice) return null;
  // A second staff alone isn't a safe signal: real tunes in this library
  // already use V:2 for unrelated hand-written bass lines, so the comping
  // voice must opt in explicitly by being named `comp`.
  if (!COMPING_VOICE_HEADER_RE.test(cleanAbc)) return null;

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
          tripletStart:
            item.startTriplet !== undefined
              ? { r: item.tripletR ?? item.startTriplet, multiplier: item.tripletMultiplier ?? 1 }
              : undefined,
          tripletEnd: !!item.endTriplet,
        });
      }
    }
    lines.push({ lineIndex, events });
    lineIndex++;
  }
  return { lines };
}

/**
 * Slack for the `<=` time comparison below. Triplet multipliers (2/3, 4/5, …)
 * make the accumulated time totals inexact binary fractions, so a grip onset
 * and a comping event that are musically simultaneous can land a few ULPs
 * apart; without this, such a grip would be missed by one event.
 */
const TIME_EPSILON = 1e-9;

export interface CompingAlignmentLine {
  grips: (ChordGripSpec | null)[];
}

export interface CompingAlignment {
  lines: CompingAlignmentLine[];
}

interface OnsetEntry {
  onsetChar: number;
  time: number;
}

/**
 * Walks a voice's flattened events in written order, pairing each with its
 * text position (`onsetChar`) and its time position (cumulative `duration`
 * from the tune's start, not real seconds — tempo-independent). Applies each
 * event's triplet multiplier when accumulating time, because abcjs's
 * `duration` is the nominal (written) value — a triplet's three notes each
 * report their uncompressed duration, so summing them raw over-counts the
 * group's real span. The multiplier is carried on the group's first event and
 * stays active until the event flagged `tripletEnd`.
 */
function buildOnsetTimeline<T extends { duration: number; tripletStart?: { multiplier: number }; tripletEnd: boolean }>(
  events: T[],
  onsetCharOf: (event: T) => number,
): OnsetEntry[] {
  const onsets: OnsetEntry[] = [];
  let time = 0;
  let multiplier = 1;
  for (const event of events) {
    onsets.push({ onsetChar: onsetCharOf(event), time });
    if (event.tripletStart) multiplier = event.tripletStart.multiplier;
    time += event.duration * multiplier;
    if (event.tripletEnd) multiplier = 1;
  }
  return onsets;
}

/** The earliest onset (by text position) at or after `charOffset`, in a list already sorted by `onsetChar`. */
function nearestFollowingOnset(charOffset: number, onsets: OnsetEntry[]): OnsetEntry | undefined {
  for (const onset of onsets) {
    if (onset.onsetChar >= charOffset) return onset;
  }
  return undefined;
}

/**
 * For each comping-voice event, finds the chord grip active at that moment —
 * "active" means the most recently attached grip at or before the comping
 * event's time position, held forward until the next one (a chord holds
 * until the next chord symbol).
 *
 * A grip marker attaches to the nearest event it directly precedes in the
 * source text, considering BOTH voices, not melody only: a grip can be
 * written near a melody note (annotating the existing chord-grip feature, as
 * originally designed) or written directly inline in the comping voice's own
 * line — the more natural place to put a comping-specific chord change, and
 * the only option when the comping voice's text comes after all of the
 * melody's, since then no melody event exists for the grip to attach to at
 * all. Attachment itself happens in TEXT order (matching the existing
 * `$grip$` marker convention elsewhere), but a grip embedded in the comping
 * voice's own late-in-the-text block can have an early TIME position (e.g.
 * the comping voice's very first note) — so once every grip has been resolved
 * to the event it attaches to, the resulting `time`s are re-sorted before the
 * "hold until next" walk below, rather than assuming text order already
 * matches time order across voices.
 */
export function alignCompingToGrips(
  compingVoice: CompingVoice,
  flattened: FlattenedTune,
  grips: ChordGripMarker[],
  cleanAbc: string,
): CompingAlignment {
  // Written order (same order buildOnsetTimeline iterated in) — `compingOnsets`
  // must stay in this order since the final walk below reuses it by flatIdx,
  // paired with `compingVoice.lines.forEach`'s own written-order walk.
  const melodyEvents = flattened.lines.flatMap((line) => line.events);
  const melodyOnsets = buildOnsetTimeline(melodyEvents, (event) => noteOnsetChar(event, cleanAbc));
  const compingEvents = compingVoice.lines.flatMap((line) => line.events);
  // Not just event.startChar: abcjs anchors a note's startChar at the start
  // of whatever immediately precedes it once blanked to whitespace — for
  // melody notes that's a chord-symbol annotation (why noteOnsetChar exists
  // at all); for comping notes it's just as often a blanked-out $grip$
  // marker sitting right before it, which needs the exact same whitespace
  // skip to land on the note's real onset rather than the marker's old spot.
  const compingOnsets = buildOnsetTimeline(compingEvents, (event) => noteOnsetChar(event, cleanAbc));

  // Separate, sorted-by-onsetChar copies for nearestFollowingOnset's search —
  // onset chars are already monotonic within one voice's own written order in
  // practice, but sorting a copy (rather than the arrays above) keeps that an
  // implementation detail of the search, not a hidden requirement on the
  // flatIdx correspondence the final walk depends on.
  const melodyOnsetsByChar = [...melodyOnsets].sort((a, b) => a.onsetChar - b.onsetChar);
  const compingOnsetsByChar = [...compingOnsets].sort((a, b) => a.onsetChar - b.onsetChar);

  const sortedGrips = [...grips].sort((a, b) => a.charOffset - b.charOffset);
  const attachedGrips: { time: number; spec: ChordGripSpec }[] = [];
  for (const grip of sortedGrips) {
    const melodyMatch = nearestFollowingOnset(grip.charOffset, melodyOnsetsByChar);
    const compingMatch = nearestFollowingOnset(grip.charOffset, compingOnsetsByChar);
    const winner =
      melodyMatch && compingMatch
        ? (melodyMatch.onsetChar <= compingMatch.onsetChar ? melodyMatch : compingMatch)
        : (melodyMatch ?? compingMatch);
    if (winner) attachedGrips.push({ time: winner.time, spec: grip.spec });
  }
  attachedGrips.sort((a, b) => a.time - b.time);

  const linesOut: CompingAlignmentLine[] = compingVoice.lines.map((line) => ({
    grips: new Array<ChordGripSpec | null>(line.events.length).fill(null),
  }));

  let gripIdx = 0;
  let active: ChordGripSpec | null = null;
  let flatIdx = 0;
  compingVoice.lines.forEach((line, lineIndex) => {
    line.events.forEach((_event, eventIndex) => {
      const compingTime = compingOnsets[flatIdx].time;
      while (gripIdx < attachedGrips.length && attachedGrips[gripIdx].time <= compingTime + TIME_EPSILON) {
        active = attachedGrips[gripIdx].spec;
        gripIdx++;
      }
      linesOut[lineIndex].grips[eventIndex] = active;
      flatIdx++;
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

/**
 * Everything after the leading pitch token of a plain note (its duration
 * suffix), or `null` when the text isn't a plain pitch token at all — a
 * leading slur `(`, a decoration `!fff!`, a grace-note group `{gf}` or an
 * already-written chord `[CE]4`. Returning the whole untouched string in that
 * case would let the caller emit a chord cluster (or `z`) concatenated with
 * the entire unparsed original, i.e. structurally invalid ABC, so callers must
 * skip the edit instead.
 */
function durationSuffixOf(sourceText: string): string | null {
  const match = PITCH_TOKEN_RE.exec(sourceText);
  return match ? sourceText.slice(match[0].length) : null;
}

/**
 * Splices real chord-cluster pitches into the comping voice's placeholder
 * notes, replacing only the pitch token and preserving each note's original
 * duration suffix verbatim. Edits are applied back-to-front by startChar so
 * earlier offsets stay valid even though replacement text length can differ
 * from the original. Already-rest events are left untouched; a note event with
 * no active grip (or only a fully-muted one) becomes a plain rest; a note
 * whose source text isn't a plain pitch token is skipped entirely.
 *
 * Slices from noteOnsetChar, not the raw startChar: a note directly after a
 * blanked $grip$ marker has its startChar anchored back at the marker's old
 * position (the same quirk noteOnsetChar exists to correct for melody notes
 * after a chord-symbol annotation), so the raw slice would begin with
 * leading whitespace — durationSuffixOf's anchored pitch-token match would
 * then always fail and silently skip the edit, leaving the placeholder pitch
 * in the text actually sent to playback/print.
 */
export function expandCompingVoice(cleanAbc: string, compingVoice: CompingVoice, alignment: CompingAlignment): string {
  const edits: { startChar: number; endChar: number; replacement: string }[] = [];
  compingVoice.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      if (event.kind === 'rest') return;
      const onsetChar = noteOnsetChar(event, cleanAbc);
      const original = cleanAbc.slice(onsetChar, event.endChar);
      const durationSuffix = durationSuffixOf(original);
      // Not a plain pitch token (slur paren, decoration, grace group, chord
      // bracket, …) — leave it exactly as authored rather than emitting a
      // cluster glued onto text we couldn't parse.
      if (durationSuffix === null) return;
      const grip = alignment.lines[lineIndex]?.grips[eventIndex] ?? null;
      const cluster = grip ? chordClusterAbc(grip) : null;
      const replacement = (cluster ?? 'z') + durationSuffix;
      edits.push({ startChar: onsetChar, endChar: event.endChar, replacement });
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
 * Single entry point for playback/print consumers: expands the comping voice to real
 * chord pitches when present, otherwise returns cleanAbc unchanged (checked
 * by reference-equal callers to skip a redundant re-parse).
 */
export function expandTuneForPlayback(
  cleanAbc: string,
  tune: abcjs.TuneObject,
  grips: ChordGripMarker[],
  flattened: FlattenedTune,
): string {
  const compingVoice = extractCompingVoice(tune, cleanAbc);
  if (!compingVoice) return cleanAbc;
  const alignment = alignCompingToGrips(compingVoice, flattened, grips, cleanAbc);
  return expandCompingVoice(cleanAbc, compingVoice, alignment);
}
