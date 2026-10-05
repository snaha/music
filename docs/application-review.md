# Application review and validation runbook

Use with the repo's [review-music skill](../.agents/skills/review-music/SKILL.md).
The [coverage ledger](regression-coverage.md) maps failures to maintained checks;
[core-reliability.md](core-reliability.md) describes integration boundaries.

## Identify the candidate

Record checkout, branch, head, base and dirty files. Inspect the diff and callers;
keep unrelated user edits intact. Resolve historical comments against the current
tree. For a split, compare both trees and their merge base: code inherited from
core is not necessarily restored by the Spotify branch's unique commit.

Separate correctness findings, coverage gaps and scope changes. Current core
intentionally keeps generic provider boundaries, unavailable-source guards and
embeddings/entity schema scaffolding. The embedding pipeline is not delivered yet.
A different scope requires a user decision and a viable integration path.

## Trace changed operations

Read relevant areas and follow the full ownership chain.

| Starting files in `frontend/src/lib/` unless qualified | Regression questions |
| --- | --- |
| `catalog-search.svelte.ts`, `library.svelte.ts`, `local-catalog.ts` | After each await, can an old account/query/revision publish? Does failed refresh retain the last successful snapshot? Does same-query refresh cover loaded pages before pruning? Do same-count changes invalidate details/search? |
| `player.svelte.ts`, `playback-controller.ts`, `library.svelte.ts` | Do Play and Add own separate operations? Can a late Add/random lookup change a replacement queue? Who clears loading? Do delayed media events consult actual element state? |
| `music.ts`, `shared/music.ts`, `listening-history.svelte.ts` | Are catalog IDs, duplicate collection occurrences and live queue rows distinct? Do edits preserve shuffle cursor, visited order and successor? Does recording/retry retain loaded pages/query? Can late reads resurrect cleared rows? |
| `browse-view.ts`, `discovery.svelte.ts`, `DigPanel.svelte` | Does background work retain order/scroll? Is artwork identity independent of credentials/ports? Does drag preview locally, committing once instead of reranking per event? |
| `ArtworkView.svelte`, `artwork-focus.ts`, `Queue.svelte`, `Settings.svelte`, `Bar.svelte` | Is opening explicit? Is covered/newly inserted content inert? Who owns focus when dialogs nest? Are playback controls available? Does closing restore the opener without scrolling? |
| `runtime.ts`, `preferences.ts`, image handlers | Who starts/stops listeners, subscriptions, audio and pending work? Is storage failure recoverable? Does changed artwork retry, while a late error cannot reopen a closed view? |
| `desktop/main.js`, `service-lifecycle.js`, `storage-migration.js` | Is the first window visible before bounded/retryable migration? Do newer target values win? Do error/retry/quit release server, worker and child before checking ports? Does readiness wait for listening? |
| `desktop/preload.js`, `shared/contracts.js`, `music-store-worker.js` | Is IPC restricted to trusted main frame/document, allowing query/hash changes? Is the envelope bounded in main and the full snapshot validated in worker, including direct callers? |
| `desktop/music-folders.js`, `profiles.js`, scripts/workflow | Do default/custom folders coexist without duplicates or changing originals? Are locks/state isolated? Does packaging include contracts/correct binary? Are launchers stable through updates? |

Paths in `shared/` and `desktop/` are repository-relative; desktop filenames in
those rows share their row's directory. Readability matters at these boundaries:
make edited state transitions, awaits and cleanup comprehensible. Line-length
thresholds cannot establish intent or correctness.

## Choose prevention proportional to the error

| Failure class | Preferred check |
| --- | --- |
| DTO/import/type drift | Svelte/TypeScript check, runtime boundary tests, frontend/preload build |
| Racing completion or intent | Deferred responses and explicit competing actions; assert data and loading ownership |
| Queue/history invariants | Actual compiled modules plus real store/player tests; stable occurrences and page window |
| Focus, keyed rows, pointer state | Existing Vitest browser components through production Svelte/Vite plugin |
| Startup/retry orchestration | Actual main entrypoint with isolated OS mocks and real ports; separately verify native |
| App navigation/layout | Existing synthetic agent journey and inspected screenshots |
| Native decoding, migration data, permissions, packaging, performance | Isolated profile/device/packaged check with limitations recorded |
| Scope, dead abstractions, readability | Call-site/branch comparison and documented decision; build after removing exports |

Test outcomes, not source text or exact private implementation. Mock unavailable
boundaries, not the behavior under review. A migration stub checks startup flow,
not IndexedDB contents; silent WAV or fake Audio does not establish audible output.

