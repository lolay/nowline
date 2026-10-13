# Handoff: m4.11 scheduler unification (R1), plan-scheduler-unification-quilt

Plan: [`plan-scheduler-unification-quilt.md`](./plan-scheduler-unification-quilt.md). Spec: [`specs/scheduler-unification.md`](../scheduler-unification.md).

## State

- **Branch:** `claude/eloquent-archimedes-fkbc5e` (harness-assigned task branch, cut from `origin/main` at `c34804c`, pushed). Single working directory, `lolay/nowline`.
- **Mode:** unattended, confirmed 2026-10-13 by Gary's answer `unattended`. Kickoff prompt carries `Run in unattended mode.`
- **Done:** wave 1 `[deep]` `nowline m1 s1-s3`, `c8caff3..8af7add` (m1.s1 `b25a2e0`, m1.s2 `1f0f970`, m1.s3 `8af7add`), review PASS.
- **Spend:** ~$17.9 API-equiv so far against ~$16 expected total (over expected; wave 1 ran ~$9.2 against ~$5.0 planned); guard stops past $50.
- **Next unit:** wave 2 `[exec]`, `nowline m1 s4-s5` (m1.s4 start terms, m1.s5 F1).

## How to resume

Paste the plan's Kickoff prompt into a new session (or, in this session, the run continues on its own).

## Pending question

None. The kickoff question was answered `unattended`.

## Milestone notes (gate 4)

- m1 (engine B becomes a projection of C, plus F1 as m1.s5): s1-s3 done (`c8caff3..8af7add`); s4-s5 next.
- m2 (one plan and one schedule per staging): not started. R2 (m4.14) steps that touch `RoadmapNode.place` may start once m1 and m2 are done; say so here when they are.
- m3 (tests describe behaviour, not agreement): not started.

## Decisions so far

The plan's "Decisions made while planning" (1-8) stand. Added by wave 1 (review PASS):

- review wave-1 (nowline m1 s1-s3): register entries carry a `classes` array, not one letter, because some mismatches have two causes. showcase `ship` and `announce` are (a)+(b); late-row-shifts `p1` and `d` are (a)+(c); only late-row-shifts `c` and `g1` (the lane-level group with `after:`) and sizing `search-v2` are (a) alone. **m1.s5 therefore deletes those three (a)-only entries and removes the `(a)` letter from the four compound entries**, rather than deleting every entry that mentions (a). The JSON's `$comment` documents this.
- review wave-1: examples/nested.nowline keeps its 50 `region-scope` register entries (accepted deviation from "the register's region-scope entries are deleted"). Each nested region declares its own `anchor kickoff` and starts lanes `after:kickoff`; C (which must equal the B oracle) resolves it to day 1, A has no region anchors and starts at day 0. The other three region-scope samples' entries are gone. Later steps must not expect the register to hold only (b)-(f) entries: nested's region-scope entries stay.
- review wave-1: only first-level region items join `byNode`; deeper nested region items count only in `extent`. m2.s3's "fail loudly if a node is missing" must account for nested-region items that engine A lays out (check before assuming byNode covers every node A sees).
- review wave-1: the extent oracle (`test/content-end-day-oracle.ts`, used by `test/schedule-extent.test.ts`) runs with `today` undefined; the 5 scope fixtures also assert literal values so m3.s2 can keep them as direct `extent` expectations. The 60-roadmap generator moved to `test/generated-roadmaps.ts` (shared by `waves.test.ts` and the oracle).
- review wave-1: stale engine-B comments (schedule.ts header lines 4 and 25, wave-barrier.ts, the register test's header saying C leaves isolated regions unscheduled) and spec references (waves.md, working-calendar.md, layout-phases.md) are m3.s3's; m3.s3 also covers `specs/layout-phases.md`.

## Environment notes

- env: Node is v22.22.0 at `/opt/node22`; `.nvmrc` pins 26.2.0 but `engines.node` is `>=22` and CI has a Node 22 cell. pnpm 12.8.1 via corepack, Bun 1.4.2 (for `make compile TARGET=local`), Python 3.13.
- env: `make init` has run (about 6s). `make pre-commit` takes about 6-7 min; a G1 or G3 render pass about 2 min each.
- env: no Makefile target runs one Vitest file; for the inner loop use `packages/layout/node_modules/.bin/vitest run <file>`, but every gate goes through make.
- env: an older commit builds for comparison with `git archive <sha> | tar -x -C .scratch/g1/src-<sha>` then `make init build-fast` there; Biome ignores `.scratch/`. Remove that checkout afterwards.
- env: render caches exist for c8caff3, b25a2e0, 1f0f970 and 8af7add in `.scratch/g1/<sha>/` and `.scratch/g3/<sha>/`; the sample list is `.scratch/g1-samples.txt`.
- env: `team` is a DSL keyword, so `roadmap team ...` does not parse; test fixtures use `squad`.
- env: `.scratch/` exists and is gitignored; G1/G3 render caches go in `.scratch/g1/<sha>/` and `.scratch/g3/<sha>/`.
- env: git identity is the runner's (`noreply@anthropic.com`), accepted per the runner rule.

## Deviations from plan

- A PR (lolay/nowline#148) was opened from the Claude Code UI before any step ran; Gary asked for it to go, so it is closed and unsubscribed. The milestone PR is still opened only after Gary says yes at completion (a new PR from this branch).
- Wave 1 spent ~$9.2 against ~$5.0 planned; the run is over its ~$16 expected total at ~$17.9 (a note, not a stop; the guard is $50).
- Open for completion: m1.s2 added public `@nowline/layout` API (`ScheduleOptions.plan`, `RoadmapSchedule.plan`, `.resolved`, `.extent`, `ScheduleExtent`) with no `added` changelog block, per plan decision 5. Raise with Gary at the PR ask.
