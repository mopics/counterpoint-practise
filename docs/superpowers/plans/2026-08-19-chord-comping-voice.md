# Chord-Comping Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional second ABC voice (`V:2`) that authors a rhythm-only comping line, translate it into real guitar-chord pitches (sourced from the existing `$grip$` chord-grip markers) as a genuine ABC voice before playback/print, and render it in `SheetView` as chord-grip diagrams plus a single rhythm line beneath each staff line.

**Architecture:** A new pure-logic module, `src/abc/chordComping.ts`, extracts `V:2`'s rhythm (ignoring its placeholder pitch), time-aligns each rhythm note to whichever `$grip$` chord grip is active in `V:1` at that moment (holds until the next grip), and can splice real chord-cluster pitches into the raw ABC text for playback/print. `SheetView` uses the rhythm+alignment data directly (no text expansion) to draw a new custom row; `synthEngine`/`PrintView` use the expanded ABC text, letting abcjs's native multi-voice support handle playback/engraving with no further changes there.

**Tech Stack:** TypeScript, abcjs (`parseOnly`/`TuneObject`, real multi-voice ABC), React (SVG rendering), Vitest.

**Spec:** [docs/superpowers/specs/2026-08-19-chord-comping-voice-design.md](../specs/2026-08-19-chord-comping-voice-design.md)

## Global Constraints

- No new npm dependencies.
- No new ABC marker syntax — this feature is built entirely from standard ABC `V:` voice syntax plus the existing `$grip$` markers (`src/abc/chordGrips.ts`).
- Tunes with no `V:2` voice must remain byte-for-byte behavior- and pixel-identical to today (verified by dedicated tests/checks in each task that touches a shared code path).
- All new pure-logic tests use real `parseTune`/`flattenTune` against literal ABC strings — no mocking of abcjs — matching `src/abc/chordGrips.test.ts` and `src/abc/flatten.test.ts`.
- Standard guitar tuning for pitch derivation: low-to-high strings E2 A2 D3 G3 B3 E4 (MIDI 40, 45, 50, 55, 59, 64), matching `ChordGripSpec.frets`' existing "index 0 = low E ... index 5 = high E" convention (`src/abc/chordGrips.ts`).

