import type { LayoutEvent } from './layout';
import { stemUp as pitchStemUp } from './geometry';

export interface BeamInfo {
  beamed: boolean;
  stemUp: boolean;
}

function primaryPitch(le: LayoutEvent): number | null {
  const pitches = le.event.pitches;
  if (!pitches?.length) return null;
  return pitches[0].pitch;
}

/**
 * Assigns a single, shared stem direction to every note in a beam group
 * (computed from the group's average pitch), instead of each note picking
 * its own direction independently — mixed directions within one beam
 * produce wildly slanted, visually broken beam lines.
 */
export function computeBeamInfo(events: LayoutEvent[]): Map<number, BeamInfo> {
  const info = new Map<number, BeamInfo>();
  let group: LayoutEvent[] = [];
  let inGroup = false;

  const flushUnbeamed = (les: LayoutEvent[]) => {
    for (const le of les) {
      const p = primaryPitch(le);
      info.set(le.eventIndex, { beamed: false, stemUp: p === null ? true : pitchStemUp(p) });
    }
  };

  const flushGroup = () => {
    if (group.length > 1) {
      const pitches = group.map(primaryPitch).filter((p): p is number => p !== null);
      const avg = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 6;
      const up = avg <= 6;
      for (const le of group) info.set(le.eventIndex, { beamed: true, stemUp: up });
    } else {
      flushUnbeamed(group);
    }
    group = [];
  };

  for (const le of events) {
    if (le.event.kind !== 'note') continue;
    if (le.event.beamStart) {
      inGroup = true;
      group = [];
    }
    if (inGroup) {
      group.push(le);
    } else {
      flushUnbeamed([le]);
    }
    if (le.event.beamEnd && inGroup) {
      flushGroup();
      inGroup = false;
    }
  }
  if (inGroup && group.length) flushUnbeamed(group); // malformed/dangling group: fall back safely

  return info;
}
