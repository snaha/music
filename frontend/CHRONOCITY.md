# Chronocity

Chronocity is an optional 3D album-artwork view of the existing music library.
Open Albums or Playlists and choose **Chronocity** in the library toolbar.
Original covers float and turn through real depth and height in an industrial
night environment with weathered concrete, copper pipework and steam. Playlists
are collections that unfold into their actual albums as the camera approaches. Shared playback, queue and track details
remain the app's existing controls.

## Direction contract

THESIS: Fly freely among original album artwork. Covers are thin square objects,
visible from either side; vinyl discs do not substitute for the artwork.

OWN-WORLD: Extend the incumbent “Artwork leads” system. Inherit its UI font,
library toolbar and playback components. Scope weathered concrete, copper
pipework, steel gantries, amber industrial lighting, cool highlights, layered
haze and wet ground to this optional night environment. The user requested a more realistic steampunk / Blade Runner
atmosphere; original artwork remains central and retains its original colors.

STORY: Move forward, sideways and vertically, turn to discover artworks, then
approach, play or open an album. A playlist expands into its real album identities
as the listener moves toward it. Missing years remain Undated.

FIRST VIEWPORT: Large original covers occupy foreground and middle depth, with
smaller elevated covers receding into open space. Album actions sit lower left;
movement, year and playlist controls stay at the edge. Phone framing gives the
selected artwork space above the controls.

FORM: User-directed extension of Chronocity, with free XYZ flight and optional
view-dependent holographic foil and an opt-in cinematic camera tour. Original
artwork is the default. Manual movement answers immediately and takes over from
the tour; deliberate approaches ease. Reduced motion removes ambient flight and
approach easing and disables cinematic tours. This is a scoped surface brief, not a new identity.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

The ordinary-extension branch preserves the existing `DESIGN.md`, `PRODUCT.md`
and `.impeccable/design.json`; this brief records the surface-specific implementation.
Final review disposition must be recorded separately from passing assertions.

## Run

From the repository or this worktree, launch the local desktop app:

```sh
pnpm --dir desktop dev
```

This builds the preload/frontend and opens Electron against the configured local
library. `desktop/bin/navidrome` is present in this worktree. Browser-only
frontend development remains available with `pnpm --dir frontend dev`.

For an isolated synthetic library and mocked playback:

```sh
fnm exec --using 22.21.0 pnpm --dir frontend audit:serve
```

Open the loopback URL printed by the server, then choose Chronocity. The fixture's
SQLite history database requires FTS5; Node 22.21.0 supplies it on this machine.
With an FTS5-capable default Node, `pnpm --dir frontend audit:serve` is sufficient.

## Controls and continuity

- Scroll over the canvas to fly forward/backward; horizontal wheel input strafes.
  Drag the canvas to turn and look up/down. Forward travel follows the camera's
  yaw and pitch. Height is bounded between 2 and 60 scene units.
- Focus the scene or a scene control: W/S or up/down arrows move forward/backward,
  A/D or left/right arrows strafe, and Q/E descend/rise. These movement keys stay
  local to the scene instead of triggering playback shortcuts. Home resets the
  camera; losing focus or hiding the page releases held keys.
- On-screen movement buttons provide forward/backward, turn, rise and descend.
  Select an artwork to approach it; select that approached artwork again to open
  its tracks. **Approach**, **Tracks**, the album title and the shared playback
  and **Queue** controls provide explicit alternatives. Enter opens the selected
  album when the scene itself is focused.
- Previous/next and the release-year selector approach albums. The top-level
  playlist view has a playlist selector. **Entrance** resets the camera;
  **All playlists** leaves the expanded collection and resets the view.
- **Cinematic** starts a camera tour from the selected artwork; **Stop tour**
  leaves the camera at its current pose. The tour eases into a front-facing arc
  with a small dolly and crane movement, then transfers to nearby covers. It uses
  a fixed horizon and field of view for the current viewport, with wider framing
  on phone. It starts off and has an explicit pressed state and takeover hint.
- Manual movement buttons, movement keys, canvas wheel input, canvas pointer-down,
  intentional artwork navigation and scene-focused Escape stop the tour.
  **Entrance** and **All playlists** also stop it. Blocking overlays and hidden
  pages suspend tour time; leaving Chronocity or rebuilding its route stops it.