**Verified abcjs structural fact this plan depends on:** for a tune with `V:1`/`V:2` declared without explicit staff-grouping directives, abcjs puts each voice on its **own staff** per written line — `tuneLine.staff[0].voices[0]` is `V:1` (unchanged from today), `tuneLine.staff[1].voices[0]` is `V:2`. Confirmed by direct inspection of `abcjs.parseOnly()` output against a real 2-voice/2-line/rest-containing ABC string (both line-skip logic and rest encoding — `el_type: 'note'` with a `rest` field, exactly matching `flatten.ts`'s existing `RawNoteItem` convention — matched what `src/abc/flatten.ts` already assumes for `V:1`).

---

### Task 1: `chordComping.ts` — types and `extractCompingVoice`

**Files:**
- Create: `src/abc/chordComping.ts`
- Test: `src/abc/chordComping.test.ts`

**Interfaces:**
- Consumes: `abcjs.TuneObject` (from `parseTune`, `src/abc/parseTune.ts`).
- Produces (used by Tasks 2, 3, 4, 5, 7, 8):
  ```ts
  export interface CompingEvent { kind: 'note' | 'rest'; startChar: number; endChar: number; duration: number; }
  export interface CompingLine { lineIndex: number; events: CompingEvent[]; }
  export interface CompingVoice { lines: CompingLine[]; }
  export function extractCompingVoice(tune: abcjs.TuneObject): CompingVoice | null;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/abc/chordComping.test.ts
import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { extractCompingVoice } from './chordComping';

describe('extractCompingVoice', () => {
  it('returns null for a single-voice tune', () => {
    const tune = parseTune('X:1\nK:C\nCDEF|\n');
    expect(extractCompingVoice(tune)).toBeNull();
  });

  it('extracts V:2 note/rest events with duration and char range, ignoring V:1', () => {
    const tune = parseTune('X:1\nK:C\nV:1\nCDEF|\nV:2\nC4|z4|\n');
    const comping = extractCompingVoice(tune);
    expect(comping).not.toBeNull();
    expect(comping!.lines).toHaveLength(1);
    expect(comping!.lines[0].events.map((e) => ({ kind: e.kind, duration: e.duration }))).toEqual([
      { kind: 'note', duration: 1 },
      { kind: 'rest', duration: 1 },
    ]);
  });

  it('preserves the source char range of each event for later text-splicing', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:2\nC4|\n';
    const tune = parseTune(raw);
    const comping = extractCompingVoice(tune)!;
    const event = comping.lines[0].events[0];
    expect(raw.slice(event.startChar, event.endChar)).toBe('C4');
  });

  it('numbers lineIndex the same way flattenTune does (per staff-bearing written line)', () => {
    const tune = parseTune('X:1\nK:C\nV:1\nCDEF|\ncBAG|\nV:2\nC4|\nC4|\n');
    const comping = extractCompingVoice(tune)!;
    expect(comping.lines.map((l) => l.lineIndex)).toEqual([0, 1]);
    expect(comping.lines[1].events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- chordComping`
Expected: FAIL — `chordComping.ts` (and `extractCompingVoice`) does not exist yet.

- [ ] **Step 3: Implement `extractCompingVoice`**

```ts
// src/abc/chordComping.ts
import type * as abcjs from 'abcjs';

export interface CompingEvent {
  kind: 'note' | 'rest';
  startChar: number;
  endChar: number;
  duration: number;
}

export interface CompingLine {
  lineIndex: number;
  events: CompingEvent[];
}

export interface CompingVoice {
  lines: CompingLine[];
}

interface RawCompingItem {
  el_type: string;
  startChar: number;
  endChar: number;
  duration: number;
  rest?: { type: string };
}

/**
 * Extracts the rhythm-only comping voice (V:2) from a parsed tune, ignoring
 * its pitch entirely (V:2 notes carry a placeholder pitch the author picks
 * for typing convenience — only kind/duration/char-range matter here).
 * Mirrors flatten.ts's line-skip logic (subtitle lines skipped, lineIndex
 * incremented only for staff-bearing lines) so lineIndex numbering stays in
 * sync with FlattenedTune.lines, which callers rely on to correlate the two.
 * Returns null when the tune has no second voice — abcjs puts V:2 on its own
 * staff (tuneLine.staff[1]), not as a second voice of staff[0] (verified
 * empirically; see this plan's Global Constraints).
 */
export function extractCompingVoice(tune: abcjs.TuneObject): CompingVoice | null {
  const hasSecondVoice = tune.lines.some((l) => !l.subtitle && (l.staff?.length ?? 0) > 1);
  if (!hasSecondVoice) return null;

  const lines: CompingLine[] = [];
  let lineIndex = 0;
  for (const tuneLine of tune.lines) {
    if (tuneLine.subtitle) continue;
    if (!tuneLine.staff?.length) continue;

    const events: CompingEvent[] = [];
    const voice = tuneLine.staff[1]?.voices?.[0];
    if (voice) {
      for (const item of voice as unknown as RawCompingItem[]) {
        if (item.el_type !== 'note') continue;
        events.push({
          kind: item.rest ? 'rest' : 'note',
          startChar: item.startChar,
          endChar: item.endChar,
          duration: item.duration,
        });
      }
    }
    lines.push({ lineIndex, events });
    lineIndex++;
  }
  return { lines };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- chordComping`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/abc/chordComping.ts src/abc/chordComping.test.ts
git commit -m "feat: extract rhythm-only comping voice from V:2"
```

---

### Task 2: `chordComping.ts` — `alignCompingToGrips`

**Files:**
- Modify: `src/abc/chordComping.ts`
- Test: `src/abc/chordComping.test.ts`

**Interfaces:**
- Consumes: `CompingVoice` (Task 1); `FlattenedTune` (`src/abc/types.ts`); `ChordGripOverlay`, `ChordGripSpec` (`src/abc/chordGrips.ts`).
- Produces (used by Tasks 3, 7, 8):
  ```ts
  export interface CompingAlignmentLine { grips: (ChordGripSpec | null)[]; } // aligned by index to the matching CompingLine.events
  export interface CompingAlignment { lines: CompingAlignmentLine[]; }
  export function alignCompingToGrips(compingVoice: CompingVoice, flattened: FlattenedTune, chordGripOverlay: ChordGripOverlay): CompingAlignment;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/abc/chordComping.test.ts
import { flattenTune } from './flatten';
import { extractChordGrips, computeChordGripOverlay } from './chordGrips';
import { alignCompingToGrips } from './chordComping';

function buildAlignment(raw: string) {
  const { cleanAbc, grips } = extractChordGrips(raw);
  const tune = parseTune(cleanAbc);
  const flattened = flattenTune(tune);
  const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
  const compingVoice = extractCompingVoice(tune)!;
  return alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
}

describe('alignCompingToGrips', () => {
  it('assigns null to comping notes before any grip has appeared', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\nCDEF|\nV:2\nC4|\n');
    expect(alignment.lines[0].grips).toEqual([null]);
  });

  it('assigns the nearest preceding grip to a comping note', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC4|\n');
    expect(alignment.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
  });

  it('holds the same grip across multiple comping notes until the next one', () => {
    const alignment = buildAlignment('X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC2C2|C4|\n');
    expect(alignment.lines[0].grips).toEqual([
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
      { startFret: 0, frets: [null, null, 3, 4, null, null] },
    ]);
  });

  it('switches to a new grip once its time position is reached', () => {
    const alignment = buildAlignment(
      'X:1\nK:C\nV:1\n$0-xx34xx$CD$3-012345$EF|\nV:2\nC2C2|\n',
    );
    expect(alignment.lines[0].grips[0]).toEqual({ startFret: 0, frets: [null, null, 3, 4, null, null] });
    expect(alignment.lines[0].grips[1]).toEqual({ startFret: 3, frets: [0, 1, 2, 3, 4, 5] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- chordComping`
Expected: FAIL — `alignCompingToGrips` does not exist yet.

- [ ] **Step 3: Implement `alignCompingToGrips`**

```ts
// add to src/abc/chordComping.ts
import type { FlattenedTune } from './types';
import type { ChordGripOverlay, ChordGripSpec } from './chordGrips';

export interface CompingAlignmentLine {
  grips: (ChordGripSpec | null)[];
}

export interface CompingAlignment {
  lines: CompingAlignmentLine[];
}

/**
 * For each V:2 comping event, finds the chord grip active at that moment in
 * V:1 — "active" means the most recently written grip at or before the
 * comping event's time position, held forward until the next one (a chord
 * holds until the next chord symbol). Time position is cumulative `duration`
 * from the tune's start, walked in written order across all lines (not real
 * seconds, so it's tempo-independent) — both voices share one written bar
 * structure, so this stays correct without unrolling repeats.
 *
 * `active` is intentionally declared outside the per-event loop and only
 * reassigned when the melody-timeline pointer actually advances, so a grip
 * correctly holds across several consecutive comping notes even when none of
 * them coincide with a new V:1 event.
 */
export function alignCompingToGrips(
  compingVoice: CompingVoice,
  flattened: FlattenedTune,
  chordGripOverlay: ChordGripOverlay,
): CompingAlignment {
  const melodyTimeline: { time: number; grip: ChordGripSpec | null }[] = [];
  let melodyTime = 0;
  flattened.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      melodyTimeline.push({ time: melodyTime, grip: chordGripOverlay.lines[lineIndex]?.grips[eventIndex] ?? null });
      melodyTime += event.duration;
    });
  });

  const linesOut: CompingAlignmentLine[] = compingVoice.lines.map((line) => ({
    grips: new Array<ChordGripSpec | null>(line.events.length).fill(null),
  }));

  let melodyIdx = 0;
  let compingTime = 0;
  let active: ChordGripSpec | null = null;
  compingVoice.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      while (melodyIdx < melodyTimeline.length && melodyTimeline[melodyIdx].time <= compingTime) {
        active = melodyTimeline[melodyIdx].grip;
        melodyIdx++;
      }
      linesOut[lineIndex].grips[eventIndex] = active;
      compingTime += event.duration;
    });
  });

  return { lines: linesOut };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- chordComping`
Expected: PASS (8/8)

- [ ] **Step 5: Commit**

```bash
git add src/abc/chordComping.ts src/abc/chordComping.test.ts
git commit -m "feat: align comping-voice notes to the active chord grip by time position"
```

---

### Task 3: `chordComping.ts` — guitar-tuning pitch derivation and ABC text expansion

**Files:**
- Modify: `src/abc/chordComping.ts`
- Test: `src/abc/chordComping.test.ts`

**Interfaces:**
- Consumes: `CompingVoice`, `CompingAlignment` (Tasks 1-2); `ChordGripSpec`, `ChordGripMarker`, `extractChordGrips`, `computeChordGripOverlay` (`src/abc/chordGrips.ts`); `FlattenedTune`.
- Produces (used by Tasks 4, 5, 8):
  ```ts
  export function gripToMidiNotes(spec: ChordGripSpec): number[];
  export function midiToAbcNote(midi: number): string;
  export function expandCompingVoice(cleanAbc: string, compingVoice: CompingVoice, alignment: CompingAlignment): string;
  export function expandTuneForPlayback(cleanAbc: string, tune: abcjs.TuneObject, grips: ChordGripMarker[], flattened: FlattenedTune): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/abc/chordComping.test.ts
