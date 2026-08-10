import { useRef, useState } from 'react';

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRightWidth?: number;
  minRightWidth?: number;
  maxRightWidth?: number;
}

/**
 * A resizable two-pane layout: a flexible left pane and a fixed-width right
 * pane, separated by a drag-to-resize divider.
 */
export function SplitPane({
  left,
  right,
  defaultRightWidth = 400,
  minRightWidth = 240,
  maxRightWidth = 800,
}: Props) {
  const [rightWidth, setRightWidth] = useState(defaultRightWidth);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = rightWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = dragStartX.current - e.clientX;
    const next = Math.min(maxRightWidth, Math.max(minRightWidth, dragStartWidth.current + delta));
    setRightWidth(next);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400 active:bg-blue-500"
      />
      <div className="min-h-0 shrink-0 overflow-hidden" style={{ width: rightWidth }}>
        {right}
      </div>
    </div>
  );
}
