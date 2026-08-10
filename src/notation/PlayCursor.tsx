import type { EventRef } from '../abc/types';
import type { LineLayout } from './layout';
import { STAFF_HEIGHT } from './geometry';

interface Props {
  cursor: EventRef;
  layouts: Map<number, LineLayout>;
}

export function PlayCursorMarker({ cursor, layouts }: Props) {
  const layout = layouts.get(cursor.lineIndex);
  const le = layout?.events[cursor.eventIndex];
  if (!layout || !le) return null;

  const x = le.x - 6;
  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={layout.staffTopY - 6}
        width={le.width + 4}
        height={STAFF_HEIGHT + 12}
        fill="#f97316"
        opacity={0.16}
      />
      <line
        x1={x}
        y1={layout.staffTopY - 6}
        x2={x}
        y2={layout.staffTopY + STAFF_HEIGHT + 6}
        stroke="#ea580c"
        strokeWidth={2}
      />
    </g>
  );
}
