# YouTube Video Loop Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible video panel docked to the bottom of the ABC text editor that embeds a customizable YouTube video with a settable start/end loop region, so a phrase can play on repeat while transcribing it.

**Architecture:** Three pure logic modules (`src/video/youtubeUrl.ts`, `src/video/timeFormat.ts`, `src/video/loopEnforcement.ts`) carry the URL-parsing, time-formatting, and loop-boundary math, each fully unit tested. A new `VideoLoopStore` persists per-tune video/loop state to `localStorage`, keyed the same way `EditorStore` keys its edit maps. A hand-rolled `YouTubePlayer` wraps the YouTube IFrame Player API behind an imperative handle. `LoopControls` (presentation-only) and `VideoLoopPanel` (wiring) compose these into the panel, which `AbcEditorPanel` renders below its existing textarea.

**Tech Stack:** React 19 + TypeScript + MobX 7 + mobx-react-lite + Vite + Tailwind CSS v4. YouTube IFrame Player API loaded at runtime via `<script>` tag — no new npm dependency.

**Spec:** `docs/superpowers/specs/2026-08-13-video-loop-design.md`

## Global Constraints

- No new npm dependency — the YouTube IFrame Player API is loaded via a runtime `<script src="https://www.youtube.com/iframe_api">` tag, not a package.
- `requestAnimationFrame` polling for time-tracking (never `setInterval`), matching `src/playback/synthEngine.ts`'s existing cursor-timing pattern.
- Per-tune state is keyed by `entry.key ?? entry.id`, matching `EditorStore`'s `keyFor()` convention exactly.
- All `localStorage` reads/writes are wrapped in `try/catch` and silently ignore failure, matching `UiStore`'s existing pattern.
- MobX singleton store pattern: `makeObservable(this, { field: observable, method: actionBound })` in the constructor, exported as `export default new ClassName()`, re-exported from `src/stores/index.ts`.
- `verbatimModuleSyntax` is on — use `import type { X }` (or inline `type` modifiers in a combined import) for type-only imports.
- `noUnusedLocals`/`noUnusedParameters`/`erasableSyntaxOnly` are on — no unused bindings, no `enum`, no parameter-property constructor shorthand.
- No input-time validation against `loopStart < loopEnd` — loop enforcement simply never fires when the end is behind (or equal to) the start; a backwards region is inert, not an error state.
- No component-level automated tests exist anywhere in this codebase (no testing-library dependency) — `.tsx` component tasks are verified by typecheck (`tsc -b`) plus the manual verification pass in the final task, matching how `NoteGlyph`/`ChordSymbolRow` were verified in prior features. Only the pure `.ts` logic modules and MobX stores get Vitest unit tests.

---

### Task 1: YouTube URL parsing

**Files:**
- Create: `src/video/youtubeUrl.ts`
- Test: `src/video/youtubeUrl.test.ts`

**Interfaces:**
- Produces: `export function extractYouTubeVideoId(url: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/video/youtubeUrl.test.ts
import { describe, it, expect } from 'vitest';
import { extractYouTubeVideoId } from './youtubeUrl';

describe('extractYouTubeVideoId', () => {
  it('extracts the ID from a standard watch URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID when extra query params follow v=', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID when extra query params precede v=', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID from a youtu.be short URL', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID from an embed URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a bare 11-character video ID typed directly', () => {
    expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(extractYouTubeVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for an empty string', () => {
    expect(extractYouTubeVideoId('')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(extractYouTubeVideoId('https://example.com/not-a-video')).toBeNull();
  });

  it('returns null for a string that is almost a valid ID but the wrong length', () => {
    expect(extractYouTubeVideoId('short')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/video/youtubeUrl.test.ts --reporter=verbose`
Expected: FAIL — `Failed to resolve import "./youtubeUrl"` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/video/youtubeUrl.ts
const ID_PATTERN = '[A-Za-z0-9_-]{11}';

