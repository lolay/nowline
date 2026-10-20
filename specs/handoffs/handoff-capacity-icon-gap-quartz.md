# Handoff: item capacity glyph overlaps its number (quartz)

Branch: `claude/compassionate-archimedes-i6yibf`. Status: waiting on maintainer
sign-off for a visual change (AGENTS.md "Visual changes"). Nothing implemented
yet; delete this file as the branch's last commit before the PR merges.

## Pending question (verbatim)

Sign off on the proposed fix below, items only (lane badge untouched), or also
apply the wider 0.25 em gap to lane badges?

## Root cause

`capacityIconDxTerms` (meta branch, `packages/layout/src/capacity.ts`) places
the icon at 0.5 em/char for both the meta text and the number. Real fonts draw
`4w` at 14 to 16 px at 11 px (0.64 to 0.73 em/char, `w` is wide), vs the 11 px
estimate, so the icon lands 3 to 5 px early, on the digit. The number itself
is flowed by `<tspan dx>` after the real meta text, so it always sits further
right than the icon x assumes.

## Proposed fix

1. Renderer (`renderItemMetaLine`, built-in SVG branch): stop flowing the
   number in the meta `<text>`; paint `<text>metaText</text>`, then the number
   as its own `<text>` at `x + terms[0] + terms[1]`, then the icon at
   `x + sum(terms)`. Number and icon are then positioned from the same
   estimates, like the lane badge.
2. Layout (`capacityIconDxTerms` meta branch): terms become
   `[estimateTextWidth(meta), 0.6 em, estimateTextWidth(num), 0.25 em]`
   (drop `META_ICON_EM_PER_CHAR`). Keep the terms-not-sum shape (R5).
3. Reservation: `estimateCapacitySuffixWidth` grows by the extra 0.15 em gap
   for the item meta path (a `gapEm` param), so caption fit tracks the paint.

Blast radius (full examples/ + tests/ diff, base vs hack): only
`tests/capacity-items`, `tests/capacity-lanes`, `tests/size-and-capacity`.
Snapshots that move: `capacity-items.svg`, `capacity-lanes.svg`.
Determinism `capacity` golden unchanged (examples/capacity uses the multiplier).

## After sign-off

Regression test in `packages/layout/test/render-measures.test.ts` (terms) and
renderer test for number x; update snapshots; `.changelog/<branch-slug>.txt`
`release-note:fixed`; `make pre-commit`; before/after report; ask before PR.
