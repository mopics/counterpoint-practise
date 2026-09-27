import { memo, useMemo, useRef } from 'react';
import { parseTune } from '../abc/parseTune';
import { flattenTune } from '../abc/flatten';
import type { EventRef, FlattenedTune } from '../abc/types';
import { isEventInRange } from '../abc/eventRef';
import { extractKeyMarkers } from '../abc/keyMarkers';
import { extractChordGrips, computeChordGripOverlay, type ChordGripOverlay, type ChordGripSpec } from '../abc/chordGrips';
import { extractCompingVoice, alignCompingToGrips, type CompingVoice, type CompingAlignment } from '../abc/chordComping';
import { computeScaleDegrees, type ScaleDegreeOverlay } from '../abc/scaleDegrees';
import { computeZodiacOverlay, type ZodiacOverlay } from '../abc/zodiacOverlay';
import { layoutLine, type LineLayout, type LayoutEvent } from './layout';
import { Staff } from './Staff';
import { PartLabel } from './PartLabel';
import { ChordSymbolRow } from './ChordSymbolRow';
import { ChordGripDiagram } from './ChordGripDiagram';
import { ChordCompingRow } from './ChordCompingRow';
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
import {
  CHORD_GRIP_Y_OFFSET,
  CHORD_ROW_HEIGHT,
  CHORD_ROW_Y_OFFSET_WITH_GRIPS,
  COMPING_GRIP_Y_OFFSET,
  COMPING_RHYTHM_LINE_Y_OFFSET,
  COMPING_ROW_HEIGHT,
  LINE_VERTICAL_GAP,
  LINE_VERTICAL_GAP_WITH_GRIPS,
  STAFF_HEIGHT,
  STAFF_TOP_OFFSET,
  STAFF_TOP_OFFSET_WITH_GRIPS,
  gripDiagramWidth,
  spaceOutGripX,
} from './geometry';

interface Props {
  abcSource: string;
  cursor?: EventRef | null;
  selectionStart?: EventRef | null;
  selectionEnd?: EventRef | null;
  numeralMode?: boolean;
  zodiacMode?: boolean;
  onSelectionChange?: (start: EventRef | null, end: EventRef | null) => void;
}

interface ParsedSheet {
  flattened: FlattenedTune;
  layouts: Map<number, LineLayout>;
  slurSpans: SlurSpan[];
  scaleDegrees: ScaleDegreeOverlay;
  zodiac: ZodiacOverlay;
  chordGrips: ChordGripOverlay;
  hasGrips: boolean;
  compingVoice: CompingVoice | null;
  compingAlignment: CompingAlignment | null;
  /**
   * The per-tune vertical space allotted per rendered line — larger than the
   * bare LINE_VERTICAL_GAP constant when the tune has grips and/or a comping
   * voice. Carried here so hit-testing divides by the same value the layout
   * was actually built with.
   */
  lineVerticalGap: number;
  width: number;
  height: number;
}

function parseSheet(abcSource: string): ParsedSheet {
  const { cleanAbc: afterKeyMarkers, markers } = extractKeyMarkers(abcSource);
  const { cleanAbc, grips } = extractChordGrips(afterKeyMarkers);
  const tune = parseTune(cleanAbc);
  const flattened = flattenTune(tune);
  if (flattened.lines.length === 0) throw new Error('No parseable tune content');
  const scaleDegrees = computeScaleDegrees(flattened, markers, flattened.keyRoot, cleanAbc);
  const zodiac = computeZodiacOverlay(flattened);
  const chordGrips = computeChordGripOverlay(flattened, grips, cleanAbc);
  const compingVoice = extractCompingVoice(tune, cleanAbc);
  const compingAlignment = compingVoice ? alignCompingToGrips(compingVoice, flattened, grips, cleanAbc) : null;

  // Extra vertical space per line is reserved only for tunes that actually
  // use a chord grip, so every tune that doesn't use this feature keeps
  // rendering pixel-identical to before it existed. A comping voice adds
  // further room below the staff on top of that, only when present.
  const hasGrips = grips.length > 0;
  const staffTopOffset = hasGrips ? STAFF_TOP_OFFSET_WITH_GRIPS : STAFF_TOP_OFFSET;
  const baseLineVerticalGap = hasGrips ? LINE_VERTICAL_GAP_WITH_GRIPS : LINE_VERTICAL_GAP;
  const lineVerticalGap = compingVoice ? baseLineVerticalGap + COMPING_ROW_HEIGHT : baseLineVerticalGap;

  const layouts = new Map<number, LineLayout>();
  let maxWidth = 0;
  flattened.lines.forEach((line, i) => {
    const staffTopY = i * lineVerticalGap + staffTopOffset;
    const staffBottomY = staffTopY + STAFF_HEIGHT;
    const ll = layoutLine(line, staffTopY, staffBottomY);
    layouts.set(line.lineIndex, ll);
    maxWidth = Math.max(maxWidth, ll.contentWidth);
  });
  const slurSpans = computeSlurSpans(flattened.lines);
  const height = flattened.lines.length * lineVerticalGap + 20;
  return {
    flattened,
    layouts,
    slurSpans,
    scaleDegrees,
    zodiac,
    chordGrips,
    hasGrips,
    compingVoice,
    compingAlignment,
    lineVerticalGap,
    width: maxWidth,
    height,
  };
}

