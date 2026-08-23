import { describe, it, expect } from 'vitest';
import { dotCellIndex } from './ChordGripDiagram';

describe('dotCellIndex', () => {
  it('shifts fret values back by one row when startFret is 0, since fret 0 is the open circle above the grid, not a cell', () => {
    // x32010 (open C major): B-string fret 1 -> first cell below the nut, etc.
    expect(dotCellIndex(1, 0)).toBe(0);
    expect(dotCellIndex(2, 0)).toBe(1);
    expect(dotCellIndex(3, 0)).toBe(2);
    expect(dotCellIndex(5, 0)).toBe(4);
  });

  it('maps fret value directly to the same cell index when startFret is greater than 0, since fret 0 there means "play at startFret" and needs a real dot', () => {
    expect(dotCellIndex(0, 3)).toBe(0);
    expect(dotCellIndex(1, 3)).toBe(1);
    expect(dotCellIndex(5, 5)).toBe(5);
  });
});
