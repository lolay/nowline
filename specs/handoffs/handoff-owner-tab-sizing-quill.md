# Handoff: R5 follow-up F2, lane owner tab sizing

Branch: `claude/serene-gates-yvx5of` (harness-assigned, cut from `main` at 70f418b). Remove this file before the PR merges.

## Status

Maintainer picked C, and added two asks: replace the `owner: ` prefix with a glyph (person glyph for a person, people glyph for a team), and fix the nested-team title bug below in the same change. Mocked all three together; waiting on sign-off of the mock. No code changed.

Pending question, verbatim: "Ship C + owner glyph + nested-team titles as mocked (Lucide `user` for a person, `users` for a team, reusing the capacity glyphs)?"

Glyph mock moves 5 renders (F2 fixture, `examples/platform-2026`, `examples/teams`, `tests/capacity-lanes`, `tests/grammar-properties`), 4 snapshots (`platform-2026{,-dark,-grayscale}.svg`, `capacity-lanes.svg`) and the `platform-2026` / `platform-2026-dark` determinism goldens (`make determinism-update`). Concern raised: the owner glyphs are the same as `capacity-icon:person` / `people`, which also paint in the tab (`tests/capacity-lanes` "Headcount 6 [person]"). Spec to update: `specs/rendering.md` "Owner badge" (line ~317). Tests asserting `owner: ` text: `packages/renderer/test/render.test.ts`. Item owner resolution (`packages/layout/src/nodes/item-measure.ts:182`) has the same nested-team bug; fix both through one helper.

## Findings

- Bug reproduced on main: the fixture in `specs/review-since-v086.md` R5 (F2) draws the tab at x 10 to 246, y 66, and item `a` at x 174.52, y 66, over the owner text.
- Hacked A (pass the resolved owner title to `computeLaneTabRightX`): only the new fixture changes. Every render under `examples/` and `tests/` (56 files) is byte-identical, so no snapshot or determinism golden moves. The existing titled owners are too close in width to their ids to cross the tab-gutter threshold.
- Hacked B (store the raw id in `PositionedSwimlane.owner`): the fixture plus `examples/platform-2026`, `tests/capacity-lanes`, `tests/grammar-properties` change; snapshots `platform-2026.svg`, `platform-2026-dark.svg`, `platform-2026-grayscale.svg`, `capacity-lanes.svg` would need a bump.
- C draws the same pixels as A.
- `box.x = 0` vs `s.box.x`: every lane box, top-level and inside include regions, has x 0 today (`swimlane-node.ts`, `include-node.ts`), and `nested` is always empty, so the difference is latent. C removes it.
- Separate bug, out of scope: owner resolution reads `ctx.teams`, which indexes only top-level teams, so a nested team (`examples/teams.nowline`, `platform-team` under `engineering`) shows its id, not its title.

## Resume

After the pick: implement, add a regression test in `packages/layout/test/` (and/or `packages/renderer/test/`) with the fixture, add `.changelog/<branch-slug>.txt` (`release-note:fixed`), run `make pre-commit`, re-render before/after, ask before opening a PR.
