```
--- KICKOFF: begin orchestration at [deep] ---

  Status: 10/10 groups done | last review: wave-7-fix2 PASS | current: completion | updated 2026-10-13 | passed unattended: gate 1 (fix-up 2 of 2) | over expected: ~$66.25 of ~$46

  mode: unattended | proposed unattended (harness=claude-code runner=cloud; CLAUDE_CODE_REMOTE=true, assigned branch) | guard 3x min $50 | fixups 2 | confirmed 2026-10-13 session 7e027fcc-1ca6-51b0-b005-63e1163df819 by Kickoff prompt: Run in unattended mode.

  review: every-wave (log-only)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-layout-phases-heron.md. The plan is already tagged.
    On branch claude/vibrant-hopper-ac4s73 (task branch): subagents commit each finished step.
    Run in unattended mode.
    Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's
    procedure, and pause only where the recorded mode stops. Do not
    execute plan work inline. Update plan progress after each wave
    returns per the skill's procedure. The mode line above is the
    kickoff answer. If the Status line shows BLOCKED, re-post that
    question and wait; otherwise record the mode, print the kickoff
    summary and begin dispatching.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [exec] m1 s1-s2 | ~1.6M | ~$0.75 |
| 2 [deep] m1 s3 | ~2.7M | ~$1.4 |
| 3 [exec] m1 s4 | ~1.3M | ~$0.65 |
| 4 [deep] m2 s1-s2 | ~7.8M | ~$4.1 |
| 5 [exec] m3 s1-s2 | ~1.6M | ~$0.75 |
| 6 [deep] m3 s3, m4 s1-s2, m5 s1-s5, m6 s1-s2 | ~38M | ~$20 |
| 7 [exec] m6 s3 | ~2.0M | ~$0.89 |
| 7-fix [exec] nowline m6 s3 | — | — |
| 7-fix2 [exec] nowline m6 s3 | — | — |
| orchestrator | ~21M | ~$17 |
| **Total** | ~76M | ~$46 |

Expected values are estimates, good to about 2-3× per wave. Sizes: m1.s1, m1.s2, m1.s4, m3.s1, m3.s2 small; m1.s3, m2.s2, m4.s1, m4.s2, m5.s1, m6.s1, m6.s2, m6.s3 medium; m2.s1, m3.s3, m5.s2-s5 large. Wave 6 runs as four units (one per milestone), each with its own review. Orchestrator: kickoff, one resume after `/compact`, ten units' bookkeeping, one gate wait (unattended).

# Plan: m4.14 layout phases (R2)

## Context

`specs/layout-phases.md` (accepted 2026-10-13) splits the 857-line `RoadmapNode.place` into date-window, measure, place and finalize phases, makes the post-placement fixups (P1-P20, N1-N7) one ordered, checked finalize pass, measures items once, extracts `HeaderNode`, merges the lane/group loops, the `*Deps` interfaces and the two `LayoutContext` literals, and moves status tints into the theme. It also fixes two shipping ordering bugs: L1 (beside card misses a grown marker band, fixed as F1) and L2 (now-line on an extended axis gets no pill row). Read the spec in full before any step; also `specs/scheduler-unification.md` (R1, especially §9 "As built") and `specs/rendering-v2.md`.

**Ordering gate: passes.** R1 (m4.11) merged as #150 (4498948): `computeContentEndDay` is gone from `layout.ts`, `LayoutOptions.schedule` exists, and the window comes from `computeDateWindow(file, schedule, today, scale)`. R1 as-built notes that matter here: `computeDateWindow` takes its calendar from `schedule.calendar`; `LayoutContext.schedule` already exists (so `createLayoutContext`'s `shared` carries it); item durations come from `scheduledItemDays(ctx, item)`; R1's F1 changed `examples/showcase`, `examples/sizing`, `tests/late-row-shifts`, so §1.2 corpus counts and the L1 numbers may have moved (re-measured where they matter, m5.s4 and m6.s2).

Spec line references were taken at 0062df3; R1 shifted `layout.ts` (1934 -> 1635 lines) and `roadmap-node.ts` slightly. Locate code by symbol, not line.

Branch: `claude/vibrant-hopper-ac4s73` (harness-assigned), fast-forwarded to `origin/main` 4498948 at kickoff. Plan, handoff and gate script live in `specs/handoffs/` as `plan-layout-phases-heron.md`, `handoff-layout-phases-heron.md`, `gates-layout-phases-heron.sh`, removed in the last commit. One branch, one commit per step, one PR at the end (asked before opening). lolay/nowline is public: write nothing about private sibling repos.

## Gates

Every step meets all of these unless its text says otherwise.

- **Gate script.** `specs/handoffs/gates-layout-phases-heron.sh`, written in m1.s1. Usage `gates-layout-phases-heron.sh [--base <commit>] [--expect <file>]`. It:
  - takes the base as `--base`, default `git merge-base HEAD origin/main`;
  - extracts the base with `git archive <base> | tar -x` into `.scratch/g1/base-<sha>/` (gitignored, inside the repo; no `git worktree`), runs `make init build-fast` there once (cached by a marker file);
  - renders the base once into `.scratch/g1/renders-<sha>/` (cached) and the working tree, after `make build-fast`, into a fresh `.scratch/g1/step/`;
  - **G1:** the base's `git ls-files 'examples/**.nowline' 'tests/*.nowline'` (60 files), each in light, dark and grayscale with `--now 2026-02-09`, SVG to stdout plus an `exit N` status file, as in `layout-phases.md` §4;
  - **G3:** each sample with `-f xlsx`, `-f msproj`, `-f mermaid` and `--now 2026-02-09`, bytes plus exit status, in the same trees; then `make compile TARGET=local` and `make determinism` (no `UPDATE_DETERMINISM_GOLDENS`);
  - compares with `diff -r`; with `--expect <file>` (one relative path per line) a difference is allowed only on the listed paths, and every listed path must differ; prints every difference and exits non-zero on any failure.
- **G1 and G3** pass with an empty diff against the default base, except where a step says otherwise. Comparing every step with the merge-base is valid because every step before it is byte-identical or declared. After the parent merges `main`, the merge-base moves and the base rebuilds.
- **G2:** `make pre-commit` green without `UPDATE_LAYOUT_SNAPSHOTS`; this includes R1's engine divergence register, which must stay green (R2 changes no scheduling). Re-run immediately before each commit (AGENTS.md).
- No snapshot, golden or determinism edits except the ones m6.s2 declares. No changelog fragment except m6.s1 and m6.s2 (both in `.changelog/layout-phases.txt`). `Theme.statusTint` is an additive public type change with no fragment, per the spec's "no fragment except where noted".
- Each step that changes observable structure adds the tests its text names; a test that asserts new structure must fail on the base.
- Commits: subject `m{N}.s{K} <imperative subject>`, <=72 chars, no trailing period; body says what moved and the G1-G3 result (renders compared, diff empty or the declared list); trailers per the git instruction, `Assisted-by: Claude Code` last; no Co-authored-by. Repo rules: `AGENTS.md`, `CONTRIBUTING.md`, `.changelog/README.md`, `.claude/skills/steward/SKILL.md`. TypeScript is 4-space; keep `.js` import suffixes.
- Byte-identity rules of `layout-phases.md` §3.10 apply to every step: same operands in the same order, same side-effect order inside placement, drop a provisional value only where every path overwrites it (name the overwrite in the commit body), keep stale reads under names that say so until their fix lands, keep the model's key set.
- Parent, before every unit: fetch `main`; if the branch is behind, merge it (merge commit; conflicts per steward: R3 m4.12 and R4 m4.13 may edit `packages/layout`, `collectItems`, `stripColon`), run `make pre-commit`, push.

--- WAVE 1 [exec] ---

## m1 - Seams that need no phase

#### s1 - [exec] Status tints become theme tokens (done)

First write the gate script described under Gates and run it once on the unchanged tree: G1 and G3 must report an empty diff (it proves the harness, and two runs on one commit must agree). Commit it with this step.

Then add `statusTint: { done, inProgress, atRisk, blocked, planned, neutral }` (spec §3.9 keys and values) to `Theme` in `packages/layout/src/themes/shape.ts` and to `light.ts`, `dark.ts`, `grayscale.ts`, moving the `STATUS_TINT_*` values verbatim. `sequenceItem` (`layout.ts`) applies `theme.statusTint[key]` when `style.bg === theme.entities.item.bg` and `theme.status[key]` when `style.fg === theme.entities.item.fg`, on a copy of the style; first confirm those item defaults equal today's `#0f172a`/`#ffffff`/`#94a3b8`/`#9e9e9e` per theme. Delete the three tint tables and the hard-coded defaults. Test: per theme, a default item takes each status's tint; an explicit `bg:` wins. G1, G2, G3.

