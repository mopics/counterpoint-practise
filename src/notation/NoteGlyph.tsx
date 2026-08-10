import {
  FLAG_GAP,
  NOTE_RADIUS,
  STEM_LENGTH,
  flagCount,
  hasStem,
  isFilledNotehead,
  ledgerLinePitches,
  pitchToY,
} from './geometry';
import { AccidentalGlyph } from './AccidentalGlyph';
import type { NotationPitch } from '../abc/types';

interface Props {
  x: number;
  pitches: NotationPitch[];
  duration: number;
  staffBottomY: number;
  noteheadStyle?: string;
  beamed: boolean;
  /** Stem direction — shared across a whole beam group when beamed, per-note otherwise. */
  stemUp: boolean;
  selected?: boolean;
}

function NoteHead({
  cx,
  cy,
  filled,
  style,
  selected,
}: {
  cx: number;
  cy: number;
  filled: boolean;
  style?: string;
  selected?: boolean;
}) {
  const color = selected ? '#2563eb' : '#0f172a';
  if (style === 'x') {
    const r = NOTE_RADIUS;
    return (
      <g stroke={color} strokeWidth={1.6}>
        <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
        <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} />
      </g>
    );
  }
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={NOTE_RADIUS}
      ry={NOTE_RADIUS * 0.78}
      fill={filled ? color : 'white'}
      stroke={color}
      strokeWidth={filled ? 0 : 1.4}
      transform={`rotate(-18 ${cx} ${cy})`}
    />
  );
}

export function NoteGlyph({ x, pitches, duration, staffBottomY, noteheadStyle, beamed, stemUp: up, selected }: Props) {
  if (!pitches.length) return null;
  const filled = isFilledNotehead(duration);
  const stemmed = hasStem(duration);
  const flags = !beamed ? flagCount(duration) : 0;

  const minPitch = Math.min(...pitches.map((p) => p.pitch));
  const maxPitch = Math.max(...pitches.map((p) => p.pitch));
  const stemPitch = up ? minPitch : maxPitch;
  const stemY = pitchToY(stemPitch, staffBottomY);
  const stemTipY = up ? stemY - STEM_LENGTH : stemY + STEM_LENGTH;
  const stemX = x + (up ? NOTE_RADIUS - 0.5 : -(NOTE_RADIUS - 0.5));

  const ledgerPitches = new Set<number>();
  for (const p of pitches) for (const lp of ledgerLinePitches(p.pitch)) ledgerPitches.add(lp);

  return (
    <g data-selected={selected || undefined}>
      {[...ledgerPitches].map((lp) => {
        const y = pitchToY(lp, staffBottomY);
        return (
          <line
            key={lp}
            x1={x - NOTE_RADIUS - 3}
            y1={y}
            x2={x + NOTE_RADIUS + 3}
            y2={y}
            stroke="#64748b"
            strokeWidth={1}
          />
        );
      })}

      {stemmed && (
        <line x1={stemX} y1={stemY} x2={stemX} y2={stemTipY} stroke={selected ? '#2563eb' : '#0f172a'} strokeWidth={1.3} />
      )}

      {stemmed &&
        Array.from({ length: flags }).map((_, i) => {
          const flagY = stemTipY + (up ? 1 : -1) * i * FLAG_GAP;
          const nextY = flagY + (up ? 1 : -1) * FLAG_GAP * 0.8;
          return (
            <path
              key={i}
              d={`M ${stemX} ${flagY} Q ${stemX + 9} ${flagY + (up ? 6 : -6)} ${stemX + 6} ${nextY}`}
              fill="none"
              stroke={selected ? '#2563eb' : '#0f172a'}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          );
        })}

      {pitches.map((p, i) => {
        const y = pitchToY(p.pitch, staffBottomY);
        return (
          <g key={i}>
            {p.accidental && (
              <AccidentalGlyph
                x={x - NOTE_RADIUS - 9}
                y={y}
                accidental={p.accidental}
                color={selected ? '#2563eb' : '#1e293b'}
              />
            )}
            <NoteHead cx={x} cy={y} filled={filled} style={noteheadStyle} selected={selected} />
          </g>
        );
      })}
    </g>
  );
}
