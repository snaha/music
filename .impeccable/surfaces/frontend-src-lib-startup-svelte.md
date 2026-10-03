---
version: 1
slug: "frontend-src-lib-startup-svelte"
primary_target: "frontend/src/lib/Startup.svelte"
related_targets: ["frontend/src/lib/ProfileSettings.svelte","frontend/src/App.svelte"]
---

# Fresh startup and preview profiles

Mode: Operate. Audience: a friend opening a preview, or an existing Music user comparing versions. The first useful moment is seeing their own collection and playing from it. Inherit DESIGN.md and the neutral Studio default.

## Direction contract

THESIS: start listening to local music with one action; the system Music folder is selected and additional folders are easy to include. External-provider integration is outside the core build.
OWN-WORLD: existing charcoal surfaces, Avenir/system UI text, neutral outlined controls and flat source rows. No replacement identity or invented album artwork.
STORY: review the selected folders, add an archive in place, open the collection, search and play a real song. Default and custom locations combine without copying audio. Keep profile copy and continue available for returning users.
FIRST VIEWPORT: bounded 720px content, Music/build identity above a 36px heading, a flat folder list with paths and removal controls, an Add music folder action, then Open my library as the primary action. Explore first and copy/continue remain subordinate. Stack actions at 600px. Loading and errors stay within the surface.
FORM: incumbent Settings language extended into an inline startup surface; code-led, no new visual-world selection or raster assets.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Scope: Startup.svelte, ProfileSettings.svelte, desktop folder selection/indexing and first-use library/search. Existing Settings tabs, playback and shared browser login remain intact. Validate real default-folder plus archive MP3 import, searching and playback in an isolated profile. Physical speaker output and phone performance remain outside this validation.
