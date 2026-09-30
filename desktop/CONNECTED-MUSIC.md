# Connected music prototype

Music combines your Navidrome library with Spotify saved albums, Liked Songs and accessible playlists.
The app keeps one queue. Local files play here; Spotify tracks play through Spotify Desktop.
Podcasts, episodes, audiobooks and Spotify's local-file placeholders are excluded.

## Run from this repository

Install frontend and desktop dependencies using pnpm, then download Navidrome once:

```sh
pnpm --dir frontend install
pnpm --dir desktop install
pnpm --dir desktop navidrome
pnpm --dir desktop dev:capture
```

On macOS, `dev:capture` compiles the native tap with Xcode Command Line Tools, builds the frontend
and preload, and creates `desktop/.local-app/Music.app` with a stable bundle ID and the required
`NSAudioCaptureUsageDescription`. It runs directly from the repository; Applications installation is
unnecessary. Node headers must be available (Homebrew Node or `NODE_INCLUDE_DIR`). `pnpm dev` remains
available for the app without the capture-enabled bundle. Both use the existing Music data folder.
For checks, use Node 22.6+ (or a newer version supporting type stripping):

```sh
pnpm --dir frontend check
pnpm --dir desktop test
pnpm --dir desktop build:frontend
```

## Connect your account

1. Create a Web API app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard).
2. Register **`http://127.0.0.1:8888/callback`** exactly, including `http`, the port and the path.
   The callback listens only on this computer's loopback interface. Port 8888 must be available during login.
3. In Music, open the top-right menu → Settings. Paste the app's **client ID** and choose **Connect Spotify**.
4. Finish Spotify's consent screen in your system browser. No client secret is used; authentication uses PKCE.
5. Open Spotify Desktop, then choose **Find devices** in Music. Select this Mac, check **This is Spotify Desktop
   on this Mac**, and choose **Use this output**. Use the same system audio output in both players.
6. Turn **Autoplay** off in Spotify before using managed queues. Music sets Spotify shuffle and repeat off
   when starting a track so its own queue controls the order. These settings are not automatically restored.

The initial client ID can also be supplied through `SPOTIFY_CLIENT_ID` when launching. Root `.env` files
are ignored by Git and are not read by the app. `SPOTIFY_CLIENT_SECRET` is neither needed nor loaded.
Tokens are encrypted with Electron `safeStorage` and stored in the app data folder, never in renderer
storage or LAN share links. Disconnect removes tokens and the account's cached library.

