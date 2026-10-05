---
name: review-music
description: Review Music application PRs, branches or patches for behavioral regressions, lifecycle ownership and integration risks. Use for application code reviews and core/provider split decisions, with validation planning when requested.
---

# Review Music

Review the user journey and the ownership of the code behind it. A passing suite
is evidence for its assertions, not proof of native behavior or a completed visual audit.

## Establish the review

1. Resolve the intended checkout, head, base and diff. Read [AGENTS.md](../../../AGENTS.md).
   Preserve unrelated working changes; do not silently review another checkout.
2. Read the relevant sections of the [review runbook](../../../docs/application-review.md)
   and [coverage ledger](../../../docs/regression-coverage.md). Use current code and
   reviewer comments as evidence; old line references and historical passes may be stale.
3. For Svelte components/rune modules, use available Svelte code-writer and core
   best-practices skills. If unavailable, state the limitation and use the repo's
   Svelte/Vite pipeline and tests; do not invent skill results.

A review does not authorize fixes, branch rewriting, publishing or messages to
other people. Run validation when the user requests it; otherwise recommend the
smallest relevant checks and identify unverified findings.

## Trace behavior

Follow each changed operation through callers and consumers: input → view/state
→ catalog or player → desktop IPC → worker/store → completion and teardown.
Check the relevant invariants, including:

- account/generation/session ownership, loading state and failed refreshes;
- loaded pages, order, scroll and focus during background updates;
- duplicate queue occurrences, shuffled successors and late native media events;
- focus ownership across artwork, menus and nested dialogs;
- first window, migration failure and cleanup before startup retry;
- stable artwork identity, capability fallbacks and worker boundary validation.

Read surrounding code, not just added lines. Test that the app calls a helper at
the right time: correct cleanup can still be absent from the retry path.
For hot paths, examine work per event and list size. Local pointer preview followed
by a commit protects ordering; it does not prove 60 fps on a phone.

## Decide coverage and scope

- Choose behavioral assertions and the right tier using the runbook. Include a
  failure or competing intent when that is how the defect occurs. Prefer controlled
  deferred responses over guessed delays. If adding tests is requested, prove they
  detect the defect where practical using a disposable copy or mutation.
- Separate bugs from scope/design preferences and intentionally retained scaffolding.
  Consult current user decisions and [integration boundaries](../../../docs/core-reliability.md).
  Do not report planned embeddings as implemented functionality or remove them
  merely because the pipeline is not yet built.
- For core/Spotify splits, compare branch trees and their common ancestor. Inherited
  code may vanish after a rebase if removed from core. Identify transfers,
  dependencies and validation before recommending removal.
- Review readability where it hides transitions, awaits or cleanup. Prefer one
  comprehensible operation per statement; do not manufacture bugs from line length
  counts or add arbitrary lint rules without a demonstrated benefit.

## Report

Put actionable findings first, ordered by impact. Each needs a concrete trigger,
user-visible consequence, current file/line evidence and a focused correction.
Distinguish reproduced, code-established and unverified findings. Omit speculative
findings when the caller already enforces the invariant.

Then list validation performed (command, result, head, limitations), coverage gaps
and scope decisions requiring discussion. If no findings remain, say so and still
state what was not exercised. Follow the runbook's prompt/report format; never
label screenshots as approved without inspecting them against references.