#### s2 - [exec] One helper interface (done)

Replace `SwimlaneNodeDeps`, `GroupNodeDeps`, `IncludeNodeDeps` and `ParallelNodeDeps` with `LayoutHelpers` (`layout-context.ts`) or a `Pick` of it; drop the never-passed `ownerOverride` from `sequenceItem`, `resolveItemMeta` and the helper types (confirm no caller passes it). `RoadmapNodeDeps` stays until m5.s5. No runtime change. G1, G2, G3.

--- WAVE 2 [deep] ---

#### s3 - [deep] One row-track loop for lanes and groups (done)

Add `packages/layout/src/nodes/row-track.ts` with `sequenceRowTrack(content, origin, ctx, helpers): RowTrackResult` (spec §3.8), the shared child loop of `SwimlaneNode` and `GroupNode`. Diff the two loops first (strip comments, rename `laneLeftX`/`groupContentLeftX` and `cursor`/`innerCursor`); the spec found only the iterated content differs. Any further difference becomes a parameter and goes in the commit body, never silently unified. `SwimlaneNode` keeps its tab and top-pad logic and `GroupNode` its chiclet, header band and box; both read `usedHeight`, `usedRightX` and `timeCursorX` from the result. Side-effect order and arithmetic unchanged. Covered by the lane and group tests, `tests/late-row-shifts.nowline` and the attach-geometry sweep. G1, G2, G3.

