# Print View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Print" button that opens a clean `/print` window rendering the current tune's engraved sheet music via abcjs's own renderer, with no app chrome and no playback, ready for the browser's print dialog.

**Architecture:** A pure `localStorage` handoff module passes the ABC text + title from the main window to the freshly opened `/print` window (no shared JS memory across windows). `main.tsx` does a one-line hand-rolled route switch (no router library) to render a standalone `PrintView` component instead of `App` when the path is `/print`. `PrintView` strips `**K**` markers with the existing `extractKeyMarkers` utility, renders via `abcjs.renderAbc`, then triggers `window.print()`.

**Tech Stack:** React 19 + TypeScript + abcjs (already a dependency, used here for rendering for the first time in this codebase — everywhere else uses a custom SVG pipeline). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-14-print-view-design.md`

## Global Constraints

- No new npm dependency — no router library; abcjs is already installed.
- The `localStorage` handoff key is exactly `printPayload`, holding JSON `{ abc: string; title: string }`.
- `localStorage` reads/writes are wrapped in `try/catch`, silently ignoring failure — matching every other store in this codebase.
- The print window is never navigated within after opening — it's fresh for exactly one tune, so effects with an empty/one-shot dependency list are correct; no "re-render for a new tune" case exists.
- `window.print()` is deferred to a `requestAnimationFrame` callback after `abcjs.renderAbc` — never called synchronously in the same tick as the render call (risk of an unpainted/blank print preview).
- The abc source fed to the print view is `editorStore.currentAbcSource(entry)` — the same debounced/committed text `synthEngine` uses for playback — never the raw in-progress textarea buffer.
- No pagination handling for tall tunes (accepted rough edge, not solved here); the handoff payload is never cleared after being read (a manual reload of an already-open `/print` tab just re-shows the last tune sent to it — harmless).

---

### Task 1: Print handoff module

**Files:**
- Create: `src/print/printHandoff.ts`
- Test: `src/print/printHandoff.test.ts`

**Interfaces:**
- Produces: `export interface PrintPayload { abc: string; title: string }`
- Produces: `export function writePrintPayload(abc: string, title: string): void`
- Produces: `export function readPrintPayload(): PrintPayload | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/print/printHandoff.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { writePrintPayload, readPrintPayload } from './printHandoff';

