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
const VALID_CONTENT_RE = /^(\d)-([0-5x]{6})$/;

function decodeSpec(content: string): ChordGripSpec | null {
  const match = VALID_CONTENT_RE.exec(content);
  if (!match) return null;
  const startFret = Number(match[1]);
  const frets = match[2].split('').map((c) => (c === 'x' ? null : Number(c)));
  return { startFret, frets };
}

/**
 * Extracts `$<startFret>-<6 fret chars>$` chord-grip markers from raw ABC
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

/**
 * Attaches each grip marker to the single note/rest event it directly
 * precedes in the source text (the same "which event does this marker sit
 * in front of" problem computeScaleDegrees solves for root markers, reusing
 * its noteOnsetChar helper) — but with no chordSymbol gate, since a grip can
 * illustrate a voicing at any point, not just where a chord symbol is
 * written, and with no persistence: each grip attaches to exactly one event
 * and is then consumed, unlike a root marker which stays in effect going
 * forward.
 */
export function computeChordGripOverlay(
  flattened: FlattenedTune,
  grips: ChordGripMarker[],
  cleanAbc: string,
): ChordGripOverlay {
  const sortedGrips = [...grips].sort((a, b) => a.charOffset - b.charOffset);
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
