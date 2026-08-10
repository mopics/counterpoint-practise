import type { LayoutBar } from './layout';
import { STAFF_HEIGHT } from './geometry';

interface Props {
  bar: LayoutBar;
  staffTopY: number;
}

export function BarLine({ bar, staffTopY }: Props) {
  const { type, startEnding } = bar.marker;
  const y1 = staffTopY;
  const y2 = staffTopY + STAFF_HEIGHT;
  const isRepeatLeft = type === 'bar_left_repeat' || type === 'bar_dbl_repeat';
  const isRepeatRight = type === 'bar_right_repeat' || type === 'bar_dbl_repeat';
  const thick = type === 'bar_thick_thin' || type === 'bar_thin_thick';

  return (
    <g className="text-slate-700">
      {startEnding && (
        <text x={bar.x + 3} y={staffTopY - 6} fontSize={11} className="fill-slate-600">
          {startEnding}
        </text>
      )}
      <line x1={bar.x} y1={y1} x2={bar.x} y2={y2} stroke="currentColor" strokeWidth={thick ? 2.5 : 1.3} />
      {type === 'bar_thin_thin' && (
        <line x1={bar.x + 4} y1={y1} x2={bar.x + 4} y2={y2} stroke="currentColor" strokeWidth={1.3} />
      )}
      {isRepeatLeft && (
        <>
          <line x1={bar.x + 4} y1={y1} x2={bar.x + 4} y2={y2} stroke="currentColor" strokeWidth={2.5} />
          <circle cx={bar.x + 9} cy={y1 + STAFF_HEIGHT * 0.35} r={1.6} fill="currentColor" />
          <circle cx={bar.x + 9} cy={y1 + STAFF_HEIGHT * 0.65} r={1.6} fill="currentColor" />
        </>
      )}
      {isRepeatRight && (
        <>
          <line x1={bar.x - 4} y1={y1} x2={bar.x - 4} y2={y2} stroke="currentColor" strokeWidth={2.5} />
          <circle cx={bar.x - 9} cy={y1 + STAFF_HEIGHT * 0.35} r={1.6} fill="currentColor" />
          <circle cx={bar.x - 9} cy={y1 + STAFF_HEIGHT * 0.65} r={1.6} fill="currentColor" />
        </>
      )}
    </g>
  );
}
