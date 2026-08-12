# Scale-degree numeral overlay — design

## Background

The old app (`numeric-licks-abc`) supports embedding hidden "key gestures" in ABC note bodies as `**K**` tokens (e.g. `**Db**` = "from here, treat Db as the root"). When a toggle is enabled, notes render as scale-degree numbers (`1`, `b3`, `#5`, `tt`, ...) relative to the most recently seen root, instead of standard noteheads, until the next `**K**` token changes the root. Several tunes already checked into this repo's content carry these markers (ported from the old app's assets), currently inert since nothing parses them here.

This repo's renderer is architecturally different from the old app: it doesn't use abcjs's SVG output at all (see `src/notation/*`) — it has its own custom SVG rendering pipeline built from a `FlattenedTune`/`NotationEvent` model (`src/abc/flatten.ts`, `src/abc/types.ts`). abcjs is only used for parsing (`src/abc/parseTune.ts`) and audio synthesis (`src/playback/synthEngine.ts`). This lets the numeral feature be implemented as a first-class per-note render mode rather than the old app's DOM-overlay hack (hiding abcjs-rendered noteheads via CSS and injecting positioned `<text>` nodes after the fact).

## Goals

- Parse `**K**` markers out of ABC note bodies before rendering/parsing.
- Resolve, for every note, which root is active (the most recent preceding `**K**` marker, or the tune's own key if none has occurred yet).
- Render notes as scale-degree numerals instead of noteheads when a global toggle is enabled, matching the old app's degree-label scheme.
- Persist the toggle across reloads.

## Non-goals

- The old app's sibling "astrology notes" overlay is out of scope.
- No change to playback/audio — synthesis already ignores the markers by virtue of not existing in its own code path today, and will continue to via the cleaned ABC text.

## Marker parsing (`src/abc/keyMarkers.ts`)

```ts
export interface KeyMarker {
  charOffset: number; // position in cleanAbc where the marker occurred
  root: string;        // e.g. "C", "Db", "F#"
}

export function extractKeyMarkers(rawAbc: string): { cleanAbc: string; markers: KeyMarker[] };
```

- Scans for `**...**` spans (regex, global).
- A span whose content matches `^[A-G][b#]?$` is recorded as a `KeyMarker` (`charOffset` = start of the span).
- Any other `**...**` content (e.g. the `**_**` found in `licks-by-date/30-11-25.ts`) is treated as a no-op annotation: stripped, not recorded. This is a deliberate improvement over the old app, whose regex silently failed to strip invalid markers, leaving stray `*` characters that could desync its hand-rolled note scanner.
- Every matched span (valid or not) is replaced with equal-length whitespace — **not deleted**. This preserves every character offset in `cleanAbc` relative to the original source, which matters because `src/abc/flatten.ts` and `src/abc/timing.ts` already thread `startChar`/`endChar` through the whole pipeline (cursor tracking, selection, audio-accurate timing). `cleanAbc` is what gets passed to `parseTune`.

## Root resolution and degree computation (`src/abc/scaleDegrees.ts`)

Unlike the old app, this repo already has structured per-note pitch data — so there's no need to re-derive pitch classes by re-scanning raw note text the way the old app's `extractChordRootsFromAbc` did. That scanner was also fragile: it had to stay index-aligned with abcjs's own rendered note list by construction, with no shared source of truth.

**Correction from an earlier draft of this spec:** `NotationPitch.pitch` is *not* a chromatic/MIDI value — per `src/notation/geometry.ts`'s own documentation, it's a diatonic staff-step count "independent of accidentals" (used purely for vertical positioning; C=0, D=1, E=2, ... regardless of sharps/flats). Computing pitch class via `pitch % 12` would be incorrect. The real chromatic pitch class must instead be derived from `NotationPitch.name` (the base letter, e.g. `"C"`/`"c"`) plus `NotationPitch.accidental` (an explicit `"sharp"/"flat"/"natural"/"dblsharp"/"dblflat"` on this note, from abcjs's own `AccidentalName` type) — falling back, when a note carries no explicit accidental, to the tune's key-signature-implied accidental for that letter. This mirrors the old app's `addAccidentalByKey`, but sourced from abcjs's own structured `KeySignature.accidentals` list (via `tune.getKeySignature().accidentals`, each `{ acc: AccidentalName; note: NoteLetter }`) rather than a hardcoded per-key switch statement.

```ts
export interface ScaleDegreeLine {
  degrees: (string[] | null)[]; // index-aligned with NotationLine.events[]; null for rests
}
export interface ScaleDegreeOverlay {
  lines: ScaleDegreeLine[];
}

export function computeScaleDegrees(
  flattened: FlattenedTune,
  markers: KeyMarker[],
  defaultRoot: string,
): ScaleDegreeOverlay;
```

- Walks all events across all lines in `startChar` order (mirrors the approach `timing.ts`'s `buildStartCharIndex` already uses).
- Maintains a "current root" pointer, initialized to `defaultRoot`, advanced through any marker whose `charOffset <= event.startChar`.
- `defaultRoot` comes from the tune's own key signature — `flatten.ts` already extracts `key.root`/`key.acc` from `tune.getKeySignature()` before formatting them into `FlattenedTune.key`'s display string; add two small additive fields to `FlattenedTune`: `keyRoot: string` (e.g. `"Db"`, just root+accidental, no mode) and `keyAccidentals: Record<string, string>` (letter → `AccidentalName`, built from `tune.getKeySignature().accidentals`, used as the implied-accidental fallback described above). This gives the fallback-to-tune-key behavior confirmed with the user: numerals are always computable, even before any `**K**` marker appears or if a tune has none at all.
- For each pitch in each note event: resolve its chromatic pitch class from `name`/`accidental`/`keyAccidentals` as described above; degree = distance from the active root's pitch class, looked up in `DEGREE_LABEL_FLAT` (or `DEGREE_LABEL_SHARP` when the note's resolved accidental is `'sharp'`) — both label tables and the `pcDistance` helper ported verbatim from the old app's `src/helpers.ts`.
- Because `NotationEvent.pitches` already supports multiple simultaneous pitches (chords), this naturally produces one label per pitch — an improvement over the old app, which only ever saw one pitch per token and had no chord support in this feature.
- **Output is a separate parallel structure**, not a mutation of `NotationEvent`/`FlattenedTune`. Keeping scale-degree data out of the core note model means the feature stays fully additive and can't leak into cursor/timing/selection/playback logic that already consumes `NotationEvent` elsewhere in the app.

### Ported tables (from old app's `src/helpers.ts`, unchanged)

```ts
export const DEGREE_LABEL_FLAT: Record<number, string> = {
  0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
  6: "tt", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7",
};
export const DEGREE_LABEL_SHARP: Record<number, string> = {
  0: "1", 1: "#1", 2: "2", 3: "#2", 4: "3", 5: "4",
  6: "tt", 7: "5", 8: "#5", 9: "6", 10: "#6", 11: "7",
};
export const ROOT_TO_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
```

## Rendering (`src/notation/NoteGlyph.tsx`, `src/notation/SheetView.tsx`)

- `NoteGlyph` gains an optional prop `scaleDegrees?: string[]`, parallel to its existing `pitches` prop.
- In the existing per-pitch render loop: if `scaleDegrees[i]` is present, render a small SVG `<text>` at `(x, pitchToY(p.pitch, staffBottomY))` with the label, in place of `<NoteHead>`, and skip `<AccidentalGlyph>` for that pitch (the degree label already encodes the accidental, e.g. `b3`, `#5`). If absent, render exactly as today (notehead + accidental).
- Stems, beams, ledger lines, and ties/slurs are computed from `pitches`/`duration` independent of notehead-vs-numeral display, so they render unchanged in numeral mode — a beamed run of numerals still reads as one phrase.

`SheetView.tsx`'s `parseSheet(abcSource)` gains the `extractKeyMarkers` + `computeScaleDegrees` calls, always computed (cheap; independent of the toggle) alongside `parseTune`/`flattenTune`, and it is `SheetView.tsx` itself (not `Staff.tsx`, which this feature never touches) that passes the resulting `degrees` — index-aligned with `line.events[]` — into each `NoteGlyph`, only when numeral mode is active. A new `numeralMode: boolean` prop is added to `SheetView`'s `Props`, following the existing pattern used for `cursor`/`selectionStart` (state lives in a MobX store, read by an `observer`-wrapped parent, passed down as a plain prop — `SheetView` itself stays a plain `React.memo`, not MobX-aware).

## State and UI

**New `src/stores/UiStore.ts`** — a view-preference store, kept separate from `PlaybackStore`/`EditorStore`/`LibraryStore` since numeral mode is a rendering concern orthogonal to all three:

```ts
class UiStore {
  numeralMode: boolean; // initialized from localStorage, default false
  toggleNumeralMode = (): void => { ... }; // flips + persists to localStorage
}
```

Exported as a singleton from `src/stores/index.ts` alongside the existing three, using the same `makeObservable`/`actionBound` pattern.

**`src/components/TransportBar.tsx`** — add a `🔢 Numerals` toggle button using the existing `Button` component (already used for `🔁 Loop selection`), with `active={uiStore.numeralMode}` following the same pattern.

## Edge cases

- Rests: no pitches, no numeral — `ScaleDegreeLine.degrees[i]` is `null`, `NoteGlyph`/`RestGlyph` path is unaffected (rests already render via a separate `RestGlyph` component).
- Chords (multiple simultaneous pitches): one numeral per pitch, stacked at each pitch's vertical position — an improvement over the old app, which had no chord handling for this feature.
- Marker directly abutting a chord symbol or note with no whitespace (e.g. `"F-7"**Eb**B,2`), and multiple markers close together — both handled naturally since `extractKeyMarkers` is a plain regex scan independent of whitespace/token boundaries.
- Invalid marker content (e.g. `**_**`): stripped as a no-op, not recorded as a root change, not left as stray characters.
- Grace notes: `NotationGraceNote` has no `accidental` field and is a visually distinct, secondary element in the old app's design intent (an ornament, not a primary scale tone) — grace notes are left rendering as today, unaffected by numeral mode.

## Testing

Vitest is now configured for this repo, and the pure-logic modules this feature adds — `src/abc/keyMarkers.ts` and `src/abc/scaleDegrees.ts` — have real unit tests covering marker extraction, pitch-class/degree-label resolution, and root-tracking across markers (including chord-symbol-adjacent markers). `src/notation` rendering (`NoteGlyph`'s numeral display) and `src/playback` remain manually verified, using real content fixtures already ported from the old app that carry `**K**` markers, e.g. tunes matching `JustInTime`, `TuneUp`, `Anthropology` naming from the old app's asset set — confirm they exist under `src/content/**` in this repo and use them as manual test cases for dense marker sequences, single-marker-per-chord patterns, and the abutting-marker edge case.
