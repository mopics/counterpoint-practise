import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';

describe('flattenTune key fields', () => {
  it('extracts keyRoot for a plain major key', () => {
    const tune = parseTune('X:1\nK:D\nDEFG|');
    const flattened = flattenTune(tune);
    expect(flattened.keyRoot).toBe('D');
  });

  it('extracts keyRoot including a sharp on the root itself', () => {
    const tune = parseTune('X:1\nK:F#\nz4|');
    const flattened = flattenTune(tune);
    expect(flattened.keyRoot).toBe('F#');
  });

  it('extracts keyAccidentals for a one-flat key', () => {
    const tune = parseTune('X:1\nK:F\nFGAB|');
    const flattened = flattenTune(tune);
    expect(flattened.keyAccidentals).toEqual({ B: 'flat' });
  });

  it('extracts an empty keyAccidentals map for key of C', () => {
    const tune = parseTune('X:1\nK:C\nCDEF|');
    const flattened = flattenTune(tune);
    expect(flattened.keyAccidentals).toEqual({});
  });
});
