import { DOT_GAP, DOT_RADIUS, dotCount, flagCount, pitchToY } from './geometry';

interface Props {
  x: number;
  duration: number;
  staffBottomY: number;
  selected?: boolean;
}

/** Augmentation dots to the right of a rest glyph, level with its vertical center (rests aren't pitched, so there's no staff-line to dodge). */
function RestDots({ count, glyphRightEdge, y, color }: { count: number; glyphRightEdge: number; y: number; color: string }) {
  if (count === 0) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <circle key={i} cx={glyphRightEdge + DOT_GAP + i * (2 * DOT_RADIUS + DOT_GAP)} cy={y} r={DOT_RADIUS} fill={color} />
      ))}
    </>
  );
}

// Simplified, purpose-built rest glyphs (not full common-practice engraving
// glyphs): a filled bar for whole/half rests, a stemmed hook mark with
// flag-count strokes for shorter rests. Legible at a glance and duration-
// distinguishable, which is what the notation view needs.
export function RestGlyph({ x, duration, staffBottomY, selected }: Props) {
  const color = selected ? '#2563eb' : '#334155';
  const midY = pitchToY(6, staffBottomY);
  const dots = dotCount(duration);

  if (duration >= 1) {
    const y = pitchToY(8, staffBottomY);
    return (
      <>
        <rect x={x - 6} y={y - 4} width={12} height={4} fill={color} />
        <RestDots count={dots} glyphRightEdge={x + 6} y={y - 2} color={color} />
      </>
    );
  }
  if (duration >= 0.5) {
    const y = pitchToY(6, staffBottomY);
    return (
      <>
        <rect x={x - 6} y={y} width={12} height={4} fill={color} />
        <RestDots count={dots} glyphRightEdge={x + 6} y={y + 2} color={color} />
      </>
    );
  }

  const flags = flagCount(duration);
  return (
    <>
      <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round">
        <line x1={x} y1={midY - 10} x2={x} y2={midY + 10} />
        {Array.from({ length: Math.max(1, flags) }).map((_, i) => (
          <path key={i} d={`M ${x} ${midY - 6 + i * 6} q 6 2 0 8`} />
        ))}
      </g>
      <RestDots count={dots} glyphRightEdge={x + 8} y={midY} color={color} />
    </>
  );
}
