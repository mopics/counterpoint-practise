# ABC Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure-text ABC editor in a split view to the right of `SheetView`, with a drag-to-resize divider, so a user can edit the currently selected library entry's ABC source and see/hear it update live.

**Architecture:** A new `EditorStore` (MobX) holds session-only, per-entry edits in two maps — an instant `edits` map that drives the textarea, and a debounced `committed` map that `SheetView` and `PlaybackStore` consume. `App.tsx` becomes the single place that resolves "the current ABC source" and feeds it to both panes, replacing today's direct reads of `libraryStore.selected.data`.

**Tech Stack:** React 19, TypeScript, MobX 7 (`mobx-react-lite` observers), Tailwind, Vite. No test runner is configured for this repo — verification is `tsc -b` for type safety plus interactive browser checks via the dev server (this matches the project's existing verification approach; see `docs/superpowers/specs/2026-08-10-abc-text-editor-design.md`, section "Testing").

## Global Constraints

- Persistence is session-only and in-memory — no writing to `src/content`, no localStorage. (spec: "Decisions")
- `AbcData` objects imported from `src/content` must never be mutated in place. (spec: "Constraints")
- The textarea's live value must never be debounced (only the "commit" that triggers re-parse/re-load is debounced, ~400ms). (spec: "Architecture")
- An entry occupies the edit maps only while its text differs from the original — reverting to original text clears it out; there is no separate dirty flag. (spec: "Architecture")
- Follow existing codebase conventions: MobX stores use `makeObservable` + `actionBound` (see `PlaybackStore.ts`); deferred/async mutations of observed state use `runInAction` (see `PlaybackStore.loadSelected`); drag interactions use native pointer-capture (see `SheetView.tsx`'s `handlePointerDown`).

---

### Task 1: `EditorStore`

**Files:**
- Create: `src/stores/EditorStore.ts`
- Modify: `src/stores/index.ts`

**Interfaces:**
- Consumes: `AbcData` type from `src/content` (`id: string`, `key?: string`, `data?: string`).
- Produces (for later tasks):
  - `editorStore.textFor(entry: AbcData): string`
  - `editorStore.currentAbcSource(entry: AbcData): string`
  - `editorStore.isEdited(entry: AbcData): boolean`
  - `editorStore.setText(entry: AbcData, text: string): void`
  - `editorStore.resetText(entry: AbcData): void`

- [ ] **Step 1: Write `EditorStore.ts`**

```ts
import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { AbcData } from '../content';

const COMMIT_DEBOUNCE_MS = 400;

function keyFor(entry: AbcData): string {
  return entry.key ?? entry.id;
}

/**
 * Session-only editing state for library entries. Two maps per entry:
 * `edits` updates on every keystroke and drives the textarea directly;
 * `committed` updates ~400ms after typing pauses and is what SheetView and
 * PlaybackStore consume, so re-parsing/re-priming the synth doesn't happen
 * on every keystroke. An entry is only present in either map while its text
 * differs from the original — reverting to the original clears it out.
 */
class EditorStore {
  private edits = observable.map<string, string>();
  private committed = observable.map<string, string>();
  private commitDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeObservable(this, {
      setText: actionBound,
      resetText: actionBound,
    });
  }

  /** The text for the textarea: the in-progress edit, or the entry's original source. */
  textFor(entry: AbcData): string {
    return this.edits.get(keyFor(entry)) ?? entry.data ?? '';
  }

  /** The text SheetView/PlaybackStore should render/play: the debounced edit, or the original. */
  currentAbcSource(entry: AbcData): string {
    return this.committed.get(keyFor(entry)) ?? entry.data ?? '';
  }

  isEdited(entry: AbcData): boolean {
    return this.edits.has(keyFor(entry));
  }

  setText(entry: AbcData, text: string): void {
    const key = keyFor(entry);
    if (text === entry.data) this.edits.delete(key);
    else this.edits.set(key, text);

    if (this.commitDebounce) clearTimeout(this.commitDebounce);
    this.commitDebounce = setTimeout(() => {
      runInAction(() => this.commit(entry, text));
    }, COMMIT_DEBOUNCE_MS);
  }

  resetText(entry: AbcData): void {
    const key = keyFor(entry);
    this.edits.delete(key);
    this.committed.delete(key);
    if (this.commitDebounce) {
      clearTimeout(this.commitDebounce);
      this.commitDebounce = null;
    }
  }

  private commit(entry: AbcData, text: string): void {
    const key = keyFor(entry);
    if (text === entry.data) this.committed.delete(key);
    else this.committed.set(key, text);
  }
}

export default new EditorStore();
```

- [ ] **Step 2: Export it from the stores barrel**

In `src/stores/index.ts`, add:

```ts
export { default as editorStore } from './EditorStore';
```

The full file should read:

```ts
export { default as libraryStore } from './LibraryStore';
export { default as playbackStore } from './PlaybackStore';
export { default as editorStore } from './EditorStore';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/stores/EditorStore.ts src/stores/index.ts
git commit -m "$(cat <<'EOF'
Add EditorStore for session-only ABC text edits

Two maps per entry: an instant one driving the textarea, and a debounced
one that downstream consumers (SheetView, PlaybackStore) will read from
once wired up in later tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `SheetView` parse-error resilience

Once users can type arbitrary ABC, `SheetView`'s parse step (currently only ever fed known-good library content) can throw on invalid/incomplete input — e.g. `abcjs.parseOnly` returning zero tunes for unparseable text, then `flattenTune` dereferencing `undefined`. This task makes `SheetView` fall back to the last successfully parsed render instead of crashing.

**Files:**
- Modify: `src/notation/SheetView.tsx`

**Interfaces:**
- Consumes: `parseTune` (`src/abc/parseTune.ts`), `flattenTune` (`src/abc/flatten.ts`), `computeSlurSpans`/`SlurSpan` (`src/notation/TieSlur.tsx`), `layoutLine`/`LineLayout` (`src/notation/layout.ts`) — all pre-existing, unchanged signatures.
- Produces: no new exports; `SheetView`'s own props (`abcSource`, `cursor`, `selectionStart`, `selectionEnd`, `onSelectionChange`) are unchanged.

- [ ] **Step 1: Extract the parse+layout logic into a standalone function and add a `ParsedSheet` type**

In `src/notation/SheetView.tsx`, change the import line:

```ts
import { TieSlurLayer, computeSlurSpans } from './TieSlur';
```

to:

```ts
import { TieSlurLayer, computeSlurSpans, type SlurSpan } from './TieSlur';
```

Then, directly above the `export function SheetView` line, add:

```ts
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
```

`FlattenedTune` is already imported at the top of the file (`import type { EventRef, FlattenedTune } from '../abc/types';`), so no new type import is needed for it.

- [ ] **Step 2: Replace the component's `useMemo` block with a try/catch + last-good cache**

Inside `export function SheetView(...)`, replace:

```tsx
  const { flattened, layouts, slurSpans, width, height } = useMemo(() => {
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
  }, [abcSource]);
```

with:

```tsx
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
```

`useRef` is already imported at the top of the file (`import { useMemo, useRef } from 'react';`), so no import changes are needed for this step.

- [ ] **Step 3: Show a notice when rendering stale content**

In the header block, change:

```tsx
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">{flattened.title}</h2>
        <p className="text-xs text-slate-500">
          Key: {flattened.key || 'C'} &middot; Meter: {flattened.meter} &middot; &#9833;={Math.round(flattened.qpm)}
        </p>
      </div>
```

to:

```tsx
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
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/notation/SheetView.tsx
git commit -m "$(cat <<'EOF'
Make SheetView resilient to unparseable ABC

Once the editor (added in a later task) lets users type arbitrary,
often mid-edit ABC, parseTune/flattenTune can throw on input that was
previously guaranteed valid. Cache the last successful parse and keep
rendering it (with a notice) instead of crashing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire `PlaybackStore` to `EditorStore`

**Files:**
- Modify: `src/stores/PlaybackStore.ts`

**Interfaces:**
- Consumes: `editorStore.currentAbcSource(entry: AbcData): string` (from Task 1).
- Produces: `playbackStore.loadSelected(abcSource: string): Promise<void>` — signature changes from no-arg to taking the resolved ABC source directly (it previously re-read `libraryStore.selected.data` itself). This method is only called from the constructor's `reaction`; no other file references it (verified: `grep -rn "loadSelected" src` shows only the two `PlaybackStore.ts` references before this change).

- [ ] **Step 1: Import `editorStore`**

In `src/stores/PlaybackStore.ts`, change:

```ts
import libraryStore from './LibraryStore';
```

to:

```ts
import libraryStore from './LibraryStore';
import editorStore from './EditorStore';
```

- [ ] **Step 2: Track the resolved ABC source instead of the raw selection**

Replace:

```ts
    reaction(
      () => libraryStore.selected,
      () => {
        void this.loadSelected();
      },
      { fireImmediately: true },
    );
```

with:

```ts
    reaction(
      () => editorStore.currentAbcSource(libraryStore.selected),
      (abcSource) => {
        void this.loadSelected(abcSource);
      },
      { fireImmediately: true },
    );
```

This one reaction now covers both switching to a different library entry and a debounced edit landing, since both change the tracked value.

- [ ] **Step 3: Update `loadSelected` to take the ABC source as a parameter**

Replace:

```ts
  async loadSelected(): Promise<void> {
    const abcSource = libraryStore.selected.data;
    if (!abcSource) return;

    this.status = 'loading';
```

with:

```ts
  async loadSelected(abcSource: string): Promise<void> {
    if (!abcSource) return;

    this.status = 'loading';
```

The rest of the method (loop-state reset, `synthEngine.load`, `runInAction` blocks, `catch`) is unchanged.

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Regression check — playback still works with no edits present**

Run: `npm run dev`, open the app in a browser.
Expected: the default tune loads and plays exactly as before (this reaction has no edits to react to yet, since nothing can create one until Task 4 — this step confirms the rewire didn't break the existing load/play path). Stop the dev server after checking.

- [ ] **Step 6: Commit**

```bash
git add src/stores/PlaybackStore.ts
git commit -m "$(cat <<'EOF'
Load playback from EditorStore's resolved ABC source

PlaybackStore now reacts to editorStore.currentAbcSource(selected)
instead of reading libraryStore.selected.data directly, so a debounced
edit reloads the synth the same way switching entries already does.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `AbcEditorPanel`, `SplitPane`, and wiring into `App.tsx`

This task makes the feature visible and usable end-to-end, and is where Task 2's stale-content fallback and Task 1/3's edit propagation become interactively testable together.

**Files:**
- Create: `src/components/AbcEditorPanel.tsx`
- Create: `src/components/SplitPane.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `editorStore.textFor`, `editorStore.currentAbcSource`, `editorStore.isEdited`, `editorStore.setText`, `editorStore.resetText` (Task 1); `libraryStore.selected` (existing); `playbackStore.cursor` / `.loopStart` / `.loopEnd` / `.setSelectionRange` (existing).
- Produces: `AbcEditorPanel({ value, edited, onChange, onReset })` and `SplitPane({ left, right, defaultRightWidth?, minRightWidth?, maxRightWidth? })` — both presentational, no further consumers planned.

- [ ] **Step 1: Write `AbcEditorPanel.tsx`**

```tsx
interface Props {
  value: string;
  edited: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}

export function AbcEditorPanel({ value, edited, onChange, onReset }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">ABC source</span>
        {edited && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            Edited
          </span>
        )}
        {edited && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-xs text-slate-500 underline hover:text-slate-800"
          >
            Reset to original
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none p-3 font-mono text-sm text-slate-800 outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 2: Write `SplitPane.tsx`**

```tsx
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
```

- [ ] **Step 3: Wire it all into `App.tsx`**

Replace the full contents of `src/App.tsx` with:

```tsx
import { observer } from 'mobx-react-lite';
import { Sidebar } from './components/Sidebar';
import { TransportBar } from './components/TransportBar';
import { AbcEditorPanel } from './components/AbcEditorPanel';
import { SplitPane } from './components/SplitPane';
import { SheetView } from './notation/SheetView';
import { libraryStore, playbackStore, editorStore } from './stores';

const App = observer(function App() {
  const selected = libraryStore.selected;
  const abcSource = editorStore.currentAbcSource(selected);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TransportBar />
        <SplitPane
          left={
            <SheetView
              abcSource={abcSource}
              cursor={playbackStore.cursor}
              selectionStart={playbackStore.loopStart}
              selectionEnd={playbackStore.loopEnd}
              onSelectionChange={playbackStore.setSelectionRange}
            />
          }
          right={
            <AbcEditorPanel
              value={editorStore.textFor(selected)}
              edited={editorStore.isEdited(selected)}
              onChange={(text) => editorStore.setText(selected, text)}
              onReset={() => editorStore.resetText(selected)}
            />
          }
        />
      </div>
    </div>
  );
});

export default App;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Interactive verification**

Run `npm run dev`, open the app in a browser, and check each of the following (this is the full checklist from the design spec's "Testing" section):

1. The editor panel appears to the right of the sheet, showing the selected entry's ABC text.
2. Type a change (e.g. edit a note letter) → after ~400ms, the sheet view re-renders with the change.
3. Type something unparseable (e.g. delete the `X:1` header line entirely) → the sheet keeps showing the last valid render plus the amber "Showing last valid version" notice; no crash, no blank page.
4. Fix the text back to valid ABC → the notice disappears and the sheet updates again.
5. Press Play → the synth plays the edited version, not the original (e.g. audibly confirm a changed note, or change the key/tempo header and confirm playback reflects it).
6. Select a different entry in the sidebar, then select the edited entry again → the edit is still present in the textarea and on the sheet.
7. Click "Reset to original" → textarea and sheet both revert to the original text, the "Edited" badge and "Reset" button disappear.
8. Drag the divider between the sheet and the editor → both panes resize smoothly; dragging to the extremes respects the 240px/800px clamps.

Stop the dev server after checking.

- [ ] **Step 6: Commit**

```bash
git add src/components/AbcEditorPanel.tsx src/components/SplitPane.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
Add ABC text editor split view

A resizable pane next to the sheet view lets users edit a library
entry's ABC source directly; edits are session-only, kept per-entry,
and debounce into the sheet/playback ~400ms after typing pauses.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
