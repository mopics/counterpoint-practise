import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';
import { extractChordGrips, computeChordGripOverlay } from './chordGrips';

describe('extractChordGrips', () => {
  it('strips a valid marker and records its offset and decoded spec', () => {
    const { cleanAbc, grips } = extractChordGrips('CD$0-xx34xx$EF');
    expect(cleanAbc).toBe('CD          EF');
    expect(grips).toEqual([
      { charOffset: 2, spec: { startFret: 0, frets: [null, null, 3, 4, null, null] } },
    ]);
  });

  it('preserves string length exactly (offset stability)', () => {
    const raw = 'X:1\nK:C\n$3-012345$CDEF|';
    const { cleanAbc } = extractChordGrips(raw);
    expect(cleanAbc.length).toBe(raw.length);
  });

  it('leaves every character after the marker at the same offset', () => {
    const raw = '$0-xxxxxx$DEFG';
    const { cleanAbc } = extractChordGrips(raw);
    const noteIndex = raw.indexOf('D');
    expect(cleanAbc[noteIndex]).toBe('D');
  });

  it('handles multiple markers, including ones abutting other tokens with no whitespace', () => {
    const raw = '"F-7"$2-x0123x$B,2 G,B,';
    const { grips } = extractChordGrips(raw);
    expect(grips).toEqual([
      { charOffset: 5, spec: { startFret: 2, frets: [null, 0, 1, 2, 3, null] } },
    ]);
  });

  it('strips invalid marker content as a no-op, without recording a spec', () => {
    // Wrong shape entirely (no dash, wrong length) - not decodable.
    const raw = 'CD$nonsense$EF';
    const { cleanAbc, grips } = extractChordGrips(raw);
    expect(grips).toEqual([]);
    expect(cleanAbc).toBe(`CD${' '.repeat('$nonsense$'.length)}EF`);
    expect(cleanAbc.length).toBe(raw.length);
  });

  it('rejects a fret digit outside the fixed 6-row diagram (0-5) and drops the marker', () => {
    const { grips } = extractChordGrips('$0-xx99xx$');
    expect(grips).toEqual([]);
  });

  it('rejects a string count other than exactly 6', () => {
    const { grips } = extractChordGrips('$0-xx3x$');
    expect(grips).toEqual([]);
  });

  it('returns no grips for text with no $ tokens', () => {
    const { cleanAbc, grips } = extractChordGrips('CDEFGAB');
    expect(cleanAbc).toBe('CDEFGAB');
    expect(grips).toEqual([]);
  });

  it('decodes an alternating open/muted example correctly', () => {
    const { grips } = extractChordGrips('$0-x0x0x0$');
    expect(grips[0]?.spec).toEqual({ startFret: 0, frets: [null, 0, null, 0, null, 0] });
  });

  it('allows a single-digit start fret up through 9', () => {
    const { grips } = extractChordGrips('$9-012345$');
    expect(grips[0]?.spec.startFret).toBe(9);
  });

  it('allows a two-digit start fret, for a voicing moved further up the neck', () => {
    const { grips } = extractChordGrips('$12-012345$');
    expect(grips[0]?.spec.startFret).toBe(12);
  });

  it('preserves string length exactly with a two-digit start fret (offset stability)', () => {
    const raw = 'CD$12-012345$EF';
    const { cleanAbc } = extractChordGrips(raw);
    expect(cleanAbc.length).toBe(raw.length);
    expect(cleanAbc).toBe(`CD${' '.repeat('$12-012345$'.length)}EF`);
  });

  it('rejects a three-digit start fret and drops the marker', () => {
    const { grips } = extractChordGrips('$123-012345$');
    expect(grips).toEqual([]);
  });
});

describe('computeChordGripOverlay', () => {
  it('attaches a grip to the note it directly precedes, even with no chord symbol at all', () => {
    // Unlike root hints, chord grips are NOT gated on the event having a chordSymbol.
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\nCD$0-xx34xx$EF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips).toEqual([
      null,
      null,
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      null,
    ]);
  });

  it('attaches to the note it directly precedes even when a chord symbol comes first', () => {
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\n"D-"$0-xx34xx$DEFG|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
    expect(overlay.lines[0].grips.slice(1)).toEqual([null, null, null]);
  });

  it('attaches correctly even when whitespace separates the chord symbol from the marker', () => {
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\n"D-"$0-xx34xx$ DEFG|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
  });

  it('produces null for events with no grip nearby', () => {
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\nCDEF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips).toEqual([null, null, null, null]);
  });

  it('does not carry a grip forward to later events (one-shot, unlike root markers)', () => {
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\n$0-xx34xx$CDEF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips).toEqual([
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      null,
      null,
      null,
    ]);
  });

  it('attaches a grip to a rest event', () => {
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\n$0-xx34xx$z CDE|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
  });

  it('handles two grips in one line, each attaching to its own nearest event', () => {
    const { cleanAbc, grips } = extractChordGrips('X:1\nK:C\n$0-xx34xx$C D$3-012345$E F|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[0].grips).toEqual([
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      null,
      { startFret: 3, frets: [0, 1, 2, 3, 4, 5] },
      null,
    ]);
  });

  it('does not leak a grip written inside V:comp onto the next melody line', () => {
    // The grip sits inside the V:comp block, textually between melody line 1
    // and melody line 2. It's meant only for the comping voice's own
    // alignment (see alignCompingToGrips) and must never attach to the first
    // melody event of line 2 just because it's the nearest melody event that
    // follows it in char order.
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:comp\n$0-xx34xx$C8|\nV:1\nGABc|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    expect(overlay.lines[1].grips).toEqual([null, null, null, null]);
  });
});
