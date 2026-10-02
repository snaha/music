# Agent-driven Music regressions

Use Codex computer/browser controls or the installed `agent-browser` CLI. There
is no Playwright test dependency or Cypress dependency in this workflow. The CLI
may use browser-automation libraries internally; this project does not maintain
Playwright specs.

## Start the isolated fixture

```sh
pnpm --dir frontend audit:serve
```

Opens a loopback server at http://127.0.0.1:4178 after building the frontend.
Contains 240 synthetic albums, a playlist, long titles and multiple discs. Local
API and Spotify playback are mocked. Listening history uses an isolated temporary
SQLite database, deleted when the fixture server stops. No real library, tokens or audio are used.
Reload resets the fixture's browser preferences. Keep the fixture separate from
the actual app, whose settings and playback are real.

## Repeatable agent-browser assertions

With `agent-browser` installed and its browser available:

```sh
pnpm --dir frontend audit:regressions
```

If a browser executable is already installed, set
`AGENT_BROWSER_EXECUTABLE_PATH` to its full path. Otherwise run
`agent-browser install` using your installed CLI's documented setup. The CLI
must support `set viewport`, `hover`, `focus`, `eval`, `snapshot` and `screenshot`.
Set `MUSIC_AGENT_BROWSER` to use another CLI executable location.

Runs at 1920×1080, 1440×900, 1024×768 and 390×844. Checks hover/focus and overlay
hit testing, cover play, dropdown opening/no-match/Escape/selection/reset,
Settings modal centering, focus containment, category keys, device-picker search,
keyboard selection and nested Escape, click-only menus and keyboard dismissal, track-detail
overflow, and scroll/tile-order preservation during background updates.

Writes timestamped screenshots, results.json, and failure screenshots/snapshots
to `.audit-results/`. Exits nonzero on a failed assertion. Uses the isolated
`music-regressions` browser session and closes it afterward.

**Screenshot capture is not a visual pass.** Codex or a human must inspect them,
compare with approved references, and record visual results. Agent judgment is
useful for UX review but cannot guarantee the same decisions across runs.

## Full Codex audit

Give Codex the prompt in `AUDIT-PROMPT.md`. It includes additional exploratory
checks, all three styles, sliders, resize-open panels and the actual Mac app.
Codex can use its built-in computer controls without agent-browser installed.
The existing `pnpm --dir desktop test` remains the deterministic playback/library
regression suite. Physical phone, live Spotify and capture behavior need their
separate release checks in `frontend/UX-AUDIT.md`.

Only replace approved screenshots after reviewing an intentional design change.
Never treat a new screenshot as approved solely because the runner completed.

## Latest validation

2026-09-30: the agent-browser runner passed all four viewport sizes using the
installed CLI and Chrome for Testing. Screenshots and results are saved under
`.audit-results/2026-09-30T16-14-42-955Z/`. Automated assertions passed; full visual
approval of every screenshot remains a separate review. This is intentionally
recorded as pending in results.json.

Official agent-browser command reference: https://agent-browser.dev/commands
