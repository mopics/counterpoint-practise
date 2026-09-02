import { describe, it, expect } from 'vitest';
import {
  dotCount,
  spaceOutGripX,
  gripDiagramWidth,
  CHORD_GRIP_MIN_GAP,
  CHORD_GRIP_WIDTH,
  CHORD_GRIP_FRET_LABEL_WIDTH,
} from './geometry';

const plain = (x: number) => ({ x, width: gripDiagramWidth(false) });
const fretted = (x: number) => ({ x, width: gripDiagramWidth(true) });

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

describe('gripDiagramWidth', () => {
  it('is the bare grid width with no fret label', () => {
    expect(gripDiagramWidth(false)).toBe(CHORD_GRIP_WIDTH);
  });

  it('adds the fret-label allowance when a start-fret label is shown', () => {
    expect(gripDiagramWidth(true)).toBe(CHORD_GRIP_WIDTH + CHORD_GRIP_FRET_LABEL_WIDTH);
  });
});

describe('spaceOutGripX', () => {
  it('leaves positions untouched when they are already far enough apart', () => {
    const items = [plain(0), plain(100), plain(200)];
    expect(spaceOutGripX(items)).toEqual([0, 100, 200]);
  });

  it('pushes a crowded diagram right by exactly the minimum gap past the previous diagram\'s right edge', () => {
    const items = [plain(0), plain(3)];
    expect(spaceOutGripX(items)).toEqual([0, CHORD_GRIP_WIDTH + CHORD_GRIP_MIN_GAP]);
  });

  it('cascades the push through a run of crowded diagrams rather than only fixing the first pair', () => {
    const items = [plain(0), plain(1), plain(2), plain(3)];
    const out = spaceOutGripX(items);
    expect(out[0]).toBe(0);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBe(out[i - 1] + CHORD_GRIP_WIDTH + CHORD_GRIP_MIN_GAP);
    }
  });

  it('never moves a diagram left of its natural position', () => {
    const items = [plain(0), plain(100)];
    expect(spaceOutGripX(items)).toEqual([0, 100]);
  });

  it('returns an empty array for no positions', () => {
    expect(spaceOutGripX([])).toEqual([]);
  });

  it('reserves extra room after a diagram that shows a start-fret label', () => {
    // A fretted diagram at x=0 is wider than a plain one, so its right
    // neighbor needs to clear the fret-label allowance too, not just
    // CHORD_GRIP_WIDTH + CHORD_GRIP_MIN_GAP.
    const items = [fretted(0), plain(3)];
    const out = spaceOutGripX(items);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(CHORD_GRIP_WIDTH + CHORD_GRIP_FRET_LABEL_WIDTH + CHORD_GRIP_MIN_GAP);
  });

  it('does not reserve the extra room when the earlier diagram has no fret label', () => {
    const items = [plain(0), plain(3)];
    const out = spaceOutGripX(items);
    expect(out[1]).toBe(CHORD_GRIP_WIDTH + CHORD_GRIP_MIN_GAP);
  });
});
