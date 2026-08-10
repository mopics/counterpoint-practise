# Jazz Solo Transcriptions

A jazz transcription/lick library with a custom-built, interactive notation view.

- Parses ABC notation (via `abcjs.parseOnly`) and renders it with a fully custom SVG engraver — abcjs is only used for audio playback, not visual rendering.
- Realtime play cursor synced to a self-computed timing table (duration + tempo), independent of abcjs's own cursor mechanism.
- Click-drag a region on the staff to loop-play just that selection.
- Library content lives in `src/content/**`, grouped by artist/collection in the sidebar.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