--- WAVE 3 [exec] ---

#### s4 - [exec] Marker band and corridor helpers leave `roadmap-node.ts` (done)

Move `packMarkerRow`, `markerLabelsRightX`, the run and exception entries and their ids into `packages/layout/src/nodes/marker-band.ts`, and `collectSlackCorridors` into `nodes/milestone-node.ts`, beside the helpers it reuses. A pure move; the calls in `place` keep their names; tests that import these change only their import path. G1, G2, G3.

--- WAVE 4 [deep] ---

## m2 - Items are measured once

#### s1 - [deep] `measureItem` and the full `ItemNode.measure` (done)

Add `packages/layout/src/nodes/item-measure.ts` with `ItemMeasure` and `measureItem(node, startX, ctx)` (spec §3.6): the front half of `sequenceItem` without the start resolution and the `before:` caps, with the duration from `scheduledItemDays`, the status tint from m1.s1 (on a copy of the style) and the helpers it needs (`statusFromProp`, `resolveItemProgress`, `resolveItemMeta`, chip sampling, `computeChipBarExtra`, `collectItemFootnoteIndicators`, `resolveTitleFirstLineReserve`, `parseLinkIcon`), moved without changing arithmetic. `measureItem` reads the scope, the scale and the footnote index, never an entity edge or a placed item. `ItemNode` is built from the measure: `measure()` returns `{ width: naturalWidth, height: bandwidth + barExtra }` and `place` returns the grown box, so no caller patches its height (N6); keep today's "grow only when `barExtra > 0`" arithmetic. `predictItemBarExtraHeight` stays this step. Test: for every placed item across the corpus (every `examples/**.nowline` and `tests/*.nowline`), `ItemNode.measure().height` equals the placed box height. G1, G2, G3.

#### s2 - [deep] Derive the prediction from the measure (done)

`sequenceRowTrack` calls `measureItem` at `ctx.scale.startX(resolveChildStart(...))`, takes the desired end (`start + naturalWidth`) and the row pitch (`step + barExtra`) from it, and hands the measure to `sequenceItem`; parallel tracks, which reach `sequenceItem` directly, measure where they place. Delete `predictItemBarExtraHeight`, its `LayoutHelpers` slot, the second `computeChipBarExtra` caller and the duplicate width math in the loop. Replace the safety-net `Math.max` row height with the pitch only if G1 stays empty: `step + barExtra` and `step + ((bandwidth + barExtra) - bandwidth)` can differ by an ulp; if a byte moves, keep the commit-time expression and assert equality in a test instead, and say so in the commit body. Verify the spec's identity claims as you go (the wave floor is idempotent through `resolveChildStart`; `!!link` equals `parseLinkIcon(link).icon !== 'none'` for every link the validator accepts) and report any that fail. Unit fixtures, because the corpus never exercises a mismatch: a wrapped title, a spilled chip column and a narrow-bar link spill, each asserting the predicted pitch equals the placed height. G1, G2, G3.

--- WAVE 5 [exec] ---

## m3 - Placement and its context

#### s1 - [exec] One `LayoutContext` builder (done)

