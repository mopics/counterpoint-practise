import { describe, it, expect } from 'vitest';
import { shouldSeekToLoopStart } from './loopEnforcement';

describe('shouldSeekToLoopStart', () => {
  it('returns false when looping is disabled', () => {
    expect(shouldSeekToLoopStart(10, false, 0, 5)).toBe(false);
  });

  it('returns false when loopStart is unset', () => {
    expect(shouldSeekToLoopStart(10, true, null, 5)).toBe(false);
  });

  it('returns false when loopEnd is unset', () => {
    expect(shouldSeekToLoopStart(10, true, 0, null)).toBe(false);
  });

  it('returns false while current time is still before loopEnd', () => {
    expect(shouldSeekToLoopStart(3, true, 0, 5)).toBe(false);
  });

  it('returns true once current time reaches loopEnd', () => {
    expect(shouldSeekToLoopStart(5, true, 0, 5)).toBe(true);
  });

  it('returns true once current time passes loopEnd', () => {
    expect(shouldSeekToLoopStart(6, true, 0, 5)).toBe(true);
  });

  it('is inert (returns false) when loopEnd is behind loopStart', () => {
    expect(shouldSeekToLoopStart(100, true, 20, 10)).toBe(false);
  });

  it('is inert (returns false) when loopEnd equals loopStart', () => {
    expect(shouldSeekToLoopStart(100, true, 10, 10)).toBe(false);
  });
});
