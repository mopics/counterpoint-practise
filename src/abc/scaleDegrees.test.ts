import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';
import { extractKeyMarkers } from './keyMarkers';
import { computeScaleDegrees, pitchClassOf, degreeLabel } from './scaleDegrees';
import type { NotationPitch } from './types';

function pitch(name: string, accidental?: string): NotationPitch {
  return { pitch: 0, name, accidental, verticalPos: 0, tieStart: false, tieEnd: false, slurStart: [], slurEnd: [] };
}

describe('pitchClassOf', () => {
  it('resolves a natural note with no accidental and no key implication', () => {
    expect(pitchClassOf(pitch('C'), {})).toBe(0);
  });

  it('resolves an explicit sharp', () => {
    expect(pitchClassOf(pitch('C', 'sharp'), {})).toBe(1);
  });

  it('resolves an explicit flat', () => {
    expect(pitchClassOf(pitch('B', 'flat'), {})).toBe(10);
  });

  it('falls back to a key-implied accidental when the note has none', () => {
    expect(pitchClassOf(pitch('B'), { B: 'flat' })).toBe(10);
  });

  it('lets an explicit accidental override the key-implied one', () => {
    expect(pitchClassOf(pitch('B', 'natural'), { B: 'flat' })).toBe(11);
  });
});

describe('degreeLabel', () => {
  it('labels the root as "1"', () => {
    expect(degreeLabel(0, pitch('C'), {})).toBe('1');
  });

  it('uses flat spelling by default', () => {
    expect(degreeLabel(0, pitch('E', 'flat'), {})).toBe('b3');
  });

  it('uses sharp spelling when the note has an explicit sharp', () => {
    expect(degreeLabel(0, pitch('G', 'sharp'), {})).toBe('#5');
  });

  it('labels a tritone as "tt" regardless of spelling', () => {
    expect(degreeLabel(0, pitch('F', 'sharp'), {})).toBe('tt');
  });
});

describe('computeScaleDegrees', () => {
  it('uses the tune key as the default root when no markers are present', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\nCDEF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['1'], ['2'], ['3'], ['4']]);
  });

  it('applies a marker occurring before the first note to every note', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\n**F**CDEF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['5'], ['6'], ['7'], ['1']]);
  });

  it('carries a root forward only from the point the marker occurs', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\nCD**F**EF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['1'], ['2'], ['7'], ['1']]);
  });

  it('produces null for rests', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\nCz|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['1'], null]);
  });

  it('produces one label per pitch for a chord', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\n[CE]D|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees[0]).toEqual(['1', '3']);
  });
});
