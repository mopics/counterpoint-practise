import type { NotationGraceNote } from '../abc/types';
import { GRACE_NOTE_WIDTH, pitchToY } from './geometry';

interface Props {
  x: number;
  grace: NotationGraceNote[];
  staffBottomY: number;
}

export function GraceNoteGlyph({ x, grace, staffBottomY }: Props) {
  return (
    <g>
      {grace.map((g, i) => {
        const gx = x - GRACE_NOTE_WIDTH * (grace.length - i);
        const gy = pitchToY(g.pitch, staffBottomY);
        return (
          <g key={i}>
            <line x1={gx} y1={gy} x2={gx} y2={gy - 12} stroke="#475569" strokeWidth={1} />
            <path d={`M ${gx} ${gy - 12} l 5 3`} stroke="#475569" strokeWidth={1.2} fill="none" strokeLinecap="round" />
            <ellipse cx={gx} cy={gy} rx={2.6} ry={2} fill="#475569" transform={`rotate(-18 ${gx} ${gy})`} />
          </g>
        );
      })}
      {grace.length > 0 && (
        <path
          d={`M ${x - GRACE_NOTE_WIDTH * grace.length - 2} ${pitchToY(grace[0].pitch, staffBottomY) + 6} l 6 -8`}
          stroke="#475569"
          strokeWidth={1}
          fill="none"
        />
      )}
    </g>
  );
}