- **Pause artwork** freezes the artwork flight clock; **Float artwork** resumes it.
  This switch is independent of the camera tour, manual input, intentional
  approaches, ground ripples and steam.
  **Artwork** is the default material; the material button opts into holographic
  foil that responds to viewing angle.
- Search temporarily uses the existing search results. The cover wall remains
  mounted and preserves its scroll while the city is active. Album detail,
  expanded player, Settings, visualizer and hidden-page states suspend the scene
  as appropriate; controls under blocking overlays are inert.

## Library and playlist data

Grid supplies albums or playlists after its existing source, artist, genre,
favorite and Dig filters. Metadata overrides apply. Cover-wall sort and size
controls are hidden in Chronocity. Initial album addresses are ordered by known
release year, then Undated, with stable title/identity tie-breaking. Addresses
occupy layered rooms in a square spiral, rather than one lateral rail.

Background refresh replaces metadata at existing addresses, retains selection
and camera pose, and appends new arrivals. Flight phase is deterministic from the
stable slot and the running clock. Explicit route/filter/account changes rebuild
the layout and clear playlist caches; a newly discovered older album may remain
at the end until that deliberate rebuild.

Approaching within 22 scene units of a playlist starts loading its tracks. The
playlist selector, artwork click or **Explore artwork** can also enter it. Child
covers spread from the collection according to the camera's approach distance;
retreating contracts them, while **All playlists** clears the collection. Album
selection inside the collection uses the normal album playback/details behavior.
A cinematic tour can enter a playlist as it approaches; once real album members
arrive, it retargets from the current camera pose into that collection. Its next
shot stays within the current gallery, choosing a cover within 45 scene units
and preferring unvisited nearby covers. With no eligible neighbor it returns to
the current cover. The front arc lasts 16 seconds; approach duration scales with
distance and has a three-second minimum.

`trackPages` publishes provider pages incrementally (Spotify pagination; local
playlist entries arrive as one provider response). After each page, artworks are
recomputed from `albumInfo.id` or `albumId`, preserving first-seen identity order.
Repeated tracks from one album yield one artwork; distinct edition IDs remain
separate even if their names or cover URLs match. Known catalog metadata or
embedded album metadata supplies the cover/title/year/count. Sparse identities
use the track's available album title, artist and cover, and mark the album
incomplete; their count represents the encountered tracks. Tracks without an
album identity do not invent an artwork.

The visible artwork count updates as pages arrive. Loading, empty metadata and
provider restrictions have explicit states, with Retry and Playlist tracks on
error. Leaving or switching collections invalidates stale responses before they
can publish; it does not claim to abort the provider's in-flight request. Completed
collections are cached for the current route, so revisiting does not refetch until
a route reset. No membership, year, mood or audio feature is inferred from color.

## Engine, resources and fallback

Three.js `WebGPURenderer` owns the 3D scene. Threlte's public context/task API owns
renderer lifecycle and scheduling after successful backend initialization. vgpu's
Vite loader resolves/minifies `street.wgsl` and `foil.wgsl`; `vgpu/three` exposes
the wet-floor and foil functions to Three node materials on WebGPU.

Three falls back to WebGL2 when WebGPU is unavailable. Equivalent TSL graphs
compile to GLSL for that backend; raw WGSL is only used on WebGPU. Append
`?chronocity-backend=webgl` to force fallback verification. Initialization/render
errors show Retry and Return to cover wall. Missing cover URLs use a color
fallback; real-provider image loading/CORS behavior still needs live validation.

The nearby resource budget is 24 artworks, or 16 on coarse pointers, shared by
root and expanded playlist artworks. Spatial queries inspect nearby 40-unit
buckets when the camera crosses a 10-unit cell, rather than scanning the catalog
every frame. Cover textures outside that set are disposed, as are replaced URLs,
labels and materials. Geometry is shared; facade bays, pipework, tanks and
gantries are batched into instanced meshes. Scenery retains a 3×3 set of nine
sections on a fixed 340-unit world grid, sharing geometry and materials. Distant
sections stream in and out as the camera crosses section boundaries; their
nearest geometry transitions beyond roughly 330 units in distance fog. Existing
sections keep their world positions. The environment group no longer follows or
snaps to the camera. Pixel ratio is capped at 1.5. The 3D bundle loads on first
request.

All root and loaded playlist artwork addresses reserve space for artwork motion
and camera approaches. A 40-unit spatial index compares these envelopes with
scenery bounds. An intersecting building, utility gallery or truss is omitted as
a complete prop family, including its attached facade parts. Reservations update
when album or playlist stations change and apply to newly streamed sections as
well as retained ones.

