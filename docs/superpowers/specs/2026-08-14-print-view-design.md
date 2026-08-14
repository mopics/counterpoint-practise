# Print view — design

## Background

Today, printing a tune means using the browser's print function on the main app window itself — sidebar, toolbar, editor pane, and all. This feature adds a dedicated "Print" button that opens a clean, single-purpose view containing nothing but the engraved sheet music, ready for the browser's print dialog.

This app deliberately never uses abcjs's own renderer for the main view — it has a fully custom SVG rendering pipeline (`src/notation/*`), with abcjs used only for parsing (`parseTune.ts`) and audio synthesis (`synthEngine.ts`). This feature is a deliberate, scoped exception: reusing abcjs's own battle-tested engraving (`abcjs.renderAbc`) for a print-only view is far cheaper than teaching the custom renderer to produce a print-quality static page, and the print view has no interactive requirements (no cursor, no selection, no numeral mode) that would demand the custom pipeline's capabilities.

## Goals

- A "Print" button in the main app opens a new browser window/tab at a `/print` route.
- That route renders a single static view: just the current tune's engraved sheet music, nothing else (no sidebar, no toolbar, no editor).
- Rendered via `abcjs.renderAbc`, fed the exact same ABC source used for audio playback (`editorStore.currentAbcSource(entry)` — the debounced, committed text, not the raw in-progress textarea buffer).
- `**K**` key-hint markers are stripped before rendering, exactly as `synthEngine.ts` already does before parsing for playback — otherwise abcjs would render the literal marker characters as garbage text.
- The browser's print dialog opens automatically once rendering has settled.

## Non-goals

- No pagination-aware rendering for long tunes. A tune whose engraved output is taller than one printed page relies entirely on the browser's own page-break behavior, which may cut across a staff line. Not solved here.
- No clearing of the handoff payload after the print view reads it. A manual reload of an already-open `/print` tab simply re-shows the last tune that was sent to it — harmless, not treated as an error state.
- No router library. `/print` is the only additional route this app will have; a real router is unwarranted for one static destination.
- No numeral-mode or root-hint rendering in the print view — those are custom-pipeline-only display modes with no abcjs equivalent, and printing is about the notation itself.

## Architecture

New files, following this codebase's existing conventions (pure domain logic in its own top-level folder, e.g. `src/abc/`, `src/video/`):

- `src/print/printHandoff.ts` — pure functions moving the ABC text + title from the main window to the new one via `localStorage`, since a window opened via `window.open()` shares no JS memory with its opener.
- `src/print/PrintView.tsx` — the `/print` page's root component: reads the handoff payload, strips key markers, renders via `abcjs.renderAbc`, then triggers the browser's print dialog.
- `src/main.tsx` (modified) — a route switch: render `<PrintView />` instead of `<App />` when `window.location.pathname === '/print'`.
- `src/components/TransportBar.tsx` (modified) — a new "🖨 Print" button that writes the handoff payload and opens the new window.

## Data handoff (`src/print/printHandoff.ts`)

```ts
export interface PrintPayload {
  abc: string;
  title: string;
}

export function writePrintPayload(abc: string, title: string): void;
export function readPrintPayload(): PrintPayload | null;
```

`writePrintPayload` JSON-serializes `{ abc, title }` into a single `localStorage` key (`printPayload`), wrapped in `try/catch` and silently ignoring failure — the same persistence pattern already used by `UiStore` and `VideoLoopStore`. `readPrintPayload` reads and `JSON.parse`s that key, returning `null` if the key is absent, unparseable, or `localStorage` access throws (private browsing, storage disabled).

`localStorage` (not `sessionStorage`) is used deliberately: a window opened via `window.open()` from the same origin is guaranteed to share `localStorage`, whereas `sessionStorage` sharing across windows is a browser-implementation detail this app shouldn't depend on. `localStorage` also has no practical size concern for ABC text (even a long solo transcription is a few KB, far under any `localStorage` quota), unlike a URL query parameter, which real transcriptions could exceed.

## Route switch (`src/main.tsx`)

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

No router library, no nested routes. The print route renders standalone — `PrintView` is not nested inside `App`, so there is no sidebar/toolbar to hide; the page is clean by construction rather than by CSS suppression.

## Print page (`src/print/PrintView.tsx`)

```tsx
export function PrintView(): JSX.Element;
```

On mount (a single `useEffect`):
1. Call `readPrintPayload()`. If `null`, render a plain message — "Nothing to print. Open a tune in the main app and click Print." — and stop; no `abcjs` call is made.
2. Otherwise, strip key markers via the existing `extractKeyMarkers(payload.abc).cleanAbc` (`src/abc/keyMarkers.ts` — already used by `synthEngine.ts` for exactly this reason: leftover `**K**` text would otherwise be parsed/rendered as literal characters).
3. Call `abcjs.renderAbc(containerRef.current, cleanAbc)`, targeting a `useRef<HTMLDivElement>` rendered in this component's JSX (an element ref, not a string element-id — `abcjs.renderAbc`'s first parameter accepts either, and a ref avoids a magic DOM-query string). abcjs parses the ABC header itself (title, composer, key, meter) and renders them as part of its own engraving output — no separate title/metadata rendering is needed here, unlike the main view's custom `SheetView` header.
4. Call `window.print()` inside a `requestAnimationFrame` callback (not synchronously right after the render call). `abcjs.renderAbc` synchronously mutates the DOM, but the browser hasn't necessarily painted that DOM yet in the same tick — calling `window.print()` immediately risks the print dialog capturing a blank or partially-laid-out page in some browsers. Deferring to the next animation frame guarantees a paint has happened first.

The effect has an empty dependency array — a `/print` window is opened fresh for exactly one tune and is never navigated within, so there is no "re-render for a new tune" case to handle.

## UI: the Print button (`src/components/TransportBar.tsx`)

`TransportBar` already reads its stores directly rather than through props (it currently imports `playbackStore`/`uiStore` itself), so the Print button follows the same pattern — importing `editorStore` and `libraryStore` as well:

```tsx
<Button
  onClick={() => {
    const entry = libraryStore.selected;
    writePrintPayload(editorStore.currentAbcSource(entry), entry.title);
    window.open('/print', '_blank');
  }}
>
  🖨 Print
</Button>
```

Placed in its own group (separated by the existing `border-slate-200` divider pattern already used between the other button groups), after the 🔢 Numerals toggle. Always enabled — a tune is always selected once the app has loaded (`libraryStore.selected` has no "nothing selected" state, matching how `editorStore.currentAbcSource(selected)` is already called unconditionally elsewhere, e.g. in `App.tsx`).

## Testing

`printHandoff.ts` is pure logic with no DOM rendering dependency beyond `localStorage` (already exercised via `jsdom` in this repo's existing store tests) — it gets real Vitest unit tests: write-then-read round-trips, `null` on missing/corrupt data, and the `try/catch` silent-failure behavior, mirroring `UiStore.test.ts`'s and `VideoLoopStore.test.ts`'s existing patterns.

`PrintView.tsx` has no automated test, consistent with this codebase's existing convention (no component-test infrastructure — `.tsx` components are verified by typecheck plus manual browser verification). Manual verification: click Print from a tune with `**K**` markers in its source, confirm the new window shows clean engraved notation with no marker artifacts, and confirm the print dialog opens automatically. Also verify the no-payload case by navigating to `/print` directly.
