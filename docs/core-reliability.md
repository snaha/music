# Core reliability and integration boundaries

## State and ownership

- `runtime.ts` starts and stops audio, media-session handlers, scanning, discovery,
  preference synchronization and custom background loading. App owns its lifetime;
  Vite hot disposal also stops it. Importing a player module does not create audio
  elements or start subscriptions.
- `library.svelte.ts` publishes immutable catalog snapshots and a monotonic revision.
  Completed scans invalidate search/details even when the song count does not change.
- `browse-view.ts` contains pure filtering, ranking and order reconciliation.
  `browse-view.svelte.ts` commits ordering history outside derivation. Playback reads
  the registered browse getter synchronously; rendering does not copy its input into
  a shared `visible` field. Background updates retain surviving order and append new
  matches; explicit filtering/sorting establishes a new order.
- Each collection operation owns a loading token. New play intentions invalidate old
  play tokens, while independent Add operations keep their status. An Add captures
  the queue session and account at the click, so a delayed response cannot append to
  a replacement queue.
- Tracks, queue entries and collection occurrences have separate identities.
  `queueEntryId` belongs to the live queue row; `playbackOriginIndex` identifies the
  original album/playlist occurrence, including duplicate tracks. Reordering retains
  queue DOM/focus; replay allocates fresh live queue IDs.

## Search refresh

Each generation accumulates authoritative provider results independently. The prior
snapshot stays visible during a refresh. A same-query refresh reads through the
previously loaded offsets before pruning, preserving surviving result order. Album,
artist, track and playlist lanes remain separate. Failed lanes retain their last
successful snapshot, and obsolete generations cannot publish or clear new loading
state. Deleted files disappear after a successful refresh.

## Shared contracts and providers

`shared/music.ts` defines the catalog domain. `shared/contracts.d.ts` owns desktop,
profile and history DTOs; `shared/contracts.js` validates history and desktop request
boundaries. History writes declare schema version 1; unversioned legacy batches
remain supported. Packaging includes the shared validator module alongside the app resources.
The main process validates the trusted frame and request envelope; full queue/event validation runs once in the database worker, including for direct callers.

`CatalogProvider<Client>` defines domain-level catalog capabilities, pages, tracks
and search results. `local-catalog.ts` adapts Subsonic to this contract. Future Spotify
work should implement an adapter at this boundary and add its PlaybackAdapter to the
existing serial playback controller. Provider authentication and transport data
should stay outside Grid and queue components. Rebase the Spotify follow-up onto
committed core changes before integration; this local candidate does not change that
branch.

## Preferences and compatibility

Device storage uses guarded reads/writes with retryable failed writes. Malformed JSON
falls back without blocking playback. App presents persistence errors and a Retry
saving action. Persisted history remains separate from UI preferences.

The Vite syntax target is Chromium 111, Firefox 114 and Safari 16.4. Missing browser
DOM capabilities require runtime fallbacks: Settings focus checks support browsers
without checkVisibility, and queue menus support browsers without native popovers.
This does not establish physical-device or full cross-browser certification.

## PR review fixes

- Recording a play refreshes all loaded history pages. Filtered history does not
  optimistically insert a nonmatching play; failed refreshes retain visible rows.
- Cover-color fingerprints use stable local artwork IDs, independent of auth salt
  and profile ports. External artwork URLs still invalidate when their URL changes.
- The Dig map previews pointer motion locally and publishes a filter on release.
  Keyboard and preset inputs remain immediate. Dragging does not rerank every frame.
- Artwork views share focus ownership, isolate the library with `inert`, respect
  nested dialogs and keep bottom playback controls available. Explicit opening
  replaces hot corners; closing restores the opener without scrolling.
- Late native play/pause events read the audio element’s current state, so a queued
  event cannot undo a newer transport intention.
- Queue moves/removals preserve surviving shuffle occurrences and the cursor.
  Removing the current occurrence follows its existing shuffled successor.
- The first native window shows before storage import. Import failures/timeouts
  preserve the old data and show a warning; later launches retry. Existing values
  and backgrounds take precedence over partial older imports.
- Startup retries close the HTTP server, terminate the history worker and stop the
  previous child before checking saved ports. Listening failures reject startup
  instead of reporting readiness; shutdown uses the same cleanup path.
- Trusted IPC permits query/hash changes within `app://music/`, while rejecting
  other documents, origins and subframes.

Embeddings and entity schema scaffolding remain deliberately in core for upcoming
work. This does not claim an embedding pipeline is implemented. Spotify-only URI,
external-link and saved-state fields and the unused sidebar were removed from core;
provider interfaces and unavailable-source guards remain.

## Validation

Install both packages with `pnpm --dir frontend install` and
`pnpm --dir desktop install` before running the suites. Desktop integration tests
compile actual frontend rune modules through a frontend-owned compiler export;
they do not depend on an internal `node_modules` file layout.

`pnpm --dir frontend test:unit` runs browser component/rune tests through the actual
Svelte Vite plugin. Set `MUSIC_TEST_BROWSER` to a Chromium executable if needed; the
CI checks install Chromium through the Vitest browser provider's Playwright CLI.
This adds component tests rather than a second application end-to-end harness.

Keep `pnpm --dir desktop test` for SQLite, profiles, packaging and serial playback
checks. Keep `pnpm --dir frontend audit:regressions` for the existing synthetic
application journey at all four viewports. Agent screenshots require inspection;
interaction assertions alone are not visual approval. Native decoding, audible
output, real phone touch and measured frame rate need separate validation.