The environment is procedural geometry and materials. Concrete, steel and copper
use physically based materials with noise-driven color, roughness and bump detail.
Wet ground uses variable roughness and a small animated bump ripple. Recessed
windows and lamp strips accompany a warm key light, cool rim, hemisphere fill and
two point lights that stay in the origin section; the point lights are not
replicated with scenery sections. The key casts a 1024×1024 PCF shadow map on
fine-pointer devices; its shadow is disabled for coarse pointers. Its direction
stays fixed while shadow coverage follows the camera continuously. Architecture and artwork bodies cast
shadows, while soft artwork contact shadows remain separate ground meshes.

Exponential fog, warm haze planes and depth-tested steam billboards provide
atmosphere. Steam and haze in each section turn with camera yaw; steam turbulence
and finite amber ground-light pools share the environment clock. These are
layered planes, not volumetric simulation. The ground plane follows the camera,
while its material is evaluated in world coordinates. The previous neon floor grid
and sky rings are removed. There is no rain system, full-screen bloom or planar
reflection pass. ACES filmic tone mapping applies to the scene, while artwork
materials explicitly opt out. Catalog covers remain the artwork source.
Streamed-out sections release their instance buffers. Environment geometry,
materials, remaining instance buffers and the key shadow resource are disposed
when the scene is destroyed.

System reduced motion freezes artwork flight and the ground/steam environment
clock, rests covers at their stable addresses and makes intentional approaches
immediate. It also disables the Cinematic button and stops an active tour when
the preference changes. Manual camera controls remain available. Artwork pause is a narrower control than this
system preference. Frame time is capped for movement integration after stalls;
these resource limits do not establish measured phone performance.

## Incumbent-system comparison and artwork provenance

