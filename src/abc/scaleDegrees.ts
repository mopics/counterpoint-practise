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

/**
 * The bare pitch letter (A-G) a `NotationPitch.name` refers to. abcjs does
 * NOT strip the ABC accidental prefix character from `name` when the note
 * carries one — e.g. a note written `^G` in the source has `name: "^G"`,
 * not `name: "G"` (confirmed empirically against the real library; this
 * contradicts what abcjs's own shipped `NoteLetter` type implies). A lookup
 * that assumed a bare letter would silently miss the table and fall back to
 * pitch class 0 (C) for every explicitly-accidented note.
 */
function extractLetter(name: string): string {
  return (name.match(/[A-Ga-g]/)?.[0] ?? 'C').toUpperCase();
}

/**
 * Resolves the accidental that actually governs a note's sounding pitch:
 * the note's own explicit accidental, if it has one; otherwise an
 * accidental persisted from an earlier note with the same letter earlier in
 * the same measure (ABC's measure-persistence rule — ended by the tune's
 * key signature, but this map is caller-managed and cleared per measure,
 * see `computeScaleDegrees`); otherwise the tune's key-signature-implied
 * accidental for that letter; otherwise none (natural).
 */
function effectiveAccidental(
  pitch: NotationPitch,
  keyAccidentals: Record<string, AccidentalName>,
  measureAccidentals?: Record<string, AccidentalName>,
): AccidentalName | undefined {
  const letter = extractLetter(pitch.name);
  return pitch.accidental ?? measureAccidentals?.[letter] ?? keyAccidentals[letter];
}

/** Chromatic pitch class (0-11) of a note. `pitch.pitch` is a diatonic staff
 *  step, not chromatic, so this derives the real sounding pitch from the
 *  letter name plus its effective accidental (see `effectiveAccidental`). */
export function pitchClassOf(
  pitch: NotationPitch,
  keyAccidentals: Record<string, AccidentalName>,
  measureAccidentals?: Record<string, AccidentalName>,
): number {
  const base = NOTE_LETTER_PC[extractLetter(pitch.name)] ?? 0;
  const accidental = effectiveAccidental(pitch, keyAccidentals, measureAccidentals);
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
 *  spelling is used when the note's effective accidental (see
 *  `effectiveAccidental`) is sharp — its own explicit mark, or one it
 *  inherited via measure-persistence. */
export function degreeLabel(
  rootPc: number,
  pitch: NotationPitch,
  keyAccidentals: Record<string, AccidentalName>,
  measureAccidentals?: Record<string, AccidentalName>,
): string {
  const dist = pcDistance(rootPc, pitchClassOf(pitch, keyAccidentals, measureAccidentals));
  const table = effectiveAccidental(pitch, keyAccidentals, measureAccidentals) === 'sharp' ? DEGREE_LABEL_SHARP : DEGREE_LABEL_FLAT;
  return table[dist] ?? '?';
}

export interface ScaleDegreeLine {
  degrees: (string[] | null)[];
  rootHints: (string | null)[];
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
    rootHints: new Array<string | null>(line.events.length).fill(null),
  }));

  // Accidentals persist for the rest of an ABC measure once written, per
  // standard music notation rules. Keyed by bare letter, cleared whenever
  // the walk crosses into a new measure (line+measureIndex pair, since
  // `measureIndex` resets per rendered line — real content always breaks
  // lines at bar lines, so this never falsely persists across a true
  // measure boundary).
  let measureKey = '';
  let measureAccidentals: Record<string, AccidentalName> = {};

  for (const { lineIndex, eventIndex } of allRefs) {
    const event = flattened.lines[lineIndex].events[eventIndex];
    const onsetChar = noteOnsetChar(event, cleanAbc);
    let lastConsumedRoot: string | null = null;
    while (markerIdx < sortedMarkers.length && sortedMarkers[markerIdx].charOffset <= onsetChar) {
      currentRootPc = ROOT_TO_PC[sortedMarkers[markerIdx].root] ?? currentRootPc;
      lastConsumedRoot = sortedMarkers[markerIdx].root;
      markerIdx++;
    }
    if (lastConsumedRoot !== null && event.chordSymbol) {
      linesOut[lineIndex].rootHints[eventIndex] = lastConsumedRoot;
    }

    const key = `${lineIndex}:${event.measureIndex}`;
    if (key !== measureKey) {
      measureKey = key;
      measureAccidentals = {};
    }

    if (event.kind !== 'note' || !event.pitches?.length) continue;
    linesOut[lineIndex].degrees[eventIndex] = event.pitches.map((p) =>
      degreeLabel(currentRootPc, p, flattened.keyAccidentals, measureAccidentals),
    );
    for (const p of event.pitches) {
      if (p.accidental) measureAccidentals[extractLetter(p.name)] = p.accidental;
    }
  }

  return { lines: linesOut };
}