Add `createLayoutContext(source, shared, chart, init)` to `packages/layout/src/layout-context.ts` (spec §3.8, with `schedule` in `shared` since R1 already added it to the context); `RoadmapNode.place` and `buildIncludeRegions` call it instead of their literals. The chart fields pass through unchanged (root: `chartTopY` from the timeline, both bottoms 0, `chartRightX` final; region: all three y fields `innerStartY`, the host's `chartRightX`), a region gets no footnotes and no marker placements, and the caller still seeds the wave edges. G1, G2, G3.

#### s2 - [exec] Footnotes indexed once (done)

Split `buildFootnotes` into a pure `indexFootnotes(footnotes)` (index and hosts) and the panel; `place` indexes once, and the panel is built once where P19 builds it today. G1, G2, G3.

--- WAVE 6 [deep] ---

#### s3 - [deep] Placement stops reading the canvas (done)

Lanes no longer set their width (N2), regions are fitted only after P8 (N4), and milestones no longer compute a provisional row and label box (N7, with `decideLabelBoxForCanvas`): `MilestoneNode.place` returns a `MilestonePlacement`, and the positioned milestone is built where P11 patches it today. `chartRightX` moves from `LayoutContext` into a `CanvasExtent` that `RoadmapNode.place` owns until m5.s4; the builders that read it after placement (`buildNowline`, `buildWaveLegend`, `buildFootnotes`) take it as an argument. The commit body names the overwrite of each dropped value (P9, P10, P11). Tests: every milestone the model carries has a re-pack placement; the snapshot invariant (lanes span the canvas, regions stay inside it) still holds; a unit fixture for a region whose bars reach the canvas edge, because no sample exercises a re-fit. G1, G2, G3.

## m4 - `HeaderNode`

#### s1 - [deep] Measure the header (done)

Add `packages/layout/src/nodes/header-node.ts` with `HeaderNode` and `measure()` returning `MeasuredHeader` (spec §3.7), absorbing `sizeBesideHeader` and `HEADER_CARD_OUTER_PAD` from `layout.ts`, the above-mode height, `chartLeftX` and `chartTopY`, and the card's minimum with `HEADER_CARD_TOP_INSET`; drop `sizeBesideHeader` from `RoadmapNodeDeps`. Measure-phase code still turns `minRowsBottomY` into the timeline y as today. Covered by the header-height and header-logo tests (beside, above, every logo size). G1, G2, G3.

#### s2 - [deep] Place the header (done)

`HeaderNode.place(measured, { rowsBottomY, chartBottomY, canvasRightX })` builds the header box, card box, logo box, text inset and header object; `RoadmapNode.place` passes `rowsBottomY` as the estimated rows bottom it uses today (renamed `estimatedRowsBottomY`, §3.10 rule 4). The attribution box stays where it is (f16 later). G1, G2, G3.

## m5 - The four phases

#### s1 - [deep] The date-window phase (done)

Add `packages/layout/src/phases/date-window.ts` with `RoadmapScope`, `DateWindow`, `resolveScope` and `resolveDateWindow` (spec §3.2, with `naturalEndDate`), built on R1's `computeDateWindow(file, schedule, today, scale)`, which moves there from `layout.ts` and leaves `RoadmapNodeDeps`. `date-window.test.ts` imports it from the new module. G1, G2, G3.

#### s2 - [deep] The measure phase (done)

Add `phases/measure.ts` with `measureRoadmap` returning `MeasuredRoadmap` (spec §3.3): axis, `HeaderBands` (with `estimatedMarkerRows` and `estimatedRowsBottomY`), the marker estimate through `MarkerBand`, and the timeline. The marker entry assembly and the placement-to-y conversion, written twice in `place` today, become one each in `nodes/marker-band.ts`. G1, G2, G3.

#### s3 - [deep] The place phase (done)

Add `phases/place.ts` with `placeChart` returning `PlacedChart` (spec §3.4): context, entity-edge seeds, footnote index, the barrier passes (P1), the corridor rerun unchanged (P2), the kept regions (P4), the milestones (P6), and the background `waveTooltip` set where the item is placed instead of by the walk in `buildWaves` (N5). The waves, wave-barrier and waves-byte-stability tests cover the passes. G1, G2, G3.

#### s4 - [deep] The finalize context and the ordered pass (done)

Add `phases/finalize.ts`: `FinalizeContext`, `CanvasExtent` with `grow`/`freeze`/`final`, the `finalScale()` and `markerBand()` guards, and steps f1 to f16 as a constant table with declared reads and writes (spec §3.5); f1 moves to the head of finalize. Tests: the order check (a copy of the table with f4 moved before f2 fails it); each guard throws (growing a frozen canvas, reading the canvas before f3, the final scale before f2, the marker band before f5); and the coverage register `packages/layout/test/finalize-coverage.test.ts` with a committed `finalize-coverage.json`, built through an internal trace hook on `FinalizeContext` over every sample (spec §6). Seed the JSON from the actual trace and reconcile it with spec §1.2's corpus column; list every count that differs from §1.2 in the commit body with its cause (R1's F1 changed showcase, sizing and late-row-shifts). G1, G2, G3.

