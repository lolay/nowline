# Handoff: R5 follow-up F2, lane owner tab sizing

Branch: `claude/serene-gates-yvx5of` (harness-assigned, cut from `main` at 70f418b). Remove this file before the PR merges.

## Status

Options presented, waiting on the maintainer's pick. No code changed.

Pending question, verbatim: "Which option for F2: A (size from display title), B (draw the raw id), or C (layout carries the tab geometry on `PositionedSwimlane`)? Recommended: C."

## Findings

- Bug reproduced on main: the fixture in `specs/review-since-v086.md` R5 (F2) draws the tab at x 10 to 246, y 66, and item `a` at x 174.52, y 66, over the owner text.
- Hacked A (pass the resolved owner title to `computeLaneTabRightX`): only the new fixture changes. Every render under `examples/` and `tests/` (56 files) is byte-identical, so no snapshot or determinism golden moves. The existing titled owners are too close in width to their ids to cross the tab-gutter threshold.
- Hacked B (store the raw id in `PositionedSwimlane.owner`): the fixture plus `examples/platform-2026`, `tests/capacity-lanes`, `tests/grammar-properties` change; snapshots `platform-2026.svg`, `platform-2026-dark.svg`, `platform-2026-grayscale.svg`, `capacity-lanes.svg` would need a bump.
- C draws the same pixels as A.
- `box.x = 0` vs `s.box.x`: every lane box, top-level and inside include regions, has x 0 today (`swimlane-node.ts`, `include-node.ts`), and `nested` is always empty, so the difference is latent. C removes it.
- Separate bug, out of scope: owner resolution reads `ctx.teams`, which indexes only top-level teams, so a nested team (`examples/teams.nowline`, `platform-team` under `engineering`) shows its id, not its title.

## Resume

After the pick: implement, add a regression test in `packages/layout/test/` (and/or `packages/renderer/test/`) with the fixture, add `.changelog/<branch-slug>.txt` (`release-note:fixed`), run `make pre-commit`, re-render before/after, ask before opening a PR.
