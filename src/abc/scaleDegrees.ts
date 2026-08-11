import type { AccidentalName } from 'abcjs';
import type { FlattenedTune, NotationEvent, NotationPitch } from './types';
import type { KeyMarker } from './keyMarkers';

const NOTE_LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const ACCIDENTAL_OFFSET: Record<AccidentalName, number> = {
  natural: 0,
  sharp: 1,
  flat: -1,
  dblsharp: 2,
  dblflat: -2,
  quartersharp: 0,
  quarterflat: 0,
};

const ROOT_TO_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const DEGREE_LABEL_FLAT: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'tt', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_LABEL_SHARP: Record<number, string> = {
  0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 5: '4',
  6: 'tt', 7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7',
};

/** Chromatic pitch class (0-11) of a note. `pitch.pitch` is a diatonic staff
 *  step, not chromatic, so this derives the real sounding pitch from the
 *  letter name plus the note's own accidental, falling back to the tune's
 *  key-signature-implied accidental for that letter when the note has none.
 *
 *  Known limitation: this only consults the note's own explicit accidental
 *  or the key signature — it does not track an accidental carried over from
 *  an earlier note earlier in the same measure (ABC's measure-persistence
 *  rule, e.g. `^FF F,|FF|` should sound the 2nd/3rd F sharp too). This is
 *  parity with the old app (not a regression) and out of scope here. */
export function pitchClassOf(pitch: NotationPitch, keyAccidentals: Record<string, AccidentalName>): number {
  const letter = pitch.name.toUpperCase();
  const base = NOTE_LETTER_PC[letter] ?? 0;
  const accidental = pitch.accidental ?? keyAccidentals[letter];
  const offset = accidental ? (ACCIDENTAL_OFFSET[accidental] ?? 0) : 0;
  return ((base + offset) % 12 + 12) % 12;
}

/**
 * The character offset at which a note's own text (letter/accidentals/
 * duration) actually begins — as opposed to `event.startChar`, which abcjs
 * anchors at the start of a *preceding* chord-symbol annotation when one is
 * present (e.g. for `"D-"**D**D...`, the note's `startChar` points at the
 * opening `"` of `"D-"`, not at the note letter). Chord symbols are always
 * written as a quoted annotation (`"Chord"`) immediately before the note in
 * ABC source, so stepping past the quoted text (+2 for the two quote
 * characters) recovers the note's true onset. Without a chord symbol,
 * `startChar` already points at the note's own text.
 */
function noteOnsetChar(event: NotationEvent): number {
  if (!event.chordSymbol) return event.startChar;
  return event.startChar + event.chordSymbol.length + 2;
}

function pcDistance(rootPc: number, notePc: number): number {
  return ((notePc - rootPc) % 12 + 12) % 12;
}

/** Scale-degree label for a note relative to a root pitch class. Sharp
 *  spelling is used only when the note itself carries an explicit sharp. */
export function degreeLabel(rootPc: number, pitch: NotationPitch, keyAccidentals: Record<string, AccidentalName>): string {
  const dist = pcDistance(rootPc, pitchClassOf(pitch, keyAccidentals));
  const table = pitch.accidental === 'sharp' ? DEGREE_LABEL_SHARP : DEGREE_LABEL_FLAT;
  return table[dist] ?? '?';
}

export interface ScaleDegreeLine {
  degrees: (string[] | null)[];
}

export interface ScaleDegreeOverlay {
  lines: ScaleDegreeLine[];
}

export function computeScaleDegrees(
  flattened: FlattenedTune,
  markers: KeyMarker[],
  defaultRoot: string,
): ScaleDegreeOverlay {
  const sortedMarkers = [...markers].sort((a, b) => a.charOffset - b.charOffset);
  let markerIdx = 0;
  let currentRootPc = ROOT_TO_PC[defaultRoot] ?? 0;

  const allRefs: { lineIndex: number; eventIndex: number; startChar: number }[] = [];
  flattened.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      allRefs.push({ lineIndex, eventIndex, startChar: event.startChar });
    });
  });
  allRefs.sort((a, b) => a.startChar - b.startChar);

  const linesOut: ScaleDegreeLine[] = flattened.lines.map((line) => ({
    degrees: new Array<string[] | null>(line.events.length).fill(null),
  }));

  for (const { lineIndex, eventIndex } of allRefs) {
    const event = flattened.lines[lineIndex].events[eventIndex];
    const onsetChar = noteOnsetChar(event);
    while (markerIdx < sortedMarkers.length && sortedMarkers[markerIdx].charOffset <= onsetChar) {
      currentRootPc = ROOT_TO_PC[sortedMarkers[markerIdx].root] ?? currentRootPc;
      markerIdx++;
    }
    if (event.kind !== 'note' || !event.pitches?.length) continue;
    linesOut[lineIndex].degrees[eventIndex] = event.pitches.map((p) =>
      degreeLabel(currentRootPc, p, flattened.keyAccidentals),
    );
  }

  return { lines: linesOut };
}
