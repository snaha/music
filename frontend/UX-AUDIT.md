# Visual UX audit — 2026-09-30

## Coverage

Interactive screenshot checks in the in-app browser at 1920×1080, 1440×900,
1024×768 and 390×844. Used the current desktop frontend build, actual cached
Spotify library metadata and local Navidrome library. Spotify playback operations
were stubbed for the responsive audit. Also restarted the repository-local
Electron app and inspected its real toolbar and Settings panel.

Checked card hover and keyboard focus; included-track details; artist search,
selection, reset, no-match results and Escape; Display menus and keyboard
navigation; Simple/Advanced sliders; all three component styles; Settings
scrolling and resizing with Settings open. Narrow windows retain readable cover
sizes. No horizontal page overflow in the inspected layouts; track-detail
section scroll width equals its client width after the fix. Browser error log
was empty during the audited interactions.

## Fixed

- Hover artwork stacked above its own details. Isolated each tile and raised
  the details overlay above the cover; keyboard focus also reveals details.
- Open right menus reserved space and squeezed Settings. Menus now open on
  click, dismiss outside/Escape and close when choosing a panel.
- Settings becomes a bounded, opaque side panel; narrow windows use available
  width. Component previews remain in the right panel.
- Inconsistent pressed toolbar appearance and text-symbol icons. Use SVG icons
  and shared selected-state styling.
- Narrow toolbar wraps into three intentional rows. Cover columns adapt to
  width without overwriting the saved preferred column count.
- Display controls overlapped the first cover row and faded while in use.
  Account for their measured height and keep them visible while enabled.
- Typing in a closed combobox did not open results; dismissed query text remained
  displayed. Open on input and restore the selected label on dismissal.
- Track-row margins created horizontal scrolling; constrain rows and wrap long
  headings and provenance. Spotify capture checkbox text now wraps alongside it.

## Validation and limits

Frontend Svelte/TypeScript checks: zero errors and warnings. Existing desktop
and frontend regression suites passed. Desktop-targeted frontend build passed;
existing crypto-externalization and large Butterchurn-preset warnings remain.

This is a desktop/narrow-window audit, not testing on physical mobile hardware.
Live Spotify playback, OS capture permissions, audio handoffs and 60 fps on a
phone were not revalidated as part of this UI audit.

## Repeatable Mac-app regression checklist

Run after UI changes, using a paused queue. Record app revision, macOS version,
window dimensions, component style and screenshots of failures. Test 1920×1080,
1440×900, 1024×768 and 390×844 where the desktop window supports those sizes;
use a browser for dimensions below the native minimum.

- [ ] Cards show artwork only initially. Hover reveals title, artist, track count
      and actions. Pointer can reach each action without hiding the overlay.
- [ ] Tab to the card and its actions: details appear, focus is visible, and the
      track-list button opens contents without starting playback.
- [ ] Cover click plays only included tracks. Pause afterward.
- [ ] Search artist by typing into a closed field; results open immediately.
      Search an unknown name; show “No matches.” Escape restores selected label.
- [ ] Select artist/source/sort, reset, switch Albums/Playlists and verify the
      current playback queue remains unchanged.
- [ ] Toggle Display repeatedly. First-row covers remain below controls. Change
      the single grid slider, then Advanced columns/spacing, then return to Simple.
- [ ] Menus stay closed on hover. Click opens; outside click and Escape dismiss.
      Arrow keys/Home/End navigate; Escape returns focus to trigger.
- [ ] Open Settings. Content wraps, lower sections scroll, close remains reachable.
      Resize with Settings open and return; no squeezed or clipped panel.
- [ ] Open Components. Try Classic/Studio/Neon, inspect previews, and close.
      Library order, scroll position and playback queue remain unchanged.
- [ ] Open an album with a long title and multiple discs. Included-track rows
      wrap; no horizontal scrolling; Play and Queue actions remain reachable.
- [ ] Scroll a large library, allow background refresh, and verify no empty rows,
      unexpected reshuffling or scroll jump. Filters change only when requested.
- [ ] Hover/focus Library details. Extra counts appear without expanding toolbar.
- [ ] Restore the starting style, filters and grid settings after testing.

Desktop-specific release checks: actual local/Spotify playback handoffs, capture
permission denial/recovery, Spotify restart, external playback changes, no doubled
audio, and visualizer input switching. Physical-touch and frame-rate checks require
real hardware; viewport resizing alone does not cover them.

## Minimal browsing dock

- Opening view: centered Albums / Playlists, search, Surprise me and Filters.
- Source, artist, sort, favorites, reset and library counts live in the expandable filter tray.
- Surprise me reveals a randomly selected cover from the current results. It must not start playback or change the queue.
- Playback transport stays horizontally centered; long track metadata must not overlap it.
- Spotify recovery actions remain visible when playback needs attention; routine ready status is hidden.

## Menu and slider motion

- Rapidly open, close and reopen Display, Settings, Components and filter menus; verify the final state matches the last click.
- Verify keyboard focus and Escape work during transitions, and closed menus cannot receive input.
- Drag each slider and use arrow keys: values must update immediately, without an animation lagging behind the pointer.
- With macOS Reduce Motion enabled, panels and dropdowns must not travel or scale; slider handles must not expand.
- Check animation performance on an actual phone separately from browser viewport checks.
