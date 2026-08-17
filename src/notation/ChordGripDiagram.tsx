import type { ChordGripSpec } from '../abc/chordGrips';
import {
  CHORD_GRIP_FRET_ROWS,
  CHORD_GRIP_FRET_SPACING,
  CHORD_GRIP_GRID_HEIGHT,
  CHORD_GRIP_MUTE_OPEN_ROW_HEIGHT,
  CHORD_GRIP_STRING_COUNT,
  CHORD_GRIP_STRING_SPACING,
  CHORD_GRIP_WIDTH,
} from './geometry';

interface Props {
  spec: ChordGripSpec;
  /** Left edge of the diagram (aligned with the event it's attached to). */
  x: number;
  /** Top of the diagram block, above the mute/open indicator row. */
  y: number;
}

/** A fixed 6-string x 6-fret-row guitar chord-grip diagram, drawn below a chord symbol. */
export function ChordGripDiagram({ spec, x, y }: Props) {
  const gridTopY = y + CHORD_GRIP_MUTE_OPEN_ROW_HEIGHT;
  const stringX = (i: number) => x + i * CHORD_GRIP_STRING_SPACING;

  return (
    <g className="fill-slate-900 stroke-slate-900">
      {spec.frets.map((fret, i) => {
        if (fret === null) {
          return (
            <text key={`indicator-${i}`} x={stringX(i)} y={y + 6} fontSize={7} textAnchor="middle" className="fill-slate-600 stroke-none">
              &times;
            </text>
          );
        }
        if (fret === 0 && spec.startFret === 0) {
          return (
            <circle
              key={`indicator-${i}`}
              cx={stringX(i)}
              cy={y + 3}
              r={2.5}
              className="fill-none"
              strokeWidth={1}
            />
          );
        }
        return null;
      })}

      {Array.from({ length: CHORD_GRIP_STRING_COUNT }, (_, i) => (
        <line
          key={`string-${i}`}
          x1={stringX(i)}
          y1={gridTopY}
          x2={stringX(i)}
          y2={gridTopY + CHORD_GRIP_GRID_HEIGHT}
          strokeWidth={0.75}
        />
      ))}

      {Array.from({ length: CHORD_GRIP_FRET_ROWS + 1 }, (_, i) => (
        <line
          key={`fret-${i}`}
          x1={x}
          y1={gridTopY + i * CHORD_GRIP_FRET_SPACING}
          x2={x + CHORD_GRIP_WIDTH}
          y2={gridTopY + i * CHORD_GRIP_FRET_SPACING}
          strokeWidth={i === 0 && spec.startFret === 0 ? 2 : 0.75}
        />
      ))}

      {spec.frets.map((fret, i) => {
        if (fret === null || (fret === 0 && spec.startFret === 0)) return null;
        const dotY = gridTopY + fret * CHORD_GRIP_FRET_SPACING + CHORD_GRIP_FRET_SPACING / 2;
        return <circle key={`dot-${i}`} cx={stringX(i)} cy={dotY} r={2} className="stroke-none" />;
      })}

      {spec.startFret > 0 && (
        <text
          x={x + CHORD_GRIP_WIDTH + 3}
          y={gridTopY + CHORD_GRIP_FRET_SPACING}
          fontSize={7}
          className="fill-slate-600 stroke-none"
        >
          {spec.startFret}fr
        </text>
      )}
    </g>
  );
}
