import type { FlattenedTune } from './types';
import { noteOnsetChar } from './scaleDegrees';

export interface ChordGripSpec {
  /** Absolute fret the diagram's top row represents (0 = the nut). */
  startFret: number;
  /** Index 0 = low E ... index 5 = high E. null = muted string. Each value is a row offset from startFret (0-5). */
  frets: (number | null)[];
}

export interface ChordGripMarker {
  charOffset: number;
  spec: ChordGripSpec;
}

const MARKER_RE = /\$(.*?)\$/g;
// Start fret is 1 or 2 digits — jazz voicings routinely move up past fret 9
// (e.g. a barre shape at fret 10 or 12), so a single digit isn't enough.
const VALID_CONTENT_RE = /^(\d{1,2})-([0-5x]{6})$/;

function decodeSpec(content: string): ChordGripSpec | null {
  const match = VALID_CONTENT_RE.exec(content);
  if (!match) return null;
  const startFret = Number(match[1]);
  const frets = match[2].split('').map((c) => (c === 'x' ? null : Number(c)));
  return { startFret, frets };
}

/**
 * Extracts `$<startFret 1-2 digits>-<6 fret chars>$` chord-grip markers from raw ABC
 * text, mirroring keyMarkers.ts: each match is replaced with whitespace of
 * the same length (preserving every other character's offset) so the
 * cleaned text is safe to hand to abcjs/parseTune unchanged. `$` has no
 * meaning in ABC's tune-body grammar (verified against abcjs's own parser —
 * unlike `&`, which is the voice-overlay operator), so this never collides
 * with real notation.
 */
export function extractChordGrips(rawAbc: string): { cleanAbc: string; grips: ChordGripMarker[] } {
  const grips: ChordGripMarker[] = [];
  const cleanAbc = rawAbc.replace(MARKER_RE, (match, content: string, offset: number) => {
    const spec = decodeSpec(content);
    if (spec) grips.push({ charOffset: offset, spec });
    return ' '.repeat(match.length);
  });
  return { cleanAbc, grips };
}

export interface ChordGripOverlayLine {
  grips: (ChordGripSpec | null)[];
}

export interface ChordGripOverlay {
  lines: ChordGripOverlayLine[];
}

const VOICE_HEADER_RE = /^V:\s*(\S+)/gm;

/**
 * Char ranges of `cleanAbc` covered by a `V:comp` voice block (from its
 * header up to the next voice header, or end of text) — mirrors
 * chordComping.ts's own `COMPING_VOICE_HEADER_RE` detection. A grip written
 * inside one of these ranges is authored for the comping voice's own
 * alignment (see alignCompingToGrips) and must never be picked up by the
 * melody overlay below, even though it precedes a later melody event in raw
 * char order.
 */
function compingVoiceRanges(cleanAbc: string): { start: number; end: number }[] {
  const headers = [...cleanAbc.matchAll(VOICE_HEADER_RE)].map((m) => ({
    index: m.index,
    isComp: /^comp\b/.test(m[1]),
  }));
  return headers
    .filter((h) => h.isComp)
    .map((h) => ({
      start: h.index,
      end: headers.find((other) => other.index > h.index)?.index ?? cleanAbc.length,
    }));
}

/**
 * Attaches each grip marker to the single note/rest event it directly
 * precedes in the source text (the same "which event does this marker sit
 * in front of" problem computeScaleDegrees solves for root markers, reusing
 * its noteOnsetChar helper) — but with no chordSymbol gate, since a grip can
 * illustrate a voicing at any point, not just where a chord symbol is
 * written, and with no persistence: each grip attaches to exactly one event
 * and is then consumed, unlike a root marker which stays in effect going
 * forward.
 *
 * Grips written inside a `V:comp` block are excluded here: they belong to
 * the comping voice's own alignment, not the melody stave, and would
 * otherwise leak onto the next melody event that happens to follow them in
 * the raw text (e.g. the first note of the next melody line after a V:comp
 * block sitting between two V:1 lines).
 */
export function computeChordGripOverlay(
  flattened: FlattenedTune,
  grips: ChordGripMarker[],
  cleanAbc: string,
): ChordGripOverlay {
  const compRanges = compingVoiceRanges(cleanAbc);
  const melodyGrips = grips.filter(
    (g) => !compRanges.some((r) => g.charOffset >= r.start && g.charOffset < r.end),
  );
  const sortedGrips = [...melodyGrips].sort((a, b) => a.charOffset - b.charOffset);
  let gripIdx = 0;

  const allRefs: { lineIndex: number; eventIndex: number; onsetChar: number }[] = [];
  flattened.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      allRefs.push({ lineIndex, eventIndex, onsetChar: noteOnsetChar(event, cleanAbc) });
    });
  });
  allRefs.sort((a, b) => a.onsetChar - b.onsetChar);

  const linesOut: ChordGripOverlayLine[] = flattened.lines.map((line) => ({
    grips: new Array<ChordGripSpec | null>(line.events.length).fill(null),
  }));

  for (const { lineIndex, eventIndex, onsetChar } of allRefs) {
    let lastSpec: ChordGripSpec | null = null;
    while (gripIdx < sortedGrips.length && sortedGrips[gripIdx].charOffset <= onsetChar) {
      lastSpec = sortedGrips[gripIdx].spec;
      gripIdx++;
    }
    if (lastSpec) linesOut[lineIndex].grips[eventIndex] = lastSpec;
  }

  return { lines: linesOut };
}
