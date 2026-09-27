import { describe, it, expect } from 'vitest';
import { computeResizedSize } from './SplitPane';

describe('computeResizedSize', () => {
  it('grows the second pane when the pointer moves toward the first pane', () => {
    // Horizontal: divider dragged left (smaller clientX) grows the right pane.
    expect(computeResizedSize(100, 400, 80, 240, 800)).toBe(420);
  });

  it('shrinks the second pane when the pointer moves toward the second pane', () => {
    expect(computeResizedSize(100, 400, 130, 240, 800)).toBe(370);
  });

  it('clamps to the minimum', () => {
    expect(computeResizedSize(100, 400, 500, 240, 800)).toBe(240);
  });

  it('clamps to the maximum', () => {
    expect(computeResizedSize(100, 400, -500, 240, 800)).toBe(800);
  });
});