import { expandCompingVoice, expandTuneForPlayback, gripToMidiNotes, midiToAbcNote } from './chordComping';

describe('gripToMidiNotes', () => {
  it('maps an open-position grip to real pitches via standard guitar tuning', () => {
    // frets: low E open, A muted, D fret2, G fret3, B muted, high E open
    const notes = gripToMidiNotes({ startFret: 0, frets: [0, null, 2, 3, null, 0] });
    expect(notes).toEqual([40, 52, 58, 64]); // E2, D3+2, G3+3, E4
  });

  it('adds startFret as an offset for a moveable-shape grip', () => {
    const notes = gripToMidiNotes({ startFret: 3, frets: [0, 1, 2, 3, 4, 5] });
    expect(notes).toEqual([43, 49, 55, 61, 66, 72]);
  });

  it('returns an empty list for a fully-muted grip', () => {
    expect(gripToMidiNotes({ startFret: 0, frets: [null, null, null, null, null, null] })).toEqual([]);
  });
});

describe('midiToAbcNote', () => {
  it('renders standard open-string tuning pitches with the conventional ABC guitar octave marks', () => {
    expect(midiToAbcNote(40)).toBe('E,,'); // E2
    expect(midiToAbcNote(45)).toBe('A,,'); // A2
    expect(midiToAbcNote(50)).toBe('D,');  // D3
    expect(midiToAbcNote(55)).toBe('G,');  // G3
    expect(midiToAbcNote(59)).toBe('B,');  // B3
    expect(midiToAbcNote(64)).toBe('E');   // E4
  });

  it('uses a sharp accidental prefix for black-key pitch classes', () => {
    expect(midiToAbcNote(42)).toBe('^F,,'); // F#2 (MIDI 41 is the natural F2 — E to F has no sharp between them)
  });
});

