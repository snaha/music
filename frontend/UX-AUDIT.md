# Core Music UX checklist

Use the synthetic library described in `tests/agent/README.md` for repeatable
browser checks. It exercises local catalog APIs and actual silent WAV playback.
Test 1920×1080, 1440×900, 1024×768 and 390×844. Screenshot capture and passing
interaction assertions do not establish a comparison pass against approved art.

## Library and discovery

- [ ] Artwork leads; hover and keyboard focus reveal usable play actions.
- [ ] Cover opens the album without playing. The separate play button starts
      its included tracks and displays the listening icon only while playing.
- [ ] Album/playlist switching, searching, filters and sorting preserve playback.
- [ ] Search finds albums, songs, artists and playlists. Song Play starts music;
      Add extends the queue without starting it. Clearing search restores the wall.
- [ ] Artist dropdown opens on typing, handles no matches and restores its label
      on Escape. Selection and reset work with mouse and keyboard.
- [ ] Dig Random pick reveals an album without playing. Mood/sound presets use
      explicit user tags; unfamiliarity uses listening history. Do not imply
      automatic audio analysis. An empty tagged selection offers Clear Dig.
- [ ] Album favorite and mood/sound tags persist within the selected profile.
- [ ] Background indexing updates content in place without losing tile order,
      scroll, focus or the playback queue. Empty libraries offer Add music folder;
      scanner failures remain actionable instead of suggesting Reset filters.

## Player and controls

- [ ] Bottom bar background is clickable across its width. Menu opens/closes the
      expanded player; playback/volume controls act independently.
- [ ] Album detail and Queue/Recently played share full contained artwork and its
      color blend. Long titles, multiple discs and track menus fit the viewport.
- [ ] Pause/resume, next/previous, seek, volume, shuffle and random queue work.
      Duplicate playlist occurrences retain identity when moving/removing tracks.
- [ ] History records only successful playback, searches and replays the chosen
      occurrence, and persists after restart. Loading/error messages preserve the
      current session instead of silently replacing it.
- [ ] Nested Escape closes track/options menus before the expanded player and
      restores focus. Keyboard shortcuts do not activate while typing.

## Settings and display

- [ ] Settings is centered with fixed Appearance/Advanced tabs, one scroll area,
      full-width dividers and accessible bottom actions. ESC/X/backdrop close it.
- [ ] Arrow/Home/End navigate category tabs; Tab/Shift+Tab stay in the modal,
      excluding controls inside closed disclosures. Close restores its trigger.
- [ ] Folder/profile controls show actual roots, selected profile and build.
- [ ] Library/Layout/Background/Theme menus open on click, dismiss outside/Escape,
      and keep focus visible. Simple/Advanced sliders answer input immediately.
- [ ] Studio, Classic, Neon and Coss fit at all four sizes. No clipping, overlap,
      hidden actions, horizontal overflow or empty virtualized rows.
- [ ] Idle chrome hides, top-edge/keyboard input reveals it, and scrolling back
      to the top reveals it without moving the wall unexpectedly.

## Native release journey

Use a separate data directory; do not alter normal Music data or original audio.

- [ ] Fresh launch selects the default Music folder when present.
- [ ] Native folder chooser adds a custom folder alongside the default.
- [ ] Open my library starts indexing and shows progress as albums arrive.
- [ ] Search a real song from each root, then play one and observe its advancing
      timer and successful decoder/stream state. Verify audible output separately.
- [ ] Pause, queue another song, inspect history and restart. Roots and history
      remain; playback does not auto-start unexpectedly.
- [ ] A built portable package starts using adjacent Data with no source checkout,
      package manager or Node installation. Fresh and copied profiles stay separate.
- [ ] Restore temporary style/filter changes, stop audit servers, close only
      audit-created browser sessions and reset viewport overrides.

Physical touch, frame rate on a phone, speaker output and external-provider
integration need separate exercised evidence. Current core results are in
`docs/core-validation.md`.
