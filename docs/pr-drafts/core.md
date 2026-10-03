# feat: establish local library discovery and playback

## Summary

Extract the general music application from PR #10 into a complete local-first
foundation. Spotify is a separate stacked follow-up, so directory loading,
discovery, content retrieval and playback can be reviewed and tested on their own.

## User journey

Fresh launch selects the available default Music folder. Add custom folders
alongside it with the native picker, remove unwanted roots, or explore first.
Open my library indexes files in place and shows progress, empty-folder recovery
and scan errors. Search includes local songs, albums, artists and playlists with
separate Play/Add actions. Album covers browse; separate play buttons start
included tracks and expose listening state.

## Key decisions

- Keep shared discovery and artwork/UI in core: Dig, explicit album tags,
  favorites, filtering/sorting, responsive controls, Settings and the unified
  album/Queue/Recently played view are useful without any provider account.
- Canonicalize roots and deduplicate aliases/nested folders. Stable symlinks let
  Navidrome index multiple roots without copying audio or reshuffling identities.
- Serialize actual local audio operations. Preserve duplicate playlist positions,
  queue order and visible state while requests, indexing and refreshes settle.
- Move durable history/FTS queries to a worker-owned Music database, separate from
  Navidrome. Retain origin and shuffle context for accurate replay.
- Include isolated preview profiles, optional copy-existing migration and regular/
  portable build workflows. Portable launchers keep state in adjacent Data so
  versions can coexist without modifying the normal profile.
- Exclude provider bridges, account/device controls, remote-library sync and native
  capture from this PR. Unsupported saved sources cannot replace local playback.

Packaging validation found a hardened-runtime crash in Navidrome’s executable
WASM memory. Scope the required entitlement to the bundled server via a per-file
signing hook, keeping Electron signing options unchanged. The unit test checks
that this exception does not leak to other binaries.

## Validation

See `docs/core-validation.md`: frontend checks are clean; desktop 8/8, frontend
7/7 and fixture 1/1 pass; build/preload pass. Browser interactions pass at all four
required sizes using real silent WAV media playback. A fresh native profile
imported both roots (1,106 songs/124 albums), searched and played an archive MP3,
then exercised queue/history/discovery. Selected screenshots were inspected;
approved references were not changed. Actual speaker output, phone touch and
measured 60 fps remain separate checks.

This description is prepared locally. Publishing is deferred until the core
candidate has been tried and accepted.
