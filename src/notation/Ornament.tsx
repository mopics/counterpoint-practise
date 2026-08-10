import { pitchToY } from './geometry';
import type { NotationPitch } from '../abc/types';

interface Props {
  x: number;
  pitches: NotationPitch[];
  decorations: string[];
  staffBottomY: number;
}

const KNOWN = new Set(['slide', 'tenuto']);

export function OrnamentGlyphs({ x, pitches, decorations, staffBottomY }: Props) {
  if (!decorations.length || !pitches.length) return null;
  const y = pitchToY(pitches[0].pitch, staffBottomY);
  const unknown = decorations.filter((d) => !KNOWN.has(d));

  return (
    <g stroke="#0f172a" fill="none">
      {decorations.includes('slide') && (
        <path d={`M ${x - 12} ${y + 8} L ${x - 3} ${y + 1}`} strokeWidth={1.4} strokeLinecap="round" />
      )}
      {decorations.includes('tenuto') && (
        <line x1={x - 4} y1={y - 10} x2={x + 4} y2={y - 10} strokeWidth={1.6} strokeLinecap="round" />
      )}
      {unknown.length > 0 && (
        <text x={x} y={y - 14} fontSize={8} textAnchor="middle" fill="#94a3b8" stroke="none">
          {unknown.join(',')}
        </text>
      )}
    </g>
  );
}
