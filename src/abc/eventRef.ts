import type { EventRef } from './types';

export function compareEventRef(a: EventRef, b: EventRef): number {
  if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
  return a.eventIndex - b.eventIndex;
}

export function orderedRange(a: EventRef, b: EventRef): [EventRef, EventRef] {
  return compareEventRef(a, b) <= 0 ? [a, b] : [b, a];
}

export function isEventInRange(ref: EventRef, a: EventRef, b: EventRef): boolean {
  const [lo, hi] = orderedRange(a, b);
  return compareEventRef(ref, lo) >= 0 && compareEventRef(ref, hi) <= 0;
}
