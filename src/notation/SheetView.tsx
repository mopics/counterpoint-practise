import { useMemo, useRef } from 'react';
import { parseTune } from '../abc/parseTune';
import { flattenTune } from '../abc/flatten';
import type { EventRef, FlattenedTune } from '../abc/types';
import { isEventInRange } from '../abc/eventRef';
import { layoutLine, type LineLayout } from './layout';
import { Staff } from './Staff';
import { PartLabel } from './PartLabel';
import { ChordSymbolRow } from './ChordSymbolRow';
import { BarLine } from './BarLine';
import { NoteGlyph } from './NoteGlyph';
import { RestGlyph } from './RestGlyph';
import { BeamGroups } from './BeamGroup';
import { computeBeamInfo } from './beaming';
import { TripletBrackets } from './TripletBracket';
import { GraceNoteGlyph } from './GraceNote';
import { OrnamentGlyphs } from './Ornament';
import { TieSlurLayer, computeSlurSpans, type SlurSpan } from './TieSlur';
import { PlayCursorMarker } from './PlayCursor';
import { SelectionOverlay } from './SelectionOverlay';
import { CHORD_ROW_HEIGHT, LINE_VERTICAL_GAP, STAFF_HEIGHT, STAFF_TOP_OFFSET } from './geometry';

interface Props {
  abcSource: string;
  cursor?: EventRef | null;
  selectionStart?: EventRef | null;
  selectionEnd?: EventRef | null;
  onSelectionChange?: (start: EventRef | null, end: EventRef | null) => void;
}

interface ParsedSheet {
  flattened: FlattenedTune;
  layouts: Map<number, LineLayout>;
  slurSpans: SlurSpan[];
  width: number;
  height: number;
}

function parseSheet(abcSource: string): ParsedSheet {
  const tune = parseTune(abcSource);
  const flattened = flattenTune(tune);
  const layouts = new Map<number, LineLayout>();
  let maxWidth = 0;
  flattened.lines.forEach((line, i) => {
    const staffTopY = i * LINE_VERTICAL_GAP + STAFF_TOP_OFFSET;
    const staffBottomY = staffTopY + STAFF_HEIGHT;
    const ll = layoutLine(line, staffTopY, staffBottomY);
    layouts.set(line.lineIndex, ll);
    maxWidth = Math.max(maxWidth, ll.contentWidth);
  });
  const slurSpans = computeSlurSpans(flattened.lines);
  const height = flattened.lines.length * LINE_VERTICAL_GAP + 20;
  return { flattened, layouts, slurSpans, width: maxWidth, height };
}

function hitTest(layouts: Map<number, LineLayout>, x: number, y: number): EventRef | null {
  const lineIndex = Math.max(0, Math.min(layouts.size - 1, Math.floor(y / LINE_VERTICAL_GAP)));
  const layout = layouts.get(lineIndex);
  if (!layout || !layout.events.length) return null;

  let best = layout.events[0];
  let bestDist = Infinity;
  for (const le of layout.events) {
    const center = le.x + le.width / 2;
    const dist = Math.abs(center - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = le;
    }
  }
  return { lineIndex, eventIndex: best.eventIndex };
}

export function SheetView({ abcSource, cursor, selectionStart, selectionEnd, onSelectionChange }: Props) {
  const dragAnchor = useRef<EventRef | null>(null);
  const dragging = useRef(false);

  const lastGoodRef = useRef<ParsedSheet | null>(null);
  const { parsed, stale } = useMemo(() => {
    try {
      const result = parseSheet(abcSource);
      lastGoodRef.current = result;
      return { parsed: result, stale: false };
    } catch {
      return { parsed: lastGoodRef.current, stale: lastGoodRef.current !== null };
    }
  }, [abcSource]);

  if (!parsed) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Nothing to show yet — start typing valid ABC to see the sheet.
      </div>
    );
  }
  const { flattened, layouts, slurSpans, width, height } = parsed;

  const svgPoint = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelectionChange) return;
    const { x, y } = svgPoint(e);
    const ref = hitTest(layouts, x, y);
    if (!ref) return;
    dragAnchor.current = ref;
    dragging.current = true;
    onSelectionChange(ref, ref);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !onSelectionChange || !dragAnchor.current) return;
    const { x, y } = svgPoint(e);
    const ref = hitTest(layouts, x, y);
    if (!ref) return;
    onSelectionChange(dragAnchor.current, ref);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  return (
    <div className="p-4">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">{flattened.title}</h2>
        <p className="text-xs text-slate-500">
          Key: {flattened.key || 'C'} &middot; Meter: {flattened.meter} &middot; &#9833;={Math.round(flattened.qpm)}
        </p>
        {stale && (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
            Showing last valid version — the current text has a parse error.
          </p>
        )}
      </div>
      <svg
        width={width}
        height={height}
        className="select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {[...layouts.values()].map((ll) => {
          const beamInfo = computeBeamInfo(ll.events);
          return (
            <g key={ll.lineIndex}>
              <Staff topY={ll.staffTopY} width={ll.contentWidth} />
              {ll.partLabel && <PartLabel label={ll.partLabel} staffTopY={ll.staffTopY} />}
              <ChordSymbolRow events={ll.events} y={ll.staffTopY - CHORD_ROW_HEIGHT / 2} />
              {ll.bars.map((b, i) => (
                <BarLine key={i} bar={b} staffTopY={ll.staffTopY} />
              ))}
              <BeamGroups events={ll.events} staffBottomY={ll.staffBottomY} beamInfo={beamInfo} />
              <TripletBrackets events={ll.events} staffBottomY={ll.staffBottomY} beamInfo={beamInfo} />
              {ll.events.map((le) => {
                const ref: EventRef = { lineIndex: ll.lineIndex, eventIndex: le.eventIndex };
                const selected = !!(selectionStart && selectionEnd && isEventInRange(ref, selectionStart, selectionEnd));
                if (le.event.kind === 'rest') {
                  return (
                    <RestGlyph
                      key={le.eventIndex}
                      x={le.x}
                      duration={le.event.duration}
                      staffBottomY={ll.staffBottomY}
                      selected={selected}
                    />
                  );
                }
                return (
                  <g key={le.eventIndex}>
                    {le.event.grace && le.event.grace.length > 0 && (
                      <GraceNoteGlyph x={le.x} grace={le.event.grace} staffBottomY={ll.staffBottomY} />
                    )}
                    <NoteGlyph
                      x={le.x}
                      pitches={le.event.pitches ?? []}
                      duration={le.event.duration}
                      staffBottomY={ll.staffBottomY}
                      noteheadStyle={le.event.noteheadStyle}
                      beamed={beamInfo.get(le.eventIndex)?.beamed ?? false}
                      stemUp={beamInfo.get(le.eventIndex)?.stemUp ?? true}
                      selected={selected}
                    />
                    {le.event.decorations.length > 0 && (
                      <OrnamentGlyphs
                        x={le.x}
                        pitches={le.event.pitches ?? []}
                        decorations={le.event.decorations}
                        staffBottomY={ll.staffBottomY}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        <TieSlurLayer spans={slurSpans} layouts={layouts} />
        {selectionStart && selectionEnd && (
          <SelectionOverlay start={selectionStart} end={selectionEnd} layouts={layouts} />
        )}
        {cursor && <PlayCursorMarker cursor={cursor} layouts={layouts} />}
      </svg>
    </div>
  );
}
