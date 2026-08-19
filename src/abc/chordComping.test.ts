import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { extractCompingVoice, alignCompingToGrips } from './chordComping';
import { flattenTune } from './flatten';
import { extractChordGrips, computeChordGripOverlay } from './chordGrips';
import { expandCompingVoice, expandTuneForPlayback, gripToMidiNotes, midiToAbcNote } from './chordComping';

describe('extractCompingVoice', () => {
  it('returns null for a single-voice tune', () => {
    const raw = 'X:1\nK:C\nCDEF|\n';
    const tune = parseTune(raw);
    expect(extractCompingVoice(tune, raw)).toBeNull();
  });

  it('returns null for a second voice that is not named `comp` (e.g. a hand-written V:2 bass line)', () => {
    const raw = 'X:1\nK:C\nV:1 clef=treble\nCDEF|\nV:2 clef=bass\nC,4|\n';
    const tune = parseTune(raw);
    expect(extractCompingVoice(tune, raw)).toBeNull();
  });

  it('extracts V:comp note/rest events with duration and char range, ignoring V:1', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:comp\nC8|z8|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune, raw);
    expect(comping).not.toBeNull();
    expect(comping!.lines).toHaveLength(1);
    expect(comping!.lines[0].events.map((e) => ({ kind: e.kind, duration: e.duration }))).toEqual([
      { kind: 'note', duration: 1 },
      { kind: 'rest', duration: 1 },
    ]);
  });

  it('preserves the source char range of each event for later text-splicing', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:comp\nC8|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune, raw)!;
    const event = comping.lines[0].events[0];
    expect(raw.slice(event.startChar, event.endChar)).toBe('C8');
  });

  it('numbers lineIndex the same way flattenTune does (per staff-bearing written line)', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\ncBAG|\nV:comp\nC8|\nC8|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune, raw)!;
    expect(comping.lines.map((l) => l.lineIndex)).toEqual([0, 1]);
    expect(comping.lines[1].events).toHaveLength(1);
  });

  it('captures triplet start/end markers so time walks can apply the real (compressed) duration', () => {
    const raw = 'X:1\nM:4/4\nL:1/4\nK:C\nV:1\nCDEF|\nV:comp\n(3CCC C2|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune, raw)!;
    const events = comping.lines[0].events;
    expect(events[0].tripletStart).toEqual({ r: 3, multiplier: 2 / 3 });
    expect(events[0].tripletEnd).toBe(false);
    expect(events[2].tripletEnd).toBe(true);
    expect(events[3].tripletStart).toBeUndefined();
  });
});

function buildAlignment(raw: string) {
  const { cleanAbc, grips } = extractChordGrips(raw);
  const tune = parseTune(cleanAbc);
  const flattened = flattenTune(tune);
  const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
  const compingVoice = extractCompingVoice(tune, cleanAbc)!;
  return alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
}

