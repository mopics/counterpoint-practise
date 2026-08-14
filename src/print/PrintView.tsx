import { useEffect, useRef, useState } from 'react';
import * as abcjs from 'abcjs';
import { extractKeyMarkers } from '../abc/keyMarkers';
import { readPrintPayload } from './printHandoff';

export function PrintView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [payload] = useState(() => readPrintPayload());

  useEffect(() => {
    if (!payload || !containerRef.current) return;

    let cancelled = false;
    document.title = payload.title;
    const { cleanAbc } = extractKeyMarkers(payload.abc);
    abcjs.renderAbc(containerRef.current, cleanAbc, { staffwidth: 680 });

    // Defer window.print() a frame so the browser has painted the rendered
    // notation first — calling it synchronously right after renderAbc risks
    // an unpainted/blank print preview in some browsers.
    const rafHandle = requestAnimationFrame(() => {
      if (!cancelled) window.print();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
    };
  }, [payload]);

  if (!payload) {
    return (
      <div className="p-8 text-sm text-slate-600">
        Nothing to print. Open a tune in the main app and click Print.
      </div>
    );
  }

  return <div ref={containerRef} className="p-8 print:p-0" />;
}