/**
 * Extracts an 11-character YouTube video ID from a watch/short/embed URL, or
 * accepts a bare ID typed directly. Returns null for anything unparseable.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (new RegExp(`^${ID_PATTERN}$`).test(trimmed)) return trimmed;

  const watchMatch = trimmed.match(new RegExp(`[?&]v=(${ID_PATTERN})`));
  if (watchMatch) return watchMatch[1];

  const shortMatch = trimmed.match(new RegExp(`youtu\\.be/(${ID_PATTERN})`));
  if (shortMatch) return shortMatch[1];

  const embedMatch = trimmed.match(new RegExp(`youtube\\.com/embed/(${ID_PATTERN})`));
  if (embedMatch) return embedMatch[1];

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/video/youtubeUrl.test.ts --reporter=verbose`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/video/youtubeUrl.ts src/video/youtubeUrl.test.ts
git commit -m "Add YouTube URL/video-ID parsing for the video loop panel"
```

---

### Task 2: Time formatting helpers

**Files:**
- Create: `src/video/timeFormat.ts`
- Test: `src/video/timeFormat.test.ts`

**Interfaces:**
- Produces: `export function formatSeconds(totalSeconds: number): string` (e.g. `65` → `"1:05"`)
- Produces: `export function parseTimeInput(text: string): number | null` (accepts `"mm:ss"` or a bare number of seconds)

- [ ] **Step 1: Write the failing test**

```ts
// src/video/timeFormat.test.ts
import { describe, it, expect } from 'vitest';
import { formatSeconds, parseTimeInput } from './timeFormat';

describe('formatSeconds', () => {
  it('formats whole minutes and seconds as mm:ss', () => {
    expect(formatSeconds(65)).toBe('1:05');
  });

  it('pads single-digit seconds with a leading zero', () => {
    expect(formatSeconds(5)).toBe('0:05');
  });

  it('handles zero', () => {
    expect(formatSeconds(0)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatSeconds(65.9)).toBe('1:05');
  });

  it('clamps negative input to zero', () => {
    expect(formatSeconds(-5)).toBe('0:00');
  });

  it('handles minutes above 59 without wrapping', () => {
    expect(formatSeconds(3661)).toBe('61:01');
  });
});

describe('parseTimeInput', () => {
  it('parses mm:ss format', () => {
    expect(parseTimeInput('1:05')).toBe(65);
  });

  it('parses mm:ss with a two-digit minute value', () => {
    expect(parseTimeInput('12:30')).toBe(750);
  });

  it('parses a bare integer as seconds', () => {
    expect(parseTimeInput('90')).toBe(90);
  });

  it('parses a bare decimal as seconds', () => {
    expect(parseTimeInput('90.5')).toBe(90.5);
  });

  it('trims surrounding whitespace', () => {
    expect(parseTimeInput('  1:05  ')).toBe(65);
  });

  it('returns null for an empty string', () => {
    expect(parseTimeInput('')).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseTimeInput('not a time')).toBeNull();
  });

  it('returns null when the seconds component is 60 or more', () => {
    expect(parseTimeInput('1:60')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/video/timeFormat.test.ts --reporter=verbose`
Expected: FAIL — `Failed to resolve import "./timeFormat"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/video/timeFormat.ts
/** Formats a seconds count as "m:ss" (minutes unpadded, seconds zero-padded). */
export function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Parses "mm:ss" or a bare number of seconds. Returns null if unparseable. */
export function parseTimeInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const mmss = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (mmss) {
    const minutes = Number(mmss[1]);
    const seconds = Number(mmss[2]);
    return minutes * 60 + seconds;
  }

  const bare = trimmed.match(/^\d+(\.\d+)?$/);
  if (bare) return Number(trimmed);

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/video/timeFormat.test.ts --reporter=verbose`
Expected: PASS, all 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/video/timeFormat.ts src/video/timeFormat.test.ts
git commit -m "Add mm:ss time formatting/parsing helpers for loop controls"
```

---

### Task 3: Loop enforcement logic

**Files:**
- Create: `src/video/loopEnforcement.ts`
- Test: `src/video/loopEnforcement.test.ts`