describe('expandCompingVoice', () => {
  it('splices a chord cluster in place of the placeholder pitch, keeping the duration suffix', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    const expanded = expandCompingVoice(cleanAbc, compingVoice, alignment);
    // grip { startFret: 0, frets: [null, null, 3, 4, null, null] } -> frets are semitone offsets,
    // not scale steps: D-string (MIDI 50) + fret 3 = MIDI 53 = F3 = "F,"; G-string (MIDI 55) + fret 4 = MIDI 59 = B3 = "B,"
    expect(expanded).toContain('[F,B,]4');
    expect(expanded).not.toContain('C4');
  });

  it('leaves an already-rest V:2 event untouched', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nz4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    expect(expandCompingVoice(cleanAbc, compingVoice, alignment)).toContain('z4');
  });

  it('converts a note with no active grip yet into a plain rest of the same duration', () => {
    const raw = 'X:1\nK:C\nV:1\nCDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    expect(expandCompingVoice(cleanAbc, compingVoice, alignment)).toContain('z4');
  });

  it('converts a note backed only by a fully-muted grip into a rest, not an empty chord bracket', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xxxxxx$CDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
    const compingVoice = extractCompingVoice(tune)!;
    const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
    const expanded = expandCompingVoice(cleanAbc, compingVoice, alignment);
    expect(expanded).not.toContain('[]');
    expect(expanded).toContain('z4');
  });
});

describe('expandTuneForPlayback', () => {
  it('is a no-op passthrough when the tune has no V:2', () => {
    const raw = 'X:1\nK:C\nCDEF|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    expect(expandTuneForPlayback(cleanAbc, tune, grips, flattened)).toBe(cleanAbc);
  });

  it('produces text that reparses with a real 2-note chord on the second voice', () => {
    const raw = 'X:1\nK:C\nV:1\n$0-xx34xx$CDEF|\nV:2\nC4|\n';
    const { cleanAbc, grips } = extractChordGrips(raw);
    const tune = parseTune(cleanAbc);
    const flattened = flattenTune(tune);
    const expanded = expandTuneForPlayback(cleanAbc, tune, grips, flattened);
    const reparsed = parseTune(expanded);
    const v2Items = reparsed.lines[0].staff![1].voices[0] as unknown as { el_type: string; pitches?: unknown[] }[];
    const noteItem = v2Items.find((it) => it.el_type === 'note');
    // Exact pitch-letter assertions belong to the 'splices a chord cluster' test above
    // (via the raw spliced text) — here we only need to confirm the round-trip through
    // abcjs actually parses as a 2-note chord, not fall back to asserting on abcjs's
    // exact `pitches[].name` string formatting for octave-marked notes, which is untested elsewhere.
    expect(noteItem?.pitches).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- chordComping`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement guitar-tuning derivation and expansion**

```ts
// add to src/abc/chordComping.ts
import type { ChordGripMarker } from './chordGrips';
import { computeChordGripOverlay } from './chordGrips';

/** Low-to-high open-string MIDI numbers, matching ChordGripSpec.frets' own string-index convention. */
const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

export function gripToMidiNotes(spec: ChordGripSpec): number[] {
  const notes: number[] = [];
  spec.frets.forEach((fretOffset, stringIndex) => {
    if (fretOffset === null) return;
    notes.push(STANDARD_TUNING_MIDI[stringIndex] + spec.startFret + fretOffset);
  });
  return notes;
}

const CHROMATIC_LETTERS = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];

/**
 * MIDI note number -> ABC pitch token, using ABC's octave convention (bare
 * uppercase = the octave containing middle C, MIDI 60 = C4 = bare "C";
 * commas drop an octave, apostrophes on the lowercase form raise one) —
 * matches the conventional ABC spelling of open guitar strings (E2 = "E,,").
 */
export function midiToAbcNote(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const letter = CHROMATIC_LETTERS[pitchClass];
  if (octave >= 5) return letter.toLowerCase() + "'".repeat(octave - 5);
  return letter + ','.repeat(4 - octave);
}

function chordClusterAbc(spec: ChordGripSpec): string | null {
  const notes = gripToMidiNotes(spec);
  if (notes.length === 0) return null; // fully-muted grip -> no pitches to sound
  return `[${notes.map(midiToAbcNote).join('')}]`;
}

const PITCH_TOKEN_RE = /^[\^=_]*[A-Ga-g][,']*/;

function durationSuffixOf(sourceText: string): string {
  const match = PITCH_TOKEN_RE.exec(sourceText);
  return match ? sourceText.slice(match[0].length) : sourceText;
}

/**
 * Splices real chord-cluster pitches into V:2's placeholder notes, replacing
 * only the pitch token and preserving each note's original duration suffix
 * verbatim. Edits are applied back-to-front by startChar so earlier offsets
 * stay valid even though replacement text length can differ from the
 * original. Already-rest events are left untouched; a note event with no
 * active grip (or only a fully-muted one) becomes a plain rest.
 */
export function expandCompingVoice(cleanAbc: string, compingVoice: CompingVoice, alignment: CompingAlignment): string {
  const edits: { startChar: number; endChar: number; replacement: string }[] = [];
  compingVoice.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      if (event.kind === 'rest') return;
      const original = cleanAbc.slice(event.startChar, event.endChar);
      const grip = alignment.lines[lineIndex]?.grips[eventIndex] ?? null;
      const cluster = grip ? chordClusterAbc(grip) : null;
      const replacement = cluster ? cluster + durationSuffixOf(original) : 'z' + durationSuffixOf(original);
      edits.push({ startChar: event.startChar, endChar: event.endChar, replacement });
    });
  });

  edits.sort((a, b) => b.startChar - a.startChar);
  let result = cleanAbc;
  for (const { startChar, endChar, replacement } of edits) {
    result = result.slice(0, startChar) + replacement + result.slice(endChar);
  }
  return result;
}

