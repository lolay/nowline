# Handoff: marker-predecessor slack and overrun arrows

Branch `claude/clever-allen-vtmks9` (harness-assigned), cut from `main` at 6ad6008 (F2, lolay/nowline#189). Delete this file in the PR's last commit.

## Done

- Probe (scratch, not committed) over all 60 `examples/**` and `tests/*` samples with `--now 2026-02-09`: **no sample has a slack or overrun arrow from an anchor or milestone predecessor.** So the fix moves no existing render; only the new fixture shows it.
- New fixture `tests/marker-predecessor-arrows.nowline` (host) including `tests/marker-predecessor-partner.nowline` (isolated region). On `main`:
  - host band grows from 2 estimated rows to 3; `beta` (slack) and `review` (overrun) from `alpha` draw at y 87, `alpha` sits at 61;
  - region `p-beta` (slack) and `p-due` (overrun) from `p-alpha` draw at y 165 (inside the host's Core lane), `p-alpha` sits at 329;
  - region `p-alpha after:[p-start, p-build]` draws no arrow from the region anchor `p-start`;
  - the partner file rendered alone: `p-beta`/`p-due` arrows at 87, `p-alpha` at 113.
- `finalize-coverage.json` gains the two fixtures (no existing sample's firing set changes).
- `make pre-commit` on this commit fails only `attach-geometry.test.ts` (integration-tests): it flags the 4 host-frame arrows (`beta`, `review`, `p-beta`, `p-due` in the partner file alone) whose x lands on a bar end but whose y is off its row. That is the bug, pinned on `main`. The region arrows and anchor arrows slip past it because their x is on no bar end; plan: add a marker rule to the sweep (an arrow whose x is on a marker's cut line, in the same scope, starts at that marker's `center.y`).
- Before/after (hand-edited SVG) shown to the maintainer.

## Pending: maintainer sign-off on the visual change

Question asked: approve the before/after so implementation can start?

## Design (to implement once approved)

- Placement stops reading a marker's y. `collectMilestonePredecessors` marks a predecessor that names one of the scope's anchors or milestones as a marker (ids from the context's source content) and gives it no y. A slack or overrun arrow from it carries the marker's id instead of a y.
- A dated milestone's overrun arrow from a predecessor with no y (a group or parallel) starts on the milestone's own row, resolved the same way.
- `positionMilestones` resolves those arrows from the final rows: f6 (`band.placements`) for host milestones, the region's own `markerRowPlacements` in `placeRegionMarkers`. Chart arrows (item predecessors) keep their local y.
- f7 translates only the chart arrows of a host milestone; header arrows are already final canvas y. Regions translate everything (their rows are in the chart frame).
- Marker predecessors no longer produce slack corridors (their arrows run in the marker band; today they produce negative-y corridors that never meet a row but still trigger the pass-2 rerun).
- Removes `chartFrameY` and `LayoutContext.estimatedChartTopY` (f7 reads `measured.bands.chartTopY`).
- `estimatedCenterY` stays only as the milestone midpoint the f6 trace compares against; §9 bullet rewritten.
- Docs: `specs/rendering.md` Milestones (marker predecessors start on the marker's own row), `specs/layout-phases.md` §9 (retire the stale read). Changelog `fixed`.

## Gotchas

- `.nvmrc` pins Node 26; the container has 22. `make doctor` passed.
- Probe scripts: `.scratch/probe-marker-arrows.mjs` and `.scratch/probe-rows.mjs` import `packages/*/dist` directly; rebuild with `make build-fast` first.
