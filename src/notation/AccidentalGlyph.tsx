// Hand-drawn accidental glyphs. Unicode music symbols (♯ ♭ ♮) render as
// multi-color glyphs on some platforms (Windows falls back to a color font
// for the Miscellaneous Symbols block), which fights any SVG `fill`/`stroke`
// we set. Plain vector paths guarantee a single, predictable color.

interface Props {
  x: number;
  y: number;
  accidental: string;
  color: string;
}

function Sharp({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.1}>
      <line x1={x - 3} y1={y - 7} x2={x - 3} y2={y + 5} />
      <line x1={x + 1} y1={y - 8} x2={x + 1} y2={y + 4} />
      <line x1={x - 4.5} y1={y - 2} x2={x + 2.5} y2={y - 4} />
      <line x1={x - 4.5} y1={y + 2.5} x2={x + 2.5} y2={y + 0.5} />
    </g>
  );
}

function Flat({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.2} fill="none">
      <line x1={x - 3} y1={y - 8} x2={x - 3} y2={y + 4} />
      <path d={`M ${x - 3} ${y + 1} Q ${x + 3.5} ${y - 1.5} ${x - 3} ${y + 4.5}`} />
    </g>
  );
}

function Natural({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.1}>
      <line x1={x - 3} y1={y - 7} x2={x - 3} y2={y + 2} />
      <line x1={x + 2} y1={y - 2} x2={x + 2} y2={y + 7} />
      <line x1={x - 3} y1={y - 2} x2={x + 2} y2={y - 4} />
      <line x1={x - 3} y1={y + 2} x2={x + 2} y2={y} />
    </g>
  );
}

export function AccidentalGlyph({ x, y, accidental, color }: Props) {
  switch (accidental) {
    case 'sharp':
      return <Sharp x={x} y={y} color={color} />;
    case 'flat':
      return <Flat x={x} y={y} color={color} />;
    case 'natural':
      return <Natural x={x} y={y} color={color} />;
    case 'dblsharp':
      return (
        <text x={x - 5} y={y + 4} fontSize={11} fontFamily="Arial, sans-serif" fill={color}>
          x
        </text>
      );
    case 'dblflat':
      return (
        <g>
          <Flat x={x - 3} y={y} color={color} />
          <Flat x={x + 3} y={y} color={color} />
        </g>
      );
    default:
      return null;
  }
}