**Interfaces:**
- Produces: `export function shouldSeekToLoopStart(currentTime: number, loopEnabled: boolean, loopStart: number | null, loopEnd: number | null): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/video/loopEnforcement.test.ts
import { describe, it, expect } from 'vitest';
import { shouldSeekToLoopStart } from './loopEnforcement';

describe('shouldSeekToLoopStart', () => {
  it('returns false when looping is disabled', () => {
    expect(shouldSeekToLoopStart(10, false, 0, 5)).toBe(false);
  });

  it('returns false when loopStart is unset', () => {
    expect(shouldSeekToLoopStart(10, true, null, 5)).toBe(false);
  });

  it('returns false when loopEnd is unset', () => {
    expect(shouldSeekToLoopStart(10, true, 0, null)).toBe(false);
  });

  it('returns false while current time is still before loopEnd', () => {
    expect(shouldSeekToLoopStart(3, true, 0, 5)).toBe(false);
  });

  it('returns true once current time reaches loopEnd', () => {
    expect(shouldSeekToLoopStart(5, true, 0, 5)).toBe(true);
  });

  it('returns true once current time passes loopEnd', () => {
    expect(shouldSeekToLoopStart(6, true, 0, 5)).toBe(true);
  });

  it('is inert (returns false) when loopEnd is behind loopStart', () => {
    expect(shouldSeekToLoopStart(100, true, 20, 10)).toBe(false);
  });

  it('is inert (returns false) when loopEnd equals loopStart', () => {
    expect(shouldSeekToLoopStart(100, true, 10, 10)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/video/loopEnforcement.test.ts --reporter=verbose`
Expected: FAIL — `Failed to resolve import "./loopEnforcement"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/video/loopEnforcement.ts
/**
 * True when playback has reached the loop's end and should be seeked back
 * to its start. A backwards or zero-length region (loopEnd <= loopStart) is
 * inert rather than an error state — it simply never fires.
 */
export function shouldSeekToLoopStart(
  currentTime: number,
  loopEnabled: boolean,
  loopStart: number | null,
  loopEnd: number | null,
): boolean {
  if (!loopEnabled || loopStart === null || loopEnd === null) return false;
  if (loopEnd <= loopStart) return false;
  return currentTime >= loopEnd;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/video/loopEnforcement.test.ts --reporter=verbose`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/video/loopEnforcement.ts src/video/loopEnforcement.test.ts
git commit -m "Add pure loop-boundary check for the video loop panel"
```

---

### Task 4: VideoLoopStore

**Files:**
- Create: `src/stores/VideoLoopStore.ts`
- Test: `src/stores/VideoLoopStore.test.ts`
- Modify: `src/stores/index.ts`

**Interfaces:**
- Consumes: `AbcData` from `../content` (fields used: `id: string`, `key?: string`)
- Produces: `export interface VideoLoopEntry { url: string; loopStart: number | null; loopEnd: number | null; loopEnabled: boolean }`
- Produces (default export singleton, methods): `entryFor(entry: AbcData): VideoLoopEntry`, `setUrl(entry: AbcData, url: string): void`, `setLoopStart(entry: AbcData, loopStart: number | null): void`, `setLoopEnd(entry: AbcData, loopEnd: number | null): void`, `toggleLoopEnabled(entry: AbcData): void`
- Produces: `src/stores/index.ts` gains `export { default as videoLoopStore } from './VideoLoopStore';`

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/VideoLoopStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AbcData } from '../content';

const ENTRY: AbcData = { id: 'tune-1', title: 'Tune One' };
const OTHER_ENTRY: AbcData = { id: 'tune-2', title: 'Tune Two' };

describe('VideoLoopStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Module-level singleton — reset modules so each test's dynamic
    // import() re-runs the constructor against cleared storage, matching
    // UiStore.test.ts's pattern.
    vi.resetModules();
  });

  it('returns a default empty entry for a tune with nothing saved', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    expect(videoLoopStore.entryFor(ENTRY)).toEqual({ url: '', loopStart: null, loopEnd: null, loopEnabled: false });
  });

  it('setUrl updates only the url field', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setUrl(ENTRY, 'https://youtu.be/abc12345678');
    expect(videoLoopStore.entryFor(ENTRY)).toEqual({
      url: 'https://youtu.be/abc12345678',
      loopStart: null,
      loopEnd: null,
      loopEnabled: false,
    });
  });

  it('keeps entries for different tunes independent', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setUrl(ENTRY, 'https://youtu.be/abc12345678');
    expect(videoLoopStore.entryFor(OTHER_ENTRY).url).toBe('');
  });

  it('setLoopStart and setLoopEnd update independently', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopStart(ENTRY, 10);
    videoLoopStore.setLoopEnd(ENTRY, 20);
    expect(videoLoopStore.entryFor(ENTRY)).toMatchObject({ loopStart: 10, loopEnd: 20 });
  });

  it('toggleLoopEnabled is a no-op when loopStart is unset', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopEnd(ENTRY, 20);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(false);
  });

  it('toggleLoopEnabled is a no-op when loopEnd is unset', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopStart(ENTRY, 10);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(false);
  });

  it('toggleLoopEnabled flips the flag once both loop times are set', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setLoopStart(ENTRY, 10);
    videoLoopStore.setLoopEnd(ENTRY, 20);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(true);
    videoLoopStore.toggleLoopEnabled(ENTRY);
    expect(videoLoopStore.entryFor(ENTRY).loopEnabled).toBe(false);
  });

  it('persists entries to localStorage keyed by entry.key ?? entry.id', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    videoLoopStore.setUrl(ENTRY, 'https://youtu.be/abc12345678');
    const raw = localStorage.getItem('videoLoopEntries');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed['tune-1'].url).toBe('https://youtu.be/abc12345678');
  });

  it('loads persisted entries on module init', async () => {
    localStorage.setItem(
      'videoLoopEntries',
      JSON.stringify({ 'tune-1': { url: 'https://youtu.be/xyz', loopStart: 1, loopEnd: 2, loopEnabled: true } }),
    );
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    expect(videoLoopStore.entryFor(ENTRY)).toEqual({ url: 'https://youtu.be/xyz', loopStart: 1, loopEnd: 2, loopEnabled: true });
  });

  it('uses entry.key over entry.id when both are present', async () => {
    const { default: videoLoopStore } = await import('./VideoLoopStore');
    const keyedEntry: AbcData = { id: 'internal-id', key: 'display-key', title: 'Keyed Tune' };
    videoLoopStore.setUrl(keyedEntry, 'https://youtu.be/abc12345678');
    const raw = JSON.parse(localStorage.getItem('videoLoopEntries')!);
    expect(raw['display-key']).toBeDefined();
    expect(raw['internal-id']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/VideoLoopStore.test.ts --reporter=verbose`
