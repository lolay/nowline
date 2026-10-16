# Handoff: milestone and `before:` time paths (quartz)

Branch: `claude/vigilant-cray-trqshd` (harness-assigned).

Goal: close the two chart-only gaps in `specs/scheduler-unification.md` §9 "Known open gaps":
an after-only milestone sits at the item's painted end, and `before:` overflow compares the
painted end. Both should use the duration end (§8 decision 6).

## Done (partial, uncommitted to samples)

- `sequence-item.ts`: `before:` overflow now compares `durationEndX` to the cap; the red tail
  still runs to the painted end.
- `milestone-node.ts`: `MilestonePredecessor` gains `endX` (time, from `entityRightEdges`);
  `x` stays the painted arrow source. After-only placement, flow dedupe, the binding
  predecessor, slack arrows (`hasSlackArrow`) and dated-milestone overrun all read `endX`.
  This is option A below, and the overrun switch, both pending a decision.

## Pending question (verbatim to the user)

1. After-only milestone: option A (duration end, exactly engine C, cut line in the gutter,
   about 19 samples move 6 px right) or option B (min(painted bar edge, duration end), only
   milestones after clamped bars move, unclamped keep a 6 px early bias)?
2. Dated milestone overrun and its slack corridor: switch to the duration end too, or leave it
   and record it in §9 Known open gaps?

## Still to do

Regression tests (milestone after a 1-day item at a coarse scale matches engine C; a clamped
`before:` item whose duration meets the cap is not flagged), the before/after render of every
`examples/**` and `tests/*` sample in light, dark and grayscale with `--now 2026-02-09`
plus the xlsx, msproj and mermaid exports, declare every moved sample, snapshot and
determinism cell, `.changelog/` `fixed` fragment, §9 and waves.md updates, `make pre-commit`.
Delete this handoff as the last commit before merge.
