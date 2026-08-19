import { useEffect, useRef, useState } from 'react';
import * as abcjs from 'abcjs';
import { extractKeyMarkers } from '../abc/keyMarkers';
import { extractChordGrips } from '../abc/chordGrips';
import { readPrintPayload } from './printHandoff';
import { parseTune } from '../abc/parseTune';
import { flattenTune } from '../abc/flatten';
import { expandTuneForPlayback } from '../abc/chordComping';

export function PrintView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [payload] = useState(() => readPrintPayload());

  useEffect(() => {
    if (!payload || !containerRef.current) return;

    let cancelled = false;
    document.title = payload.title;
    const { cleanAbc: afterKeyMarkers } = extractKeyMarkers(payload.abc);
    const { cleanAbc, grips } = extractChordGrips(afterKeyMarkers);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const finalAbc = expandTuneForPlayback(cleanAbc, tune, grips, flattened);
    abcjs.renderAbc(containerRef.current, finalAbc, { staffwidth: 680 });

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