Checked `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, `components.css`,
`CollectionPlayback.svelte`, Grid and Chronocity source, including `environment.ts`,
`StreetScene.svelte`, `CityContext.svelte` and `street.wgsl`. The DOM overlay uses
`--ui-font` (Avenir Next/Segoe UI/system-ui, or the selected preset's font), compact
labels, visible focus outlines and 44px phone controls. Toolbar and playback
behavior reuse the incumbent components. The cover wall, Settings and global
system files are preserved. The cinematic refinement adds one local toggle to
this control layer and reuses the existing frame scheduler, scene and cover data;
it adds no dependencies. Its warm pressed state is scoped to the tour button,
and its pause icon is inline SVG. Camera behavior in `cinema.ts` extends the
existing artwork-led environment without changing global design tokens.

The environment's concrete/copper/steel materials, amber/cool lighting and haze
are scoped to this view. Its navy/cyan HUD, 4px control corners, 6px console
corners and view-dependent foil remain local exceptions. Canvas labels currently
use a generic sans-serif font rather than `--ui-font`; the HUD colors and corners do not inherit
all component-preset tokens. These are implementation facts, not new global
normative tokens or a claim of complete preset parity.

Production uses supplied catalog cover URLs unchanged, displayed on both sides
of thin artwork objects. Scenery, weathering, haze and steam are procedural; no
raster scenery was generated or downloaded, and no new production raster was
created. The fixture's six distinct covers are inline SVG compositions explicitly
labeled “SYNTHETIC ARTWORK STUDY” in `tests/agent/fixture.mjs`. They exercise artwork fidelity and grouping,
not production branding or substitute catalog covers.

## Verification

```sh
pnpm --dir frontend check
pnpm --dir desktop test
pnpm --dir desktop build:frontend
pnpm --dir frontend audit:chronocity
```

The targeted audit requires the fixture and agent-browser; see
`tests/agent/README.md` for browser setup and `AGENT_BROWSER_EXECUTABLE_PATH`.
The installed CLI rejects its own select values payload, so this runner exercises
the native select change event through eval.

2026-10-03: frontend check passed with zero errors/warnings, the desktop test
command passed 32 desktop and 16 frontend tests, and the desktop frontend build
passed. Targeted results in
`.audit-results/chronocity-2026-10-03T08-59-15-314Z/results.json` passed WebGPU at
1920×1080, 1440×900, 1024×768 and 390×844, plus forced WebGL2. Coverage includes
XYZ movement/turning/held keys, original-art default and foil opt-in, year/Undated
navigation, refresh continuity, playback/queue/details, retained wall scroll,
paged playlist grouping, discarded late responses, proximity expansion, motion
pause and honest restricted-playlist errors. Frontend check and the desktop
frontend build passed again after the review fixes for obstructed artwork
approaches and scenery movement. That atmosphere run includes outer slots
20/21, the former environment snap boundary near z = −85, and the new
section-streaming boundary near z = −170. The captures were opened and confirmed
valid. The same finish reviewer personally inspected all 11 supplied captures
and returned **ship**, scoring all three findings **resolved**: artwork/approach
clearance, scenery continuity and documentation accuracy. This verdict covers
those three fixes only; passing interaction assertions remain separate evidence.

The earlier artwork-flight review returned **ship** for protected text readability
and complete selected artwork framing on phone. That verdict predates the
industrial atmosphere refinement. The atmosphere run’s results.json and REPORT.md record its completed scoped verdict;
future runner invocations begin with visual review pending. Neither the scoped verdict nor the assertions
establish photorealism or phone performance. No approved Chronocity reference
exists yet, and this is not whole-app visual approval.

2026-10-03, subsequent cinematic refinement: frontend check passed with zero
errors/warnings, the desktop test command passed 32 desktop plus 18 frontend
tests (50 total), and desktop build:frontend passed. The main audit at
`.audit-results/chronocity-2026-10-03T09-38-14-579Z/results.json` passed all four
WebGPU sizes and the prior scenarios, with cinematic arc, manual/Escape takeover,
neighbor advance and overlay time suspension. It then failed at the installed
agent-browser media command's CLI/daemon protocol mismatch. That failure remains
in the record; this was not one clean full run.

The focused continuation at
`.audit-results/chronocity-2026-10-03T09-42-31-411Z/results.json` passed playlist
proximity entry during the tour, a simulated MediaQueryList reduced-motion change,
manual movement/Approach with reduced motion, and the WebGL cinematic path.
The replacement drives the in-page preference-change contract; native OS
reduced-motion behavior remains untested. `MUSIC_AUDIT_CINEMA_EDGES_ONLY=1`
skips the four-size and outer-boundary matrix for this focused continuation;
the default runner includes the new tail after the full matrix.

A fresh Astra finish reviewer returned **ship** for this scoped cinematic
refinement with no material code findings. The reviewer personally inspected
eight start/arc captures across the four sizes and supplemental playlist-entry,
reduced-motion and WebGL cinematic captures, confirming complete selected-cover
framing and accessible controls in those views. This is framing and control-logic
evidence, not certification of live motion quality, every transfer path,
physical-phone touch/FPS, native Mac behavior, real-cover CORS, live Spotify or
the whole app. One detector pass returned no findings; it does not broaden this
review scope. No new general regression run was attempted for this refinement.

Pre-existing regression-harness drift: the general `audit:regressions` runner
currently stops on `.tile-actions`, removed by an earlier artwork-view change.
That blocked result remains visible; this extension does not rewrite unrelated
scenarios. Physical touch, actual-phone frame rate, native Mac-app interaction,
real-library image/CORS behavior, live Spotify and audio capture remain untested.

## Stacked branch integration

2026-10-03: `jose/3d-space` stacks the single 3D feature commit on
`jose/spotify-experiment` at `3f729e8`, including its folder-library, startup,
profile and main-branch updates. The Grid conflict retains the newer source
behavior: artwork visibility does not reset tile order. The synthetic audit
fixture now implements the ready startup/profile bridge expected by that base.
The scene and camera implementation are unchanged by this rebase.

Frontend check passed with zero errors/warnings, desktop build:frontend passed,
and all 18 frontend tests passed. The desktop suite passed 34 of 35 tests;
`desktop/history.test.js` fails its “legacy loads synchronously” assertion.
The identical failure was independently reproduced on the unchanged Spotify
base, so it is inherited rather than introduced by the 3D integration.

The full targeted audit passed at all four WebGPU sizes and on WebGL2 in
`.audit-results/chronocity-2026-10-03T13-16-56-034Z/results.json`, including
camera takeover, playlist grouping, shared playback, background continuity and
the simulated reduced-motion contract. Cinematic start captures at all four
sizes and the WebGL cinematic capture were opened and compared with the earlier
reviewed composition; selected artwork and controls remain framed. This is an
integration check, not a new whole-app visual approval. The physical-device,
native-app and real-provider limits above still apply.
