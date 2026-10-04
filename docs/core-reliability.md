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
The database repeats validation so direct worker callers follow the same contract.

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

## Validation

`pnpm --dir frontend test:unit` runs browser component/rune tests through the actual
Svelte Vite plugin. Set `MUSIC_TEST_BROWSER` to a Chromium executable if needed; the
CI checks install Chromium through the Vitest browser provider's Playwright CLI.
This adds component tests rather than a second application end-to-end harness.

Keep `pnpm --dir desktop test` for SQLite, profiles, packaging and serial playback
checks. Keep `pnpm --dir frontend audit:regressions` for the existing synthetic
application journey at all four viewports. Agent screenshots require inspection;
interaction assertions alone are not visual approval. Native decoding, audible
output, real phone touch and measured frame rate need separate validation.
