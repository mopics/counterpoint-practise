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

## Persisting tunes (optional local server)

By default new tunes still have to be added by hand under `src/content/**`. Running the
persistence server lets you add and edit tunes from the browser instead — new tunes and
edits to existing ones are saved as JSON files under `server/data/`, without touching the
original `.ts` content files.

In a second terminal, alongside `npm run dev`:

```bash
npm run server
```

This starts a local API on `http://localhost:3001`, which Vite proxies at `/api`. It's a
personal local tool — localhost only, no authentication. If the server isn't running, the
app falls back to the static content in `src/content/**` as usual.

## Build

```bash
npm run build
```

To use the persistence server against a production build, run `npm run server` alongside
`npm run preview` (both proxy configs point at `http://localhost:3001`).
