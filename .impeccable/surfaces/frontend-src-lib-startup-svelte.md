---
version: 1
slug: "frontend-src-lib-startup-svelte"
primary_target: "frontend/src/lib/Startup.svelte"
related_targets: ["frontend/src/lib/ProfileSettings.svelte","frontend/src/App.svelte"]
---

# Fresh startup and preview profiles

Mode: Operate. Audience: a friend opening a preview, or an existing Music user comparing versions. The first useful moment is seeing their own collection and playing from it. Inherit DESIGN.md and the neutral Studio default.

## Direction contract

THESIS: start listening to local music with one action; the system Music folder is selected and additional folders are easy to include. Spotify is secondary, configured only in Settings.
OWN-WORLD: existing charcoal surfaces, Avenir/system UI text, neutral outlined controls and flat source rows. No replacement identity or invented album artwork.
STORY: review the selected folders, add an archive in place, open the collection, search and play a real song. Default and custom locations combine without copying audio. Keep profile copy and continue available for returning users.
FIRST VIEWPORT: bounded 720px content, Music/build identity above a 36px heading, a flat folder list with paths and removal controls, an Add music folder action, then Open my library as the primary action. Explore first and copy/continue remain subordinate. Stack actions at 600px. Loading and errors stay within the surface.
FORM: incumbent Settings language extended into an inline startup surface; code-led, no new visual-world selection or raster assets.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Scope: Startup.svelte, ProfileSettings.svelte, desktop folder selection/indexing and first-use library/search. Existing Settings tabs, playback and shared browser login remain intact. Validate real default-folder plus archive MP3 import, searching and playback in an isolated profile. Live Spotify authorization and capture remain outside this validation.

## Preview identity and authored highlights extension

Keep this surface in Operate mode. A friend should immediately identify the
preview's source branch and find the instructions for trying its 3D experience.
Startup places the branch/commit with Music Preview identity and a compact title,
summary and Try it instruction before the music-folder controls. Settings →
Advanced retains the full feature list beside existing build/profile information.
These are inline additions: no new popup, acknowledgment step or interruption.

The content is authored in `desktop/build-highlights.json`, keyed by exact preview
branch, and shared with build metadata, Actions, release text and the portable
README. Stable builds and unmatched preview branches omit the highlights; an
unmatched preview retains its branch identity. Keep claims and Try it instructions
current when features or branch names change.

### Incumbent-system comparison and evidence

The finished extension follows `DESIGN.md`'s neutral charcoal control palette,
readable subordinate text, compact section hierarchy and thin separators. It
adds flat text within Startup and the existing Settings body, with no decorative
cards, accent identity or new visual system. Settings retains its fixed heading
and tabs above one scrolling body. The phone Startup capture wraps instructions
within the available width and leaves folder actions and Explore first visible;
the desktop Settings capture keeps the full feature list within the existing
panel. The Chronocity artwork world remains an explicitly selected experience;
its atmosphere does not become Startup or Settings chrome.

Evidence: `.audit-results/build-info-2026-10-03T13-58-48-091Z/` contains the four-size
assertion results and 13 screenshots. A fresh Astra finish reviewer personally
inspected all 13 and returned **ship** with no material fixes or detector findings
in `review.json`. The documenter additionally inspected `390x844-startup.png` and
`1440x900-settings.png` against the incumbent rules above. The runner's automatic
pending visual marker records its own limit; the separate review supplies the
scoped visual verdict. Root `DESIGN.md`, `PRODUCT.md` and `.impeccable/design.json`
remain unchanged, including any pre-existing documentation drift.

Validation and limitations are recorded in `frontend/tests/agent/README.md`:
all four focused assertion sizes passed, while the broader regression suite still
has its stale selector blocker and desktop tests retain the inherited history
migration failure. Native Mac, live Spotify, touch and FPS remain untested. This
checkpoint documents source and synthetic UI validation, with no new final
installer published yet.
