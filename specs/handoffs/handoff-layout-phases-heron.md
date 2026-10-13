# Handoff: m4.14 layout phases (R2), orchestrate run

- **Plan:** `specs/handoffs/plan-layout-phases-heron.md`
- **Branch:** `claude/vibrant-hopper-ac4s73` (harness-assigned task branch; started at ff8eb8b, fast-forwarded to `origin/main` 4498948 at kickoff, no commits of its own before this one)
- **Mode:** unattended (confirmed 2026-10-13, session 7e027fcc-1ca6-51b0-b005-63e1163df819; harness=claude-code runner=cloud)
- **Status:** waves 1-6 PASS (m1-m5, m6 s1-s2). Merging `main` (R3 #153, #154) before wave 7 (m6 s3).

## What's done

- Ordering gate checked: R1 (m4.11) landed as #150 (4498948). `computeContentEndDay` is gone, `LayoutOptions.schedule` exists, `computeDateWindow(file, schedule, today, scale)`. So the plan covers m1-m6 plus F1 (m6.s2) and L2 (m6.s1).
- Plan written, tagged, wave markers, Kickoff block, Cost table (~76M tokens, ~$46 API-equiv expected), counting header.

## Waves

1. [exec] m1 s1-s2 (s1 also writes the gate script)
2. [deep] m1 s3
3. [exec] m1 s4
4. [deep] m2 s1-s2
5. [exec] m3 s1-s2
6. [deep] m3 s3, m4 s1-s2, m5 s1-s5, m6 s1-s2 (four units, one per milestone)
7. [exec] m6 s3

## Review log verdicts, fix-ups, retries, checkpoints

- wave-1 (nowline m1 s1-s2) 0b49f7c..28771a2: PASS. m1.s1 98bf1ea (gate script + `Theme.statusTint`), m1.s2 28771a2 (`LayoutHelpers` replaces the four `*Deps`). G1/G3 empty vs 4498948, `make pre-commit` green.
- wave-2 (nowline m1 s3) b448282..7e64d9c: PASS. m1.s3 7e64d9c (`sequenceRowTrack` in `nodes/row-track.ts`). G1/G3 empty, pre-commit green.
- wave-3 (nowline m1 s4) 4400fbd..bbab969: PASS. m1.s4 bbab969 (`nodes/marker-band.ts`; `collectSlackCorridors` into `milestone-node.ts`). Pure move.
- wave-4 (nowline m2 s1-s2) f354568..f5a6416: PASS. m2.s1 51c95bd (`nodes/item-measure.ts`, `ItemNode` from the measure, N6), m2.s2 f5a6416 (prediction from the measure, predictor deleted, row height = pitch). G1/G3 empty vs 570254b.
- wave-5 (nowline m3 s1-s2) bb92ae0..1dd90a6: PASS. m3.s1 a517539 (`createLayoutContext`), m3.s2 1dd90a6 (`indexFootnotes` + `buildFootnotePanel`). G1/G3 empty vs 9c71cbb.
- wave-6 m3 unit (nowline m3 s3) cb898b5..3112f70: PASS. m3.s3 3112f70 (N2, N4, N7; `CanvasExtent` replaces `LayoutContext.chartRightX`). G1/G3 empty vs 9c71cbb.
- wave-6 m4 unit (nowline m4 s1-s2) af7a82e..bc8e31d: PASS. m4.s1 c87fef9 (`HeaderNode.measure`), m4.s2 bc8e31d (`HeaderNode.place`, `estimatedRowsBottomY`). G1/G3 empty vs 9c71cbb.
- wave-6 m5 unit (nowline m5 s1-s5) dad67df..56d00f7: PASS. m5.s1 d846fa3 (`phases/date-window.ts`), m5.s2 48b8a4f (`phases/measure.ts`, one marker entry assembly), m5.s3 a8e0bf9 (`phases/place.ts`, N5), m5.s4 82b47c6 (`phases/finalize.ts`, f1-f16 table, guards, coverage register), m5.s5 56d00f7 (`RoadmapNode.place` is four calls; `RoadmapNodeDeps` gone). G1/G3 empty vs 9c71cbb.
- wave-6 m6 unit (nowline m6 s1-s2) ab6488c..c064e10: PASS. m6.s1 18d3b1c (L2: now-pill row reserved on an extended axis; fragment created; no sample changes), m6.s2 c064e10 (F1: beside card hugs the final rows bottom; changed exactly the nine renders `examples/dependencies`, `tests/late-row-shifts`, `tests/marker-left-overflow` x light/dark/grayscale, snapshots `dependencies.svg` and `marker-left-overflow.svg`, determinism golden cells `dependencies` svg/html/png/pdf).

## Milestone m5 summary (milestone handoff)

m5 is done: `RoadmapNode.place` is `resolveDateWindow` -> `measureRoadmap` -> `placeChart` -> `finalizeRoadmap`, with `sequenceOne` still injected (`LayoutHelpers` is `{ sequenceOne }`). Finalize is the ordered, checked f1-f16 table in `phases/finalize.ts`, with `CanvasExtent` (`grow`/`freeze`/`provisional`/`final`) and the scale and marker-band guards; the coverage register is `test/finalize-coverage.{test.ts,json}`. `layout.ts` is 80 lines. Byte-identical through m5.s5. m6 starts from 56d00f7; m6.s1 is the first behaviour step.

## Milestone m4 summary (milestone handoff)

m4 is done: `nodes/header-node.ts` measures the header (`MeasuredHeader`: above height, `chartLeftX`, `chartTopY`, `minRowsBottomY`) and places it (`PositionedHeaderParts`); `RoadmapNode` adds the attribution box last. The L1 stale read is `estimatedRowsBottomY`, kept until F1 (m6.s2). Byte-identical. m5 starts from bc8e31d.

## Milestone m3 summary (milestone handoff)

m3 is done: one `createLayoutContext` builder, footnotes indexed once (`indexFootnotes` + `buildFootnotePanel`), and placement no longer reads the canvas (lanes width 0 until P9, regions fitted only after P8, milestones placed as `MilestonePlacement` and positioned at P11). `chartRightX` lives in a private `CanvasExtent` in `roadmap-node.ts` until m5.s4. Byte-identical. m4 starts from 3112f70.

## Milestone m2 summary (milestone handoff)

m2 is done: items are measured once by `measureItem` (`nodes/item-measure.ts`), `ItemNode.measure()` returns the grown height, `sequenceRowTrack` derives desired end and pitch from the measure, and `predictItemBarExtraHeight` is gone. Byte-identical. m3 starts from f5a6416 plus the merge of `main` 9c71cbb (a perf-test change only).

## Milestone m1 summary (milestone handoff)

m1 is done: status tints are theme tokens (`Theme.statusTint`, applied by a local `applyStatusTheme` in `layout.ts`), the four node `*Deps` interfaces are `LayoutHelpers` (or a `Pick`), lanes and groups share `sequenceRowTrack` (`nodes/row-track.ts`), and the marker band helpers live in `nodes/marker-band.ts`. Every step byte-identical (G1/G3 empty vs 4498948). m2 starts from bbab969 plus the merge of `main` 570254b (R4 m4.13, renderer/CLI/extension only). The gate script is `specs/handoffs/gates-layout-phases-heron.sh`; its base moves with the merge.

## Deviations from plan

- Gate 2 before wave 2 ([exec] to [deep]) passed as an unattended checkpoint.
- Gate 4 (m1 to m2) and gate 2 before wave 4 passed as unattended checkpoints. The milestone handoff core.md asks for at gate 4 is kept as a section of this session handoff ("Milestone m1 summary") rather than a separate `handoff-m2-*.md`, since every run file is removed in the last commit.
- Gate 4 (m2 to m3) passed as a checkpoint before wave 5; m2 summary kept in this handoff the same way.
- Gate 2 before wave 6 ([exec] to [deep]) passed as a checkpoint.
- Gate 4 (m3 to m4) passed as a checkpoint before wave 6's m4 unit; m3 summary kept in this handoff.
- Gate 4 (m4 to m5) passed as a checkpoint before wave 6's m5 unit; m4 summary kept in this handoff.
- Gate 4 (m5 to m6) passed as a checkpoint before wave 6's m6 unit; m5 summary kept in this handoff.
- m6.s1: f5 packs the marker band at its final header-rows top instead of f7 moving it (the band is final after f5 under the slot rules); same outcome as the spec, different mechanism. The beside-card rule applies to the pill-row part only; marker-band growth keeps today's behaviour.
- Gary asked to merge `main` (R3 #153 and #154 landed). The merge waits for the m6 unit, then a delegated general-purpose subagent resolves it (code conflicts in `layout.ts` and `roadmap-node.ts`, plus R3's edits to code m5 moved into new modules), since the parent does no source edits; it is not a plan step and gets no Review log line, but its gate results are recorded here.
- Spend passed the Cost table's expected total (~$49.29 of ~$46) after the m5 unit (~$17.10 against the wave-6 row's ~$20 for four units); not a stop, guard is $138.
- m5's worker probed a built 6513424 tree in `.scratch/probe/t0` (deleted) and temporarily patched the cached `.scratch/g1/base-9c71cbb19e8e` build with stderr probe lines to reconcile the coverage register with §1.2, then restored it; the cached base renders were not touched and the reviewer's gate run passed against that base.
- m3.s3's worker briefly copied two test files into the gitignored `.scratch/g1/base-4498948` tree while checking its tests fail on the base, then removed them; inside the working directory, nothing tracked touched.

## Spend

~$56.34 of ~$46 expected (over expected; guard $138) (guard 3x min $50 = $138). Wave 1 ran ~$2.85 against ~$0.75 expected (cold gate-script build, 5-minute gate runs); later waves' gate runs are warm.

## Next unit

Merge `main` (R3 #153, #154), then wave 7 [exec] m6 s3.

## How to resume

Paste the plan's Kickoff prompt.

## Pending question (verbatim)

None. Kickoff answered: "Unattended"; re-confirmed by the pasted Kickoff prompt.

## Decisions so far

- R1 has landed, so the full m1-m6 plan runs; F1 is m6.s2, its own step right after L2 (m6.s1), since it reads the header-rows bottom L2 completes.
- G1/G3 compare each step with the branch's merge-base with `origin/main` (valid because every earlier step is byte-identical or declared); m6.s2 and m6.s3 pass `--expect` with F1's nine renders.
- The G1 base tree and renders live in `.scratch/g1/` inside the repo (gitignored, and ignored by Biome through its VCS setting), so workers stay inside their working directory. No `git worktree`.
- G3 (exporter bytes plus `make compile TARGET=local && make determinism`) runs on every step even though the spec scopes it to steps that touch exporters or the schedule.
- `Theme.statusTint` ships without a changelog fragment, per the spec; the PR body names it.
- From wave 1 (PASS): the gate script compares path by path with `cmp` over both render trees; `--expect` paths are relative to the render root, `g1/...` (SVG) and `g3/...` (exports), so m6.s2's expect file lists F1's renders in that form. Samples come from `git ls-tree` at the base (60 files). `applyStatusTheme` is local to `layout.ts`, not exported (m2.s1 moves it into `item-measure`); a `THEME_STATUS_KEY` map converts `StatusKind` (`in-progress`) to theme keys (`inProgress`).
- From wave 2 (PASS): `sequenceRowTrack(content, origin: RowTrackOrigin {leftX, firstRowY}, ctx, helpers: LayoutHelpers): RowTrackResult {children, timeCursorX, packer}`; callers read `usedHeight()`/`usedRightX()` through `result.packer`. `SwimlaneNode` never read `timeCursorX` after its loop, so only `GroupNode` reads it. Lane/group loops differed only in iterated content.
- From wave 3 (PASS): `nodes/marker-band.ts` also holds `calendarLabelEntry`, `MarkerEntity` (exported), `markerLabelWidth` and `PackedPlacement`; `collectSlackCorridors` sits after `buildMilestones` in `milestone-node.ts`.
- From wave 4 (PASS): `ItemNode` takes `ItemNodeGeometry` (id, naturalWidth, visualWidth, caption {leftInset, fit}, barExtra), a structural subset that `ItemMeasure` extends. `ItemMeasure` keeps two named widths for byte identity: `visualWidth` (box width, `(startX + naturalWidth) - startX`) and `naturalVisualWidth` (naturalWidth less insets, read by chip fit and first-line reserve); it also carries id, size, caption.title/leftInset/lastBaseline. `sequenceItem` throws if a handed measure's start differs from the placement start. The corpus test uses a test-only `setItemNodeTrace` hook. Moved helpers stay exported from `item-measure.ts`. The row height is now the pitch (`step + barExtra`).
- From wave 5 (PASS): `createLayoutContext` resolves sizes itself from `source.content.sizes` under `shared.cal`; `init` has `footnotes` and `markerRowPlacements`; `waves` is spread in only when set. `buildFootnotes` is now `indexFootnotes(footnotes): FootnoteIndex` (type in `footnote-node.ts`) plus `buildFootnotePanel(...): PositionedFootnoteArea`; where later step text (m3.s3) says `buildFootnotes`, read `buildFootnotePanel`. `place` indexes once, before building the context, and hands the index in through `init.footnotes`.
- From wave 6 m3 unit (PASS): `CanvasExtent` is private to `roadmap-node.ts` with only `grow` and `rightX`; its seed is `naturalChartRightX`, grown at P3, P7, P8, and a final `chartRightX` after P8 feeds P9, P10, the header, the attribution and the model (m5.s4 moves it to `phases/finalize.ts` and adds `freeze`/`final`). `MilestoneNode.place` returns `MilestonePlacement`; `positionMilestones(placements, rows)` builds `PositionedMilestone` at P11 and throws on a missing re-pack row. `MilestoneNode.place` still writes each milestone's entity midpoint with a pre-pack y named `estimatedCenterY` (stale read kept, §3.10 rule 4; marker-predecessor slack arrows read it). `buildNowline`, `buildWaveLegend`, `buildFootnotePanel` take `chartRightX` as their last argument. `specs/waves.md` still says `buildFootnotes`; m6.s3's spec update fixes it.
- From wave 6 m4 unit (PASS): `HeaderNode({title, author?, style, logo?: ScaledLogo})` takes the logo already resolved (`resolveHeaderLogo` stays in `RoadmapNode`; `ScaledLogo` exported from `header-logo.ts`). `MeasuredHeader.position` is `HeaderPosition`. `place` returns `PositionedHeaderParts` (`PositionedHeader` without `attributionBox`); `RoadmapNode` builds `{ ...headerParts, attributionBox }`. The 8 px chart-top gap is `CHART_TOP_GAP_PX`. The private helper in `header-node.ts` keeps the name `sizeBesideHeader` (renderer comments cite it). `RoadmapNode` passes `rowsBottomY: estimatedRowsBottomY` (L1 stale read, until F1).
- From wave 6 m5 unit (PASS): `DateWindow` has no `sizes` field (contexts resolve sizes). `MeasuredRoadmap` adds `headerNode` (f15 places the header) and `naturalChartRightX`; `MarkerEstimate` adds `hasEntities` (f5). The context gets a copy of the estimated placements; f5 installs a fresh map. N5's text is `WaveLayoutState.backgroundTooltip` (4th argument of `createWaveLayoutState`), set in `sequence-item.ts`. P5 stays in place (P6 cut lines read `swimlaneBottomY`). `FinalizeStep.run` returns whether it changed something (coverage trace); the trace hook is module-level `setFinalizeTrace`. Slot rules: input, final (after a named step), cursor (advanced by named steps), product; f9 also writes the timeline, f10 marker midpoints. `CanvasExtent` has `provisional` (read by f3 before freezing); `grow()` returns whether it grew. `sequenceItem` is in `nodes/sequence-item.ts` (not `item-node.ts`: import cycle) and the dispatcher in `nodes/sequence-one.ts`. `resolveChildStart` dropped its unused `laneLeftX`. Coverage register deltas from §1.2: f1 29/26, f2 7/6, f4 35/32 (R1's F1, via showcase, sizing, late-row-shifts); f6 7/9 (definition: the provisional label box m3.s3 removed); f10, f11, f12, f14, f16 have no §1.2 number. m6.s2 (F1) will change the coverage counts of the samples it changes only if a finalize step's effect changes; update `finalize-coverage.json` in m6.s1/m6.s2 only if the register test fails, and name the change.
- m6.s3 follow-ups from m5: name `sequence-item.ts` and `sequence-one.ts`, `DateWindow` without `sizes`, the extra `MeasuredRoadmap` and `MarkerEstimate` fields, fix `specs/waves.md` (`buildFootnotes`), and fix the `src/schedule.ts` comments that still name `RoadmapNode.place`.
- From Gary, relaying the m4.12 (R3) session (branch `claude/zealous-thompson-tur82q`, not yet merged): R3 adds `@nowline/core/internal` (`trackChildren`, `trackNodes`, `declarations` in `packages/core/src/language/ast-walk.ts`), rewrites layout's `collectItems` on `trackNodes`, removes the `stripColon` copy in `roadmap-node.ts`, and replaces layout's `propValue`, `propValues`, `stripColon` and `parseDate` with core's `util/props.ts` (strict `parseIsoDate`: an impossible day reads as no date); `style-resolution.ts` builds on core's `styleLayers`. When R3 lands on main first, the parent's merge resolves toward the core helpers: `sequenceRowTrack` descends with `trackChildren` (own recursion kept for inherited state), `collectItems` stays on `trackNodes` in `nodes/dependency-edges.ts`, and conflicts in `dsl-utils.ts`, `style-resolution.ts`, `calendar-resolver.ts` and the `nodes/*` date reads go toward core. If this branch lands first, R3 rebases.
- From wave 6 m6 unit (PASS): `headerRowsTimelineY` (measure.ts) is the one beside-card rule; `resolveHeaderRowsTop` and the guarded `FinalizeContext.headerRowsTop()` (throws before f2) reserve the 16 px pill row; f7 records the final rows bottom in the `rowsBottom` slot, read through the guarded `headerRowsBottom()` by f15. `HeaderBands` gains `rowsHeight` and loses `estimatedRowsBottomY`. `finalize-coverage.json` unchanged. m6.s3 follow-ups for `specs/layout-phases.md`: §3.3 HeaderBands (drop `estimatedRowsBottomY`, add `rowsHeight`); §3.5 (f5 reads scale, f7 writes `rowsBottom`, f15 reads it); §3.7, §3.10 rule 4 and the m4.s2 text still name `estimatedRowsBottomY`; add `headerRowsTop()` and `headerRowsBottom()` to the guard list. The F1 expect file is `.scratch/f1-expect.txt` (nine `g1/...` paths).

## Environment notes

- Cloud runner; `make doctor` passed at session start. Bun is at `/root/.bun/bin/bun` (needed by `make compile`).
- `origin/HEAD` was unset in the cloud checkout; set with `git remote set-head origin --auto`.
- Git identity is the runner's (`noreply@anthropic.com`); accepted per the runner rule.
- The runner has Node 22.22.0 though `.nvmrc` says 26.2.0; `make init`, `build-fast`, `compile`, `determinism` and `pre-commit` all work with it.
- `node_modules` may be absent in a fresh container: `make init` (~20s) then `make build-fast` (~10s) first.
- The gate script puts `$HOME/.bun/bin` on PATH itself for `make compile`. A cold gate run (base build plus 360 base renders) takes ~5 min, a warm one ~3 min; `make determinism` is ~90s of that.
- No Makefile target runs a single test file; `node_modules/.bin/vitest run <file>` inside the package checks a new test fails on the base. The gate is still `make pre-commit`.
- Biome had 11 pre-existing warnings at the base; m1.s3 removed the two unused `props`, so 9 remain; after the 570254b merge `make lint` reports 10 (cli/options.ts, export-mermaid, roadmap-node.ts:17, mcp.smoke.test.ts), none from this branch.
- After a merge of `main` the gate's merge-base moves and the first gate run rebuilds the base cold (~5 min).
- In `packages/layout`, vitest is `packages/layout/node_modules/.bin/vitest`.
- Run `make format` after edits; `make lint` flags Biome format drift (line width).
- `make bundle-size` (CI runs it as its own job; `make pre-commit` does not) is 199.51 KB of the 200 KB gzip budget at 56d00f7 (0.49 KB headroom); main at 9c71cbb is 197.97 KB, so m1-m5 added ~1.54 KB. R3 reports 197.94 KB on its branch. Every remaining step runs `make bundle-size` before committing and must stay under budget; the parent runs it before every push. At c064e10 it is 199.86 KB (0.14 KB headroom; m6.s1 ~0.24 KB, m6.s2 ~0.11 KB).
- Determinism goldens for Node only: `UPDATE_DETERMINISM_GOLDENS=1 make determinism` with `$HOME/.bun/bin` on PATH (`make determinism-update` also installs chromium). Layout snapshots: `UPDATE_LAYOUT_SNAPSHOTS=1 packages/integration-tests/node_modules/.bin/vitest run test/snapshot.test.ts` from `packages/integration-tests`.
- After moving code, `npx biome lint --write --unsafe --only=correctness/noUnusedImports <files>` removes unused imports (without `--unsafe` Biome fixes nothing). Biome reports 9 pre-existing warnings at 56d00f7.
- To check a new test fails on the base without `git worktree`: copy it into `.scratch/g1/base-<merge-base>/packages/layout/test/`, run that tree's `node_modules/.bin/vitest run <file>`, then delete the copy. Use the current merge-base's tree, not an older one.
