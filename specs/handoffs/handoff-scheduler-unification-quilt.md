# Handoff: m4.11 scheduler unification (R1), plan-scheduler-unification-quilt

Plan: [`plan-scheduler-unification-quilt.md`](./plan-scheduler-unification-quilt.md). Spec: [`specs/scheduler-unification.md`](../scheduler-unification.md).

## State

- **Branch:** `claude/eloquent-archimedes-fkbc5e` (harness-assigned task branch, cut from `origin/main` at `c34804c`, pushed). Single working directory, `lolay/nowline`.
- **Mode:** unattended, confirmed 2026-10-13 by Gary's answer `unattended`. Kickoff prompt carries `Run in unattended mode.`
- **Done:** wave 1 `[deep]` `nowline m1 s1-s3`, `c8caff3..8af7add` (m1.s1 `b25a2e0`, m1.s2 `1f0f970`, m1.s3 `8af7add`), review PASS. Wave 2 unit 1 `[exec]` `nowline m1 s4-s5`, `921ce16..f2027ee` (m1.s4 `e2889f5`, m1.s5 F1 `f2027ee`), review CONCERNS (showcase Ship drawn at day 42.2, not 40; docs overclaim); fix-up `2-fix` `6cc27e6` corrected the spec F1 row and changelog, review PASS. Wave 2 unit 2 `[exec]` `nowline m2 s1-s3`, `7e5ce18..2de5e41` (m2.s1 `e46d779`, m2.s2 `c699ea2`, m2.s3 `2de5e41`), review PASS.
- **Spend:** ~$27.5 API-equiv so far against ~$16 expected total (over expected; wave 1 ran ~$9.2 against ~$5.0 planned); guard stops past $50.
- **Next unit:** wave 2 `[exec]` `nowline m3 s1-s3` (gate 4 passed unattended), then completion.

## How to resume

Paste the plan's Kickoff prompt into a new session (or, in this session, the run continues on its own).

## Pending question

None. The kickoff question was answered `unattended`.

## Milestone notes (gate 4)

- m1 (engine B becomes a projection of C, plus F1 as m1.s5): **done**, `c8caff3..6cc27e6` (merge of main `52dd496` inside). Outcome: engine C has B's scope and `extent`; the date window is projected from the schedule (`computeContentEndDay`, `literalDays`, `defaultStartDate` gone); start terms parsed once in `start-terms.ts`; F1 landed: `after:` in a lane starts at `max(lane cursor, refs)`. F1 changed showcase, sizing, late-row-shifts renders (x3 themes), the `sizing.svg` snapshot and the `sizing:{html,pdf node+cli,png,svg}` determinism cells. Showcase Ship draws at day 42.2 vs the exports' 40 ((d) tail gutter, F3). Register keeps (b)-(f) entries plus nested.nowline's region-scope entries. Gate 4 into m2 passed unattended.
- m2 (one plan and one schedule per staging): **done**, `7e5ce18..2de5e41`. `LayoutOptions.schedule` lets layout reuse a schedule; `stageDocument` builds plan, schedule and layout once and carries the schedule on `ExportInputs.schedule`; engine A reads item durations from `schedule.byNode` (via `scheduledItemDays`, which throws on a missing node). **m1 and m2 are done, so R2 (m4.14) steps that touch `RoadmapNode.place` may start** (they build on this branch until it merges). Gate 4 into m3 passed unattended.
- m3 (tests describe behaviour, not agreement): not started.

## Decisions so far

The plan's "Decisions made while planning" (1-8) stand. Added by wave 1 (review PASS):