#### s5 - [deep] The composition root shrinks (done)

`RoadmapNode.place` becomes the four calls of spec §3.1, with `sequenceOne` still injected (§8 decision 4). `collectItems` and `buildDependencies` move to `dependency-edges.ts`, `buildNowline` to `nowline-node.ts`, the start rules (`resolveChildStart` and friends) to `start-rules.ts` beside R1's `start-terms.ts`; `RoadmapNodeDeps` is deleted; `layout.ts` keeps `layoutRoadmap` and `LayoutOptions`. G1, G2, G3.

## m6 - After the phases

#### s1 - [deep] *Behaviour:* reserve the now-pill row on an extended axis (done)

L2 (spec §1.3, §8 decision 2). First reproduce it on the current code: `examples/platform-2026.nowline` with `length:1w` added and `--now 2026-03-17` should lay out with `pillRowHeight` 0 and the pill on the tick panel's y. If R1 already changed this repro, find one that still hits L2 and say so in the commit body. Then f7 becomes `growHeaderRows` in full: when f2 brought `today` into the axis and the pill row is 0, the header rows grow by `NOW_PILL_HEIGHT_PX` above the tick panel, so the tick panel, wave strip, marker band and chart move down together, in the same shift as the marker-band growth; the new timeline y follows the beside-card rule rather than adding the height blindly. Regression test from the repro (fails on the base). Fragment: create `.changelog/layout-phases.txt` with one `release-note:fixed` block describing L2 in the style of the existing fragments. G1 and G3 against the default base: empty (no sample changes). G2.

#### s2 - [deep] *Behaviour:* beside card hugs the grown header rows (done)

F1 (spec §5, §8 decision 3). f15 passes the final header-rows bottom, after f7 (so it also covers s1's pill row), instead of `estimatedRowsBottomY`, which goes away. Expected changes: the renders of `examples/dependencies`, `tests/late-row-shifts` and `tests/marker-left-overflow` in all three themes; the layout snapshots `dependencies.svg` and `marker-left-overflow.svg` under `packages/integration-tests/test/__snapshots__/`; and the `dependencies` cells of the determinism goldens. Re-measure before committing (R1's F1 changed `late-row-shifts`): run the gate with `--expect` listing the nine SVG renders, and if the changed set of renders, snapshots or golden cells differs from this list, return `needs_info` with the actual set instead of committing. Update only those snapshots and golden cells, confirm in each changed render that the card bottom equals the header rows' bottom, add a regression test (fails on the base), and append a `release-note:fixed` block to `.changelog/layout-phases.txt`. The commit body names every changed render, snapshot and golden cell. G2 after the deliberate update.

--- WAVE 7 [exec] ---

#### s3 - [exec] Update the specs (done)

Docs only. `specs/rendering-v2.md` (the phases, which nodes measure, the header answer to `rendering-v2.md:292`), `specs/rendering.md` where it describes the extension pass, `specs/waves.md` §8.4 (the pass-loop order names the finalize steps), the header comment of `packages/layout/src/nodes/renderable.ts`, `specs/layout-phases.md` status to implemented with a "§9 As built" section (deviations from the spec text found in m1-m6, in the style of `scheduler-unification.md` §9), and the `specs/milestones.md` m4.14 entry. Run the gate with `--expect` holding m6.s2's nine renders. G2.

## Completion

1. Parent merges `main`, re-runs `make pre-commit` and the gate script.
2. Last commit removes `plan-layout-phases-heron.md`, `handoff-layout-phases-heron.md` and `gates-layout-phases-heron.sh`.
3. Ask before opening the PR. Body: per-step G1-G3 results, the L2 and F1 changes with every changed render, snapshot and golden cell, `Theme.statusTint`, and any as-built deviations.

Out of scope: F2 (local coordinates), F3 (after R1 F3), R5 renderer status table.

## Review log

