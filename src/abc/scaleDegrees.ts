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
 * opening `"` of `"D-"`, not at the note letter). Empirically (verified
 * against real transcription data, not just synthetic examples), abcjs can
 * also include whitespace *before* that opening quote in `startChar` — e.g.
 * immediately after a preceding bar line — so the quote is not always the
 * very first character at `startChar`.
 *
 * This scans the *cleaned* ABC string (the one actually parsed, with `**K**`
 * markers already blanked out to whitespace of equal length — see
 * `keyMarkers.ts`) starting at `event.startChar`: skip any leading
 * whitespace, then if the next character is a quote, skip past the matching
 * closing quote of the chord-symbol annotation, then skip any further run of
 * whitespace. Because a marker that sat between the chord symbol and the
 * note has already been reduced to whitespace, the whitespace-skips
 * naturally consume it regardless of how many literal spaces (zero or more)
 * separated the marker from the chord symbol or from the note in the
 * original source — unlike a fixed-length offset, which only worked for the
 * zero-gap case. For events with no chord symbol, there is no quote to find,
 * so this reduces to skipping any (typically absent) leading whitespace and
 * returns `startChar` unchanged.
 */
function noteOnsetChar(event: NotationEvent, cleanAbc: string): number {
  let pos = event.startChar;
  while (pos < cleanAbc.length && /\s/.test(cleanAbc[pos])) pos++;
  if (cleanAbc[pos] === '"') {
    pos++;
    while (pos < cleanAbc.length && cleanAbc[pos] !== '"') pos++;
    pos++; // step past the closing quote
    while (pos < cleanAbc.length && /\s/.test(cleanAbc[pos])) pos++;
  }
  return pos;
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
  cleanAbc: string,
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
    const onsetChar = noteOnsetChar(event, cleanAbc);
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