function hitTest(
  layouts: Map<number, LineLayout>,
  lineVerticalGap: number,
  x: number,
  y: number,
): EventRef | null {
  const lineIndex = Math.max(0, Math.min(layouts.size - 1, Math.floor(y / lineVerticalGap)));
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

export const SheetView = memo(function SheetView({
  abcSource,
  cursor,
  selectionStart,
  selectionEnd,
  numeralMode,
  zodiacMode,
  onSelectionChange,
}: Props) {
  const dragAnchor = useRef<EventRef | null>(null);
  const dragging = useRef(false);

  const lastGoodRef = useRef<ParsedSheet | null>(null);
  const { parsed, stale } = useMemo(() => {
    try {
      const result = parseSheet(abcSource);
      lastGoodRef.current = result;
      return { parsed: result, stale: false };
    } catch (err) {
      console.warn('SheetView: failed to parse ABC source, showing last valid render', err);
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
  const {
    flattened,
    layouts,
    slurSpans,
    scaleDegrees,
    zodiac,
    chordGrips,
    hasGrips,
    compingVoice,
    compingAlignment,
    lineVerticalGap,
    width,
    height,
  } = parsed;

  const svgPoint = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSelectionChange) return;
    const { x, y } = svgPoint(e);
    const ref = hitTest(layouts, lineVerticalGap, x, y);
    if (!ref) return;
    dragAnchor.current = ref;
    dragging.current = true;
    onSelectionChange(ref, ref);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !onSelectionChange || !dragAnchor.current) return;
    const { x, y } = svgPoint(e);
    const ref = hitTest(layouts, lineVerticalGap, x, y);
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
              <ChordSymbolRow
                events={ll.events}
                y={ll.staffTopY + (hasGrips ? CHORD_ROW_Y_OFFSET_WITH_GRIPS : -CHORD_ROW_HEIGHT / 2)}
                rootHints={numeralMode ? scaleDegrees.lines[ll.lineIndex]?.rootHints : undefined}
              />
              {hasGrips &&
                (() => {
                  const gripped: { le: LayoutEvent; grip: ChordGripSpec }[] = ll.events
                    .map((le) => ({ le, grip: chordGrips.lines[ll.lineIndex]?.grips[le.eventIndex] ?? null }))
                    .filter((g): g is { le: LayoutEvent; grip: ChordGripSpec } => !!g.grip);
                  const spacedX = spaceOutGripX(
                    gripped.map((g) => ({ x: g.le.x, width: gripDiagramWidth(g.grip.startFret > 0) })),
                  );
                  return gripped.map((g, i) => (
                    <ChordGripDiagram
                      key={`grip-${g.le.eventIndex}`}
                      spec={g.grip}
                      x={spacedX[i]}
                      y={ll.staffTopY + CHORD_GRIP_Y_OFFSET}
                    />
                  ));
                })()}
              {compingVoice && (
                <ChordCompingRow
                  events={compingVoice.lines[ll.lineIndex]?.events ?? []}
                  grips={compingAlignment?.lines[ll.lineIndex]?.grips ?? []}
                  melodyEvents={ll.events}
                  gripY={ll.staffBottomY + COMPING_GRIP_Y_OFFSET}
                  rhythmY={ll.staffBottomY + COMPING_RHYTHM_LINE_Y_OFFSET}
                />
              )}
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
                      scaleDegrees={
                        numeralMode ? (scaleDegrees.lines[ll.lineIndex]?.degrees[le.eventIndex] ?? undefined) : undefined
                      }
                      zodiac={zodiacMode ? (zodiac.lines[ll.lineIndex]?.glyphs[le.eventIndex] ?? undefined) : undefined}
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
});
