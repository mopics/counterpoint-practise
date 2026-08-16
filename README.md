# Jazz Solo Transcriptions

A jazz transcription/lick library with a custom-built, interactive notation view.

- Parses ABC notation (via `abcjs.parseOnly`) and renders it with a fully custom SVG engraver — abcjs is only used for audio playback, not visual rendering.
- Realtime play cursor synced to a self-computed timing table (duration + tempo), independent of abcjs's own cursor mechanism.
- Click-drag a region on the staff to loop-play just that selection.
- Library content lives in server-side storage under `server/data/library/`, browsable by folder in the sidebar.

## Development

```bash
npm install
npm run dev
```

## Content library (server-required)

All tunes and folders live in server-side storage under `server/data/library/`, edited from the browser — there's no more static content baked into the app. **The server must be running for the app to show anything.**

In a second terminal, alongside `npm run dev`:

```bash
npm run server
```

This starts a local API on `http://localhost:3001`, which Vite proxies at `/api`. It's a personal local tool — localhost only, no authentication. If the server isn't running, the app shows a "can't reach the persistence server" message instead of the library.

Folders and tunes support create, rename, and delete (a folder must be empty before it can be deleted) via the sidebar's breadcrumb-navigated browser.

## Build

```bash
npm run build
```

The server is required in every mode, including a production build — run `npm run server`
alongside `npm run preview` (both proxy configs point at `http://localhost:3001`).
