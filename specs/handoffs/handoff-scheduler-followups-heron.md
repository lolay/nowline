# Handoff: m4.11 follow-ups F2-F8 (orchestrate run)

- **Plan:** `specs/handoffs/plan-scheduler-followups-heron.md`
- **Branch:** `claude/friendly-babbage-qlcz6d` (harness-assigned task branch; fast-forwarded to `origin/main` `5da7d2a` and pushed at kickoff)
- **Mode:** unattended, confirmed 2026-10-15 in session ef0db142 (dialog: "Unattended (Recommended)"; session: "This session")
- **Status:** wave 2/m2 closed after two fix-ups (2-fix2 PASS); wave 2 unit m3 s1-s2 [deep] next (gate 4 passes unattended).
- **Spend:** ~$45.5, over the ~$31 expected. Guard 3x min $50, ~$93.
- **Next unit:** wave 2 [deep] `nowline m3 s1-s2` (F5, F7), then m4 s1 (F4); then wave 3 [exec] m4 s2-s4.
- **Gates the plan crosses:** 2 before wave 2; 4 at m2, m3 and m4. No canary (wave 1 has one group). No `[xdeep]`.
- **Resume:** run `/compact` if needed, then paste the plan's Kickoff prompt.

## Pending question

None.

## Done

- wave 1 [exec] `nowline m1 s1` 4e3870f..c3e5c96: PASS. Spec §5/§8 carry decisions 5-13; F6, F7, F8 rows added.
- wave 2 [deep] `nowline m1 s2` 30a5c0e..fd989f4: PASS. Merge of origin/main (2206c8c: #160, #161, #162, no conflicts), then F8 (fd989f4). G1 differs only in tests/weekends-show; weekends-show snapshot and its determinism cells bumped (declared).
- wave 2 [deep] `nowline m2 s1-s4` 8b1b4ac..47639f6: CONCERNS. Merge 983ffac (#163, clean); F2 96e073b (G1 identical), F3 (d) e38c414 (minimal, platform-2026, product, showcase), F3 (c) 3f9afe1 (inline-date-pins, waves, late-row-shifts), F3 (b) 47639f6 (showcase, non-working-hide/show). Review: the minimum bar width still reaches the parallel join and `after:` edges (sequence-item.ts:333, :353); fix-up 2-fix.
- fix-up 2-fix [deep] `nowline m2 s1-s4` 8b1b4ac..4314f48: CONCERNS. 4314f48 splits time (cursor.x, entityRightEdges, wave member: duration end) from painted (maxX, bracket, packer, canvas) ends; four regression tests; G1/G3 identical. Review: waves.md:823 and the changelog s4 block wrongly say C resolves `after:<parallel>`; fix-up 2-fix2.
- fix-up 2-fix2 [deep] `nowline m2 s1-s4` 8b1b4ac..c8ecee2: PASS. Docs only: waves.md §8.6 (b) and the s4 changelog block no longer claim the exports resolve `after:<parallel>`.

## Deviations from plan

- Wave 2/m2 used both automatic fix-ups (cap 2): 2-fix for the clamp reaching the parallel join and `after:`, 2-fix2 for two inaccurate sentences 2-fix wrote. A third CONCERNS on this group stops at gate 1.

- m1.s2 merged origin/main itself (the plan wanted each milestone's first step to; m1.s1 was docs-only and didn't). `check_wave.py` then flagged main's own commits 3d8b606, 766bc38 and 0e948e9 (subject, trailers, Co-authored-by) because the merge brings them into the range. Logged PASS rather than CONCERNS: an automatic fix-up would reword main's published history. The worker's own commits pass. Later merges of main draw the same flag and are handled the same way (wave 2/m2: db78b2e, #163).

- The kickoff's parent spend (~$10.78) exceeds the orchestrator row's kickoff share (~$1.0): the same session did the decision dialogs and scratch prototypes before kicking off.

## Decisions so far

- m2 (review CONCERNS on s4 only; the rest held): the canvas fix counts every parallel track's spilled caption, not only group tracks. `TRACK_BLOCK_TAIL_GUTTER_PX` (a public `@nowline/layout` export) is deleted, noted in the s2 `fixed` fragment. `minimal` moved in s2 (its last child is a parallel of group tracks; decision 8). `size-and-capacity` did not move in s4. The barrier theorem test and waves.md §8.4 compare duration ends; a clamped bar may paint past its wave boundary (decision 6). showcase `announce` is itself a clamped bar and keeps a decision-6 register entry. `packages/layout/test/finalize-coverage.json` moves with layout changes too. Historical spec text (§1.2, §1.3, §9) left for m4.s3.
- Open, outside m2's scope (2-fix worker and reviewer): engine C ignores `after:<parallel>` and `after:<group>` (`walkNode` registers only items in `scope.itemEnd`; `resolveAfterDay` returns 0), so A > C there. Also an after-only milestone `after:<item>` sits at the item's visual box right (a clamped bar pushes it later: A 0.35 vs C 0.14 weeks), and `before:` overflow compares `logicalRight`. All pre-existing and outside the register. To raise with Gary at completion.
- Open, outside m2's scope (reviewer): a group's `entityRightEdges` is still its painted box, so `item z after:g` where g's caption spills puts z at day 84.98 in A against 0 in C (C's 0 looks wrong too). Same before m2. To raise with Gary at completion unless F4's lower-bound test forces it earlier.

- m1.s2 (review PASS): `resolvePinnedOrSequentialStart` keeps its name (m2.s1 cites it) though it no longer pins. The `after:<date>` hint fires on items, groups and parallels, not swimlanes (inline dates are NL.E0411 there). core `waves-order.ts` dropped pins too. Historical records (milestones.md m2o row, scheduler-unification.md §1.4/§3/§6, working-calendar.md Phase 3 known limits) were left as written for m4.s3's close-out. Determinism goldens were edited by hand for the declared cells only (`make determinism-update` regenerates everything and installs chromium).

- Gary, 2026-10-15, after the resume: "after all is done, also, use an [exec] subagent to merge any changes from main". Added as m4.s4 [exec] at the end of wave 3 (before the PR question).

The planning session's decisions 5-13 are in the plan's Context section; m1.s1 records them in `specs/scheduler-unification.md` §8. Notably:

- F8 removes item `date:`/`start:` pins outright (items only), which also settles F3 (f). The specs gain a "pinning is not supported" note (resource-level splits conflict with `principles.md`; may be revisited).
- F6 (status dot ≥ 24 px) and F7 (caption cap at the chart's end) are m4.11 follow-ups in this plan.
- F3 (b): each clamped bar's own register entry stays as presentation (decision 6); everything else in the register goes.

## Environment notes

- env: a G1/G3 render of one tree took ~6 min in m2; render it in a separate built worktree (`make init && make build-fast`) so the main tree stays free.
- env: run `make compile TARGET=local` (under 1 s) before `make determinism`; a stale binary fails the CLI-vs-kernel cells.
- env: to bump only the changed determinism cells, `UPDATE_DETERMINISM_GOLDENS=1 npx vitest run --config vitest.determinism.config.ts` in packages/integration-tests (Node leg only, no chromium); unchanged cells rewrite byte-identically; check `git diff` touches only declared cells.
- env: `.scratch/base-m3` is a built worktree at 47639f6 and `.scratch/g1-m2s4-head` its G1/G3 render (stale once 2-fix lands).

- env: Bun 1.4.2 is on the runner, so `make compile TARGET=local` and `make determinism` work.
- env: a G1/G3 CLI render of one tree takes ~15 min (60 files × 6 outputs); run it in the background.
- env: `make changelog-check BASE=origin/main REQUIRE=1` only sees committed fragments; run it after the commit.
- env: the G1 script is `.scratch/g1.sh <repo root> <out dir>`; m1.s2's base worktree is `.scratch/base-m1s2` (2206c8c). Remove stale base worktrees when done with them.

- Node 22.22.0 on the runner (`.nvmrc` pins 26.2.0); `make doctor` passed at session start.
- A scratch prototype of F2/F3 lived in the session's scratchpad clone, not in the repo; the plan's step text carries what it showed (e.g. the clipped "Screens" caption under F2).
