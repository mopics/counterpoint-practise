# Scale-Degree Numeral Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the old app's hidden `**K**` key-marker feature — rendering notes as scale-degree numerals (e.g. `1`, `b3`, `#5`) instead of noteheads, relative to the most recently seen root — into this app's custom SVG notation renderer.

**Architecture:** A new preprocessing pass strips `**K**` markers from ABC text before parsing (preserving character offsets the rest of the pipeline relies on) and records their positions/roots. A second pure-function pass resolves, for every parsed note, the active root and its scale-degree label, using this app's already-structured pitch data (not a re-scan of raw text, unlike the old app). The result is a separate overlay structure threaded into the existing custom `NoteGlyph` renderer as an optional prop, toggled by a new global MobX store flag persisted to `localStorage`.

**Tech Stack:** React 19, TypeScript, MobX 7 (`makeObservable`/`actionBound`), abcjs 6.7 (parsing only, not rendering), Vite. New: Vitest + jsdom for unit tests (this repo has no test runner yet).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-scale-degree-numerals-design.md` — follow it exactly; this plan implements it task-by-task.
- Degree label tables (`DEGREE_LABEL_FLAT`, `DEGREE_LABEL_SHARP`) and `ROOT_TO_PC` are ported verbatim from the old app's `src/helpers.ts` values — do not alter the label strings or pitch-class numbers.
- `NotationPitch.pitch` is a **diatonic staff-step** value, not chromatic — never use it for pitch-class math. Chromatic pitch class comes from `NotationPitch.name` + `NotationPitch.accidental`, falling back to the tune's key-signature-implied accidentals.
- Marker stripping must replace matched spans with equal-length whitespace, never delete — every `startChar`/`endChar` downstream (`flatten.ts`, `timing.ts`) depends on this.
- New MobX store code follows the existing pattern in `src/stores/PlaybackStore.ts`: `makeObservable(this, { field: observable, method: actionBound })` in the constructor, exported as a `new ClassName()` singleton.
- Rendering/UI changes (NoteGlyph, SheetView, TransportBar, App) are verified manually against the running app — no component-rendering test harness exists in this repo and adding one is out of scope. Pure-logic modules (`keyMarkers.ts`, `scaleDegrees.ts`, `UiStore.ts`) get real Vitest unit tests.

---

### Task 1: Add Vitest test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: a `test` npm script (`vitest run`) and a `vitest.config.ts` with `environment: 'jsdom'`, used by every subsequent task's test files.

- [ ] **Step 1: Install Vitest and jsdom**

Run: `npm install --save-dev vitest jsdom`

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In the `"scripts"` block, add:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Verify the runner executes with zero test files**

Run: `npm test`
Expected: Vitest starts, reports "No test files found" (or exits 0/1 depending on Vitest version's empty-run behavior) without a config/startup error. This confirms the harness itself works before any real tests depend on it.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest test infrastructure"
```

---

### Task 2: Marker extraction (`src/abc/keyMarkers.ts`)

**Files:**
- Create: `src/abc/keyMarkers.ts`
- Test: `src/abc/keyMarkers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface KeyMarker {
    charOffset: number; // position in cleanAbc where the marker started
    root: string;        // e.g. "C", "Db", "F#"
  }
  export function extractKeyMarkers(rawAbc: string): { cleanAbc: string; markers: KeyMarker[] };
  ```
  Task 4 and Task 6 both import `KeyMarker` and `extractKeyMarkers` from this exact path.

- [ ] **Step 1: Write the failing tests**

