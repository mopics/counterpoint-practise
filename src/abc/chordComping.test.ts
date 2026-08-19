import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { extractCompingVoice, alignCompingToGrips } from './chordComping';
import { flattenTune } from './flatten';
import { extractChordGrips, computeChordGripOverlay } from './chordGrips';

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
    const alignment = buildAlignment('X:1\nL:1/4\nK:C\nV:1\n$0-xx34xx$C4|\nV:2\nCCC|\n');
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
