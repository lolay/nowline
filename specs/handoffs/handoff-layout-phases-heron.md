# Handoff: m4.14 layout phases (R2), orchestrate run

- **Plan:** `specs/handoffs/plan-layout-phases-heron.md`
- **Branch:** `claude/vibrant-hopper-ac4s73` (harness-assigned task branch; started at ff8eb8b, fast-forwarded to `origin/main` 4498948 at kickoff, no commits of its own before this one)
- **Mode:** unattended (confirmed 2026-10-13, session 7e027fcc-1ca6-51b0-b005-63e1163df819; harness=claude-code runner=cloud)
- **Status:** m1-m3 complete (waves 1-5 and wave 6's m3 unit PASS). Dispatching wave 6, unit m4 s1-s2.

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
- Gate 4 (m3 to m4) passes as a checkpoint before wave 6's m4 unit; m3 summary kept in this handoff.
- m3.s3's worker briefly copied two test files into the gitignored `.scratch/g1/base-4498948` tree while checking its tests fail on the base, then removed them; inside the working directory, nothing tracked touched.

## Spend

~$28.21 of ~$46 expected (guard 3x min $50 = $138). Wave 1 ran ~$2.85 against ~$0.75 expected (cold gate-script build, 5-minute gate runs); later waves' gate runs are warm.

## Next unit

Wave 6 [deep], unit m4 s1-s2 (then m5 and m6 s1-s2).

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
- To check a new test fails on the base without `git worktree`: copy it into `.scratch/g1/base-<merge-base>/packages/layout/test/`, run that tree's `node_modules/.bin/vitest run <file>`, then delete the copy. Use the current merge-base's tree, not an older one.