Expected: FAIL — `Failed to resolve import "./VideoLoopStore"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/stores/VideoLoopStore.ts
import { actionBound, makeObservable, observable, runInAction } from 'mobx';
import type { AbcData } from '../content';

const STORAGE_KEY = 'videoLoopEntries';

export interface VideoLoopEntry {
  url: string;
  loopStart: number | null;
  loopEnd: number | null;
  loopEnabled: boolean;
}

function defaultEntry(): VideoLoopEntry {
  return { url: '', loopStart: null, loopEnd: null, loopEnabled: false };
}

function keyFor(entry: AbcData): string {
  return entry.key ?? entry.id;
}

function loadEntries(): Record<string, VideoLoopEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, VideoLoopEntry>) : {};
  } catch {
    return {};
  }
}

/** Per-tune persisted video URL + loop region, keyed the same way EditorStore keys its edit maps. */
class VideoLoopStore {
  private entries = observable.map<string, VideoLoopEntry>(loadEntries());

  constructor() {
    makeObservable(this, {
      setUrl: actionBound,
      setLoopStart: actionBound,
      setLoopEnd: actionBound,
      toggleLoopEnabled: actionBound,
    });
  }

  entryFor(entry: AbcData): VideoLoopEntry {
    return this.entries.get(keyFor(entry)) ?? defaultEntry();
  }

  setUrl(entry: AbcData, url: string): void {
    this.update(entry, { url });
  }

  setLoopStart(entry: AbcData, loopStart: number | null): void {
    this.update(entry, { loopStart });
  }

  setLoopEnd(entry: AbcData, loopEnd: number | null): void {
    this.update(entry, { loopEnd });
  }

  toggleLoopEnabled(entry: AbcData): void {
    const current = this.entryFor(entry);
    if (current.loopStart === null || current.loopEnd === null) return;
    this.update(entry, { loopEnabled: !current.loopEnabled });
  }

  private update(entry: AbcData, patch: Partial<VideoLoopEntry>): void {
    const key = keyFor(entry);
    const next = { ...this.entryFor(entry), ...patch };
    runInAction(() => {
      this.entries.set(key, next);
      this.persist();
    });
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.entries)));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }
}

export default new VideoLoopStore();
```

