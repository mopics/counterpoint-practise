import { LINE_SPACING, STAFF_LINE_COUNT } from './geometry';

interface Props {
  topY: number;
  width: number;
}

export function Staff({ topY, width }: Props) {
  const lines = [];
  for (let i = 0; i < STAFF_LINE_COUNT; i++) {
    const y = topY + i * LINE_SPACING;
    lines.push(
      <line key={i} x1={0} y1={y} x2={width} y2={y} stroke="currentColor" strokeWidth={1} />,
    );
  }
  return <g className="text-slate-400">{lines}</g>;
}