describe('alignCompingToGrips', () => {
  it('assigns null to comping notes before any grip has appeared', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\nCDEF|\nV:comp\nC4|\n');
    expect(alignment.lines[0].grips).toEqual([null]);
  });

  it('assigns the nearest preceding grip to a comping note', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\nC4|\n');
    expect(alignment.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
  });

  it('holds the same grip across multiple comping notes until the next one', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\nC2C2|C4|\n');
    expect(alignment.lines[0].grips).toEqual([
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
    ]);
  });

  it('switches to a new grip once its time position is reached', () => {
    const alignment = buildAlignment(
      'X:1\nK:C\nV:1\n$0-xx34xx$CD$3-012345$EF|\nV:comp\nC2C2|\n',
    );
    expect(alignment.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
    expect(alignment.lines[0].grips[1]).toEqual({ startFret: 3, frets: [0, 1, 2, 3, 4, 5] });
  });

  it('does not drift past a written triplet in the melody', () => {
    // M:4/4 L:1/4, so each written V:1 note is 1/4 of a whole note. The
    // triplet's three notes are nominally 3/4 in total but really sound 1/2
    // (multiplier 2/3). Real time positions of V:1's first bar:
    //   C   t=0     (grip A attaches here)
    //   D   t=1/4     \
    //   E   t=1/4+1/6  } the (3DEF triplet, 1/6 each
    //   F   t=1/4+2/6 /
    //   G   t=3/4    (grip B attaches here)
    // The comping voice's third event starts at exactly t=3/4, so it must
    // pick up grip B. Walking nominal durations instead would place G at
    // t=1, and that third comping event would still be stuck on grip A.
    const alignment = buildAlignment(
      'X:1\nM:4/4\nL:1/4\nK:C\nV:1\n$0-xx34xx$C (3DEF $3-012345$G|\nV:comp\nC2 C C|\n',
    );
    const gripA = { startFret: 0, frets: [null, null, 3, 4, null, null] };
    const gripB = { startFret: 3, frets: [0, 1, 2, 3, 4, 5] };
    expect(alignment.lines[0].grips).toEqual([gripA, gripA, gripB]);
  });

  it('does not drift past a written triplet in the comping voice itself', () => {
    // Mirror image: V:1 is plain quarters with grip B on beat 4 (t=3/4), and
    // the comping voice opens with a quarter-note triplet. Its fourth event
    // really starts at t=1/2 (the triplet only spans 1/2), so grip B has not
    // arrived yet. Walking nominal durations would put that event at t=3/4
    // and wrongly hand it grip B.
    const alignment = buildAlignment(
      'X:1\nM:4/4\nL:1/4\nK:C\nV:1\n$0-xx34xx$CDE$3-012345$F|\nV:comp\n(3CCC C2|\n',
    );
    const gripA = { startFret: 0, frets: [null, null, 3, 4, null, null] };
    expect(alignment.lines[0].grips).toEqual([gripA, gripA, gripA, gripA]);
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

function buildExpansion(raw: string) {
  const { cleanAbc, grips } = extractChordGrips(raw);
  const tune = parseTune(cleanAbc);
  const flattened = flattenTune(tune);
  const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
  const compingVoice = extractCompingVoice(tune, cleanAbc)!;
  const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
  return { cleanAbc, expanded: expandCompingVoice(cleanAbc, compingVoice, alignment) };
}

describe('expandCompingVoice', () => {
  it('splices a chord cluster in place of the placeholder pitch, keeping the duration suffix', () => {
    const { expanded } = buildExpansion('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\nC4|\n');
    // grip { startFret: 0, frets: [null, null, 3, 4, null, null] } -> frets are semitone offsets,
    // not scale steps: D-string (MIDI 50) + fret 3 = MIDI 53 = F3 = "F,"; G-string (MIDI 55) + fret 4 = MIDI 59 = B3 = "B,"
    expect(expanded).toContain('[F,B,]4');
    expect(expanded).not.toContain('C4');
  });

  it('leaves an already-rest comping event untouched', () => {
    const { expanded } = buildExpansion('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\nz4|\n');
    expect(expanded).toContain('z4');
  });

  it('converts a note with no active grip yet into a plain rest of the same duration', () => {
    const { expanded } = buildExpansion('X:1\nK:C\nV:1\nCDEF|\nV:comp\nC4|\n');
    expect(expanded).toContain('z4');
  });

  it('converts a note backed only by a fully-muted grip into a rest, not an empty chord bracket', () => {
    const { expanded } = buildExpansion('X:1\nK:C\nV:1\n$0-xxxxxx$CDEF|\nV:comp\nC4|\n');
    expect(expanded).not.toContain('[]');
    expect(expanded).toContain('z4');
  });

  it('leaves a comping note whose source text is not a plain pitch token completely untouched', () => {
    // abcjs reports this note's source range as `(C2` — the leading slur paren
    // is outside what PITCH_TOKEN_RE models. Rather than emitting a chord
    // cluster concatenated with the whole unparsed original (`[F,B,](C2`,
    // structurally invalid ABC), the edit is skipped entirely. The following
    // note (`C2)`) is a plain pitch token, so it still expands normally.
    const { expanded } = buildExpansion('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\n(C2C2)|\n');
    expect(expanded).toContain('\n(C2[F,B,]2)|');
    expect(expanded).not.toContain('[F,B,](');
  });

  it('leaves a decorated comping note untouched rather than gluing a cluster onto the decoration', () => {
    // abcjs reports this note's source range as `!fff!C4`.
    const { expanded } = buildExpansion('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\n!fff!C4|\n');
    expect(expanded).toContain('\n!fff!C4|');
    expect(expanded).not.toContain('[F,B,]!fff!');
  });
});

describe('expandTuneForPlayback', () => {
  it('is a no-op passthrough when the tune has no comping voice', () => {
    const raw = 'X:1\nK:C\nCDEF|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    expect(expandTuneForPlayback(cleanAbc, tune, grips, flattened)).toBe(cleanAbc);
  });

  it('is a no-op passthrough for a hand-written second voice that is not named `comp`', () => {
    const raw = 'X:1\nK:C\nV:1 clef=treble\n$0-xx34xx$CDEF|\nV:2 clef=bass\nC,4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    expect(expandTuneForPlayback(cleanAbc, tune, grips, flattened)).toBe(cleanAbc);
  });

  it('produces text that reparses with a real 2-note chord on the second voice', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:comp\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const expanded = expandTuneForPlayback(cleanAbc, tune, grips, flattened);
    const reparsed = parseTune(expanded);
    const v2Items = (reparsed.lines[0].staff?.[1]?.voices?.[0] ?? []) as unknown as {
      el_type: string;
      pitches?: unknown[];
    }[];
    const noteItem = v2Items.find((it) => it.el_type === 'note');
    // Exact pitch-letter assertions belong to the 'splices a chord cluster' test above
    // (via the raw spliced text) — here we only need to confirm the round-trip through
    // abcjs actually parses as a 2-note chord, not fall back to asserting on abcjs's
    // exact `pitches[].name` string formatting for octave-marked notes, which is untested elsewhere.
    expect(noteItem?.pitches).toHaveLength(2);
  });
});
