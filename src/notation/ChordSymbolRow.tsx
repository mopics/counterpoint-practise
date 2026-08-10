import type { LayoutEvent } from './layout';

interface Props {
  events: LayoutEvent[];
  y: number;
}

export function ChordSymbolRow({ events, y }: Props) {
  return (
    <g>
      {events
        .filter((e) => e.event.chordSymbol)
        .map((e) => (
          <text
            key={e.eventIndex}
            x={e.x}
            y={y}
            fontSize={13}
            fontWeight={700}
            fontFamily="ui-sans-serif, system-ui"
            className="fill-slate-900"
          >
            {e.event.chordSymbol}
          </text>
        ))}
    </g>
  );
}
