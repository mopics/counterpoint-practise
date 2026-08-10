import type { LayoutEvent } from './layout';
import type { BeamInfo } from './beaming';
import { NOTE_RADIUS, STEM_LENGTH, pitchToY } from './geometry';

interface Props {
  events: LayoutEvent[];
  staffBottomY: number;
  beamInfo: Map<number, BeamInfo>;
}

function stemTip(le: LayoutEvent, up: boolean, staffBottomY: number): { x: number; y: number } {
  const pitches = le.event.pitches ?? [];
  if (!pitches.length) return { x: le.x, y: staffBottomY };
  const stemPitch = up ? Math.min(...pitches.map((p) => p.pitch)) : Math.max(...pitches.map((p) => p.pitch));
  const y0 = pitchToY(stemPitch, staffBottomY);
  const y = up ? y0 - STEM_LENGTH : y0 + STEM_LENGTH;
  const x = le.x + (up ? NOTE_RADIUS - 0.5 : -(NOTE_RADIUS - 0.5));
  return { x, y };
}

export function BeamGroups({ events, staffBottomY, beamInfo }: Props) {
  const beams: { from: LayoutEvent; to: LayoutEvent; up: boolean }[] = [];
  let groupStart: LayoutEvent | null = null;
  let lastNote: LayoutEvent | null = null;

  for (const le of events) {
    if (le.event.kind !== 'note') continue;
    const info = beamInfo.get(le.eventIndex);
    if (!info?.beamed) continue;
    if (le.event.beamStart && !groupStart) groupStart = le;
    if (groupStart) lastNote = le;
    if (le.event.beamEnd && groupStart && lastNote && lastNote !== groupStart) {
      beams.push({ from: groupStart, to: lastNote, up: info.stemUp });
      groupStart = null;
      lastNote = null;
    } else if (le.event.beamEnd) {
      groupStart = null;
      lastNote = null;
    }
  }

  return (
    <g>
      {beams.map(({ from, to, up }, i) => {
        const a = stemTip(from, up, staffBottomY);
        const b = stemTip(to, up, staffBottomY);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#0f172a"
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}
