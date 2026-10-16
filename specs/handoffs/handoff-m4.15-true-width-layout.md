# Handoff to m4.15: true-width layout

Spec: [`../true-width-layout.md`](../true-width-layout.md). Milestone entry: [`../milestones.md`](../milestones.md#m415--true-width-layout).

## Where things stand

- m4.11 made the scheduler (engine C) the one source of dates; the exports and the chart agree on every start and end. The chart still draws short bars wider than their dates, and containers take horizontal space. m4.15 removes both.
- The design was worked out against mocks and a browser prototype, not production code. Nothing in `packages/` implements it yet.
- The `after:` a parallel or a group fix (both engines, [`scheduler-unification.md`](../scheduler-unification.md) §9 "After m4.11") landed first, so containers are valid dependency sources in both engines.

## Decided (by the product owner)

- Dates are exact for bars, milestones and anchors; vertical space is the budget.
- No variable-width items, no variable-width columns, no auto-zoom, no merging short items into runs.
- The only floor is 1 px; the corner radius is a maximum.
- Groups and parallels sit above and around their content (header bracket, shaded body padded above and below), never beside it.
- Captions sit right of a short bar; a collision drops the next item a row.
- The arrow rules, "rows never move up", and the marker rules of spec §3 were shown in the prototype and accepted when the prototype was approved.

## The prototype

The design was worked out in a browser page (`true-width-prototype/`) that drew today's render beside the proposed one from one staging. It was removed when m4.15 closed (spec §5 m4); its five stress files are described in spec §6, and the page is in git history at aa0c0a1 (`git show aa0c0a1:specs/handoffs/true-width-prototype/README.md`).

## First step (m1)

Bars at true width in `packages/layout`: drop the `MIN_ITEM_WIDTH` clamp and the `ITEM_INSET_PX` gutter, add the 1 px seam and radius rule, collapse `TrackCursor` to one end, make the row packer never move a child up. Write the date-truth invariant test of spec §6 first; it fails on main for every sample with a bar under 20 px.

## Gotchas

- Every sample moves. Render all of `examples/` and `tests/` in three themes before and after each step, and list every moved file, snapshot and determinism cell in the commit and PR. Never bump a golden just to get green.
- The exports must not move; if xlsx, msproj or mermaid bytes change, something touched the schedule.
- `make pre-commit` is the gate. The repo pins Node 26 (`.nvmrc`).
- ~~Remove or promote `true-width-prototype/` before m4.15 closes.~~ Removed in m4; see above.