Use deferred promises/events to release racing work in the required order. Wait
for an observable condition with a bounded deadline, not a guessed sleep. Exercise
rejection, supersession and disposal when they explain the bug; avoid exhaustive
combinations that add no new invariant.

Where practical, demonstrate failure against old behavior or one targeted mutation
in a disposable copy. Confirm the intended assertion fails, not an import/setup
error. Never revert the user's branch to prove coverage. Save the command/result
with validation evidence. Keep detailed incident steps here, stable rules in AGENTS.

## Run requested validation

Install both packages on a fresh checkout. Desktop tests use the frontend-owned
rune compiler export. Use Node with `node:sqlite` and FTS5 (CI uses Node 22; the
local Node 25 build also supports it). Set `MUSIC_TEST_BROWSER` to an installed
Chromium executable if needed; otherwise install the provider's browser:

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend check
pnpm --dir frontend test:unit
pnpm --dir desktop test
pnpm --dir frontend audit:test
pnpm --dir desktop build:frontend
pnpm --dir desktop build:preload
```

Add desktop suites to the explicit list in `desktop/package.json`; that command
runs in CI. Browser components must work with a cold Vite cache. If mounting a new
component triggers a late optimizer reload, prebundle the dependency in the test
config and rerun cold. Do not retry until an accidental pass.

For UI implementation changes, follow [the synthetic audit README](../frontend/tests/agent/README.md),
[full audit prompt](../frontend/tests/agent/AUDIT-PROMPT.md) and
[Mac checklist](../frontend/UX-AUDIT.md). Vitest's Playwright provider supplies
component runtime; it is not a second application E2E framework. CI's fixture
contract test does not execute the agent journey.

Inspect screenshots at all four viewports. Record visual pass/fail/blocked
separately from interaction results; do not replace references to hide regressions.
Measure performance for performance claims. Stop temporary servers, close only
sessions you created and reset viewport overrides.

## Native checks

Follow [desktop launch/profile instructions](../desktop/README.md), using a new
absolute data root under `.audit-results/`. From the repository root, for example:

```sh
pnpm --dir desktop exec electron . --data-dir "$PWD/.audit-results/review-native/Data" --profile review
```

Build frontend/preload first; obtain Navidrome with `pnpm --dir desktop navidrome`
if missing. Record source head/build identifier. Do not reuse normal Music/Preview
state or change real account/permission settings for fault injection.

1. Fresh library: confirm default folder, add custom alongside it, index, search a
   known song, play/pause/resume/seek, add another while paused. Confirm playback
   advances; audible output requires listening. Restart and verify folders/history/
   preferences. Empty scan should offer setup/recovery, not only Reset filters.
2. Migration: use an isolated copied legacy-origin profile. Check first window while
   pending, failure/timeout warning, usable library and next-launch retry. Verify
   newer target preferences/backgrounds win over partial imports; retain backup.
   Mocks cover control flow, not browser storage contents.
3. Lifecycle: record saved ports, stop only this fixture's Navidrome child, retry,
   verify old server/worker replaced and unchanged free ports/share links. Separately
   occupy a saved port with a fixture listener: app selects a free port and reconnects
   instead of reporting stale readiness. Release the fixture listener afterward.
4. IPC: query/hash navigation within `app://music/` keeps bridge usable. Automation
   rejects other document/origin/subframe. Never weaken trust checks for a probe.
5. Packaging: smoke actual portable launcher/profile path, two independent folders/
   versions and a closed-source profile copy. OS mocks do not establish signing,
   packaged permissions, audible output or real child launch.

Quit normally and verify fixture child/server exit. Remove only created temporary
resources; preserve accounts, source music and permissions. Save evidence without
credentials/signed URLs in `.audit-results/`.

## Review prompt and report

> Review this Music candidate against its user outcome and AGENTS.md. Resolve the
> checkout/head/base. Trace changed operations through consumers, async completion
> and teardown using relevant runbook invariants. Check regression coverage and
> integration dependencies. Put concrete correctness findings first; separate test
> gaps, intentional scaffolding and scope preferences. Recommend focused checks,
> running validation only when requested. Include current file/line evidence,
> triggers, consequences and limitations. Do not claim native, visual or performance
> results from mocks or historical runs.

Report: **candidate** (head/base/dirty state), **findings** (priority, trigger,
consequence, location, correction), **validation** (command/fixture/result and
artifact path), **gaps**, **scope decisions**. Link historical evidence with its
head/date rather than claiming a new pass. Update the coverage ledger for new
regressions; leave screenshots/logs in ignored evidence folders.
