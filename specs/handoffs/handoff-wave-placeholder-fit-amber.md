# Handoff: wave placeholder and legend fit (amber)

Branch: `claude/confident-brown-fuv4ks` (harness-assigned). No PR yet.

## Status

Prototype implemented and committed, `make pre-commit` green. **Waiting on maintainer sign-off** for the visual change (AGENTS.md "Visual changes"). Pending question, verbatim from the session:

> Approve the placeholder fallback (names ellipsized, then "No items assigned to waves yet") and the legend word-wrap, or pick another option?

## What changed

- `packages/layout/src/nodes/wave-node.ts`: `fitPlaceholder` (names ellipsized, then short form, then short form ellipsized, then none) so the all-empty placeholder halo fits the timeline; legend wraps a wave name at spaces when its estimate would pass the canvas edge, keeping `(no items)` whole.
- `packages/layout/src/i18n.ts`: new `wavesDeclaredPlaceholderShort` (en-US, fr).
- Tests: `packages/layout/test/waves-model.test.ts` (new cases fail without the fix), renderer placeholder test widened with `length:12w`.
- `specs/waves.md` §9.1 and §9.5, `.changelog/confident-brown-fuv4ks.txt`.

## Rejected

Grow the canvas (the strip is timeline-wide, canvas growth doesn't help) and left-align at the timeline start (still overflows right).

## Resume

On approval: delete this file as the last commit, open the PR. On a different choice: rework `fitPlaceholder` / the legend `startRuns` block.
