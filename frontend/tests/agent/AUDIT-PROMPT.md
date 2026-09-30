# Reusable Codex Music regression audit

Audit this repository's current UI against `frontend/UX-AUDIT.md`. Use Codex's
browser/computer controls, or agent-browser if available. Read the appropriate
installed tool documentation first. Do not install another test framework.

1. Run existing desktop regressions and frontend checks. Start
   `pnpm --dir frontend audit:serve` and use its synthetic library. This fixture
   resets preferences on reload, mocks playback and does not need real accounts.
2. Run `pnpm --dir frontend audit:regressions` when agent-browser is available.
   Inspect its failures and screenshots; passing DOM assertions alone does not
   mean the visual audit passed.
3. At 1920×1080, 1440×900, 1024×768 and 390×844, audit every item in the saved
   checklist. Cover mouse hover and keyboard focus, cover/default playback,
   details and queue actions, searchable dropdowns, source/sort/reset, Albums /
   Playlists, Simple/Advanced sliders, Display and Library menus, outside click,
   Escape and keyboard navigation, Settings scrolling and resizing while open,
   Classic/Studio/Neon previews, counts on hover/focus, long titles and track rows.
4. Check clipping, overlap, unexpected layout shifts, hidden focus, inaccessible
   actions, unreadable text, horizontal scrolling and empty virtualized rows.
   Scroll the large fixture library and trigger its synthetic background update
   with `window.__auditRefresh()` through the available test controls. Preserve
   scroll, tile order and the queue. Do not use real Spotify to inject updates.
5. Save screenshots for each size: resting grid, hovered/focused card, dropdown,
   Settings, both layout modes, each menu, each component style and track details.
   Compare with previously approved screenshots where available. Record what was
   compared; lack of a reference is an initial visual review, not a regression pass.
6. Validate the repository-local Music.app separately. Inspect actual hover,
   dropdowns, Display and Settings. Restore preferences and leave playback as
   found. Do not disconnect accounts, change capture permissions or start live
   music solely for visual checks. Report untested audio/touch/performance separately.
7. Report per-check pass/fail/blocked with dimensions, screenshot paths and
   reproduction steps. Fix reproducible UI regressions and rerun affected checks
   plus the four-size smoke checks. Keep failures visible; never approve changed
   references automatically. Save a dated report in `.audit-results/`.
8. Stop the temporary fixture server, close only audit-created browser sessions,
   reset viewport overrides and leave the actual app usable. Do not commit/push
   unless the user requested it.
