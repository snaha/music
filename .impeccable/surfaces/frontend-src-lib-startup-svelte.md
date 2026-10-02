---
version: 1
slug: "frontend-src-lib-startup-svelte"
primary_target: "frontend/src/lib/Startup.svelte"
related_targets: ["frontend/src/lib/ProfileSettings.svelte","frontend/src/App.svelte"]
---

# Fresh startup and preview profiles

Mode: Operate. Audience: a friend opening a preview, or an existing Music user comparing versions. The first useful moment is seeing their own collection and playing from it. Inherit DESIGN.md and the neutral Studio default.

## Direction contract

THESIS: choose a source once, then reach the cover wall. Setup is real folder selection or Spotify authorization, with Explore first available.
OWN-WORLD: existing charcoal surfaces, Avenir/system UI text, neutral outlined controls and flat source rows. No replacement identity or invented album artwork.
STORY: choose a folder without moving audio; connect Spotify using the existing account/output controls; copy normal Music data into an isolated preview after quitting the source.
FIRST VIEWPORT: bounded 720px content, Music/build identity above a 36px heading, two source rows with explicit actions, an Explore first action beside the source group, then optional copy/continue controls. Stack actions at 600px. Loading and errors remain within this surface.
FORM: incumbent Settings language extended into an inline startup surface; code-led, no new visual-world selection or raster assets.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Scope: Startup.svelte, ProfileSettings.svelte, App routing and the first-use library empty state. Existing Settings tabs, playback and shared browser login remain intact. Actual Spotify authorization is not exercised while developing this surface. Signing requires owner-supplied Apple credentials.
