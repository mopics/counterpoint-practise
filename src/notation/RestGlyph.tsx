import { flagCount, pitchToY } from './geometry';

interface Props {
  x: number;
  duration: number;
  staffBottomY: number;
  selected?: boolean;
}

// Simplified, purpose-built rest glyphs (not full common-practice engraving
// glyphs): a filled bar for whole/half rests, a stemmed hook mark with
// flag-count strokes for shorter rests. Legible at a glance and duration-
// distinguishable, which is what the notation view needs.
export function RestGlyph({ x, duration, staffBottomY, selected }: Props) {
  const color = selected ? '#2563eb' : '#334155';
  const midY = pitchToY(6, staffBottomY);

  if (duration >= 1) {
    const y = pitchToY(8, staffBottomY);
    return <rect x={x - 6} y={y - 4} width={12} height={4} fill={color} />;
  }
  if (duration >= 0.5) {
    const y = pitchToY(6, staffBottomY);
    return <rect x={x - 6} y={y} width={12} height={4} fill={color} />;
  }

  const flags = flagCount(duration);
  return (
    <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round">
      <line x1={x} y1={midY - 10} x2={x} y2={midY + 10} />
      {Array.from({ length: Math.max(1, flags) }).map((_, i) => (
        <path key={i} d={`M ${x} ${midY - 6 + i * 6} q 6 2 0 8`} />
      ))}
    </g>
  );
}
