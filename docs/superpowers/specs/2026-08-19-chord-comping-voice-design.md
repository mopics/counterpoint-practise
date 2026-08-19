# Chord-comping voice — design

## Background

Tunes today are single-voice: `flattenTune` (`src/abc/flatten.ts`) reads only `staff[0].voices[0]`, and `synthEngine.load()`/`PrintView` each hand abcjs one cleaned single-voice ABC string. This spec adds an optional second voice for guitar chord-comping: a rhythm-only line (durations and rests, pitch irrelevant) that pairs with the existing `$grip$` chord-grip markers to produce real, audible chord accompaniment — authored as a standard ABC `V:2` voice, translated to real chord pitches, and added to the ABC sent to playback and print.

This rides almost entirely on infrastructure already built for the chord-grip feature (`src/abc/chordGrips.ts`, `ChordGripDiagram.tsx`, the nearest-event char-offset attachment pattern) and needs no new marker syntax — the only new authoring convention is writing a second ABC voice.

## Goals

- Author a `V:2` voice in a tune's ABC using ordinary ABC note syntax, with any single pitch used purely as a typing placeholder (its value is discarded).
- Each `V:2` note's actual sounding pitches are derived from whichever `$grip$` chord grip is active in `V:1` at that moment in the tune ("active" = most recently written grip, holding until the next one).
- The derived chord (via standard guitar tuning E2-A2-D3-G3-B3-E4) is spliced into the raw ABC text as a real chord-cluster (e.g. `[E,A,d,g]`), replacing the placeholder pitch but keeping the original duration — producing fully valid multi-voice ABC.
- `synthEngine` and `PrintView` use this expanded ABC directly — both already/natively support multi-voice ABC once it's real ABC, so no synth-scheduling or abcjs-rendering changes are needed there beyond calling the new expansion step.
- `SheetView`'s custom renderer shows the comping voice as chord-grip diagrams plus a single rhythm line beneath each staff line — not a normal second staff — using the *original* (untranslated) `V:2` for rhythm/rest data only.
- Tunes without a `V:2` voice are entirely unaffected, pixel- and behavior-identical to today.

## Non-goals

- No new ABC marker syntax. The feature is built entirely from standard `V:` voice syntax plus the existing `$grip$` markers.
- No support for a comping note that isn't backed by any grip yet (before the first grip in the tune) — it renders/plays as silence, not an error.
- No print-view-specific custom rendering — print gets abcjs's own native second-staff engraving of the expanded ABC, as-is, not the diagram+rhythm-line look.
- No chord-symbol-text parsing (e.g. inferring pitches from "Dm6" itself) — a grip is always the source of truth for pitches.
- No UI toggle to hide comping when present — if a tune has `V:2`, it always renders/plays.

## Pipeline

New module `src/abc/chordComping.ts`:

```ts
export interface CompingEvent {
  charOffset: number;   // V:2 note's position in the (post key/grip-marker-stripped) ABC text
  startChar: number;
  endChar: number;
  duration: number;
  isRest: boolean;
  timePosition: number; // cumulative duration (whole-note fraction) from tune start, written order
}

export function extractCompingVoice(tune: abcjs.TuneObject): CompingEvent[] | null;
// null when the tune has no second voice.

export function alignCompingToGrips(
  compingEvents: CompingEvent[],
  grips: ChordGripMarker[],
  gripTimePositions: Map<ChordGripMarker, number> // by reference, computed alongside
): (ChordGripSpec | null)[]; // one entry per compingEvent — null = no grip active yet

export function expandCompingVoice(cleanAbc: string, tune: abcjs.TuneObject, grips: ChordGripMarker[]): string;
// Splices real chord-cluster pitches into V:2's placeholder notes; no-op passthrough if no V:2.
```

**Time-position computation** (shared by grips and comping events): a prefix-sum walk over each voice's events in written order, accumulating `duration` — not real seconds, so it's tempo-independent and unaffected by repeat structure (both voices share the same written bar/repeat structure, so structural alignment is correct without unrolling repeats). Each `$grip$` marker's time position comes from the time position of the `V:1` event it's already attached to (via the existing `noteOnsetChar`-based nearest-event walk in `chordGrips.ts`).