review wave-1 (nowline m1 s1-s2) 0b49f7c..28771a2: PASS - gate script re-run by reviewer on 28771a2: 360 renders, 0 differing paths, compile and determinism 314/314; make pre-commit green; statusTint values match §3.9; four Deps interfaces gone, ownerOverride dropped - 2026-10-13
review wave-2 (nowline m1 s3) b448282..7e64d9c: PASS - loops diffed: only iterated content differs, no extra parameter; RowTrackResult {children, timeCursorX, packer} per §3.8; side-effect order unchanged; G1/G3 empty, pre-commit green; SwimlaneNode never read timeCursorX at the base, so only GroupNode reads it; passed unattended: gate 2 - 2026-10-13
review wave-3 (nowline m1 s4) 4400fbd..bbab969: PASS - pure move confirmed line by line (only export keywords, header and imports differ); marker-band.ts also carries calendarLabelEntry, MarkerEntity (exported), markerLabelWidth, PackedPlacement; collectSlackCorridors after buildMilestones; no test imported the moved symbols; G1/G3 empty per worker - 2026-10-13
review wave-4 (nowline m2 s1-s2) f354568..f5a6416: PASS - reviewer re-ran the gate script vs 570254b: GATES PASSED; moved helpers arithmetic-identical; measureItem reads no entity edges or placed items; ItemMeasure keeps visualWidth and naturalVisualWidth by name for byte identity; safety-net Math.max replaced by the pitch (G1 empty); predictItemBarExtraHeight gone, one computeChipBarExtra caller; both identity claims hold; corpus test and three fixtures fail on the base; passed unattended: gate 4, gate 2 - 2026-10-13
review wave-5 (nowline m3 s1-s2) bb92ae0..1dd90a6: PASS - createLayoutContext per §3.8, no LayoutContext literal left in place or buildIncludeRegions, chart fields pass through, regions get empty footnotes and marker placements; indexFootnotes pure, buildFootnotePanel built once at P19; dropped values (pre-panel with chartBottomY 0, P19 map reassignment) named; new tests fail on the base; G1/G3 empty per worker; non-blocking: specs/waves.md and m3.s3 text still say buildFootnotes (now buildFootnotePanel); passed unattended: gate 4 - 2026-10-13
review wave-6 (nowline m3 s3) cb898b5..3112f70: PASS - reviewer re-ran the gate script vs 9c71cbb: GATES PASSED; N2 lane width 0 at placement (P9 overwrites), N4 no region fit at placement, N7 MilestonePlacement + positionMilestones at P11 with the old key order and shared slackArrows arrays; chartRightX gone from LayoutContext, private CanvasExtent grown at P3/P7/P8; buildNowline, buildWaveLegend, buildFootnotePanel take chartRightX; estimatedCenterY kept as a named stale read (§3.10 rule 4); new placement-canvas tests fail on the base; passed unattended: gate 2 - 2026-10-13
review wave-6 (nowline m4 s1-s2) af7a82e..bc8e31d: PASS - HeaderNode/MeasuredHeader/HeaderFrame/PositionedHeaderParts per §3.7; sizeBesideHeader, HEADER_CARD_OUTER_PAD, HEADER_CARD_TOP_INSET moved verbatim; timelineY operands unchanged; provisional header box dropped (every path overwrote it, named in the body); key order kept, attributionBox added last; estimatedRowsBottomY rename for L1; header tests 69 pass, tsc clean; G1/G3 empty per worker; passed unattended: gate 4 - 2026-10-13
review wave-6 (nowline m5 s1-s5) dad67df..56d00f7: PASS - reviewer re-ran the gate script vs 9c71cbb: GATES PASSED, layout vitest 1282 pass, lint 9 pre-existing warnings; f2-f16 match old P7-P20 at dad67df; moved bodies verbatim (diff -w) apart from export and N5; order check and four guard tests present; coverage register over 60 samples, §1.2 deltas listed in the m5.s4 body (f1 29/26, f2 7/6, f4 35/32 from R1's F1; f6 7/9 by definition); sequenceItem in nodes/sequence-item.ts to avoid an import cycle; minor: module-level setFinalizeTrace, readdir sample list, boolean FinalizeStep.run, CanvasExtent.provisional; passed unattended: gate 4 - 2026-10-13
review wave-6 (nowline m6 s1-s2) ab6488c..c064e10: PASS - L2 reproduced on the base (pillRowHeight 0, pillTopY = tickPanelY = 8) and fixed (pill row 16, rows and chart shift by 16); shared headerRowsTimelineY beside-card rule; f5 packs the marker band at its final top (deviation in mechanism, same outcome); F1: estimatedRowsBottomY gone, f15 reads the guarded rowsBottom slot; gate with --expect showed exactly the nine declared renders, snapshots dependencies.svg and marker-left-overflow.svg, dependencies svg/html/png/pdf golden cells; card bottoms 74->100 and 100->126 equal the rows bottom; layout vitest 1292 pass, snapshot 52 pass, lint 9 warnings, bundle 199.86 KB of 200; passed unattended: gate 4 - 2026-10-13
review wave-7 (nowline m6 s3) 1a119bc..529fcc4: CONCERNS - specs/layout-phases.md:664 (§9 As built, Header bullet) says f15 builds `{ ...headerParts, attributionBox }` after f16 computes the box, but f15 runs before f16 and stores only the header parts (finalize.ts:905-911); f16 sets draft.attributionBox (finalize.ts:940) and assembleModel merges the two after the pass (finalize.ts:1078-1081); the sentence should say the model assembly merges them. Everything else checked against the code and holds; gate log GATES PASSED vs 303b502 with the nine F1 paths, pre-commit green, bundle 180.20 KB - 2026-10-13
review wave-7-fix (nowline m6 s3) 1a119bc..0a188c7: CONCERNS - the corrected claim matches finalize.ts (f15 stores only draft.header, f16 sets draft.attributionBox, assembleModel merges them) and is not repeated elsewhere, but the fixed sentence at specs/layout-phases.md:664 is now a run-on: the closing parenthesis after `(`PositionedHeader` without `attributionBox`)` runs straight into `f15 stores only those parts`; a semicolon or period after the parenthesis fixes it; passed unattended: gate 1 (fix-up 2 of 2) - 2026-10-13
review wave-7-fix2 (nowline m6 s3) 1a119bc..93a98cc: PASS - 93a98cc adds the period after the parenthesis; claim unchanged; whole bullet re-read; range holds docs and comments only, no snapshot, golden, determinism or changelog edits; passed unattended: gate 1 (fix-up 2 of 2) - 2026-10-13

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`nowline-m1-s1-s2`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`, matched by prefix when long; without the id, the newest `.jsonl` there), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl` in the same directory. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.

tokens orchestrator-kickoff plan-layout-phases-heron (claude-opus-5-5): input ~100 / cache read ~8.3M / cache write ~0 5m + ~300k 1h / output ~53k | ~$5.11 API-equiv
tokens wave-1 nowline-m1-s1-s2 (claude-sonnet-5-5): input ~96 / cache read ~6.4M / cache write ~180k / output ~46k | ~$2.19 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-1 nowline-m1-s1-s2 (claude-opus-5-5): input ~32 / cache read ~510k / cache write ~49k / output ~16k | ~$0.66 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-1 nowline-m1-s1-s2 (claude-opus-5-5): input ~14 / cache read ~1.1M / cache write ~0 5m + ~23k 1h / output ~9.8k | ~$0.60 API-equiv
tokens wave-2 nowline-m1-s3 (claude-opus-5-5): input ~58 / cache read ~2.7M / cache write ~120k / output ~28k | ~$1.70 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-2 nowline-m1-s3 (claude-opus-5-5): input ~20 / cache read ~260k / cache write ~34k / output ~10k | ~$0.43 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-2 nowline-m1-s3 (claude-opus-5-5): input ~12 / cache read ~860k / cache write ~0 5m + ~19k 1h / output ~7.9k | ~$0.48 API-equiv
tokens wave-3 nowline-m1-s4 (claude-sonnet-5-5): input ~36 / cache read ~1.4M / cache write ~96k / output ~18k | ~$0.70 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-3 nowline-m1-s4 (claude-opus-5-5): input ~16 / cache read ~200k / cache write ~36k / output ~7.2k | ~$0.36 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-3 nowline-m1-s4 (claude-opus-5-5): input ~20 / cache read ~1.7M / cache write ~0 5m + ~21k 1h / output ~11k | ~$0.74 API-equiv
tokens wave-4 nowline-m2-s1-s2 (claude-opus-5-5): input ~150 / cache read ~14M / cache write ~260k / output ~73k | ~$5.55 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-4 nowline-m2-s1-s2 (claude-opus-5-5): input ~36 / cache read ~990k / cache write ~82k / output ~18k | ~$0.97 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-4 nowline-m2-s1-s2 (claude-opus-5-5): input ~16 / cache read ~1.5M / cache write ~0 5m + ~24k 1h / output ~10k | ~$0.69 API-equiv
tokens wave-5 nowline-m3-s1-s2 (claude-sonnet-5-5): input ~48 / cache read ~1.9M / cache write ~310k / output ~24k | ~$1.39 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-5 nowline-m3-s1-s2 (claude-opus-5-5): input ~20 / cache read ~270k / cache write ~39k / output ~10k | ~$0.45 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-5 nowline-m3-s1-s2 (claude-opus-5-5): input ~16 / cache read ~1.7M / cache write ~0 5m + ~23k 1h / output ~10k | ~$0.73 API-equiv
tokens wave-6 nowline-m3-s3 (claude-opus-5-5): input ~92 / cache read ~7.5M / cache write ~440k / output ~46k | ~$4.59 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-6 nowline-m3-s3 (claude-opus-5-5): input ~34 / cache read ~850k / cache write ~74k / output ~16k | ~$0.87 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-6 nowline-m3-s3 (claude-opus-5-5): input ~12 / cache read ~1.3M / cache write ~0 5m + ~22k 1h / output ~11k | ~$0.65 API-equiv
tokens wave-6 nowline-m4-s1-s2 (claude-opus-5-5): input ~84 / cache read ~5.5M / cache write ~170k / output ~42k | ~$2.81 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-6 nowline-m4-s1-s2 (claude-opus-5-5): input ~20 / cache read ~350k / cache write ~52k / output ~9.2k | ~$0.52 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-6 nowline-m4-s1-s2 (claude-opus-5-5): input ~10 / cache read ~1.1M / cache write ~0 5m + ~23k 1h / output ~12k | ~$0.64 API-equiv
tokens wave-6 nowline-m5-s1-s5 (claude-opus-5-5): input ~240 / cache read ~33M / cache write ~1M / output ~120k | ~$14.33 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-6 nowline-m5-s1-s5 (claude-opus-5-5): input ~76 / cache read ~3.5M / cache write ~140k / output ~36k | ~$2.12 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-6 nowline-m5-s1-s5 (claude-opus-5-5): input ~26 / cache read ~3.4M / cache write ~0 5m + ~35k 1h / output ~17k | ~$1.32 API-equiv
tokens wave-6 nowline-m6-s1-s2 (claude-opus-5-5): input ~130 / cache read ~10M / cache write ~220k / output ~65k | ~$4.42 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-6 nowline-m6-s1-s2 (claude-opus-5-5): input ~62 / cache read ~1.7M / cache write ~76k / output ~29k | ~$1.32 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens merge-main nowline-merge-r3 (claude-opus-5-5): input ~78 / cache read ~3.7M / cache write ~120k / output ~38k | ~$2.13 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-6 nowline-m6-s1-s2 (claude-opus-5-5): input ~38 / cache read ~5.3M / cache write ~0 5m + ~42k 1h / output ~21k | ~$1.80 API-equiv
tokens wave-7 nowline-m6-s3 (claude-sonnet-5-5): input ~90 / cache read ~7.1M / cache write ~210k / output ~45k | ~$2.39 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-7 nowline-m6-s3 (claude-opus-5-5): input ~36 / cache read ~910k / cache write ~71k / output ~17k | ~$0.88 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-7 nowline-m6-s3 (claude-opus-5-5): input ~20 / cache read ~3.5M / cache write ~0 5m + ~28k 1h / output ~6.7k | ~$1.06 API-equiv
tokens wave-7-fix nowline-m6-s3 (claude-sonnet-5-5): input ~38 / cache read ~1.3M / cache write ~34k / output ~17k | ~$0.51 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-7-fix nowline-m6-s3 (claude-opus-5-5): input ~14 / cache read ~120k / cache write ~23k / output ~6.9k | ~$0.28 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens orchestrator-wave-7-fix nowline-m6-s3 (claude-opus-5-5): input ~8 / cache read ~1.6M / cache write ~0 5m + ~12k 1h / output ~5.4k | ~$0.53 API-equiv
tokens wave-7-fix2 nowline-m6-s3 (claude-sonnet-5-5): input ~10 / cache read ~290k / cache write ~23k / output ~4.4k | ~$0.16 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
tokens review-wave-7-fix2 nowline-m6-s3 (claude-opus-5-5): input ~8 / cache read ~52k / cache write ~16k / output ~4k | ~$0.17 API-equiv (output est.) session 7e027fcc-1ca6-51b0-b005-63e1163df819
