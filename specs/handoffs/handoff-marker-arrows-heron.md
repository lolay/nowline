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

- Maintainer approved the before/after, keeping the region-anchor arrow, and added: no arrow when the two diamonds sit on top of each other (implemented: within 2 diamond radii, 12 px), and consider moving markers to other rows when their arrows would conflict (pending design, below).
- Implemented (commit "Start marker-predecessor arrows on the marker's final row"): placement records the marker (`MilestoneArrowStart`), `positionMilestones` reads its final row (f6 or the region pack), f7 translates only item arrows, `chartFrameY` and `estimatedChartTopY` removed, `LayoutContext.markerIds` added, marker arrows own no corridor, group/parallel overrun arrows start on the milestone's own final row. Tests: `chart-local-frame.test.ts` (grown band, region, region anchor, diamonds meeting, group overrun), `layout-context.test.ts` (`markerIds`), and a marker rule in `attach-geometry.test.ts` covering host and region. Docs: `specs/rendering.md` Milestones ("Marker predecessors"), `specs/layout-phases.md` §3.5, §3.10 rule 4, §9 ("Marker-predecessor arrows (after F2)"). Fragment `.changelog/clever-allen-vtmks9.txt`.
- Gate: `make pre-commit` green, `make pack-mcpb` ran, `make determinism` 314/314 unchanged. Every sample rendered on `main` (6ad6008) and the branch, light/dark/grayscale + xlsx/msproj/Mermaid: only the 6 SVGs of the two new fixtures moved (the arrow paths, exactly the approved mock); exports, stderr and exit codes identical. No snapshot moved.

- Maintainer adopted the arrow-aware marker rows in this PR (commit "Pack the marker band around marker-to-marker arrows"): `packMarkerRow(..., arrows)` with `markerArrows(placements)` from f5 and the region pack; f5 reads `placement`. Tests: `marker-arrows.test.ts` (packer rules) and a clear-run rule in the attach-geometry sweep. Docs: `specs/rendering.md` Milestones "Marker predecessors" and Marker-row labels, `specs/layout-phases.md` §9. Fragment gains a `changed` entry. Renders: still only the 6 fixture SVGs move vs `main`, byte-identical to the approved proposal.

## Pending

- Open the PR (`.github/PULL_REQUEST_TEMPLATE.md`), then delete this handoff in the PR's last commit.
- Not in scope, for the queued overrun-colour task: the renderer ends every slack arrow at `center.x - 6`, so an overrun arrow (running leftward) puts its head 6 px past the milestone's line.

## Gotchas

- `make format` also rewrites `packages/layout/src/start-rules.ts` imports (not flagged by `make lint`); revert that file to keep the PR scoped.
- `make changelog-check` sees committed fragments only.
- Render gate: `.scratch/render-gate.sh <built-repo> <samples-root> <out>`; the `main` copy is a `git archive` in the scratchpad, built with `make init && make build-fast` (not a worktree).
- `.nvmrc` pins Node 26; the container has 22. `make doctor` passed.
- Probe scripts `.scratch/probe-marker-arrows.mjs` and `.scratch/probe-rows.mjs` import `packages/*/dist` directly; rebuild with `make build-fast` first.
