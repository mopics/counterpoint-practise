import type { LayoutEvent } from './layout';

interface Props {
  events: LayoutEvent[];
  y: number;
  rootHints?: (string | null)[];
}

export function ChordSymbolRow({ events, y, rootHints }: Props) {
  return (
    <g>
      {events
        .filter((e) => e.event.chordSymbol)
        .map((e) => {
          const hint = rootHints?.[e.eventIndex];
          return (
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
              {hint && (
                <tspan fontSize={10} fontWeight={400} className="fill-green-600">
                  *{hint}
                </tspan>
              )}
            </text>
          );
        })}
    </g>
  );
}