```ts
// src/abc/keyMarkers.test.ts
import { describe, it, expect } from 'vitest';
import { extractKeyMarkers } from './keyMarkers';

describe('extractKeyMarkers', () => {
  it('strips a valid marker and records its offset and root', () => {
    const { cleanAbc, markers } = extractKeyMarkers('CD**Db**EF');
    expect(cleanAbc).toBe('CD      EF');
    expect(markers).toEqual([{ charOffset: 2, root: 'Db' }]);
  });

  it('preserves string length exactly (offset stability)', () => {
    const raw = 'X:1\nK:C\n**F#**CDEF|';
    const { cleanAbc } = extractKeyMarkers(raw);
    expect(cleanAbc.length).toBe(raw.length);
  });

  it('leaves every character after the marker at the same offset', () => {
    const raw = '**C**DEFG';
    const { cleanAbc } = extractKeyMarkers(raw);
    const noteIndex = raw.indexOf('D');
    expect(cleanAbc[noteIndex]).toBe('D');
  });

  it('handles multiple markers, including ones abutting other tokens with no whitespace', () => {
    const raw = '"F-7"**Eb**B,2 G,B,';
    const { markers } = extractKeyMarkers(raw);
    expect(markers).toEqual([{ charOffset: 5, root: 'Eb' }]);
  });

  it('strips invalid marker content as a no-op, without recording a root', () => {
    const { cleanAbc, markers } = extractKeyMarkers('CD**_**EF');
    expect(markers).toEqual([]);
    expect(cleanAbc).toBe('CD     EF');
  });

  it('returns no markers for text with no ** tokens', () => {
    const { cleanAbc, markers } = extractKeyMarkers('CDEFGAB');
    expect(cleanAbc).toBe('CDEFGAB');
    expect(markers).toEqual([]);
  });

  it('records sharp and flat roots correctly', () => {
    const { markers } = extractKeyMarkers('**F#**C **Bb**D');
    expect(markers).toEqual([
      { charOffset: 0, root: 'F#' },
      { charOffset: 8, root: 'Bb' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- keyMarkers`