/**
 * Single entry point for playback/print consumers: expands V:2 to real
 * chord pitches when present, otherwise returns cleanAbc unchanged (checked
 * by reference-equal callers to skip a redundant re-parse).
 */
export function expandTuneForPlayback(
  cleanAbc: string,
  tune: abcjs.TuneObject,
  grips: ChordGripMarker[],
  flattened: FlattenedTune,
): string {
  const compingVoice = extractCompingVoice(tune);
  if (!compingVoice) return cleanAbc;
  const chordGripOverlay = computeChordGripOverlay(flattened, grips, cleanAbc);
  const alignment = alignCompingToGrips(compingVoice, flattened, chordGripOverlay);
  return expandCompingVoice(cleanAbc, compingVoice, alignment);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- chordComping`
Expected: PASS (16/16)

- [ ] **Step 5: Commit**

```bash
git add src/abc/chordComping.ts src/abc/chordComping.test.ts
git commit -m "feat: derive real chord pitches from grips and splice them into the comping voice"
```

---

### Task 4: Wire `synthEngine.load()` to expand the comping voice

**Files:**
- Modify: `src/playback/synthEngine.ts:82-105`

**Interfaces:**
- Consumes: `expandTuneForPlayback` (Task 3), existing `extractChordGrips` (must now also keep `grips`, previously discarded).

- [ ] **Step 1: Update `load()`**

```ts
// src/playback/synthEngine.ts — replace the load() body (lines 82-105)
import { expandTuneForPlayback } from '../abc/chordComping';

async load(abcSource: string): Promise<FlattenedTune> {
  this.teardown();

  const { cleanAbc: afterKeyMarkers } = extractKeyMarkers(abcSource);
  const { cleanAbc, grips } = extractChordGrips(afterKeyMarkers);
  const parsedTune = parseTune(cleanAbc);
  const parsedFlattened = flattenTune(parsedTune);

  const finalAbc = expandTuneForPlayback(cleanAbc, parsedTune, grips, parsedFlattened);
  const tune = finalAbc === cleanAbc ? parsedTune : parseTune(finalAbc);
  const flattened = finalAbc === cleanAbc ? parsedFlattened : flattenTune(tune);

  this.timingTable = computeTimingTable(tune, flattened);
  this.currentTune = tune;

  if (!this.audioContext) {
    this.audioContext = new (getAudioContextCtor())();
  }

  this.synth = await this.createSynth(tune);

  this.elapsedAtLastStart = 0;
  return flattened;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Manual smoke check (no unit tests exist for this file today — it's AudioContext-dependent, matching existing convention)**

Run: `npm run dev`, open a tune with no `V:2` in the browser, confirm playback still works exactly as before (regression guard for the untouched path).

- [ ] **Step 4: Commit**

```bash
git add src/playback/synthEngine.ts
git commit -m "feat: expand comping voice to real chord pitches before synth playback"
```

---

### Task 5: Wire `PrintView` to expand the comping voice

**Files:**
- Modify: `src/print/PrintView.tsx:11-18`

**Interfaces:**
- Consumes: `expandTuneForPlayback` (Task 3), `parseTune`, `flattenTune`.

- [ ] **Step 1: Update the render effect**

```tsx
// src/print/PrintView.tsx — replace lines 11-18
import { parseTune } from '../abc/parseTune';
import { flattenTune } from '../abc/flatten';
import { expandTuneForPlayback } from '../abc/chordComping';

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

  const rafHandle = requestAnimationFrame(() => {
    if (!cancelled) window.print();
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafHandle);
  };
}, [payload]);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Print a tune with no `V:2` — confirm output is unchanged from before.

- [ ] **Step 4: Commit**

```bash
git add src/print/PrintView.tsx
git commit -m "feat: expand comping voice to real chord pitches before print rendering"
```

---

### Task 6: `geometry.ts` — comping-row layout constants

**Files:**
- Modify: `src/notation/geometry.ts`

**Interfaces:**
- Produces (used by Task 7, 8):
  ```ts
  export const COMPING_STEM_LENGTH: number;
  export const COMPING_ROW_HEIGHT: number;
  export const COMPING_GRIP_Y_OFFSET: number;       // relative to a line's staffBottomY
  export const COMPING_RHYTHM_LINE_Y_OFFSET: number; // relative to a line's staffBottomY
  ```

- [ ] **Step 1: Add the constants**

```ts
// append to src/notation/geometry.ts
// Chord-comping row: drawn below the staff (unlike the melody-annotation
// chord grips above it, which are unaffected by this feature and can still
// render even on a tune that also has a comping voice — the two are
// independent). Gap sized to keep the rhythm line's short stem clear of the
// grip diagram above it.
export const COMPING_GRIP_TO_STAFF_GAP = 10;
export const COMPING_RHYTHM_TO_GRIP_GAP = 20;
export const COMPING_RHYTHM_LINE_ALLOWANCE = 14;
export const COMPING_STEM_LENGTH = 14; // shorter than the melody's STEM_LENGTH — this is a simplified single-line rhythm strip, not full staff notation
export const COMPING_ROW_HEIGHT =
  COMPING_GRIP_TO_STAFF_GAP + CHORD_GRIP_TOTAL_HEIGHT + COMPING_RHYTHM_TO_GRIP_GAP + COMPING_RHYTHM_LINE_ALLOWANCE;
export const COMPING_GRIP_Y_OFFSET = COMPING_GRIP_TO_STAFF_GAP;
export const COMPING_RHYTHM_LINE_Y_OFFSET = COMPING_GRIP_TO_STAFF_GAP + CHORD_GRIP_TOTAL_HEIGHT + COMPING_RHYTHM_TO_GRIP_GAP;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors (pure additions, nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
git add src/notation/geometry.ts
git commit -m "feat: add layout constants for the chord-comping row"
```

---

### Task 7: `ChordCompingRow` component

**Files:**
- Create: `src/notation/ChordCompingRow.tsx`

**Interfaces:**
- Consumes: `CompingEvent` (Task 1), `ChordGripSpec` (`src/abc/chordGrips.ts`), `ChordGripDiagram` (`src/notation/ChordGripDiagram.tsx`), layout/geometry primitives (`src/notation/geometry.ts`).
- Produces (used by Task 8):
  ```ts
  interface Props { events: CompingEvent[]; grips: (ChordGripSpec | null)[]; gripY: number; rhythmY: number; }
  export function ChordCompingRow(props: Props): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

```tsx
// src/notation/ChordCompingRow.tsx
import type { ChordGripSpec } from '../abc/chordGrips';
import type { CompingEvent } from '../abc/chordComping';
import { ChordGripDiagram } from './ChordGripDiagram';
import {
  COMPING_STEM_LENGTH,
  DOT_GAP,
  DOT_RADIUS,
  FLAG_GAP,
  LEFT_MARGIN,
  NOTE_RADIUS,
  PART_LABEL_WIDTH,
  dotCount,
  eventWidth,
  flagCount,
  hasStem,
  isFilledNotehead,
} from './geometry';

interface Props {
  events: CompingEvent[];
  /** One entry per event in `events`, the chord grip active at that event (or null). */
  grips: (ChordGripSpec | null)[];
  gripY: number;
  rhythmY: number;
}

interface LaidOutEvent {
  x: number;
  event: CompingEvent;
  grip: ChordGripSpec | null;
}

function layoutCompingEvents(events: CompingEvent[], grips: (ChordGripSpec | null)[]): LaidOutEvent[] {
  let x = LEFT_MARGIN + PART_LABEL_WIDTH;
  return events.map((event, i) => {
    const laid: LaidOutEvent = { x, event, grip: grips[i] ?? null };
    x += eventWidth(event.duration);
    return laid;
  });
}

/**
 * True at the first event of each run sharing the same active grip — where a
 * new chord diagram should be drawn. Compares by reference: alignCompingToGrips
 * always reuses the same ChordGripSpec object for a held chord, never clones it.
 */
function isChordChangePoint(laid: LaidOutEvent[], index: number): boolean {
  if (laid[index].grip === null) return false;
  return index === 0 || laid[index - 1].grip !== laid[index].grip;
}

const COLOR = '#334155';

function CompingNote({ x, y, duration }: { x: number; y: number; duration: number }) {
  const filled = isFilledNotehead(duration);
  const stemmed = hasStem(duration);
  const flags = flagCount(duration);
  const dots = dotCount(duration);
  const stemX = x + NOTE_RADIUS - 0.5;
  const stemTipY = y - COMPING_STEM_LENGTH;

  return (
    <g>
      {stemmed && <line x1={stemX} y1={y} x2={stemX} y2={stemTipY} stroke={COLOR} strokeWidth={1.3} />}
      {stemmed &&
        Array.from({ length: flags }).map((_, i) => {
          const flagY = stemTipY + i * FLAG_GAP;
          const nextY = flagY + FLAG_GAP * 0.8;
          return (
            <path
              key={i}
              d={`M ${stemX} ${flagY} Q ${stemX + 9} ${flagY + 6} ${stemX + 6} ${nextY}`}
              fill="none"
              stroke={COLOR}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          );
        })}
      <ellipse
        cx={x}
        cy={y}
        rx={NOTE_RADIUS}
        ry={NOTE_RADIUS * 0.78}
        fill={filled ? COLOR : 'white'}
        stroke={COLOR}
        strokeWidth={filled ? 0 : 1.4}
      />
      {Array.from({ length: dots }).map((_, i) => (
        <circle key={i} cx={x + NOTE_RADIUS + DOT_GAP + i * (2 * DOT_RADIUS + DOT_GAP)} cy={y} r={DOT_RADIUS} fill={COLOR} />
      ))}
    </g>
  );
}

function CompingRest({ x, y, duration }: { x: number; y: number; duration: number }) {
  const dots = dotCount(duration);
  const body =
    duration >= 0.5 ? (
      <rect x={x - 6} y={y - 2} width={12} height={4} fill={COLOR} />
    ) : (
      <g stroke={COLOR} strokeWidth={1.6} fill="none" strokeLinecap="round">
        <line x1={x} y1={y - 10} x2={x} y2={y + 10} />
        {Array.from({ length: Math.max(1, flagCount(duration)) }).map((_, i) => (
          <path key={i} d={`M ${x} ${y - 6 + i * 6} q 6 2 0 8`} />
        ))}
      </g>
    );
  return (
    <>
      {body}
      {Array.from({ length: dots }).map((_, i) => (
        <circle key={i} cx={x + 8 + DOT_GAP + i * (2 * DOT_RADIUS + DOT_GAP)} cy={y} r={DOT_RADIUS} fill={COLOR} />
      ))}
    </>
  );
}

/** One line's worth of the chord-comping voice: grip diagrams at each chord change, plus a single rhythm line beneath the staff. */
export function ChordCompingRow({ events, grips, gripY, rhythmY }: Props) {
  const laid = layoutCompingEvents(events, grips);
  return (
    <g>
      {laid.map((le, i) =>
        isChordChangePoint(laid, i) && le.grip ? (
          <ChordGripDiagram key={`grip-${i}`} spec={le.grip} x={le.x} y={gripY} />
        ) : null,
      )}
      {laid.map((le, i) =>
        le.event.kind === 'rest' ? (
          <CompingRest key={`note-${i}`} x={le.x} y={rhythmY} duration={le.event.duration} />
        ) : (
          <CompingNote key={`note-${i}`} x={le.x} y={rhythmY} duration={le.event.duration} />
        ),
      )}
    </g>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/notation/ChordCompingRow.tsx
git commit -m "feat: add ChordCompingRow component for the chord-comping voice"
```

---

### Task 8: Wire `SheetView` to render the chord-comping row

**Files:**
- Modify: `src/notation/SheetView.tsx`

**Interfaces:**
- Consumes: `extractCompingVoice`, `alignCompingToGrips` (Tasks 1-2), `ChordCompingRow` (Task 7), `COMPING_ROW_HEIGHT`, `COMPING_GRIP_Y_OFFSET`, `COMPING_RHYTHM_LINE_Y_OFFSET` (Task 6).

- [ ] **Step 1: Extend `parseSheet()` and `ParsedSheet`**

```tsx
// src/notation/SheetView.tsx
// add imports
import { extractCompingVoice, alignCompingToGrips, type CompingVoice, type CompingAlignment } from '../abc/chordComping';
import { ChordCompingRow } from './ChordCompingRow';
import {
  COMPING_GRIP_Y_OFFSET,
  COMPING_RHYTHM_LINE_Y_OFFSET,
  COMPING_ROW_HEIGHT,
  // ...existing geometry imports stay as-is
} from './geometry';

// extend ParsedSheet
interface ParsedSheet {
  flattened: FlattenedTune;
  layouts: Map<number, LineLayout>;
  slurSpans: SlurSpan[];
  scaleDegrees: ScaleDegreeOverlay;
  chordGrips: ChordGripOverlay;
  hasGrips: boolean;
  compingVoice: CompingVoice | null;
  compingAlignment: CompingAlignment | null;
  width: number;
  height: number;
}

// inside parseSheet(), after `const chordGrips = computeChordGripOverlay(...)`:
const compingVoice = extractCompingVoice(tune);
const compingAlignment = compingVoice ? alignCompingToGrips(compingVoice, flattened, chordGrips) : null;

// replace the existing lineVerticalGap computation:
const hasGrips = grips.length > 0;
const staffTopOffset = hasGrips ? STAFF_TOP_OFFSET_WITH_GRIPS : STAFF_TOP_OFFSET;
const baseLineVerticalGap = hasGrips ? LINE_VERTICAL_GAP_WITH_GRIPS : LINE_VERTICAL_GAP;
const lineVerticalGap = compingVoice ? baseLineVerticalGap + COMPING_ROW_HEIGHT : baseLineVerticalGap;

// update the final return:
return { flattened, layouts, slurSpans, scaleDegrees, chordGrips, hasGrips, compingVoice, compingAlignment, width: maxWidth, height };
```

- [ ] **Step 2: Destructure the new fields and render the row**

```tsx
// in SheetView(), extend the destructure:
const { flattened, layouts, slurSpans, scaleDegrees, chordGrips, hasGrips, compingVoice, compingAlignment, width, height } = parsed;

// inside the `{[...layouts.values()].map((ll) => { ... })}` block, after the existing
// `{hasGrips && ll.events.map(...)}` block and before the `{ll.bars.map(...)}` block, add:
{compingVoice && (
  <ChordCompingRow
    events={compingVoice.lines[ll.lineIndex]?.events ?? []}
    grips={compingAlignment?.lines[ll.lineIndex]?.grips ?? []}
    gripY={ll.staffBottomY + COMPING_GRIP_Y_OFFSET}
    rhythmY={ll.staffBottomY + COMPING_RHYTHM_LINE_Y_OFFSET}
  />
)}
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `npx tsc -b && npm run test`
Expected: no type errors; all existing tests (including `chordComping.test.ts`) pass.

- [ ] **Step 4: Browser verification via Playwright**

Run `npm run dev`, then use the Playwright MCP tools (`browser_navigate`, `browser_evaluate`, `browser_snapshot`/`browser_take_screenshot` — the convention already established elsewhere in this app for verifying SVG notation output) to:
1. Open any existing tune with no `V:2` and confirm the rendered SVG is unaffected (spot-check via `browser_evaluate` that no `ChordCompingRow` elements exist and staff/line Y-coordinates match pre-change values).
2. Paste a small test tune with `V:1`/`V:2` and a couple of `$grip$` markers into the app's editor (e.g. `X:1\nT:Comping Test\nM:4/4\nL:1/4\nK:C\nV:1\n$0-xx34xx$CDEF|$3-012345$GABc|\nV:2\nC4|C2C2|\n`), then use `browser_evaluate` to read the resulting `<g>`/`<circle>`/`<line>`/`<rect>` elements under the comping row and confirm: two chord-grip diagrams (one per chord-change point), and rhythm-line note/rest marks at the expected x-positions — precise DOM/SVG inspection, not just a screenshot, per this app's established verification approach.

- [ ] **Step 5: Commit**

```bash
git add src/notation/SheetView.tsx
git commit -m "feat: render the chord-comping row in SheetView"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full automated suite**

Run: `npx tsc -b && npm run lint && npm run test && npm run build`
Expected: all green.

- [ ] **Step 2: Browser verification — playback**

Using the Playwright MCP tools, open the comping test tune from Task 8, trigger play, and use `browser_evaluate` to confirm audio actually starts (e.g. `AudioContext.state === 'running'`) with no console errors (`browser_console_messages`) — full pitch-accuracy of playback is already covered by Task 3's `gripToMidiNotes`/`midiToAbcNote`/`expandTuneForPlayback` unit tests, so this step only needs to confirm the wiring doesn't crash.

- [ ] **Step 3: Browser verification — print**

Trigger Print on the comping test tune via the app's UI (Playwright `browser_click`), confirm via `browser_console_messages` that abcjs renders with no errors — a native second staff for the expanded `V:2` (reasonable default engraving) — per the design's decision to let abcjs render it natively rather than build custom print support.

- [ ] **Step 4: Regression pass**

Using Playwright, open 2-3 existing tunes with no `V:2` (including at least one that already uses `$grip$` markers) and confirm via `browser_evaluate`/`browser_console_messages` that sheet rendering, playback, and print are all unchanged from before this feature (no new console errors, no `ChordCompingRow` elements present).
