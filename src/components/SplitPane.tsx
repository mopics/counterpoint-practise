import { useRef, useState } from 'react';

interface Props {
  first: React.ReactNode;
  second: React.ReactNode;
  /** Which axis the divider drags along — 'horizontal' places panes side by side (default), 'vertical' stacks them. */
  orientation?: 'horizontal' | 'vertical';
  defaultSecondSize?: number;
  minSecondSize?: number;
  maxSecondSize?: number;
}

/** Dragging the divider toward `first` grows `second` by the same amount, clamped to [min, max]. */
export function computeResizedSize(dragStartPos: number, dragStartSize: number, currentPos: number, min: number, max: number): number {
  const delta = dragStartPos - currentPos;
  return Math.min(max, Math.max(min, dragStartSize + delta));
}

/**
 * A resizable two-pane layout: a flexible first pane and a fixed-size second
 * pane, separated by a drag-to-resize divider. Works along either axis —
 * horizontal (side by side, second pane has a fixed width) or vertical
 * (stacked, second pane has a fixed height).
 */
export function SplitPane({
  first,
  second,
  orientation = 'horizontal',
  defaultSecondSize = 400,
  minSecondSize = 240,
  maxSecondSize = 800,
}: Props) {
  const [secondSize, setSecondSize] = useState(defaultSecondSize);
  const dragging = useRef(false);
  const dragStartPos = useRef(0);
  const dragStartSize = useRef(0);
  const isHorizontal = orientation === 'horizontal';

  const pointerPos = (e: React.PointerEvent<HTMLDivElement>) => (isHorizontal ? e.clientX : e.clientY);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStartPos.current = pointerPos(e);
    dragStartSize.current = secondSize;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setSecondSize(computeResizedSize(dragStartPos.current, dragStartSize.current, pointerPos(e), minSecondSize, maxSecondSize));
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  return (
    <div className={`flex min-h-0 flex-1 ${isHorizontal ? '' : 'flex-col'}`}>
      {/* Horizontal's first pane (SheetView) has no scroll mechanism of its own, so this wrapper
          provides one. Vertical's first pane (a textarea so far) already scrolls itself — an
          overflow-auto wrapper around it just adds a second, near-empty scrollbar on top. */}
      <div className={`min-h-0 min-w-0 flex-1 ${isHorizontal ? 'overflow-auto' : 'overflow-hidden'}`}>{first}</div>
      <div
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={
          isHorizontal
            ? 'w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400 active:bg-blue-500'
            : 'h-1 shrink-0 cursor-row-resize bg-slate-200 transition-colors hover:bg-blue-400 active:bg-blue-500'
        }
      />
      <div className="min-h-0 shrink-0 overflow-hidden" style={isHorizontal ? { width: secondSize } : { height: secondSize }}>
        {second}
      </div>
    </div>
  );
}
