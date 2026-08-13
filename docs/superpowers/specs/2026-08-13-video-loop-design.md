# YouTube video loop panel — design

## Background

Transcribing a solo by ear means repeatedly replaying a short phrase from a reference recording while picking out notes. Today that means manually re-seeking a YouTube video (in a separate tab/window) every few seconds. This feature adds a video panel docked to the ABC text editor, with a settable loop region, so a phrase can play on repeat while transcribing it directly into the adjacent ABC editor.

## Goals

- Embed a YouTube video (customizable URL) at the bottom of the ABC editor panel.
- Two loop-boundary controls (start/end), settable either by capturing the player's current time or by typing a time directly.
- When enabled, playback automatically loops between those two points.
- Video URL and loop region are saved per tune and survive a page reload.
- The panel can be collapsed to reclaim editor space when not in use.

## Non-goals

- No validation that a URL actually resolves to a real, playable video — an unparseable URL shows a placeholder; a parseable-but-invalid video ID shows YouTube's own "unavailable" state inside the iframe.
- No playback-speed control, no waveform/scrubber beyond what YouTube's own player chrome already provides.
- No cross-tune "video library" — each tune's video setting is independent; there's no shared/reusable video list.

## Architecture

New files, following this codebase's existing conventions (MobX stores in `src/stores`, small single-purpose components in `src/components`, pure domain logic in its own top-level folder like `src/abc/`):

- `src/video/youtubeUrl.ts` — pure function, URL → video ID.
- `src/video/YouTubePlayer.tsx` — hand-rolled wrapper around the YouTube IFrame Player API (no new npm dependency, consistent with this app's existing preference for hand-rolled integrations over pulling in libraries — e.g. its custom SVG notation renderer and hand-rolled synth wrapper around abcjs's audio API).
- `src/components/LoopControls.tsx` — presentation-only loop start/end/enabled UI.
- `src/components/VideoLoopPanel.tsx` — wires the player, the loop controls, and the store together; owns loop enforcement.
- `src/stores/VideoLoopStore.ts` — per-tune persisted state (URL, loop start/end, loop enabled).
- `src/stores/UiStore.ts` (modified) — gains one more persisted boolean, the panel's collapsed/expanded state (a workspace-layout preference, not tune data, so it belongs alongside `numeralMode` rather than in `VideoLoopStore`).
- `src/components/AbcEditorPanel.tsx` (modified) — renders `VideoLoopPanel` below the existing textarea.
- `src/stores/index.ts` (modified) — exports `videoLoopStore`.
- `src/App.tsx` (modified) — passes the selected library entry down to `VideoLoopPanel`, the same way it already does for `EditorStore`/`PlaybackStore`.

## Data model (`src/stores/VideoLoopStore.ts`)

```ts
interface VideoLoopEntry {
  url: string;
  loopStart: number | null; // seconds
  loopEnd: number | null;   // seconds
  loopEnabled: boolean;
}
```

Keyed per tune the same way `EditorStore` keys its edit maps (`entry.key ?? entry.id`). Stored as one `Record<string, VideoLoopEntry>`, persisted to `localStorage` as a single JSON blob — read on construction, written on every mutation, both wrapped in `try/catch` (mirroring `UiStore`'s existing persistence pattern, scaled from one boolean to a map). `entryFor(entry: AbcData): VideoLoopEntry` returns the stored entry or a default-empty one (`{ url: '', loopStart: null, loopEnd: null, loopEnabled: false }`) when nothing has been saved yet. Mutating actions mirror `PlaybackStore`'s shape: `setUrl`, `setLoopStart`, `setLoopEnd`, `toggleLoopEnabled` (a no-op, matching `PlaybackStore.toggleLoopEnabled`'s existing guard, when either loop time is unset).

## URL parsing (`src/video/youtubeUrl.ts`)

```ts
export function extractYouTubeVideoId(url: string): string | null;
```

Handles `youtube.com/watch?v=ID` (with or without extra query params like `&t=`/`&list=`), `youtu.be/ID`, `youtube.com/embed/ID`, and a bare 11-character video ID typed directly. Returns `null` for anything unparseable; `VideoLoopPanel` shows a placeholder instead of attempting to construct a player when this happens.

## Player wrapper (`src/video/YouTubePlayer.tsx`)

```ts
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
```

A `forwardRef` component exposing `YouTubePlayerHandle` via `useImperativeHandle`, so callers control playback without touching the underlying `YT.Player` directly.

- The IFrame API script (`https://www.youtube.com/iframe_api`) loads exactly once per app session via a module-level singleton promise, resolved by `window.onYouTubeIframeAPIReady`; every mount awaits that promise before constructing its player.
- The player is created once per mount and updated in place via `loadVideoById` when `videoId` changes (not torn down and rebuilt), avoiding a reload flicker when the stored URL changes.
- The IFrame API's `onStateChange` event starts the `requestAnimationFrame` polling loop when the player enters the "playing" state and cancels it on "paused"/"ended" — current time is reported via `onTimeUpdate` on each frame while polling is active, mirroring the polling approach `src/playback/synthEngine.ts` already uses for the sheet-music cursor rather than `setInterval`.
- `player.destroy()` runs on unmount, mirroring `synthEngine.ts`'s `teardown()` on its own audio resources.

## Loop controls (`src/components/LoopControls.tsx`)

Presentation-only; two rows (start, end), each with a "Set from current" button and an editable `mm:ss` text field (parsed back to seconds on blur/Enter, so a captured time can be hand-tuned or a time can be typed directly without ever pressing capture), plus a loop-enabled toggle beneath them. The toggle is disabled whenever either loop time is unset, and the store's `toggleLoopEnabled` guard prevents enabling it via any other path either. No input-time validation against `loopStart < loopEnd` — loop enforcement simply never fires if the end is behind (or equal to) the start, since playback time can never reach an end position that isn't ahead of the start, so a backwards region is inert rather than an error state.

## Wiring and loop enforcement (`src/components/VideoLoopPanel.tsx`)

Owns a `YouTubePlayerHandle` ref and the `onTimeUpdate` callback: when `entry.loopEnabled && currentTime >= entry.loopEnd`, calls `seekTo(entry.loopStart)`. Renders the collapse toggle + URL input in a header row, and — when expanded (`uiStore`'s collapsed/expanded boolean, per the Architecture section) — the `YouTubePlayer` (or the "enter a valid URL" placeholder, when `extractYouTubeVideoId` returns `null`) followed by `LoopControls`.

## Layout

`AbcEditorPanel.tsx` becomes a three-part column: existing header row → existing textarea (still `flex-1`, so it keeps the remaining space) → `VideoLoopPanel` docked at the bottom, non-scrolling. Collapsed, the panel is just its header row (URL input + collapse toggle); expanded, it adds the video and loop controls below that, shrinking the textarea's available height by a fixed amount.
