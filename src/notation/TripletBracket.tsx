import type { LayoutEvent } from './layout';
import type { BeamInfo } from './beaming';
import { NOTE_RADIUS, STEM_LENGTH, pitchToY, stemUp } from './geometry';

interface Props {
  events: LayoutEvent[];
  staffBottomY: number;
  beamInfo: Map<number, BeamInfo>;
}

interface Group {
  start: LayoutEvent;
  end: LayoutEvent;
  label: number;
}

function computeTripletGroups(events: LayoutEvent[]): Group[] {
  const groups: Group[] = [];
  let start: LayoutEvent | null = null;
  let label = 3;
  let last: LayoutEvent | null = null;

  for (const le of events) {
    if (le.event.kind !== 'note') continue;
    if (le.event.tripletStart && !start) {
      start = le;
      label = le.event.tripletStart.r;
    }
    if (start) last = le;
    if (le.event.tripletEnd && start && last) {
      groups.push({ start, end: last, label });
      start = null;
      last = null;
    }
  }
  return groups;
}

function topY(le: LayoutEvent, staffBottomY: number, beamInfo: Map<number, BeamInfo>): number {
  const pitches = le.event.pitches ?? [];
  if (!pitches.length) return staffBottomY;
  const up = beamInfo.get(le.eventIndex)?.stemUp ?? stemUp(pitches[0].pitch);
  const p = up ? Math.min(...pitches.map((x) => x.pitch)) : Math.max(...pitches.map((x) => x.pitch));
  const y0 = pitchToY(p, staffBottomY);
  return up ? y0 - STEM_LENGTH - 6 : y0 + STEM_LENGTH + 6;
}

export function TripletBrackets({ events, staffBottomY, beamInfo }: Props) {
  const groups = computeTripletGroups(events);
  return (
    <g stroke="#334155" strokeWidth={1} fill="none">
      {groups.map((g, i) => {
        const y1 = topY(g.start, staffBottomY, beamInfo);
        const y2 = topY(g.end, staffBottomY, beamInfo);
        const y = Math.min(y1, y2);
        const x1 = g.start.x - NOTE_RADIUS;
        const x2 = g.end.x + NOTE_RADIUS;
        const midX = (x1 + x2) / 2;
        return (
          <g key={i}>
            <path d={`M ${x1} ${y + 5} L ${x1} ${y} L ${midX - 6} ${y}`} />
            <path d={`M ${midX + 6} ${y} L ${x2} ${y} L ${x2} ${y + 5}`} />
            <text x={midX} y={y + 4} fontSize={10} textAnchor="middle" fill="#334155" stroke="none">
              {g.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
