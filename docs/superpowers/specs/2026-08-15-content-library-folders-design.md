# Content library folders — design

## Background

The persistence server built in the prior spec layered server-stored "overrides" and new "My Tunes" entries on top of the 56 hand-authored `.ts` files under `src/content/**`. That was deliberately the minimal first step. This spec goes further: it retires the static content entirely, migrates all of it into the server's storage, and adds a real folder hierarchy — with create, rename, and delete for both folders and tunes — so future tunes never need to be hand-edited into source files, and existing content can be reorganized without touching code.

This is a bigger architectural shift than it first looks, for three reasons:

1. **The override concept disappears.** There's no more "static original" to diff against once everything is server-owned, so editing a tune becomes direct in-place editing of its canonical record — no override/original split, no Reset-to-original button.
2. **The sidebar's navigation model changes.** Today's `TreeNode` renders the entire tree at once, nested and expand/collapsible in place. That doesn't scale to a browsable, editable hierarchy with create/rename/delete actions on every node, so this spec replaces it with folder-at-a-time browsing plus a breadcrumb trail.
3. **The persistence server stops being optional.** Today, if `npm run server` isn't running, the app still works against static content. Once `src/content/**` is deleted, a missing server means no content at all. Accepted as a reasonable tradeoff for a personal local tool — the app needs a real "can't reach the server" state instead of silent degradation.

## Goals

- Every tune and folder lives in server-side storage (`server/data/library/`), with none of it duplicated in `src/content/**` afterward.
- Folders are first-class: create, rename, and delete (delete only when empty), navigable via breadcrumb.
- Tunes: create, rename, edit content, delete — all as direct edits to one canonical record per tune (no override layer).
- A one-time migration script preserves the exact folder/tune structure that exists in `src/content/index.ts`'s `FILE_TREE` today.
- The sidebar becomes folder-at-a-time browsing with a breadcrumb, replacing the always-expanded nested tree.

## Non-goals

- No drag-and-drop move of a tune/folder between parents. Rename only; moving is a future pass if ever needed.
- No version history / undo-past-last-save for tune edits. Editing a tune changes its canonical record; there is no "revert to original" once saved.
- No fallback content path when the server is unreachable. A clear error state replaces silent degradation to static content, since there is no static content left to fall back to.
- No pagination or lazy per-folder fetching. The whole library (all folders + tunes, flat) is fetched once at startup, matching the existing "load everything upfront" pattern — the dataset (~60 tunes today) is small enough that this stays simple and fast.
- No cascading folder delete. Deleting a non-empty folder is rejected (409); the user must empty it first. Prevents silently losing tunes.

## Data model & storage

Two record types, both persisted as one JSON file per record in a single flat directory, `server/data/library/` (replacing the old `server/data/overrides/` + `server/data/tunes/` split — that split existed only to support overrides, which are gone):

```ts
interface VideoRef { url: string; start: string; end: string }

interface FolderRecord {
  id: string;              // stable, server-generated, e.g. "tunes-4f3a9c2b"
  type: 'folder';
  parentId: string | null; // null = root
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface TuneRecord {
  id: string;
  type: 'tune';
  parentId: string | null;
  title: string;
  data: string;             // ABC source
  video?: VideoRef;
  createdAt: string;
  updatedAt: string;
}
```

Filenames are `${id}.json`. `id` is always server-generated at creation time (`slugify(title)-<8 hex chars>`, same generator already used for tunes today) and is **permanent** — renaming only ever changes `title`. `parentId: null` denotes the implicit root; there is no record for the root itself.

This replaces the current `key` field (a full slash-separated path like `lib/tunes/cherokee`) entirely. `key` existed only to disambiguate `id` collisions in the static content (two unrelated tunes both used `id: "cherokee"`) — a problem that doesn't exist once every `id` is server-generated and globally unique. Every consumer of the old dual `id`/`key` system (`EditorStore.keyFor`, `VideoLoopStore`, `PlaybackStore`) simplifies to using `id` alone.

