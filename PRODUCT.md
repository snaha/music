# Music

<!-- impeccable:product-schema 1 -->

This records the user-supplied requirements and current catalog-search implementation. Broader audience and positioning decisions are not established here.

## Platform

web

The shared Svelte interface runs in browsers and in the Electron Mac app.

## Product Purpose

Browse the music catalog, find albums and songs, and control playback directly. The user requested one search bar for albums, songs and other catalog content, plus shared album/queue artwork views and a bottom bar that opens and closes the expanded player.

## Capabilities and Constraints

- Catalog search includes albums, song titles, artists and playlists across local music and the saved Spotify library. Visible type and source selectors narrow results independently of the wall's album/playlist mode.
- Local album/artist/song search uses the connected Subsonic server's index and pages each result category; playlist names and known collection metadata are also searched.
- Spotify search reads the saved/indexed catalog on this device, including while disconnected. It does not search Spotify's global catalog. Restricted playlist contents cannot be searched; newly discovered songs appear as indexing completes.
- Songs have separate playback and queue actions; artist results open their albums. Clearing search returns to the existing cover wall.
- Known matches appear immediately; provider work settles in the background. New result groups append in their first-seen order, and updates preserve the visible result anchor, focus and queue. Explicit queries, type/source choices and playback actions remain under user control.
- The desktop app must restart to load changes to its main-process/preload search bridge.
- Fresh desktop startup offers a local music folder, Spotify, or an empty collection to explore. Folder selection is explicit and persisted; files are scanned in place. Spotify connection and output selection use the existing controls and can be skipped.
- Preview builds use an isolated profile by default. Fresh, copy-existing and continue-preview modes separate the library index, history, tags, preferences and Spotify cache; direct use of normal Music data is an advanced opt-in. Profile changes restart the app, and a process lock prevents concurrent writes to a profile.
- Portable packages keep profiles under the launcher's adjacent Data folder. Normal preview downloads keep profiles in the OS application-data directory. Spotify credentials and system permissions remain computer-specific.
- Manual GitHub workflows can publish commit-specific prereleases with regular and portable downloads. Stable version tags publish normal releases. Build and profile metadata are visible in Settings.

## Product Principles

These come from the user's AGENTS.md instructions:

- Inputs answer on the next frame; data settles behind the visible response.
- Background network/scanner work preserves the user's layout, scroll, focus and queue.
- Ongoing work shows its state; performance and direct control matter.

## Evidence on Hand

Search implementation and synthetic preview evidence are scoped in `.audit-results/catalog-search/review-packet.md`. The established visual system is in DESIGN.md; no visual identity change is specified here.

Static checks and synthetic browser checks cover catalog lookup, result paging, song playback controls, artist browsing, no-match recovery, and clearing search. Actual Mac runtime, live Spotify, local audio, account-switch execution, physical touch and 60 fps remain unverified. Error/stale-response guards are source-inspected, not failure-injected in the browser. Synthetic covers and accounts are not real-library evidence.