**Alignment**: for each `V:2` event, the active grip is the one with the greatest `timePosition <= event.timePosition`. If none exists yet (comping starts before the first grip), the event is treated as a rest for both playback and rendering purposes.

**Expansion** (`expandCompingVoice`): for each non-rest `V:2` event with an active grip, map the grip's `frets`/`startFret` to real pitches via standard guitar tuning, build an ABC chord-cluster string, and splice it into the raw text at `[startChar, endChar)`, replacing only the pitch — the duration suffix is preserved verbatim by string-slicing around it. Events that are already rests in the source (the user can write a rest directly in `V:2`, e.g. `z2`, to leave a gap in the rhythm) are left untouched — there's no pitch to replace. Non-rest events with no active grip yet (comping starts before the first grip) are spliced to a plain ABC rest (`z`) of the same duration instead of a chord. Returns the full modified ABC string, still valid, ready for `parseTune`/`abcjs.renderAbc`.

## Wiring

- **`synthEngine.load()`**: after `extractKeyMarkers`/`extractChordGrips` (as today), call `expandCompingVoice(cleanAbc, tune, grips)` before the final `parseTune`/synth creation. Requires parsing once to get `tune` for voice detection, then re-parsing the expanded text — consistent with the existing pattern of each consumer independently parsing.
- **`PrintView`**: same `expandCompingVoice` call before `abcjs.renderAbc`.
- **`SheetView.parseSheet()`**: after existing marker extraction, call `extractCompingVoice(tune)`. If non-null, also compute the grip-alignment overlay (`alignCompingToGrips`) using the *original* grips/tune (no expansion — SheetView never needs real pitches). Produces a `CompingOverlay` used by the render loop.

## Rendering (SheetView)

Active only for lines of a tune whose `extractCompingVoice` returned non-null:

- **Chord-grip diagrams**: one `ChordGripDiagram` (reused as-is) drawn at each point the active grip changes, positioned via the existing per-line event timeline.
- **Rhythm line**: a new lightweight glyph (`CompingNoteGlyph`, in `src/notation/`) drawn on a single fixed Y position per line — filled/open notehead and flag count driven by the same `duration` thresholds `NoteGlyph`/`geometry.ts` already expose (`isFilledNotehead`, `flagCount`, `dotCount`), but with no pitch, no ledger lines, no accidentals. Rests use the existing `RestGlyph` pattern adapted the same way.
- X-positions align with the corresponding melody line's own `eventWidth` timeline, so the strip visually sits under the matching beat.
- New geometry constants for this strip's placement/height, following the exact `*_WITH_GRIPS` layout-variant pattern already established (zero effect on tunes without `V:2`).

## Testing

- `chordComping.test.ts`: time-position computation (prefix-sum correctness, including across bars/lines); alignment (holds-until-next semantics, before-first-grip → null); expansion (correct chord-cluster splice, duration preserved, no-op when no `V:2`, rest passthrough).
- `flatten.ts` / new voice-extraction: verify `extractCompingVoice` returns `null` for every existing single-voice tune (regression guard — this feature must not alter any current tune's behavior).
- `SheetView`: browser-based Playwright check (per existing verification convention) — a test tune with `V:1`/`V:2` renders grips + rhythm line at the right positions; playback of that tune produces audible chord tones matching the grip's frets.

## Verification

1. Author a small test tune with a `V:2` comping voice and a couple of `$grip$` markers in `V:1`.
2. Sheet view: confirm chord-grip diagrams + rhythm line render beneath the staff, chord changes align to grip positions.
3. Playback: confirm the comped chords are audible and voiced per the grips' fret positions.
4. Print view: confirm abcjs renders a native second staff for the expanded `V:2` (no crash, reasonable default engraving).
5. Confirm every existing tune (no `V:2`) is pixel- and behavior-identical to before this change (`npm run test`, plus a spot-check in the browser).
