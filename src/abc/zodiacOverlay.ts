import type { AccidentalName } from 'abcjs';
import type { FlattenedTune } from './types';
import { pitchClassOf, extractLetter } from './scaleDegrees';

/** Unicode astrological glyph for each chromatic pitch class (0=C), independent of spelling — e.g. both C# and Db (pitch class 1) map to the same glyph. */
export const ZODIAC_GLYPHS: Record<number, string> = {
  0: '♈', // C
  1: '♉', // C#/Db
  2: '♊', // D
  3: '♋', // D#/Eb
  4: '♌', // E
  5: '♍', // F
  6: '♎', // F#/Gb
  7: '♏', // G
  8: '♐', // G#/Ab
  9: '♑', // A
  10: '♒', // A#/Bb
  11: '♓', // B
};

export interface ZodiacLine {
  /** One entry per event in the line; null for rests, one glyph per pitch for chords. */
  glyphs: (string[] | null)[];
}

export interface ZodiacOverlay {
  lines: ZodiacLine[];
}

/**
 * Per-note zodiac glyph, indexed exactly like ScaleDegreeLine.degrees (line
 * index, event index, pitch index within a chord). Walks each line's events
 * directly in array order — unlike computeScaleDegrees, there's no root to
 * track and no tune-wide charOffset sort/merge with key markers needed,
 * since a zodiac glyph is an absolute pitch-class label, not root-relative —
 * while still reproducing the measure-accidental-persistence rule (an
 * accidental written earlier in a measure governs a later bare note with the
 * same letter, reset at each new measure) via the same
 * pitchClassOf/extractLetter primitives computeScaleDegrees uses, so the two
 * overlays never disagree about what pitch class a note actually sounds.
 */
export function computeZodiacOverlay(flattened: FlattenedTune): ZodiacOverlay {
  const linesOut: ZodiacLine[] = flattened.lines.map((line) => ({
    glyphs: new Array<string[] | null>(line.events.length).fill(null),
  }));

  flattened.lines.forEach((line, lineIndex) => {
    let currentMeasureIndex: number | null = null;
    let measureAccidentals: Record<string, AccidentalName> = {};

    line.events.forEach((event, eventIndex) => {
      if (event.measureIndex !== currentMeasureIndex) {
        currentMeasureIndex = event.measureIndex;
        measureAccidentals = {};
      }
      if (event.kind !== 'note' || !event.pitches?.length) return;
      linesOut[lineIndex].glyphs[eventIndex] = event.pitches.map(
        (p) => ZODIAC_GLYPHS[pitchClassOf(p, flattened.keyAccidentals, measureAccidentals)],
      );
      for (const p of event.pitches) {
        if (p.accidental) measureAccidentals[extractLetter(p.name)] = p.accidental;
      }
    });
  });

  return { lines: linesOut };
}
