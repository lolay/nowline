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

## Pending: marker-row conflict design, prototype awaiting sign-off

Problem: arrows from markers run along the predecessor's row and cross other markers' diamonds and labels (Kickoff to Alpha crosses Cut and Code freeze), and when the predecessor sits above the milestone the arrow ends in empty space above the milestone's diamond (Alpha to Beta), since cut lines only run down from a diamond.

Prototype, saved as `specs/handoffs/marker-row-arrows-prototype.patch` (not applied; `git apply` it to resume). `packMarkerRow` takes the marker arrows (`markerArrows(placements)`, from f5 and the region pack; the measure pre-pack passes none):
1. An arrow's run (between the two diamonds, on the source's row) is reserved on that row like a label, so no other diamond, label or arrow sits on it.
2. The target stays at or above the source's row, so the arrow meets its diamond or cut line.
3. When nothing fits, the new row goes right below the target (when the marker is an arrow source whose target is placed); otherwise the band grows at the top as before.
4. A marker's label takes the side its own arrow does not leave, when that side fits.

Result on the fixture: host band 3 to 4 rows, region 3 to 4 rows; no arrow crosses another marker. Still crossed: Kickoff's own label (no room on its left) and Alpha / Partner alpha (arrows leave both sides). The corpus has no marker arrows, so no other sample would move.

Question asked: adopt the prototype as is, or with changes?

Also seen (not in scope, fits the queued overrun-colour task): the renderer ends every slack arrow at `center.x - 6`, so an overrun arrow, which runs leftward, puts its head 6 px past the milestone's line.

## Gotchas

- `make format` also rewrites `packages/layout/src/start-rules.ts` imports (not flagged by `make lint`); revert that file to keep the PR scoped.
- `make changelog-check` sees committed fragments only.
- Render gate: `.scratch/render-gate.sh <built-repo> <samples-root> <out>`; the `main` copy is a `git archive` in the scratchpad, built with `make init && make build-fast` (not a worktree).
- `.nvmrc` pins Node 26; the container has 22. `make doctor` passed.
- Probe scripts `.scratch/probe-marker-arrows.mjs` and `.scratch/probe-rows.mjs` import `packages/*/dist` directly; rebuild with `make build-fast` first.