describe('printHandoff', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing has been written', () => {
    expect(readPrintPayload()).toBeNull();
  });

  it('round-trips a written payload', () => {
    writePrintPayload('X:1\nK:C\nCDEF|\n', 'My Tune');
    expect(readPrintPayload()).toEqual({ abc: 'X:1\nK:C\nCDEF|\n', title: 'My Tune' });
  });

  it('returns null for corrupted JSON in storage', () => {
    localStorage.setItem('printPayload', '{not valid json');
    expect(readPrintPayload()).toBeNull();
  });

  it('returns null when the stored value is missing expected fields', () => {
    localStorage.setItem('printPayload', JSON.stringify({ abc: 'X:1' }));
    expect(readPrintPayload()).toBeNull();
  });

  it('overwrites a previous payload with a new write', () => {
    writePrintPayload('X:1\nK:C\nC|\n', 'First');
    writePrintPayload('X:1\nK:C\nD|\n', 'Second');
    expect(readPrintPayload()).toEqual({ abc: 'X:1\nK:C\nD|\n', title: 'Second' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/print/printHandoff.test.ts --reporter=verbose`
Expected: FAIL — `Failed to resolve import "./printHandoff"` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/print/printHandoff.ts
const STORAGE_KEY = 'printPayload';

export interface PrintPayload {
  abc: string;
  title: string;
}

/** Hands the current tune's ABC text + title to a freshly opened /print window (no shared JS memory across windows). */
export function writePrintPayload(abc: string, title: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ abc, title }));
  } catch {
    // ignore persistence failures (e.g. private browsing / storage disabled)
  }
}

export function readPrintPayload(): PrintPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PrintPayload>;
    if (typeof parsed.abc !== 'string' || typeof parsed.title !== 'string') return null;
    return { abc: parsed.abc, title: parsed.title };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/print/printHandoff.test.ts --reporter=verbose`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/print/printHandoff.ts src/print/printHandoff.test.ts
git commit -m "Add localStorage handoff for passing ABC text to the print window"
```

---

### Task 2: Print view + route switch

**Files:**
- Create: `src/print/PrintView.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `readPrintPayload(): PrintPayload | null` from `./printHandoff` (Task 1)
- Consumes: `extractKeyMarkers(rawAbc: string): { cleanAbc: string; markers: KeyMarker[] }` from `../abc/keyMarkers` (already exists, used by `synthEngine.ts`)
- Consumes: `abcjs.renderAbc(target: string | Element, code: string, params?: AbcVisualParams): TuneObjectArray` from the `abcjs` package (already a dependency; `Element` includes `HTMLDivElement`, so a React ref's `.current` can be passed directly)
- Produces: `export function PrintView(): JSX.Element` from `./PrintView`

No automated test for this task — no component-test infrastructure exists in this codebase (no testing-library dependency; every `.tsx` component task in prior plans here was verified by typecheck + manual browser verification, not unit tests). Verified by typecheck here; full end-to-end manual verification happens in Task 3 once the Print button exists to trigger the real flow.

- [ ] **Step 1: Write the print view component**

```tsx
// src/print/PrintView.tsx
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
    abcjs.renderAbc(containerRef.current, cleanAbc);

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

  return <div ref={containerRef} className="p-8" />;
}
```

- [ ] **Step 2: Wire the route switch**

Replace the full contents of `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrintView } from './print/PrintView.tsx'

const isPrintRoute = window.location.pathname === '/print';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintRoute ? <PrintView /> : <App />}
  </StrictMode>,
)
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors from `src/print/PrintView.tsx` or `src/main.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/print/PrintView.tsx src/main.tsx
git commit -m "Add standalone /print route rendering via abcjs.renderAbc"
```

---

### Task 3: Print button in TransportBar + verification

**Files:**
- Modify: `src/components/TransportBar.tsx`

**Interfaces:**
- Consumes: `writePrintPayload(abc: string, title: string): void` from `../print/printHandoff` (Task 1)
- Consumes: `editorStore.currentAbcSource(entry: AbcData): string` (already exists)
- Consumes: `libraryStore.selected: AbcData` (already exists, always a real tune — never null)

- [ ] **Step 1: Add the Print button**

In `src/components/TransportBar.tsx`, change the import line from:

```tsx
import { playbackStore, uiStore } from '../stores';
```

to:

```tsx
import { playbackStore, uiStore, editorStore, libraryStore } from '../stores';
import { writePrintPayload } from '../print/printHandoff';
```

Then, immediately after the existing `🔢 Numerals` button block (which currently reads):

```tsx
      <Button onClick={() => uiStore.toggleNumeralMode()} active={uiStore.numeralMode}>
        🔢 Numerals
      </Button>
      <div className="mx-2 h-5 w-px bg-slate-200" />
```

add a new divider + button group right after it, so the block reads:

```tsx
      <Button onClick={() => uiStore.toggleNumeralMode()} active={uiStore.numeralMode}>
        🔢 Numerals
      </Button>
      <div className="mx-2 h-5 w-px bg-slate-200" />
      <Button
        onClick={() => {
          const entry = libraryStore.selected;
          writePrintPayload(editorStore.currentAbcSource(entry), entry.title);
          window.open('/print', '_blank');
        }}
      >
        🖨 Print
      </Button>
      <div className="mx-2 h-5 w-px bg-slate-200" />
```

(The existing divider that used to directly follow Numerals now sits between Numerals and Print instead; a new one is added after Print, before the Swing control — so all three groups stay visually separated exactly as the rest of the toolbar already does.)

- [ ] **Step 2: Typecheck and run the full test suite**

Run: `npx tsc -b`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (existing suite + the 5 new tests from Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/components/TransportBar.tsx
git commit -m "Add Print button to TransportBar"
```

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`, background). Using the Playwright browser tools:

1. Navigate to the app, select a tune whose ABC source contains `**K**` markers (e.g. any David Baker or Sonny Rollins entry — most content in this library carries them).
2. Click "🖨 Print". Confirm a new browser tab/window opens at `/print`.
3. Take a snapshot of the new tab. Confirm: no sidebar, no toolbar, no editor — only the engraved sheet music (title/composer/key rendered by abcjs itself from the ABC header). Confirm no literal `**...**` marker text or stray asterisks appear anywhere in the rendered notation.
4. Confirm the browser's print dialog opened automatically (or, if the sandboxed browser suppresses `window.print()`, confirm no JS error was thrown and the notation is fully rendered — note this limitation in the report if the dialog itself can't be observed).
5. Close the print tab. Navigate directly to `/print` in a fresh tab (bypassing the button). Confirm the "Nothing to print. Open a tune in the main app and click Print." message renders instead of a blank page or crash.
6. Report which steps passed, and flag anything that couldn't be verified due to environment constraints (e.g. `window.print()` behavior in a headless/sandboxed browser). No commit for this step.