- review wave-1 (nowline m1 s1-s3): register entries carry a `classes` array, not one letter, because some mismatches have two causes. showcase `ship` and `announce` are (a)+(b); late-row-shifts `p1` and `d` are (a)+(c); only late-row-shifts `c` and `g1` (the lane-level group with `after:`) and sizing `search-v2` are (a) alone. **m1.s5 therefore deletes those three (a)-only entries and removes the `(a)` letter from the four compound entries**, rather than deleting every entry that mentions (a). The JSON's `$comment` documents this.
- review wave-1: examples/nested.nowline keeps its 50 `region-scope` register entries (accepted deviation from "the register's region-scope entries are deleted"). Each nested region declares its own `anchor kickoff` and starts lanes `after:kickoff`; C (which must equal the B oracle) resolves it to day 1, A has no region anchors and starts at day 0. The other three region-scope samples' entries are gone. Later steps must not expect the register to hold only (b)-(f) entries: nested's region-scope entries stay.
- review wave-1: only first-level region items join `byNode`; deeper nested region items count only in `extent`. m2.s3's "fail loudly if a node is missing" must account for nested-region items that engine A lays out (check before assuming byNode covers every node A sees).
- review wave-1: the extent oracle (`test/content-end-day-oracle.ts`, used by `test/schedule-extent.test.ts`) runs with `today` undefined; the 5 scope fixtures also assert literal values so m3.s2 can keep them as direct `extent` expectations. The 60-roadmap generator moved to `test/generated-roadmaps.ts` (shared by `waves.test.ts` and the oracle).
- review wave-1: stale engine-B comments (schedule.ts header lines 4 and 25, wave-barrier.ts, the register test's header saying C leaves isolated regions unscheduled) and spec references (waves.md, working-calendar.md, layout-phases.md) are m3.s3's; m3.s3 also covers `specs/layout-phases.md`.

- Gary, 2026-10-13, asked whether it was too late for a changelog entry for the new layout fields: "Is it too late to add changelog entry for layout fields? If so, don't worry about it." It isn't, so **m2.s1 appends a `release-note:added` block to `.changelog/scheduler-unification.txt`** naming the new public `@nowline/layout` API: `ScheduleOptions.plan`, `RoadmapSchedule.plan`, `.resolved`, `.extent` (`ScheduleExtent`) and m2.s1's `LayoutOptions.schedule`. This overrides plan decision 5's "every other step is internal" for m2.s1; m2.s2's `ExportInputs.schedule` (`@nowline/export-core`) may extend the same block.
- review wave-2 (nowline m1 s4-s5): F1 does not put showcase `Ship` on day 40. Engine A draws it at 42.2 working days (C and exports: 40) because the lane cursor takes the parallel's box edge, which includes the (d) 8 px track tail gutter; fixing (d) is F3, out of scope. The register records showcase `ship`/`announce` as (b)+(d) and a new showcase `assets` (b). Spec text and changelog must say Ship now follows the parallel, within the (d) tail gutter of the exports, not that it matches them.
- review wave-2: milestone `after:` refs go through `startTermsOf().after`; milestone `date:` and anchors still read `date:` directly. `resolveChildStart` keeps an unused `_laneLeftX` parameter for the `*Deps` threading R2 owns; `resolvePinnedOrSequentialStart` dropped it.

- review wave-2 (nowline m2 s1-s3): `scheduledItemDays` throws on a missing node unconditionally (spec "fail loudly"); engine A only lays out first-level isolated regions (`buildIncludeRegions` does not recurse), so `byNode` covers every item A places. `byNode` is a WeakMap; tests wrap it with a subclass overriding `get`. The kernel spy test lives in `packages/integration-tests/test/export-schedule-once.test.ts`. The `added` changelog block names ScheduleOptions.plan, RoadmapSchedule.plan/resolved/extent (ScheduleExtent), LayoutOptions.schedule and ExportInputs.schedule.

## Environment notes

- env: Node is v22.22.0 at `/opt/node22`; `.nvmrc` pins 26.2.0 but `engines.node` is `>=22` and CI has a Node 22 cell. pnpm 12.8.1 via corepack, Bun 1.4.2 (for `make compile TARGET=local`), Python 3.13.
- env: `make init` has run (about 6s). `make pre-commit` takes about 6-7 min; a G1 or G3 render pass about 2 min each.
- env: no Makefile target runs one Vitest file; for the inner loop use `packages/layout/node_modules/.bin/vitest run <file>`, but every gate goes through make.
- env: an older commit builds for comparison with `git archive <sha> | tar -x -C .scratch/g1/src-<sha>` then `make init build-fast` there; Biome ignores `.scratch/`. Remove that checkout afterwards.
- env: render caches exist for c8caff3, b25a2e0, 1f0f970 and 8af7add in `.scratch/g1/<sha>/` and `.scratch/g3/<sha>/`; the sample list is `.scratch/g1-samples.txt`.
- env: `make determinism-update` downloads a Playwright Chromium headless shell into `/opt/pw-browsers` (works). `make format` (biome check --write) exists.
- env: `.scratch/bin/render_g1.sh` and `render_g3.sh` re-create the spec's render_all; render caches exist for 921ce16, e2889f5 and f2027ee too.
- env: `team` is a DSL keyword, so `roadmap team ...` does not parse; test fixtures use `squad`.
- env: `.scratch/` exists and is gitignored; G1/G3 render caches go in `.scratch/g1/<sha>/` and `.scratch/g3/<sha>/`.
- env: git identity is the runner's (`noreply@anthropic.com`), accepted per the runner rule.

## Deviations from plan

- A PR (lolay/nowline#148) was opened from the Claude Code UI before any step ran; Gary asked for it to go, so it is closed and unsubscribed. The milestone PR is still opened only after Gary says yes at completion (a new PR from this branch).
- Wave 1 spent ~$9.2 against ~$5.0 planned; the run is over its ~$16 expected total at ~$17.9 (a note, not a stop; the guard is $50).
- Open for completion: m1.s2 added public `@nowline/layout` API (`ScheduleOptions.plan`, `RoadmapSchedule.plan`, `.resolved`, `.extent`, `ScheduleExtent`) with no `added` changelog block, per plan decision 5. Raise with Gary at the PR ask.
- Before wave 2: merged `origin/main` (`ff8eb8b`, #149: env doctor floor-aware, Makefile/CI only, no layout code) with merge commit `52dd496`; no conflicts. Wave 2's `from` is the merge, so its G1 base includes it.
- Wave 2 unit 1 review CONCERNS: automatic fix-up `2-fix` (1 of 2), no gate (first CONCERNS on the group); it passed (`6cc27e6`). Checkpoint: gate 1 (fix-up 1 of 2); gate 4 before m2. The m1.s5 commit body's "as in the exports" claim stays in history (review concerns are fixed with new commits); the PR body will state the 42.2-day result.
- Checkpoint: gate 4 before m3 (unattended).
