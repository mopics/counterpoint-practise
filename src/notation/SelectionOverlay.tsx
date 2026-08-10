import type { EventRef } from '../abc/types';
import { orderedRange } from '../abc/eventRef';
import type { LineLayout } from './layout';
import { STAFF_HEIGHT } from './geometry';

interface Props {
  start: EventRef;
  end: EventRef;
  layouts: Map<number, LineLayout>;
}

export function SelectionOverlay({ start, end, layouts }: Props) {
  const [lo, hi] = orderedRange(start, end);
  const rects: { key: string; x: number; width: number; y: number; height: number }[] = [];

  for (const layout of layouts.values()) {
    if (layout.lineIndex < lo.lineIndex || layout.lineIndex > hi.lineIndex) continue;
    const fromIndex = layout.lineIndex === lo.lineIndex ? lo.eventIndex : 0;
    const toIndex = layout.lineIndex === hi.lineIndex ? hi.eventIndex : layout.events.length - 1;
    const fromEvent = layout.events[fromIndex];
    const toEvent = layout.events[toIndex];
    if (!fromEvent || !toEvent) continue;

    rects.push({
      key: `${layout.lineIndex}`,
      x: fromEvent.x - 6,
      width: toEvent.x + toEvent.width - fromEvent.x + 4,
      y: layout.staffTopY - 8,
      height: STAFF_HEIGHT + 16,
    });
  }

  return (
    <g pointerEvents="none">
      {rects.map((r) => (
        <rect key={r.key} x={r.x} y={r.y} width={r.width} height={r.height} fill="#2563eb" opacity={0.14} rx={3} />
      ))}
    </g>
  );
}
