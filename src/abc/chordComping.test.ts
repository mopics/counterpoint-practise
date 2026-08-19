import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { extractCompingVoice, alignCompingToGrips } from './chordComping';
import { flattenTune } from './flatten';
import { extractChordGrips, computeChordGripOverlay } from './chordGrips';
import { expandCompingVoice, expandTuneForPlayback, gripToMidiNotes, midiToAbcNote } from './chordComping';

describe('extractCompingVoice', () => {
  it('returns null for a single-voice tune', () => {
    const tune = parseTune('X:1\nK:C\nCDEF|\n');
    expect(extractCompingVoice(tune)).toBeNull();
  });

  it('extracts V:2 note/rest events with duration and char range, ignoring V:1', () => {
    const tune = parseTune('X:1\nK:C\nV:1\nCDEF|\nV:2\nC8|z8|\n');
    const comping = extractCompingVoice(tune);
    expect(comping).not.toBeNull();
    expect(comping!.lines).toHaveLength(1);
    expect(comping!.lines[0].events.map((e) => ({ kind: e.kind, duration: e.duration }))).toEqual([
      { kind: 'note', duration: 1 },
      { kind: 'rest', duration: 1 },
    ]);
  });

  it('preserves the source char range of each event for later text-splicing', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:2\nC8|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune)!;
    const event = comping.lines[0].events[0];
    expect(raw.slice(event.startChar, event.endChar)).toBe('C8');
  });

  it('numbers lineIndex the same way flattenTune does (per staff-bearing written line)', () => {
    const tune = parseTune('X:1\nK:C\nV:1\nCDEF|\ncBAG|\nV:2\nC8|\nC8|\n');
    const comping = extractCompingVoice(tune)!;
    expect(comping.lines.map((l) => l.lineIndex)).toEqual([0, 1]);
    expect(comping.lines[1].events).toHaveLength(1);
  });
});

function buildAlignment(raw: string) {
  const { cleanAbc, grips } = extractChordGrips(raw);
  const tune = parseTune(cleanAbc);
  const flattened = flattenTune(tune);
  const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
  const compingVoice = extractCompingVoice(tune)!;
  return alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
}

describe('alignCompingToGrips', () => {
  it('assigns null to comping notes before any grip has appeared', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\nCDEF|\nV:2\nC4|\n');
    expect(alignment.lines[0].grips).toEqual([null]);
  });

  it('assigns the nearest preceding grip to a comping note', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC4|\n');
    expect(alignment.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
  });

  it('holds the same grip across multiple comping notes until the next one', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC2C2|C4|\n');
    expect(alignment.lines[0].grips).toEqual([
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
    ]);
  });

  it('switches to a new grip once its time position is reached', () => {
    const alignment = buildAlignment(
      'X:1\nK:C\nV:1\n$0-xx34xx$CD$3-012345$EF|\nV:2\nC2C2|\n',
    );
    expect(alignment.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
    expect(alignment.lines[0].grips[1]).toEqual({ startFret: 3, frets: [0, 1, 2, 3, 4, 5] });
  });
});

describe('gripToMidiNotes', () => {
  it('maps an open-position grip to real pitches via standard guitar tuning', () => {
    // frets: low E open, A muted, D fret2, G fret3, B muted, high E open
    const notes = gripToMidiNotes({ startFret: 0, frets: [0, null, 2, 3, null, 0] });
    expect(notes).toEqual([40, 52, 58, 64]); // E2, D3+2, G3+3, E4
  });

  it('adds startFret as an offset for a moveable-shape grip', () => {
    const notes = gripToMidiNotes({ startFret: 3, frets: [0, 1, 2, 3, 4, 5] });
    expect(notes).toEqual([43, 49, 55, 61, 66, 72]);
  });

  it('returns an empty list for a fully-muted grip', () => {
    expect(gripToMidiNotes({ startFret: 0, frets: [null, null, null, null, null, null] })).toEqual([]);
  });
});

describe('midiToAbcNote', () => {
  it('renders standard open-string tuning pitches with the conventional ABC guitar octave marks', () => {
    expect(midiToAbcNote(40)).toBe('E,,'); // E2
    expect(midiToAbcNote(45)).toBe('A,,'); // A2
    expect(midiToAbcNote(50)).toBe('D,');  // D3
    expect(midiToAbcNote(55)).toBe('G,');  // G3
    expect(midiToAbcNote(59)).toBe('B,');  // B3
    expect(midiToAbcNote(64)).toBe('E');   // E4
  });

  it('uses a sharp accidental prefix for black-key pitch classes', () => {
    expect(midiToAbcNote(42)).toBe('^F,,'); // F#2 (MIDI 41 is the natural F2 — E to F has no sharp between them)
  });
});

describe('expandCompingVoice', () => {
  it('splices a chord cluster in place of the placeholder pitch, keeping the duration suffix', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    const expanded = expandCompingVoice(cleanAbc, compingVoice, alignment);
    // grip { startFret: 0, frets: [null, null, 3, 4, null, null] } -> frets are semitone offsets,
    // not scale steps: D-string (MIDI 50) + fret 3 = MIDI 53 = F3 = "F,"; G-string (MIDI 55) + fret 4 = MIDI 59 = B3 = "B,"
    expect(expanded).toContain('[F,B,]4');
    expect(expanded).not.toContain('C4');
  });

  it('leaves an already-rest V:2 event untouched', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nz4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    expect(expandCompingVoice(cleanAbc, compingVoice, alignment)).toContain('z4');
  });

  it('converts a note with no active grip yet into a plain rest of the same duration', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    expect(expandCompingVoice(cleanAbc, compingVoice, alignment)).toContain('z4');
  });

  it('converts a note backed only by a fully-muted grip into a rest, not an empty chord bracket', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xxxxxx$CDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    const expanded = expandCompingVoice(cleanAbc, compingVoice, alignment);
    expect(expanded).not.toContain('[]');
    expect(expanded).toContain('z4');
  });
});

describe('expandTuneForPlayback', () => {
  it('is a no-op passthrough when the tune has no V:2', () => {
    const raw = 'X:1\nK:C\nCDEF|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    expect(expandTuneForPlayback(cleanAbc, tune, grips, flattened)).toBe(cleanAbc);
  });

  it('produces text that reparses with a real 2-note chord on the second voice', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const expanded = expandTuneForPlayback(cleanAbc, tune, grips, flattened);
    const reparsed = parseTune(expanded);
    const v2Items = reparsed.lines[0].staff![1].voices[0] as unknown as { el_type: string; pitches?: unknown[] }[];
    const noteItem = v2Items.find((it) => it.el_type === 'note');
    // Exact pitch-letter assertions belong to the 'splices a chord cluster' test above
    // (via the raw spliced text) — here we only need to confirm the round-trip through
    // abcjs actually parses as a 2-note chord, not fall back to asserting on abcjs's
    // exact `pitches[].name` string formatting for octave-marked notes, which is untested elsewhere.
    expect(noteItem?.pitches).toHaveLength(2);
  });
});