Each friend installs their own copy and authorizes their own Premium account. Add their account to the
developer app's allowlist before they connect. Spotify currently permits up to five authenticated users
in development mode, and the app owner must also have Premium. See [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

## Use the combined library

- **Albums / Playlists** are the two primary views. Albums contains local albums and Spotify albums
  represented by saved albums, Liked Songs, or accessible playlists. One playlist song adds one album
  with one included track; a saved album contributes its full track list. Different editions and local
  copies remain separate. Playlists contains Liked Songs, local playlists, and Spotify playlists.
- **Search**, **Source**, **Artist**, **Sort**, **Recently added**, and **Local favorites** filter browsing.
  Search matches title and artist words without accents. Reset clears all restrictions, including covers-only.
  Filters never rewrite an existing queue. Sorting is applied when chosen; background discoveries append
  so existing covers stay put. Re-select a sort to apply it to newly discovered albums.
- Click a cover to immediately play its included tracks. **+** appends those tracks. **☷** opens the
  track list and shows provenance. Albums are in disc/track order; playlists retain order and duplicates.
  Tracks repeated across sources appear once within an album. Album playback pages use a frozen snapshot
  so discovery cannot expand that listening session to other tracks. Selecting an individual row while
  its list is still loading plays that one song; collection Play/Add continue loading all pages.
- **Display** opens layout, background and source-highlight controls. Queue is in the player menu.
  Queue arrows and × reorder/remove entries. **Shuffle queue** shuffles the queue; **Random from the grid**
  snapshots the visible collections.
- Account-specific metadata loads from cache immediately. Discovery scans likes, saved albums, then
  accessible playlists with at most two requests in flight. Playlist snapshots skip unchanged contents;
  interrupted playlist pages resume. Failed scans retain complete previous membership, and successful
  source scans reconcile removals. Cache writes are batched every five seconds and at completion.
  Playback transitions pause discovery. Disconnect removes the expanded account cache without affecting local music.
- Counts distinguish albums, playlists, unique indexed tracks, and inaccessible playlists. Spotify links
  open the original collection; artwork and metadata come from Spotify. No Spotify audio is downloaded.

Spotify currently exposes playlist contents only for playlists the user owns or collaborates on in
development mode. Other playlists show their artwork and an explanation, with an Open in Spotify link.
See the [development-mode migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

## Playback behavior and recovery

Mixed queues require confirmed Spotify Desktop on the same Mac. Spotify-only queues can target other
available devices. The app never silently picks another output.

Handoffs pause the outgoing player before starting the next one and wait for Spotify acknowledgment.
API latency means gapless transitions cannot be guaranteed. Progress is interpolated locally; the app
checks Spotify more often near a track ending. An ambiguous pause stays paused. A track, device, shuffle,
or repeat change made outside Music suspends automatic queue advancement. Press Play to reclaim control.

An expired session, disconnected device, unavailable track, rate limit, or exhausted API quota leaves the
queue intact and shows a recovery message. Use Settings to reconnect/reselect the device, wait out a rate
limit, or explicitly retry a quota error later. Local playback remains usable without connecting Spotify.
Local scrobbling stays on the local audio path; Spotify maintains its own listening history. Existing
LAN sharing serves local music and never receives Spotify tokens, remote-control access, or captured audio.

## Spotify visualization (experimental, opt-in)

Enable **Spotify audio capture** in Settings or open Visualizer during a Spotify song and click
**Enable Spotify visualization**. Allow Music's audio-capture permission when macOS asks. Requires
macOS 14.2+ and Spotify Desktop playing on this Mac. Remote Spotify devices cannot supply audio here.

The native module creates a private Core Audio process tap containing only `com.spotify.client` and
its child bundle IDs. It does not use the microphone or an all-system fallback. Float32 stereo samples
pass through a bounded native ring, one outstanding IPC batch, and one outstanding worklet message.
The worklet resamples to the AudioContext rate and discards stale backlog. Butterchurn consumes a
separate analysis bus whose only speaker connection has gain permanently set to zero; captured Spotify
audio is never replayed, recorded, or uploaded. Local playback keeps its own speaker path.

Capture exists only while a visualizer is mounted (fullscreen or background), the opt-in is enabled,
and the selected provider is Spotify. Closing it, selecting local playback, disconnecting, navigating
or quitting releases the tap and buffers. Spotify process and default-output changes recreate the tap.
Permission errors, a missing Spotify process, silence, unsupported formats, and remote devices show
recovery instructions. Left/Right skip tracks while the fullscreen visualizer stays open; Space still changes the visual preset. If permission was denied, enable Music in **System Settings → Privacy & Security →
Screen & System Audio Recording**, then turn capture off/on. There is no broader fallback.

Sources: [Apple process taps](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps),
[Electron capture requirements](https://www.electronjs.org/docs/latest/api/desktop-capturer/).


## Verification and rollout

### Mac session, 2026-09-29

OAuth completed and 511 Spotify collections synced. Cached library and output selection survived
repository app restarts. Live checks confirmed manual local → Spotify → local handoffs, explicit
Spotify → Spotify advancement, pause/resume and seeking near an ending, and automatic local → Spotify,
Spotify → Spotify and Spotify → local advancement after letting the final seconds finish naturally.
Changing repeat directly in Spotify suspended Music's queue; explicit Play reclaimed it. Closing Spotify
retained the queue and showed a recovery message instead of redirecting playback to another device.
After reopening, Spotify needed one native play/pause to reappear in its playback API; the preserved
queue then resumed successfully. The recovery message includes this step.
Rapid next-track clicks across the provider boundary settled on the requested local track with Spotify
paused. Both players were left paused after validation.

The live run exposed a slightly regressing Spotify progress report just before completion. End detection
now allows 500 ms of reporting jitter while requiring a recent near-end observation and a terminal/reset
position. Explicit pause and seek clear the completion observation. A regression test covers that trace.
The seek slider also now reports its actual duration to accessibility clients.

For diagnosis, `MUSIC_PLAYBACK_TRACE=1 pnpm --dir desktop dev` logs playback time, duration and playing
state, without tokens, account identifiers or track names. One observed Spotify → Spotify transition
took about 1.1 seconds from the first terminal API report to confirmed playback of the next track;
this is a control-path measurement, not an acoustic gap measurement.

Acoustic overlap/gap measurements, physical network loss, and phone frame-rate profiling remain
unverified. The automated suite uses simulated provider failures; it cannot establish these properties.

### Track-based library and capture validation, 2026-09-29

The live account indexed **8,980 albums / 11,895 unique tracks** from 348 accessible sources
(26 saved albums, Liked Songs, 321 playlists). Another 163 playlist covers remain visible but Spotify
restricts their contents. The expanded cache is about 12.1 MB. A Node measurement parsed it in 43 ms
and derived albums in 30 ms; a synthetic 40,000-track index took 56–62 ms. These measure desktop
indexing work, not phone rendering performance.

Live UI validation: Albums/Playlists tabs and instant search, cached restart without another login,
and “Love This Giant” represented by only “Who”, with two playlist origins. Play produced a one-track
queue. Liked Songs appeared in the playlist view. Native taps delivered real 48 kHz Spotify samples;
while Spotify was paused, playing a system sound in `afplay` produced no samples. Quitting/reopening
Spotify changed its process ID, recreated the tap, and resumed nonzero samples. The running visualizer
reported Spotify audio connected and rendered from this input. Rebuilding the local bundle retained
permission on this Mac. A natural local → Spotify transition kept the visualizer open; manual
Spotify → local → Spotify skips also retained the same visualizer while stopping/restarting capture.
Natural Spotify → local queue advancement passed separately. Closing/reopening the visualizer restored
capture, and closing it stopped PCM traffic. Background → fullscreen → background switches also
kept Spotify capture available; capture ownership is shared across overlapping component lifetimes. Both players were left paused, with the unfiltered album wall visible.

The wall now renders only viewport rows plus an overscan buffer. In this account, total DOM nodes fell
from about 105,000 to 7,100 (including artist choices). Steady desktop frame rate was about 59–60 fps;
startup and some Butterchurn preset compilations still produced 100–400 ms stalls. The visualizer's
rendering width is capped at 1920 pixels. Capture batches were normally 512–1024 stereo frames at
48 kHz. Native-read → renderer-ack transport measured 0–2 ms; this excludes Core Audio scheduling,
worklet buffering and display latency, and is not an acoustic/end-to-end latency measurement.
During several minutes and reopen cycles, JS heap fluctuated roughly 55–159 MB with visualization,
returning to about 28 MB after closing it. This is a short run, not an extended leak/soak guarantee.

`MUSIC_DIAGNOSTICS=1 pnpm --dir desktop dev:capture` logs aggregate frame rate, longest frame,
JS heap, node count and capture peak/batch size/renderer acknowledgment time. It never logs PCM or credentials. The standalone
`capture-probe.js` is a bounded 90-second native feasibility check (build the repo app with `--probe`);
run the normal repo-app script again to restore the main app entry point.

Automated regressions additionally cover partial albums, source overlap/provenance, full saved albums,
multiple discs/editions, playlist duplicates, removed memberships, inaccessible sources, interrupted
resume, max-two concurrency, late disconnect responses, stable large-catalog order, frozen album pages,
actual cover/add queue subsets, the permanently silent analysis output, capture backpressure, PCM resampling/underflow, simulated permission
denial, Spotify restarts, device changes, and unsupported systems.

Physical output-device changes, permission revocation, extended memory soak, and phone profiling still
need hardware validation. Simulated checks do not establish those properties.

### Regression checks and release gate

Automated tests cover OAuth state and PKCE, token rotation and disconnect races, music-only normalization,
rate-limit backoff, serialized handoffs, rapid skips, end detection, external playback changes, and the
actual Svelte queue's ordering, removal, duplicate identities and stale-page protection. Spotify calls
in automated tests are simulated; these tests do not establish live Spotify timing or permission.

Before calling mixed playback verified, exercise a real local → Spotify → local queue and Spotify → Spotify
advancement on the same Mac. Test natural endings with Autoplay off, pause/seek near the end, rapid skips,
Spotify closing, network loss and changes made directly in Spotify. `music-playback-handoff` performance
entries measure command-to-confirmation latency, not acoustic silence or overlap; audible transitions
must also be observed. Check a large cached library for scroll/selection stability and profile scrolling
on a phone before claiming 60 fps there.

This is an experimental prototype. Spotify's [developer policy](https://developer.spotify.com/policy)
restricts integration with other services' content, replacement clients and segueing Spotify content
with other audio. Development access does not waive these restrictions. Resolve the policy fit before
sharing connected builds with friends or distributing publicly; this prototype is not Spotify-approved.
