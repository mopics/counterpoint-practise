// src/notation/ChordCompingRow.tsx
import type { ChordGripSpec } from '../abc/chordGrips';
import type { CompingEvent } from '../abc/chordComping';
import { ChordGripDiagram } from './ChordGripDiagram';
import {
  COMPING_STEM_LENGTH,
  DOT_GAP,
  DOT_RADIUS,
  FLAG_GAP,
  LEFT_MARGIN,
  NOTE_RADIUS,
  PART_LABEL_WIDTH,
  dotCount,
  eventWidth,
  flagCount,
  hasStem,
  isFilledNotehead,
} from './geometry';

interface Props {
  events: CompingEvent[];
  /** One entry per event in `events`, the chord grip active at that event (or null). */
  grips: (ChordGripSpec | null)[];
  gripY: number;
  rhythmY: number;
}

interface LaidOutEvent {
  x: number;
  event: CompingEvent;
  grip: ChordGripSpec | null;
}

function layoutCompingEvents(events: CompingEvent[], grips: (ChordGripSpec | null)[]): LaidOutEvent[] {
  let x = LEFT_MARGIN + PART_LABEL_WIDTH;
  return events.map((event, i) => {
    const laid: LaidOutEvent = { x, event, grip: grips[i] ?? null };
    x += eventWidth(event.duration);
    return laid;
  });
}

/**
 * True at the first event of each run sharing the same active grip — where a
 * new chord diagram should be drawn. Compares by reference: alignCompingToGrips
 * always reuses the same ChordGripSpec object for a held chord, never clones it.
 */
function isChordChangePoint(laid: LaidOutEvent[], index: number): boolean {
  if (laid[index].grip === null) return false;
  return index === 0 || laid[index - 1].grip !== laid[index].grip;
}

const COLOR = '#334155';

function CompingNote({ x, y, duration }: { x: number; y: number; duration: number }) {
  const filled = isFilledNotehead(duration);
  const stemmed = hasStem(duration);
  const flags = flagCount(duration);
  const dots = dotCount(duration);
  const stemX = x + NOTE_RADIUS - 0.5;
  const stemTipY = y - COMPING_STEM_LENGTH;

  return (
    <g>
      {stemmed && <line x1={stemX} y1={y} x2={stemX} y2={stemTipY} stroke={COLOR} strokeWidth={1.3} />}
      {stemmed &&
        Array.from({ length: flags }).map((_, i) => {
          const flagY = stemTipY + i * FLAG_GAP;
          const nextY = flagY + FLAG_GAP * 0.8;
          return (
            <path
              key={i}
              d={`M ${stemX} ${flagY} Q ${stemX + 9} ${flagY + 6} ${stemX + 6} ${nextY}`}
              fill="none"
              stroke={COLOR}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          );
        })}
      <ellipse
        cx={x}
        cy={y}
        rx={NOTE_RADIUS}
        ry={NOTE_RADIUS * 0.78}
        fill={filled ? COLOR : 'white'}
        stroke={COLOR}
        strokeWidth={filled ? 0 : 1.4}
      />
      {Array.from({ length: dots }).map((_, i) => (
        <circle key={i} cx={x + NOTE_RADIUS + DOT_GAP + i * (2 * DOT_RADIUS + DOT_GAP)} cy={y} r={DOT_RADIUS} fill={COLOR} />
      ))}
    </g>
  );
}

function CompingRest({ x, y, duration }: { x: number; y: number; duration: number }) {
  const dots = dotCount(duration);
  const body =
    duration >= 0.5 ? (
      <rect x={x - 6} y={y - 2} width={12} height={4} fill={COLOR} />
    ) : (
      <g stroke={COLOR} strokeWidth={1.6} fill="none" strokeLinecap="round">
        <line x1={x} y1={y - 10} x2={x} y2={y + 10} />
        {Array.from({ length: Math.max(1, flagCount(duration)) }).map((_, i) => (
          <path key={i} d={`M ${x} ${y - 6 + i * 6} q 6 2 0 8`} />
        ))}
      </g>
    );
  return (
    <>
      {body}
      {Array.from({ length: dots }).map((_, i) => (
        <circle key={i} cx={x + 8 + DOT_GAP + i * (2 * DOT_RADIUS + DOT_GAP)} cy={y} r={DOT_RADIUS} fill={COLOR} />
      ))}
    </>
  );
}

/** One line's worth of the chord-comping voice: grip diagrams at each chord change, plus a single rhythm line beneath the staff. */
export function ChordCompingRow({ events, grips, gripY, rhythmY }: Props) {
  const laid = layoutCompingEvents(events, grips);
  return (
    <g>
      {laid.map((le, i) =>
        isChordChangePoint(laid, i) && le.grip ? (
          <ChordGripDiagram key={`grip-${i}`} spec={le.grip} x={le.x} y={gripY} />
        ) : null,
      )}
      {laid.map((le, i) =>
        le.event.kind === 'rest' ? (
          <CompingRest key={`note-${i}`} x={le.x} y={rhythmY} duration={le.event.duration} />
        ) : (
          <CompingNote key={`note-${i}`} x={le.x} y={rhythmY} duration={le.event.duration} />
        ),
      )}
    </g>
  );
}
