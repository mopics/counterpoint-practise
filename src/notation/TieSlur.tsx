import type { NotationLine } from '../abc/types';
import type { LineLayout } from './layout';
import { LEFT_MARGIN, pitchToY } from './geometry';

export interface EventPoint {
  lineIndex: number;
  eventIndex: number;
  pitchIndex: number;
}

export interface SlurSpan {
  kind: 'tie' | 'slur';
  from: EventPoint;
  to: EventPoint;
}

interface FlatEvt {
  lineIndex: number;
  eventIndex: number;
  event: NotationLine['events'][number];
}

function flattenAllEvents(lines: NotationLine[]): FlatEvt[] {
  const out: FlatEvt[] = [];
  for (const line of lines) {
    line.events.forEach((event, eventIndex) => out.push({ lineIndex: line.lineIndex, eventIndex, event }));
  }
  return out;
}

/** Pairs up tie/slur start+end markers into renderable spans, including spans that wrap across a line break. */
export function computeSlurSpans(lines: NotationLine[]): SlurSpan[] {
  const flat = flattenAllEvents(lines);
  const spans: SlurSpan[] = [];
  const openSlurs = new Map<number, EventPoint>();

  flat.forEach((fe, idx) => {
    const pitches = fe.event.pitches;
    if (!pitches) return;
    pitches.forEach((p, pitchIndex) => {
      if (p.tieStart) {
        for (let j = idx + 1; j < flat.length; j++) {
          const candidate = flat[j].event;
          if (candidate.kind === 'note' && candidate.pitches?.length) {
            const toPitchIndex = Math.min(pitchIndex, candidate.pitches.length - 1);
            spans.push({
              kind: 'tie',
              from: { lineIndex: fe.lineIndex, eventIndex: fe.eventIndex, pitchIndex },
              to: { lineIndex: flat[j].lineIndex, eventIndex: flat[j].eventIndex, pitchIndex: toPitchIndex },
            });
            break;
          }
        }
      }
      for (const label of p.slurStart) {
        openSlurs.set(label, { lineIndex: fe.lineIndex, eventIndex: fe.eventIndex, pitchIndex });
      }
      for (const label of p.slurEnd) {
        const start = openSlurs.get(label);
        if (start) {
          spans.push({
            kind: 'slur',
            from: start,
            to: { lineIndex: fe.lineIndex, eventIndex: fe.eventIndex, pitchIndex },
          });
          openSlurs.delete(label);
        }
      }
    });
  });

  return spans;
}

function notePoint(layouts: Map<number, LineLayout>, ref: EventPoint): { x: number; y: number; layout: LineLayout } | null {
  const layout = layouts.get(ref.lineIndex);
  if (!layout) return null;
  const le = layout.events[ref.eventIndex];
  const pitch = le?.event.pitches?.[ref.pitchIndex] ?? le?.event.pitches?.[0];
  if (!le || !pitch) return null;
  return { x: le.x, y: pitchToY(pitch.pitch, layout.staffBottomY), layout };
}

function arcPath(x1: number, y1: number, x2: number, y2: number, above: boolean): string {
  const dx = x2 - x1;
  const height = Math.min(20, Math.max(7, Math.abs(dx) * 0.16));
  const cy = above ? Math.min(y1, y2) - height : Math.max(y1, y2) + height;
  return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${cy} ${x2} ${y2}`;
}

interface Props {
  spans: SlurSpan[];
  layouts: Map<number, LineLayout>;
}

export function TieSlurLayer({ spans, layouts }: Props) {
  return (
    <g fill="none" strokeLinecap="round">
      {spans.map((span, i) => {
        const from = notePoint(layouts, span.from);
        const to = notePoint(layouts, span.to);
        if (!from || !to) return null;
        const stroke = span.kind === 'tie' ? '#0f172a' : '#334155';
        const strokeWidth = span.kind === 'tie' ? 1.6 : 1.2;

        if (span.from.lineIndex === span.to.lineIndex) {
          const above = from.y < from.layout.staffBottomY - 16; // roughly upper-half of staff
          return (
            <path
              key={i}
              d={arcPath(from.x + 3, from.y - 6, to.x - 3, to.y - 6, above)}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          );
        }

        // Cross-line span: draw a tail hook at the end of the source line and
        // a head hook at the start of the destination line.
        const above = from.y < from.layout.staffBottomY - 16;
        const tailEndX = from.layout.contentWidth;
        const headStartX = LEFT_MARGIN;
        return (
          <g key={i}>
            <path
              d={arcPath(from.x + 3, from.y - 6, tailEndX, from.y - 6, above)}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            <path
              d={arcPath(headStartX, to.y - 6, to.x - 3, to.y - 6, to.y < to.layout.staffBottomY - 16)}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        );
      })}
    </g>
  );
}