Then modify `src/stores/index.ts` (add one line, keeping the existing three exports intact):

```ts
export { default as libraryStore } from './LibraryStore';
export { default as playbackStore } from './PlaybackStore';
export { default as editorStore } from './EditorStore';
export { default as uiStore } from './UiStore';
export { default as videoLoopStore } from './VideoLoopStore';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/VideoLoopStore.test.ts --reporter=verbose`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/VideoLoopStore.ts src/stores/VideoLoopStore.test.ts src/stores/index.ts
git commit -m "Add per-tune VideoLoopStore for the video loop panel"
```

---

### Task 5: UiStore gains videoPanelExpanded

**Files:**
- Modify: `src/stores/UiStore.ts`
- Modify: `src/stores/UiStore.test.ts`

**Interfaces:**
- Produces (added to the existing `UiStore` singleton): `videoPanelExpanded: boolean` (observable, default `true`), `toggleVideoPanelExpanded(): void` (actionBound)

- [ ] **Step 1: Write the failing tests**

Append to the existing `src/stores/UiStore.test.ts` (inside the existing `describe('UiStore', ...)` block, after the current four tests):

```ts
  it('defaults videoPanelExpanded to true when nothing is persisted', async () => {
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.videoPanelExpanded).toBe(true);
  });

  it('toggleVideoPanelExpanded flips the value', async () => {
    const { default: uiStore } = await import('./UiStore');
    const initial = uiStore.videoPanelExpanded;
    uiStore.toggleVideoPanelExpanded();
    expect(uiStore.videoPanelExpanded).toBe(!initial);
  });

  it('persists the toggled videoPanelExpanded value to localStorage', async () => {
    const { default: uiStore } = await import('./UiStore');
    uiStore.toggleVideoPanelExpanded();
    expect(localStorage.getItem('videoPanelExpanded')).toBe(String(uiStore.videoPanelExpanded));
  });

  it('loads a persisted false videoPanelExpanded value on module init', async () => {
    localStorage.setItem('videoPanelExpanded', 'false');
    const { default: uiStore } = await import('./UiStore');
    expect(uiStore.videoPanelExpanded).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/UiStore.test.ts --reporter=verbose`
Expected: FAIL — `uiStore.videoPanelExpanded` is `undefined`, `toggleVideoPanelExpanded` is not a function.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/stores/UiStore.ts`:

```ts
import { actionBound, makeObservable, observable } from 'mobx';

const NUMERAL_MODE_KEY = 'numeralMode';
const VIDEO_PANEL_EXPANDED_KEY = 'videoPanelExpanded';

function loadNumeralMode(): boolean {
  try {
    return localStorage.getItem(NUMERAL_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadVideoPanelExpanded(): boolean {
  try {
    const raw = localStorage.getItem(VIDEO_PANEL_EXPANDED_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

class UiStore {
  numeralMode = loadNumeralMode();
  videoPanelExpanded = loadVideoPanelExpanded();

  constructor() {
    makeObservable(this, {
      numeralMode: observable,
      videoPanelExpanded: observable,
      toggleNumeralMode: actionBound,
      toggleVideoPanelExpanded: actionBound,
    });
  }

  toggleNumeralMode(): void {
    this.numeralMode = !this.numeralMode;
    try {
      localStorage.setItem(NUMERAL_MODE_KEY, String(this.numeralMode));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }

  toggleVideoPanelExpanded(): void {
    this.videoPanelExpanded = !this.videoPanelExpanded;
    try {
      localStorage.setItem(VIDEO_PANEL_EXPANDED_KEY, String(this.videoPanelExpanded));
    } catch {
      // ignore persistence failures (e.g. private browsing / storage disabled)
    }
  }
}

export default new UiStore();
```

Note: the `numeralMode` localStorage key string itself (`'numeralMode'`) is unchanged — only the internal constant name changed — so existing persisted user data keeps working.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/UiStore.test.ts --reporter=verbose`
Expected: PASS, all 8 tests (4 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/stores/UiStore.ts src/stores/UiStore.test.ts
git commit -m "Add persisted videoPanelExpanded preference to UiStore"
```

---

### Task 6: YouTube IFrame API types + player wrapper

**Files:**
- Create: `src/video/youtubeIframeApi.d.ts`
- Create: `src/video/YouTubePlayer.tsx`

**Interfaces:**
- Produces: ambient global `YT` namespace (`YT.Player` class, `YT.PlayerOptions`, `YT.PlayerEvents`, `YT.OnStateChangeEvent`) and `Window.YT` / `Window.onYouTubeIframeAPIReady` augmentations
- Produces: `export interface YouTubePlayerHandle { play(): void; pause(): void; seekTo(seconds: number): void; getCurrentTime(): number }`
- Produces: `export const YouTubePlayer: React.ForwardRefExoticComponent<...>` with props `{ videoId: string; onTimeUpdate: (seconds: number) => void }` and `ref: YouTubePlayerHandle`

No unit test for this task — it wraps a browser-only third-party global API with no automated test in this codebase's conventions (see Global Constraints). Verified by typecheck here, and by manual browser verification in the final task.

- [ ] **Step 1: Write the ambient type declarations**

```ts
// src/video/youtubeIframeApi.d.ts
export {};

declare global {
  namespace YT {
    type PlayerState = -1 | 0 | 1 | 2 | 3 | 5;

    interface OnStateChangeEvent {
      data: PlayerState;
      target: Player;
    }

    interface PlayerEvents {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
    }

    interface PlayerOptions {
      videoId?: string;
      events?: PlayerEvents;
    }

    class Player {
      constructor(elementId: string | HTMLElement, options: PlayerOptions);
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      getCurrentTime(): number;
      loadVideoById(videoId: string): void;
      destroy(): void;
    }
  }

  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}
```

- [ ] **Step 2: Write the player wrapper**

```tsx
// src/video/YouTubePlayer.tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
}

interface Props {
  videoId: string;
  onTimeUpdate: (seconds: number) => void;
}

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api';

/** Module-level singleton so the IFrame API script loads exactly once per app session. */
let apiReadyPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = IFRAME_API_URL;
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

/**
 * Hand-rolled wrapper around the YouTube IFrame Player API. The player is
 * created once per mount and updated in place via loadVideoById when
 * videoId changes (not torn down/rebuilt), avoiding reload flicker.
 */
export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, onTimeUpdate },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const rafRef = useRef<number | null>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  useImperativeHandle(
    ref,
    () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    function stopPolling(): void {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function poll(): void {
      const player = playerRef.current;
      if (!player) return;
      onTimeUpdateRef.current(player.getCurrentTime());
      rafRef.current = requestAnimationFrame(poll);
    }

    void loadIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: videoIdRef.current,
        events: {
          onStateChange: (event) => {
            if (event.data === 1) {
              stopPolling();
              rafRef.current = requestAnimationFrame(poll);
            } else if (event.data === 2 || event.data === 0) {
              stopPolling();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopPolling();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.loadVideoById(videoId);
  }, [videoId]);

  return <div ref={containerRef} className="aspect-video w-full" />;
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors from `src/video/youtubeIframeApi.d.ts` or `src/video/YouTubePlayer.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/video/youtubeIframeApi.d.ts src/video/YouTubePlayer.tsx
git commit -m "Add hand-rolled YouTube IFrame Player API wrapper"
```

---

### Task 7: LoopControls (presentation-only)

**Files:**
- Create: `src/components/LoopControls.tsx`

**Interfaces:**
- Consumes: `formatSeconds`, `parseTimeInput` from `../video/timeFormat` (Task 2)
- Produces: `export function LoopControls(props: { loopStart: number | null; loopEnd: number | null; loopEnabled: boolean; currentTime: number; onSetLoopStart: (seconds: number | null) => void; onSetLoopEnd: (seconds: number | null) => void; onToggleLoopEnabled: () => void }): JSX.Element`

No unit test for this task (presentation-only component; see Global Constraints). Verified by typecheck and the final manual verification pass.

- [ ] **Step 1: Write the implementation**

```tsx
// src/components/LoopControls.tsx
import { useEffect, useState } from 'react';
import { formatSeconds, parseTimeInput } from '../video/timeFormat';

interface Props {
  loopStart: number | null;
  loopEnd: number | null;
  loopEnabled: boolean;
  currentTime: number;
  onSetLoopStart: (seconds: number | null) => void;
  onSetLoopEnd: (seconds: number | null) => void;
  onToggleLoopEnabled: () => void;
}

export function LoopControls({
  loopStart,
  loopEnd,
  loopEnabled,
  currentTime,
  onSetLoopStart,
  onSetLoopEnd,
  onToggleLoopEnabled,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-200 px-3 py-2">
      <TimeRow label="Loop start" value={loopStart} onCapture={() => onSetLoopStart(currentTime)} onCommit={onSetLoopStart} />
      <TimeRow label="Loop end" value={loopEnd} onCapture={() => onSetLoopEnd(currentTime)} onCommit={onSetLoopEnd} />
      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
        <input
          type="checkbox"
          checked={loopEnabled}
          disabled={loopStart === null || loopEnd === null}
          onChange={onToggleLoopEnabled}
        />
        Loop enabled
      </label>
    </div>
  );
}

function TimeRow({
  label,
  value,
  onCapture,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCapture: () => void;
  onCommit: (seconds: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : formatSeconds(value));

  useEffect(() => {
    setText(value === null ? '' : formatSeconds(value));
  }, [value]);

  function commit(): void {
    const parsed = parseTimeInput(text);
    onCommit(parsed);
    setText(parsed === null ? '' : formatSeconds(parsed));
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={onCapture}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
      >
        Set from current
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="mm:ss"
        className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-800"
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors from `src/components/LoopControls.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/LoopControls.tsx
git commit -m "Add presentation-only LoopControls component"
```

---

### Task 8: VideoLoopPanel (wiring + loop enforcement)

**Files:**
- Create: `src/components/VideoLoopPanel.tsx`

**Interfaces:**
- Consumes: `extractYouTubeVideoId` (Task 1), `shouldSeekToLoopStart` (Task 3), `videoLoopStore`/`uiStore` from `../stores` (Tasks 4-5), `YouTubePlayer`/`YouTubePlayerHandle` (Task 6), `LoopControls` (Task 7), `AbcData` from `../content`
- Produces: `export const VideoLoopPanel: React.FC<{ entry: AbcData }>`

No unit test for this task (MobX-observer wiring component; see Global Constraints). Verified by typecheck and the final manual verification pass.

- [ ] **Step 1: Write the implementation**

```tsx
// src/components/VideoLoopPanel.tsx
import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { AbcData } from '../content';
import { videoLoopStore, uiStore } from '../stores';
import { extractYouTubeVideoId } from '../video/youtubeUrl';
import { shouldSeekToLoopStart } from '../video/loopEnforcement';
import { YouTubePlayer, type YouTubePlayerHandle } from '../video/YouTubePlayer';
import { LoopControls } from './LoopControls';

interface Props {
  entry: AbcData;
}

export const VideoLoopPanel = observer(function VideoLoopPanel({ entry }: Props) {
  const playerHandle = useRef<YouTubePlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const state = videoLoopStore.entryFor(entry);
  const videoId = extractYouTubeVideoId(state.url);

  function handleTimeUpdate(seconds: number): void {
    setCurrentTime(seconds);
    const { loopEnabled, loopStart, loopEnd } = state;
    if (shouldSeekToLoopStart(seconds, loopEnabled, loopStart, loopEnd) && loopStart !== null) {
      playerHandle.current?.seekTo(loopStart);
    }
  }

  return (
    <div className="flex flex-col border-t border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-medium text-slate-700">Video</span>
        <input
          type="text"
          value={state.url}
          onChange={(e) => videoLoopStore.setUrl(entry, e.target.value)}
          placeholder="YouTube URL or video ID"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800"
        />
        <button
          type="button"
          onClick={() => uiStore.toggleVideoPanelExpanded()}
          className="text-xs text-slate-500 underline hover:text-slate-800"
        >
          {uiStore.videoPanelExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {uiStore.videoPanelExpanded && (
        <>
          {videoId ? (
            <YouTubePlayer ref={playerHandle} videoId={videoId} onTimeUpdate={handleTimeUpdate} />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
              Enter a valid YouTube URL to load a video.
            </div>
          )}
          <LoopControls
            loopStart={state.loopStart}
            loopEnd={state.loopEnd}
            loopEnabled={state.loopEnabled}
            currentTime={currentTime}
            onSetLoopStart={(seconds) => videoLoopStore.setLoopStart(entry, seconds)}
            onSetLoopEnd={(seconds) => videoLoopStore.setLoopEnd(entry, seconds)}
            onToggleLoopEnabled={() => videoLoopStore.toggleLoopEnabled(entry)}
          />
        </>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors from `src/components/VideoLoopPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoLoopPanel.tsx
git commit -m "Add VideoLoopPanel wiring player, loop controls, and store"
```

---

### Task 9: Wire the panel into AbcEditorPanel and App

**Files:**
- Modify: `src/components/AbcEditorPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `VideoLoopPanel` (Task 8), `AbcData` from `../content`
- Produces: `AbcEditorPanel`'s `Props` gains `entry: AbcData`

- [ ] **Step 1: Modify AbcEditorPanel.tsx**

Replace the full contents of `src/components/AbcEditorPanel.tsx`:

```tsx
import type { AbcData } from '../content';
import { VideoLoopPanel } from './VideoLoopPanel';

interface Props {
  entry: AbcData;
  value: string;
  edited: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
}

export function AbcEditorPanel({ entry, value, edited, onChange, onReset }: Props) {
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
      <VideoLoopPanel entry={entry} />
    </div>
  );
}
```

- [ ] **Step 2: Modify App.tsx**

In `src/App.tsx`, update the `<AbcEditorPanel ... />` usage to pass `entry`:

```tsx
          right={
            <AbcEditorPanel
              entry={selected}
              value={editorStore.textFor(selected)}
              edited={editorStore.isEdited(selected)}
              onChange={(text) => editorStore.setText(selected, text)}
              onReset={() => editorStore.resetText(selected)}
            />
          }
```

(Only the `entry={selected}` line is new; everything else in `App.tsx` is unchanged.)

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npx tsc -b`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (existing suite + the new ones from Tasks 1-5).

- [ ] **Step 4: Commit**

```bash
git add src/components/AbcEditorPanel.tsx src/App.tsx
git commit -m "Render VideoLoopPanel at the bottom of the ABC editor panel"
```

---

### Task 10: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run in background: `npm run dev`

- [ ] **Step 2: Navigate and select a tune**

Use the Playwright browser tools to navigate to the dev server URL, take a snapshot, and click a tune in the sidebar (e.g. "Just In Time"). Confirm the video panel appears docked below the ABC textarea, expanded by default, showing the URL input and a "Enter a valid YouTube URL to load a video." placeholder (since no URL is set yet).

- [ ] **Step 3: Load a real video**

Type a real YouTube watch URL (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`) into the video URL field and blur/tab out. Take a screenshot. Confirm the placeholder is replaced by an embedded YouTube iframe. (This step requires the sandboxed browser to reach youtube.com; if it can't, note that as an environment limitation and continue — the placeholder-vs-player branch and everything else below is still fully verifiable.)

- [ ] **Step 4: Set a loop region by typing**

Type `0:05` into the "Loop start" field and `0:10` into the "Loop end" field, tabbing out of each to commit. Confirm both fields display `0:05` / `0:10` after commit, and the "Loop enabled" checkbox is now enabled (not disabled).

- [ ] **Step 5: Enable looping and observe**

Check "Loop enabled". If the video is playing, wait ~6 seconds past the loop end and confirm (via screenshot or the player's visible timestamp) that playback jumps back to ~0:05 instead of continuing past 0:10.

- [ ] **Step 6: Verify persistence across reload**

Reload the page. Confirm the same tune's video URL, loop start/end, and loop-enabled checkbox are all restored exactly as set.

- [ ] **Step 7: Verify per-tune isolation**

Switch to a different tune in the sidebar. Confirm the video panel resets to its own empty state (blank URL, placeholder shown, loop fields empty, "Loop enabled" disabled). Switch back to the first tune and confirm its video/loop state is still intact.

- [ ] **Step 8: Verify collapse/expand persistence**

Click "Collapse". Confirm the panel shrinks to just its header row (URL input + toggle button, no video/loop controls). Reload the page and confirm it's still collapsed. Click "Expand" to restore it.

- [ ] **Step 9: Report results**

Summarize which steps passed, and flag anything that couldn't be verified due to environment constraints (e.g. no outbound network access to youtube.com in the sandbox). No commit for this task.