Expected: FAIL — `Cannot find module './keyMarkers'` (file doesn't exist yet).

- [ ] **Step 3: Implement `extractKeyMarkers`**

```ts
// src/abc/keyMarkers.ts
export interface KeyMarker {
  charOffset: number;
  root: string;
}

const MARKER_RE = /\*\*(.*?)\*\*/g;
const VALID_ROOT_RE = /^[A-G][b#]?$/;

export function extractKeyMarkers(rawAbc: string): { cleanAbc: string; markers: KeyMarker[] } {
  const markers: KeyMarker[] = [];
  const cleanAbc = rawAbc.replace(MARKER_RE, (match, content: string, offset: number) => {
    if (VALID_ROOT_RE.test(content)) {
      markers.push({ charOffset: offset, root: content });
    }
    return ' '.repeat(match.length);
  });
  return { cleanAbc, markers };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- keyMarkers`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/abc/keyMarkers.ts src/abc/keyMarkers.test.ts
git commit -m "Add ABC key-marker extraction"
```

---

### Task 3: `FlattenedTune` key fields (`src/abc/types.ts`, `src/abc/flatten.ts`)

**Files:**
- Modify: `src/abc/types.ts`
- Modify: `src/abc/flatten.ts`
- Test: `src/abc/flatten.test.ts` (new file — `flatten.ts` currently has no tests)

**Interfaces:**
- Consumes: `abcjs.TuneObject.getKeySignature()` (already used in `flatten.ts`), which returns `{ root, acc, mode, accidentals?: Array<{ acc, note, verticalPos }> }`.
- Produces: two new fields on `FlattenedTune` — `keyRoot: string` (e.g. `"Db"`, root + accidental, no mode) and `keyAccidentals: Record<string, string>` (note letter → `AccidentalName`, e.g. `{ B: 'flat' }` for key F). Task 4's `computeScaleDegrees` consumes both by name.

- [ ] **Step 1: Write the failing tests**

```ts
// src/abc/flatten.test.ts
import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';

describe('flattenTune key fields', () => {
  it('extracts keyRoot for a plain major key', () => {
    const tune = parseTune('X:1\nK:D\nDEFG|');
    const flattened = flattenTune(tune);
    expect(flattened.keyRoot).toBe('D');
  });

  it('extracts keyRoot including a sharp on the root itself', () => {
    const tune = parseTune('X:1\nK:F#\nz4|');
    const flattened = flattenTune(tune);
    expect(flattened.keyRoot).toBe('F#');
  });

  it('extracts keyAccidentals for a one-flat key', () => {
    const tune = parseTune('X:1\nK:F\nFGAB|');
    const flattened = flattenTune(tune);
    expect(flattened.keyAccidentals).toEqual({ B: 'flat' });
  });

  it('extracts an empty keyAccidentals map for key of C', () => {
    const tune = parseTune('X:1\nK:C\nCDEF|');
    const flattened = flattenTune(tune);
    expect(flattened.keyAccidentals).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- flatten`
Expected: FAIL — `flattened.keyRoot` is `undefined`, assertions fail (property doesn't exist on the returned object yet).

- [ ] **Step 3: Add the fields to `FlattenedTune`**

In `src/abc/types.ts`, modify the `FlattenedTune` interface:

```ts
export interface FlattenedTune {
  lines: NotationLine[];
  title: string;
  key: string;
  keyRoot: string;
  keyAccidentals: Record<string, string>;
  meter: string;
  qpm: number;
}
```

- [ ] **Step 4: Populate the fields in `flattenTune`**

In `src/abc/flatten.ts`, modify the section building the return value (currently around line 129-144):

```ts
  const key = tune.getKeySignature();
  const meter = tune.getMeter();
  const meterStr =
    meter.type === 'common_time'
      ? 'C'
      : meter.type === 'cut_time'
        ? 'C|'
        : meter.value?.map((v) => `${v.num}/${v.den}`).join(' ') ?? '';

  const keyAccidentals: Record<string, string> = {};
  for (const a of key.accidentals ?? []) {
    keyAccidentals[a.note.toUpperCase()] = a.acc;
  }

  return {
    lines,
    title: tune.metaText.title ?? '',
    key: `${key.root ?? ''}${key.acc ?? ''}${key.mode ?? ''}`,
    keyRoot: `${key.root ?? ''}${key.acc ?? ''}`,
    keyAccidentals,
    meter: meterStr,
    qpm: tune.getBpm(),
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- flatten`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/abc/types.ts src/abc/flatten.ts src/abc/flatten.test.ts
git commit -m "Expose key root and key-signature accidentals on FlattenedTune"
```

---

### Task 4: Scale-degree computation (`src/abc/scaleDegrees.ts`)

**Files:**
- Create: `src/abc/scaleDegrees.ts`
- Test: `src/abc/scaleDegrees.test.ts`

**Interfaces:**
- Consumes:
  - `KeyMarker` / `extractKeyMarkers` from `./keyMarkers` (Task 2).
  - `FlattenedTune.keyRoot` / `FlattenedTune.keyAccidentals` (Task 3).
  - `NotationPitch { pitch, name, accidental, verticalPos, tieStart, tieEnd, slurStart, slurEnd }` and `NotationEvent { kind, pitches, startChar, ... }` from `./types`.
- Produces:
  ```ts
  export interface ScaleDegreeLine {
    degrees: (string[] | null)[]; // index-aligned with NotationLine.events[]; null for rests
  }
  export interface ScaleDegreeOverlay {
    lines: ScaleDegreeLine[]; // index-aligned with FlattenedTune.lines[]
  }
  export function computeScaleDegrees(
    flattened: FlattenedTune,
    markers: KeyMarker[],
    defaultRoot: string,
  ): ScaleDegreeOverlay;
  ```
  Task 6 (`SheetView.tsx`) consumes `computeScaleDegrees` and reads `overlay.lines[lineIndex].degrees[eventIndex]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/abc/scaleDegrees.test.ts
import { describe, it, expect } from 'vitest';
import { parseTune } from './parseTune';
import { flattenTune } from './flatten';
import { extractKeyMarkers } from './keyMarkers';
import { computeScaleDegrees, pitchClassOf, degreeLabel } from './scaleDegrees';
import type { NotationPitch } from './types';

function pitch(name: string, accidental?: string): NotationPitch {
  return { pitch: 0, name, accidental, verticalPos: 0, tieStart: false, tieEnd: false, slurStart: [], slurEnd: [] };
}

describe('pitchClassOf', () => {
  it('resolves a natural note with no accidental and no key implication', () => {
    expect(pitchClassOf(pitch('C'), {})).toBe(0);
  });

  it('resolves an explicit sharp', () => {
    expect(pitchClassOf(pitch('C', 'sharp'), {})).toBe(1);
  });

  it('resolves an explicit flat', () => {
    expect(pitchClassOf(pitch('B', 'flat'), {})).toBe(10);
  });

  it('falls back to a key-implied accidental when the note has none', () => {
    expect(pitchClassOf(pitch('B'), { B: 'flat' })).toBe(10);
  });

  it('lets an explicit accidental override the key-implied one', () => {
    expect(pitchClassOf(pitch('B', 'natural'), { B: 'flat' })).toBe(11);
  });
});

describe('degreeLabel', () => {
  it('labels the root as "1"', () => {
    expect(degreeLabel(0, pitch('C'), {})).toBe('1');
  });

  it('uses flat spelling by default', () => {
    expect(degreeLabel(0, pitch('E', 'flat'), {})).toBe('b3');
  });

  it('uses sharp spelling when the note has an explicit sharp', () => {
    expect(degreeLabel(0, pitch('G', 'sharp'), {})).toBe('#5');
  });

  it('labels a tritone as "tt" regardless of spelling', () => {
    expect(degreeLabel(0, pitch('F', 'sharp'), {})).toBe('tt');
  });
});

describe('computeScaleDegrees', () => {
  it('uses the tune key as the default root when no markers are present', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\nCDEF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['1'], ['2'], ['3'], ['4']]);
  });

  it('applies a marker occurring before the first note to every note', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\n**F**CDEF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['5'], ['6'], ['7'], ['1']]);
  });

  it('carries a root forward only from the point the marker occurs', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\nCD**F**EF|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['1'], ['2'], ['7'], ['1']]);
  });

  it('produces null for rests', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\nCz|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees).toEqual([['1'], null]);
  });

  it('produces one label per pitch for a chord', () => {
    const { cleanAbc, markers } = extractKeyMarkers('X:1\nK:C\n[CE]D|\n');
    const flattened = flattenTune(parseTune(cleanAbc));
    const overlay = computeScaleDegrees(flattened, markers, flattened.keyRoot);
    expect(overlay.lines[0].degrees[0]).toEqual(['1', '3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- scaleDegrees`
Expected: FAIL — `Cannot find module './scaleDegrees'`.

- [ ] **Step 3: Implement `scaleDegrees.ts`**

```ts
// src/abc/scaleDegrees.ts
import type { FlattenedTune, NotationPitch } from './types';
import type { KeyMarker } from './keyMarkers';

const NOTE_LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const ACCIDENTAL_OFFSET: Record<string, number> = {
  natural: 0,
  sharp: 1,
  flat: -1,
  dblsharp: 2,
  dblflat: -2,
  quartersharp: 0,
  quarterflat: 0,
};

const ROOT_TO_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const DEGREE_LABEL_FLAT: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'tt', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_LABEL_SHARP: Record<number, string> = {
  0: '1', 1: '#1', 2: '2', 3: '#2', 4: '3', 5: '4',
  6: 'tt', 7: '5', 8: '#5', 9: '6', 10: '#6', 11: '7',
};

/** Chromatic pitch class (0-11) of a note. `pitch.pitch` is a diatonic staff
 *  step, not chromatic, so this derives the real sounding pitch from the
 *  letter name plus the note's own accidental, falling back to the tune's
 *  key-signature-implied accidental for that letter when the note has none. */
export function pitchClassOf(pitch: NotationPitch, keyAccidentals: Record<string, string>): number {
  const letter = pitch.name.toUpperCase();
  const base = NOTE_LETTER_PC[letter] ?? 0;
  const accidental = pitch.accidental ?? keyAccidentals[letter];
  const offset = accidental ? (ACCIDENTAL_OFFSET[accidental] ?? 0) : 0;
  return ((base + offset) % 12 + 12) % 12;
}

function pcDistance(rootPc: number, notePc: number): number {
  return ((notePc - rootPc) % 12 + 12) % 12;
}

/** Scale-degree label for a note relative to a root pitch class. Sharp
 *  spelling is used only when the note itself carries an explicit sharp. */
export function degreeLabel(rootPc: number, pitch: NotationPitch, keyAccidentals: Record<string, string>): string {
  const dist = pcDistance(rootPc, pitchClassOf(pitch, keyAccidentals));
  const table = pitch.accidental === 'sharp' ? DEGREE_LABEL_SHARP : DEGREE_LABEL_FLAT;
  return table[dist] ?? '?';
}

export interface ScaleDegreeLine {
  degrees: (string[] | null)[];
}

export interface ScaleDegreeOverlay {
  lines: ScaleDegreeLine[];
}

export function computeScaleDegrees(
  flattened: FlattenedTune,
  markers: KeyMarker[],
  defaultRoot: string,
): ScaleDegreeOverlay {
  const sortedMarkers = [...markers].sort((a, b) => a.charOffset - b.charOffset);
  let markerIdx = 0;
  let currentRootPc = ROOT_TO_PC[defaultRoot] ?? 0;

  const allRefs: { lineIndex: number; eventIndex: number; startChar: number }[] = [];
  flattened.lines.forEach((line, lineIndex) => {
    line.events.forEach((event, eventIndex) => {
      allRefs.push({ lineIndex, eventIndex, startChar: event.startChar });
    });
  });
  allRefs.sort((a, b) => a.startChar - b.startChar);

  const linesOut: ScaleDegreeLine[] = flattened.lines.map((line) => ({
    degrees: new Array<string[] | null>(line.events.length).fill(null),
  }));

  for (const { lineIndex, eventIndex, startChar } of allRefs) {
    while (markerIdx < sortedMarkers.length && sortedMarkers[markerIdx].charOffset <= startChar) {
      currentRootPc = ROOT_TO_PC[sortedMarkers[markerIdx].root] ?? currentRootPc;
      markerIdx++;
    }
    const event = flattened.lines[lineIndex].events[eventIndex];
    if (event.kind !== 'note' || !event.pitches?.length) continue;
    linesOut[lineIndex].degrees[eventIndex] = event.pitches.map((p) =>
      degreeLabel(currentRootPc, p, flattened.keyAccidentals),
    );
  }

  return { lines: linesOut };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- scaleDegrees`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/abc/scaleDegrees.ts src/abc/scaleDegrees.test.ts
git commit -m "Add scale-degree computation from key markers and pitch data"
```

---

### Task 5: Render numerals in `NoteGlyph`

**Files:**
- Modify: `src/notation/NoteGlyph.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks — this task only changes `NoteGlyph`'s own props/rendering.
- Produces: `NoteGlyph` gains an optional prop `scaleDegrees?: string[]`, parallel to its existing `pitches` prop. Task 6 passes this prop.

- [ ] **Step 1: Add the `scaleDegrees` prop and render logic**

In `src/notation/NoteGlyph.tsx`, modify the `Props` interface and the per-pitch render loop:

```tsx
interface Props {
  x: number;
  pitches: NotationPitch[];
  duration: number;
  staffBottomY: number;
  noteheadStyle?: string;
  beamed: boolean;
  stemUp: boolean;
  selected?: boolean;
  scaleDegrees?: string[];
}
```

```tsx
export function NoteGlyph({
  x,
  pitches,
  duration,
  staffBottomY,
  noteheadStyle,
  beamed,
  stemUp: up,
  selected,
  scaleDegrees,
}: Props) {
```

Replace the existing per-pitch render block (the `{pitches.map((p, i) => { ... })}` at the end of the component) with:

```tsx
      {pitches.map((p, i) => {
        const y = pitchToY(p.pitch, staffBottomY);
        const degree = scaleDegrees?.[i];
        const color = selected ? '#2563eb' : '#0f172a';
        return (
          <g key={i}>
            {!degree && p.accidental && (
              <AccidentalGlyph
                x={x - NOTE_RADIUS - 9}
                y={y}
                accidental={p.accidental}
                color={selected ? '#2563eb' : '#1e293b'}
              />
            )}
            {degree ? (
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontFamily="Arial, sans-serif" fill={color}>
                {degree}
              </text>
            ) : (
              <NoteHead cx={x} cy={y} filled={filled} style={noteheadStyle} selected={selected} />
            )}
          </g>
        );
      })}
```

- [ ] **Step 2: Manually verify no regression with numeral mode off**

Run: `npm run dev`, open any tune. Since nothing calls `NoteGlyph` with `scaleDegrees` yet (Task 6 not done), confirm notation renders exactly as before — noteheads and accidentals unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/notation/NoteGlyph.tsx
git commit -m "Add optional scale-degree numeral rendering to NoteGlyph"
```

---

### Task 6: Wire the pipeline into `SheetView`

**Files:**
- Modify: `src/notation/SheetView.tsx`

**Interfaces:**
- Consumes:
  - `extractKeyMarkers` from `../abc/keyMarkers` (Task 2).
  - `computeScaleDegrees`, `ScaleDegreeOverlay` from `../abc/scaleDegrees` (Task 4).
  - `FlattenedTune.keyRoot` (Task 3).
  - `NoteGlyph`'s `scaleDegrees?: string[]` prop (Task 5).
- Produces: `SheetView`'s `Props` gains `numeralMode?: boolean`, consumed by Task 8's `App.tsx` change.

- [ ] **Step 1: Update imports and `parseSheet`**

In `src/notation/SheetView.tsx`, add imports:

```ts
import { extractKeyMarkers } from '../abc/keyMarkers';
import { computeScaleDegrees, type ScaleDegreeOverlay } from '../abc/scaleDegrees';
```

Modify `ParsedSheet` and `parseSheet`:

```ts
interface ParsedSheet {
  flattened: FlattenedTune;
  layouts: Map<number, LineLayout>;
  slurSpans: SlurSpan[];
  scaleDegrees: ScaleDegreeOverlay;
  width: number;
  height: number;
}

function parseSheet(abcSource: string): ParsedSheet {
  const { cleanAbc, markers } = extractKeyMarkers(abcSource);
  const tune = parseTune(cleanAbc);
  const flattened = flattenTune(tune);
  if (flattened.lines.length === 0) throw new Error('No parseable tune content');
  const scaleDegrees = computeScaleDegrees(flattened, markers, flattened.keyRoot);
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
  return { flattened, layouts, slurSpans, scaleDegrees, width: maxWidth, height };
}
```

- [ ] **Step 2: Add the `numeralMode` prop**

Modify the `Props` interface:

```ts
interface Props {
  abcSource: string;
  cursor?: EventRef | null;
  selectionStart?: EventRef | null;
  selectionEnd?: EventRef | null;
  numeralMode?: boolean;
  onSelectionChange?: (start: EventRef | null, end: EventRef | null) => void;
}
```

Modify the component signature:

```ts
export const SheetView = memo(function SheetView({
  abcSource,
  cursor,
  selectionStart,
  selectionEnd,
  numeralMode,
  onSelectionChange,
}: Props) {
```

Update the destructure of `parsed` to include `scaleDegrees`:

```ts
  const { flattened, layouts, slurSpans, scaleDegrees, width, height } = parsed;
```

- [ ] **Step 3: Pass `scaleDegrees` into `NoteGlyph`**

In the JSX, modify the `<NoteGlyph>` element (inside the `ll.events.map((le) => { ... })` loop):

```tsx
                    <NoteGlyph
                      x={le.x}
                      pitches={le.event.pitches ?? []}
                      duration={le.event.duration}
                      staffBottomY={ll.staffBottomY}
                      noteheadStyle={le.event.noteheadStyle}
                      beamed={beamInfo.get(le.eventIndex)?.beamed ?? false}
                      stemUp={beamInfo.get(le.eventIndex)?.stemUp ?? true}
                      selected={selected}
                      scaleDegrees={
                        numeralMode ? (scaleDegrees.lines[ll.lineIndex]?.degrees[le.eventIndex] ?? undefined) : undefined
                      }
                    />
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`. Nothing should change visually yet (no caller passes `numeralMode={true}` until Task 8), but confirm the app still loads and renders tunes without console errors — this validates the new parse pipeline (marker extraction + scale-degree computation now run on every render) doesn't break existing parsing.

- [ ] **Step 5: Commit**

```bash
git add src/notation/SheetView.tsx
git commit -m "Wire key-marker parsing and scale-degree computation into SheetView"
```

---

### Task 7: `UiStore` — numeral mode toggle with persistence

**Files:**
- Create: `src/stores/UiStore.ts`
- Test: `src/stores/UiStore.test.ts`
- Modify: `src/stores/index.ts`

**Interfaces:**
- Produces:
  ```ts
  class UiStore {
    numeralMode: boolean;
    toggleNumeralMode(): void;
  }
  export default new UiStore(); // exported as `uiStore` from stores/index.ts
  ```
  Task 8 consumes `uiStore.numeralMode` and `uiStore.toggleNumeralMode`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/stores/UiStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('UiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // UiStore is a module-level singleton (`export default new UiStore()`),
    // constructed once per module instance — reset modules so each test's
    // dynamic import() re-runs the constructor against cleared storage,
    // instead of all tests sharing one singleton's accumulated state.
    vi.resetModules();
  });

  it('defaults numeralMode to false when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.numeralMode).toBe(false);
  });

  it('toggleNumeralMode flips the value', async () => {
    const { default: uiStore } = await import('./UiStore');
    const initial = uiStore.numeralMode;
    uiStore.toggleNumeralMode();
    expect(uiStore.numeralMode).toBe(!initial);
  });

  it('persists the toggled value to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleNumeralMode();
    expect(localStorage.getItem('numeralMode')).toBe(String(uiStore.numeralMode));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- UiStore`
Expected: FAIL — `Cannot find module './UiStore'`.

- [ ] **Step 3: Implement `UiStore.ts`**

```ts
// src/stores/UiStore.ts
import { actionBound, makeObservable, observable } from 'mobx';

const STORAGE_KEY = 'numeralMode';

function loadNumeralMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

class UiStore {
  numeralMode = loadNumeralMode();

  constructor() {
    makeObservable(this, {
      numeralMode: observable,
      toggleNumeralMode: actionBound,
    });
  }

  toggleNumeralMode(): void {
    this.numeralMode = !this.numeralMode;
    try {
      localStorage.setItem(STORAGE_KEY, String(this.numeralMode));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }
}

export default new UiStore();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- UiStore`
Expected: PASS (3 tests).

- [ ] **Step 5: Export `uiStore` from `src/stores/index.ts`**

```ts
export { default as libraryStore } from './LibraryStore';
export { default as playbackStore } from './PlaybackStore';
export { default as editorStore } from './EditorStore';
export { default as uiStore } from './UiStore';
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/UiStore.ts src/stores/UiStore.test.ts src/stores/index.ts
git commit -m "Add UiStore with persisted numeral-mode toggle"
```

---

### Task 8: Toggle button and end-to-end wiring

**Files:**
- Modify: `src/components/TransportBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `uiStore` from `../stores` (Task 7); `SheetView`'s `numeralMode` prop (Task 6).

- [ ] **Step 1: Add the toggle button to `TransportBar`**

In `src/components/TransportBar.tsx`, add the import:

```ts
import { playbackStore, uiStore } from '../stores';
```

Add a new button group after the existing loop-controls divider (after the `Clear selection` button, before the swing divider):

```tsx
      <div className="mx-2 h-5 w-px bg-slate-200" />
      <Button onClick={() => uiStore.toggleNumeralMode()} active={uiStore.numeralMode}>
        🔢 Numerals
      </Button>
```

- [ ] **Step 2: Pass `numeralMode` down from `App`**

In `src/App.tsx`, add `uiStore` to the store import:

```ts
import { libraryStore, playbackStore, editorStore, uiStore } from './stores';
```

Add the prop to `<SheetView>`:

```tsx
            <SheetView
              abcSource={abcSource}
              cursor={playbackStore.cursor}
              selectionStart={playbackStore.loopStart}
              selectionEnd={playbackStore.loopEnd}
              numeralMode={uiStore.numeralMode}
              onSelectionChange={playbackStore.setSelectionRange}
            />
```

- [ ] **Step 3: Manually verify the toggle end-to-end**

Run: `npm run dev`. Open a tune known to contain `**K**` markers — `101 - Bebop II-V7 Patterns` (David Baker) is a good first case (`src/content/david-baker/_101-bebop-II-V7.ts`, markers `**D**`, `**G**`, `**C**` per phrase). Click "🔢 Numerals":
- Noteheads should be replaced by numeral text (`1`, `b3`, etc.); accidental glyphs should disappear on numeral notes.
- Reload the page — numeral mode should still be on (persisted).
- Click "🔢 Numerals" again to turn it off — noteheads should return exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransportBar.tsx src/App.tsx
git commit -m "Add numeral-mode toggle to TransportBar"
```

---

### Task 9: Manual verification across real fixtures

**Files:** None (verification only).

**Interfaces:** None — this task exercises the complete feature built in Tasks 1-8.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: All tests pass (keyMarkers, flatten, scaleDegrees, UiStore).

- [ ] **Step 2: Run the linter and build**

Run: `npm run lint && npm run build`
Expected: Both succeed with no new errors.

- [ ] **Step 3: Verify dense marker sequences**

Run: `npm run dev`. Open "Just In Time" (`src/content/sonny-rollins/JustInTime.ts`) — it has many `**K**` changes per line (`**Bb**`, `**A**`, `**D**`, `**G**`, `**C**`, `**F**`, `**Eb**`, `**Ab**`). Enable numeral mode and confirm the root visibly changes multiple times within a single line, matching the marker positions in the source (visible in the ABC editor panel alongside).

- [ ] **Step 4: Verify the abutting-marker edge case**

Open "Anthropology" (`src/content/tunes/Anthropology.ts`), which has a marker directly abutting a chord symbol with no whitespace (`"F-7"**Eb**B,2 G,B,`) and two markers close together (`"Ab7"**Db**G,B,CD`). Confirm numeral mode renders correctly through this passage with no parse errors or misaligned numerals.

- [ ] **Step 5: Verify the invalid-marker fixture**

Open the tune in `src/content/licks-by-date/30-11-25.ts`, which contains an invalid `**_**` marker. Confirm it loads without error and that no root change happens at that point (the marker is silently ignored, root continues from whatever preceded it).

- [ ] **Step 6: Verify fallback-to-key-signature behavior**

Pick any tune with no `**K**` markers at all. Enable numeral mode and confirm notes render as numerals immediately (relative to the tune's own `K:` header), not as noteheads — this exercises the fallback-root path from the very first note.
