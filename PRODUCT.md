# Music

<!-- impeccable:product-schema 1 -->

This records the user-supplied requirements and current catalog-search implementation. Broader audience and positioning decisions are not established here.

## Platform

web

The shared Svelte interface runs in browsers and in the Electron Mac app.

## Product Purpose

Browse the music catalog, find albums and songs, and control playback directly. The user requested one search bar for albums, songs and other catalog content, plus shared album/queue artwork views and a bottom bar that opens and closes the expanded player.

## Capabilities and Constraints

- Catalog search includes albums, song titles, artists and playlists in the local library. A visible result-type selector narrows results independently of the wall's album/playlist mode.
- Local album/artist/song search uses the connected Subsonic server's index and pages each result category; playlist names and known collection metadata are also searched.
- Songs have separate playback and queue actions; artist results open their albums. Clearing search returns to the existing cover wall.
- Known matches appear immediately; catalog requests settles in the background. New result groups append in their first-seen order, and updates preserve the visible result anchor, focus and queue. Explicit queries, result-type choices and playback actions remain under user control.
- The desktop app must restart to load changes to its main-process/preload search bridge.
- Fresh desktop startup selects the system Music folder when available and lets users add custom folders alongside it, remove unwanted locations, or explore an empty collection. Open my library starts indexing in place; audio is not copied. Folder selections persist within the profile and are managed in Settings. The core build has no external-provider setup.
- Preview builds use an isolated profile by default. Fresh, copy-existing and continue-preview modes separate the library index, history, tags and preferences; direct use of normal Music data is an advanced opt-in. Profile changes restart the app, and a process lock prevents concurrent writes to a profile.
- Portable packages keep profiles under the launcher's adjacent Data folder. Normal preview downloads keep profiles in the OS application-data directory. Music paths and system permissions remain computer-specific.
- Manual GitHub workflows can publish commit-specific prereleases with regular and portable downloads. Stable version tags publish normal releases. Build and profile metadata are visible in Settings.

## Product Principles

These come from the user's AGENTS.md instructions:

- Inputs answer on the next frame; data settles behind the visible response.
- Background network/scanner work preserves the user's layout, scroll, focus and queue.
- Ongoing work shows its state; performance and direct control matter.

## Validation Scope

Core is folder onboarding, directory indexing, local albums/playlists/artists, catalog search, Dig discovery, favorites/tags, queue/history and playback. Shared artwork, Settings and preview-profile packaging belong here. External-provider integration is a separate follow-up branch.

The core branch must be tested before publishing either replacement PR. Current results and the user test checklist are recorded in `docs/core-validation.md`. Physical speaker output, phone touch and measured frame rate require separate checks. Prior mixed-provider audit results are not proof that this extracted branch passes.