Why flat-with-`parentId` over mirroring real nested directories on disk: renaming a folder must not cascade. A directory-mirrored layout would require physically moving a directory (and fixing up every descendant's path) on rename; a `parentId` pointer makes rename a one-field edit to one file, regardless of how many descendants exist.

## API surface

Base path moves from `/api/tunes` to `/api/library`. `server/tuneStore.ts` becomes `server/libraryStore.ts` (or is rewritten in place — implementer's call), dropping all override-related functions.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/library` | — | `{ nodes: (FolderRecord \| TuneRecord)[] }` — everything, flat |
| POST | `/api/library/folders` | `{ parentId: string \| null; title: string }` | `201 FolderRecord` |
| PUT | `/api/library/folders/:id` | `{ title: string }` | `200 FolderRecord`, `404` if unknown |
| DELETE | `/api/library/folders/:id` | — | `204`; `409` if it has any children; `404` if unknown |
| POST | `/api/library/tunes` | `{ parentId: string \| null; title: string; data: string; video?: VideoRef }` | `201 TuneRecord` |
| PUT | `/api/library/tunes/:id` | `{ title: string; data: string; video?: VideoRef }` | `200 TuneRecord`, `404` if unknown — the **only** edit path for a tune now |
| DELETE | `/api/library/tunes/:id` | — | `204`; `404` if unknown |

**Path-traversal hardening, carried forward and strengthened.** The prior spec fixed a real vulnerability where a client-supplied key was interpolated directly into a filename. This design structurally avoids re-introducing it: every mutating route first does an in-memory lookup — "does a record with this exact `id` exist in the currently-loaded listing?" — and only ever builds a filesystem path from that *found* record's own `id`, never directly from `req.params.id`. This is stricter than a format-validation guard alone (unknown ids 404 before any path is ever constructed) but the `isValidKey`-style allowlist + resolved-path containment check from the prior spec should still be kept on the id generator's output and as a defense-in-depth assertion, in case a future code path ever does construct a path from unvalidated input.

## Migration

A standalone, one-time script, `server/migrate.ts`, run manually via `npx tsx server/migrate.ts` — not wired into any permanent npm script, since it only ever needs to run once.

- Statically imports `FILE_TREE` from `../src/content/index.ts`. This works fine at runtime under `tsx` (which resolves relative imports via Node's own algorithm regardless of `tsconfig` `moduleResolution`), and the script is deliberately excluded from every `tsconfig`'s `include` list so `tsc -b` never has to type-check it under the server project's `nodenext` rules — sidestepping the exact cross-project resolution conflict the prior spec hit and worked around for `server/tuneStore.ts`.
- Walks `FILE_TREE` recursively: each folder node becomes a `FolderRecord`, each leaf becomes a `TuneRecord`, with `parentId` wired to preserve the exact nesting that exists today.
- Refuses to run if `server/data/library/` already contains any files — prevents accidental double-migration.
- Prints a summary (folder count, tune count) on completion, so the result can be sanity-checked in the running app before anything is deleted.

**Sequencing (two separate steps, not one commit):**
1. Run the migration script, start the app + server, manually verify the folder structure and a sample of tunes look right.
2. Only then, delete `src/content/**` (56 files + `index.ts`) and `server/migrate.ts` itself together — the script becomes non-functional the moment `src/content/index.ts` is gone anyway, so there's no reason to keep it around as dead code.

## Frontend changes

- `AbcData`/`FolderRecord`/`TuneRecord` types move out of `src/content/index.ts` (deleted) into `src/api/tunesClient.ts`, which becomes their canonical home. Of the 10 current importers of `AbcData` from `../content`, 9 get repointed to the new location (`AbcEditorPanel.tsx`, `EditorStore.ts`, `LibraryStore.ts`, `VideoLoopPanel.tsx`, `VideoLoopStore.ts`, `PlaybackStore.ts`, `tunesClient.ts`, plus `EditorStore.test.ts` and `VideoLoopStore.test.ts`); the 10th, `TreeNode.tsx`, is deleted outright rather than repointed (see Sidebar UX below).
- `src/api/tunesClient.ts` gains folder endpoints (`createFolder`, `renameFolder`, `deleteFolder`) alongside tune endpoints (`createTune`, `renameTune`/`saveTune`, `deleteTune`), and drops the override functions (`saveOverride`, `deleteOverride`) entirely.
- `LibraryStore` rewrite:
  - Fetches `GET /api/library` once at startup; on failure, sets an observable `loadError` flag instead of silently falling back (there's nothing to fall back to).
  - Builds `Map<id, Node>` and `Map<parentId | null, Node[]>` for O(1) lookup and child listing.
  - New observable `currentFolderId: string | null` (root = `null`), driving what the sidebar shows.
  - Computed `breadcrumb: FolderRecord[]` — walks `parentId` pointers from `currentFolderId` up to root.
  - `childrenOf(folderId: string | null)` — subfolders then tunes, alphabetical by title; `null` returns the root's direct children.
  - `selected: TuneRecord | undefined` (a type change from today's always-defined `selected: AbcData`, since the library now loads asynchronously with nothing to show synchronously first). Once the library loads, it defaults to the first tune found via a depth-first walk from root (same `firstLeaf` semantics the current static tree uses), and `currentFolderId` initializes to that tune's `parentId` — so the app opens with something shown once loaded, and the breadcrumb starts pointing at wherever that tune actually lives, not forced to root. Before the initial load resolves (and if the library is empty), `selected` is `undefined`; `App.tsx`, `SheetView`, and `AbcEditorPanel` — which today all assume `libraryStore.selected` is always defined — need a real loading/empty state instead of that assumption.
  - Actions: `createFolder(title)`, `createTune(title)`, `rename(id, title)`, `remove(id)` — call `tunesClient`, then patch the local maps on success. No more "merge server data over a static tree" logic — the server's data *is* the tree now, which is simpler than the override-merge logic it replaces.
  - Navigating into a folder sets `currentFolderId`; selecting a tune sets both `selected` and `currentFolderId` (to the tune's `parentId`), so the breadcrumb always reflects the selected tune's actual location.
- `EditorStore.save()` simplifies to a single call path (`saveTune(id, input)`) — no more branching on whether a key starts with a "my tunes" prefix, since every tune is now edited the same way. `resetText()` drops its override-deletion branch entirely (there's nothing to revert to on the server; "reset" only ever means "discard my in-progress unsaved edit").
- `TreeNode.tsx` is deleted, replaced by new components for the folder-at-a-time browser (see below).

## Sidebar UX

Replaces the always-expanded nested tree with folder-at-a-time browsing:

- A breadcrumb strip at the top (e.g. "Library / Jazz Method for Trumpet"), each crumb clickable to jump `currentFolderId` back up the chain; the root crumb ("Library") is always present and always clickable.
- Below it, the current folder's contents: subfolders first, then tunes, alphabetically. Clicking a subfolder row navigates into it; clicking a tune row selects it (same role as today's `setSelected`).
- Each row gets inline rename (pencil icon → text input replaces the title, commits on Enter/blur, Escape cancels) and delete (trash icon → `confirm()` dialog, matching the app's existing lack of a modal system) affordances.
- "+ New folder" and "+ New tune" inputs at the bottom of the current folder view (replacing today's single "+ New tune" box), both scoped to `currentFolderId`.
- A folder delete rejected with 409 (non-empty) surfaces as an inline message ("Folder isn't empty") rather than silently failing or attempting a cascade.

## Error handling & resilience

- If the initial `GET /api/library` fails, the sidebar/editor area renders a clear message — "Can't reach the persistence server. Start it with `npm run server`." — rather than a blank or broken screen. This is the one deliberate behavior change from "silent graceful degradation" (the prior spec's philosophy for an *optional* server) to "explicit error state" (appropriate now that the server is load-bearing).
- All other error handling (network failures on individual CRUD calls, non-2xx responses) follows the existing defensive pattern in `tunesClient.ts` — non-throwing, sentinel return values, with the calling store surfacing failure state to the UI (as `EditorStore.save()` already does for tune edits).

## Testing

- Server: CRUD tests for folders and tunes against a temp `server/data/library/` dir (round-trip create/rename/delete for both types), the empty-folder delete guard (409 case), and the id-lookup-then-act pattern (unknown id → 404, never a filesystem operation). Path-traversal hardening tests carried forward from the prior spec, adapted to the new flat-id scheme.
- Frontend: `LibraryStore` tests for flat-nodes → `Map`-based tree construction, `childrenOf`/`breadcrumb` computation, and each CRUD action (including the "server unreachable at startup" `loadError` case). `tunesClient` tests for the new/changed endpoints, following the existing `vi.spyOn(globalThis, 'fetch')` convention.
- No automated tests for the new sidebar components, consistent with this codebase's existing convention (component behavior verified by typecheck plus manual browser verification, as done for the prior persistence-server spec). Manual verification: create a folder, create a tune inside it, rename both, verify breadcrumb navigation, attempt to delete the non-empty folder (expect rejection), empty it, delete it; verify the "server unreachable" state by stopping the server and reloading.
