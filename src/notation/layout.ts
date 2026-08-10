import type { BarMarker, NotationLine, NotationEvent } from '../abc/types';
import { BAR_PAD, END_PADDING, LEFT_MARGIN, PART_LABEL_WIDTH, eventWidth } from './geometry';

export interface LayoutEvent {
  x: number;
  width: number;
  event: NotationEvent;
  eventIndex: number;
}

export interface LayoutBar {
  x: number;
  marker: BarMarker;
}

export interface LineLayout {
  lineIndex: number;
  partLabel?: string;
  events: LayoutEvent[];
  bars: LayoutBar[];
  contentWidth: number;
  staffTopY: number;
  staffBottomY: number;
}

export function layoutLine(line: NotationLine, staffTopY: number, staffBottomY: number): LineLayout {
  let x = LEFT_MARGIN + PART_LABEL_WIDTH;
  const events: LayoutEvent[] = [];
  const bars: LayoutBar[] = [];
  let barCursor = 0;

  line.events.forEach((event, i) => {
    while (barCursor < line.bars.length && line.bars[barCursor].eventIndex === i) {
      bars.push({ x, marker: line.bars[barCursor] });
      x += BAR_PAD;
      barCursor++;
    }
    const width = eventWidth(event.duration);
    events.push({ x, width, event, eventIndex: i });
    x += width;
  });

  while (barCursor < line.bars.length) {
    bars.push({ x, marker: line.bars[barCursor] });
    barCursor++;
  }

  return {
    lineIndex: line.lineIndex,
    partLabel: line.partLabel,
    events,
    bars,
    contentWidth: x + END_PADDING,
    staffTopY,
    staffBottomY,
  };
}
