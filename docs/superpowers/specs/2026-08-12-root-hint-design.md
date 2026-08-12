# Root hint on chord symbols — design

## Background

When numeral mode is on, notes render as scale-degree numerals (`1`, `b3`, `#5`, ...) relative to whichever root the most recent `**K**` marker set (or the tune's key signature, before any marker). There's currently no visual indication in the sheet of *what* that root is at any given point — the reader has to infer it, usually correctly, from the nearest chord symbol's own name. But that inference is sometimes wrong: real content (`_101-bebop-II-V7.ts`, `Anthropology.ts`) has passages where the marked root deliberately differs from the chord symbol's own letter — e.g. `"F-7"**Eb**` marks a ii chord's root as the *target* key (Eb) it's resolving to, not F. A reader glancing at "F-7" alone would misread the numerals that follow it.

## Goal

Show, right next to the chord symbol, the actual root the following numerals are relative to — only where a `**K**` marker takes effect, only in numeral mode, only when that marker's event also carries a chord symbol (the case the marker convention already targets almost universally in practice).

## Data model

Extend `ScaleDegreeLine` (`src/abc/scaleDegrees.ts`) with a new parallel field, index-aligned with `degrees` and with `NotationLine.events[]`:

```ts
export interface ScaleDegreeLine {
  degrees: (string[] | null)[];
  rootHints: (string | null)[]; // e.g. "Eb" — set only on the event where a marker fired, and only if that event carries a chordSymbol
}
```

`computeScaleDegrees` already walks every event in document order inside a single loop, advancing `markerIdx` through the sorted marker list and updating `currentRootPc` whenever a marker's `charOffset` is at-or-before that event's computed onset (`noteOnsetChar`). Extend that same loop: when the marker-advance `while` loop consumes at least one marker during a given event's turn, and that event's `chordSymbol` is set, record the *last* marker consumed there (its `root` string, e.g. `"Eb"`, exactly as written in the `**K**` token) into `rootHints[eventIndex]`. All other events get `null`. No second pass or new data source is needed — this is computed alongside `degrees` in the existing walk.

If a marker fires on an event with no `chordSymbol` (e.g. a marker floating with no adjacent chord annotation), no hint is recorded — there's no chord-symbol text to attach it to, and inventing a separate rendering surface for that case is out of scope.

## Rendering

`ChordSymbolRow` (`src/notation/ChordSymbolRow.tsx`) currently renders one `<text>` per event with a `chordSymbol`, unconditionally. It gains a new prop:

```ts
interface Props {
  events: LayoutEvent[];
  y: number;
  rootHints?: (string | null)[]; // index-aligned with events by eventIndex; only passed when numeral mode is on
}
```

For an event whose `chordSymbol` is set and whose `rootHints[eventIndex]` is non-null, the existing `<text>` gains a second `<tspan>` immediately after the chord symbol's own text: `*` followed by the root string. The chord symbol's own `<tspan>` keeps the row's current styling (`fontSize={13}`, `fontWeight={700}`, `className="fill-slate-900"`); the hint `<tspan>` uses `fontSize={10}`, `fontWeight={400}`, `className="fill-slate-500"` — visibly smaller and lighter than the chord symbol, subordinate to it — so `"F-7"` renders as `F-7*Eb` with `*Eb` clearly secondary. Events with no hint (the common case — most chord symbols don't coincide with a marker) render exactly as they do today, unchanged (a single `<text>`, no second `<tspan>`).

`SheetView.tsx` passes `rootHints` down from the per-line `ScaleDegreeOverlay` data it already computes, following the same conditional-on-`numeralMode` pattern already used for `NoteGlyph`'s `scaleDegrees` prop: `numeralMode ? scaleDegrees.lines[lineIndex]?.rootHints : undefined`.

## Scope

- Numeral-mode-only: `rootHints` is never passed to `ChordSymbolRow` when numeral mode is off, so normal notehead view is completely unaffected.
- Shows the marker's root exactly as written (same spelling used elsewhere, e.g. `ROOT_TO_PC` keys) — no re-derivation or re-formatting.
- Shows a hint every time a marker fires at a chord-symbol-bearing event, regardless of whether the resulting root differs from the previous one (simpler than detecting "did it actually change," and still informative as "a `**K**` marker is anchored here").
- No hint when a marker fires with no adjacent chord symbol (rare in practice; not solved here).
- No change to `NoteGlyph`, `SheetView`'s note-rendering path, or the degree-label computation — this is purely an additive annotation on the existing chord-symbol row.
