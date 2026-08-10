# ABC text editor — design

## Purpose

Add a pure-text (textarea) ABC editor to the right of `SheetView`, in a split
view with a draggable resize bar, so a user can edit the ABC source of the
currently selected library entry and see/hear the result update live.

## Constraints

- Library content (`src/content/**`) is hardcoded TypeScript exports compiled
  into the bundle. There is no backend and no file-write path — edits cannot
  be saved back to source.
- `AbcData` objects from `src/content` are shared, imported module-level
  objects; they must not be mutated in place (a mutation would corrupt that
  content for the rest of the session, including if the user re-selects it).

## Decisions

- **Persistence: session-only, in-memory, per-entry.** Edits live only for
  the running session. Switching to another entry and back preserves the
  edit (kept in an in-memory map keyed by entry). A full page reload
  discards all edits.
- **Live sync, debounced.** The sheet view and playback re-parse the edited
  text ~400ms after typing pauses, not on every keystroke.
- **Reset affordance.** Since edits are otherwise only undoable by manually
  retyping, an explicit "Reset to original" action is included.

## Architecture

### New store: `EditorStore` (`src/stores/EditorStore.ts`)

Same shape as the existing `LibraryStore`/`PlaybackStore` (MobX, one store
per concern). Two maps keyed by `entry.key`:

- `edits: Map<key, string>` — updated on every keystroke; drives the
  textarea's controlled value instantly. Debouncing the controlled value
  itself would make typing feel laggy, so this is never debounced.
- `committed: Map<key, string>` — updated ~400ms after typing pauses, via a
  single debounce timer. This mirrors the existing
  `PlaybackStore.setSwing`/`swingDebounce` pattern (instant local value +
  debounced expensive side-effect). `SheetView` and `PlaybackStore` consume
  `committed`, not `edits`, so re-parsing/re-priming the synth doesn't
  happen on every keystroke.

An entry occupies these maps only while its text differs from the original;
typing back to the exact original clears the entry out of both maps. This
means "is this entry edited" is just "is it present in the map" — no
separate dirty flag needed.

Public API:

```ts
textFor(entry: AbcData): string          // edits.get(key) ?? entry.data ?? '' — for the textarea
currentAbcSource(entry: AbcData): string // committed.get(key) ?? entry.data ?? '' — for SheetView/PlaybackStore
isEdited(entry: AbcData): boolean        // edits.has(key)
setText(entry: AbcData, text: string): void
resetText(entry: AbcData): void          // clears both maps for this entry, cancels any pending debounce
```

`entry.key` is always assigned by `LibraryStore`'s `assignKeys` for every
selectable (leaf) node before it can be selected; `entry.key ?? entry.id` is
used as a defensive fallback for the map key, consistent with the existing
`libraryStore.selected.data ?? ''` fallback pattern in `App.tsx`.

### Wiring into existing code

- `App.tsx` computes `abcSource = editorStore.currentAbcSource(libraryStore.selected)`
  once per render and passes it to both `SheetView` and the new editor
  panel, replacing the current direct read of `libraryStore.selected.data`.
- `PlaybackStore`'s constructor `reaction` currently tracks
  `() => libraryStore.selected` and calls `loadSelected()`, which re-reads
  `libraryStore.selected.data` itself. It changes to track
  `() => editorStore.currentAbcSource(libraryStore.selected)` and use the
  tracked value directly. This single reaction naturally covers both
  "user switched entries" and "user's debounced edit landed," since both
  change the tracked value.

## UI / layout

- New `AbcEditorPanel.tsx`: a `<textarea>` (monospace font, full height),
  with a small header row showing an "Edited" badge and a "Reset to
  original" button — both shown only when `editorStore.isEdited(selected)`
  is true.
- The content area in `App.tsx` (currently a single child holding
  `SheetView`) becomes a horizontal split: `SheetView` (flexible width,
  scrollable) | draggable resize bar | `AbcEditorPanel` (resizable width).
- The resize bar is a thin `cursor-col-resize` divider using the same
  pointer-capture drag idiom `SheetView` already uses for its own
  drag-to-select. Pane width is local `useState` in the split-view wrapper
  component (pure layout state — not store-worthy, not persisted).
- Default editor width ~400px, clamped to a sensible min/max (e.g. 240px–800px,
  or capped as a percentage of container width) so neither pane can be
  squeezed to nothing.

## Error handling

`SheetView`'s `parseTune`/`flattenTune` call (inside a `useMemo`) is not
currently wrapped in error handling — it has only ever received known-good
library content. Once users can type arbitrary, often mid-edit and invalid
ABC, that call can throw (e.g. `abcjs.parseOnly` returning no tunes for
unparseable/empty input, then `flattenTune` dereferencing `undefined`).

Fix: wrap the parse+flatten body in try/catch inside the `useMemo`, caching
the last successful result in a `useRef`. On a parse failure, `SheetView`
keeps rendering the cached result instead of throwing, and shows a small
inline notice (e.g. "showing last valid version") so it's clear the sheet
isn't reflecting the very latest keystrokes.

## Testing

- `tsc -b` for type safety.
- Interactive verification in-browser:
  - Edit a tune's text → sheet view and playback update after the debounce.
  - Type invalid ABC → sheet keeps showing the last valid render plus the
    stale-content notice, no crash.
  - Press Play while an edit is pending/committed → synth plays the edited
    version, not the original.
  - Switch to a different entry and back → edit is still present.
  - Reset to original → textarea and sheet both revert, badge disappears.
  - Drag the resize bar → both panes resize smoothly within their clamps.

## Out of scope

- Persisting edits across reloads (e.g. localStorage) — explicitly rejected
  in favor of session-only.
- Writing edits back to `src/content` source files — no write path exists.
- A "this entry has unsaved edits" indicator in the sidebar tree — not
  requested; can be a follow-on if wanted.
