import { describe, it, expect } from 'vitest';
import { dotCount } from './geometry';

describe('dotCount', () => {
  it('returns 0 for plain (undotted) durations', () => {
    expect(dotCount(1)).toBe(0);
    expect(dotCount(0.5)).toBe(0);
    expect(dotCount(0.25)).toBe(0);
    expect(dotCount(0.125)).toBe(0);
    expect(dotCount(0.0625)).toBe(0);
  });

  it('returns 1 for a single-dotted duration (base x 1.5)', () => {
    expect(dotCount(0.75)).toBe(1); // dotted half
    expect(dotCount(0.375)).toBe(1); // dotted quarter
    expect(dotCount(0.1875)).toBe(1); // dotted eighth
    expect(dotCount(0.09375)).toBe(1); // dotted sixteenth
  });

  it('returns 2 for a double-dotted duration (base x 1.75)', () => {
    expect(dotCount(0.875)).toBe(2); // double-dotted half
    expect(dotCount(0.4375)).toBe(2); // double-dotted quarter
    expect(dotCount(0.21875)).toBe(2); // double-dotted eighth
  });

  it('does not misfire on an unrelated duration close to but not exactly a dotted value', () => {
    expect(dotCount(0.4)).toBe(0);
    expect(dotCount(0.3)).toBe(0);
  });

  it('returns 0 for a triplet-derived duration (1/3 of a base), which is not a dot', () => {
    expect(dotCount(1 / 6)).toBe(0); // triplet eighth
  });
});
