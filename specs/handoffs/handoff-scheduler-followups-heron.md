# Handoff: m4.11 follow-ups F2-F8 (orchestrate run)

- **Plan:** `specs/handoffs/plan-scheduler-followups-heron.md`
- **Branch:** `claude/friendly-babbage-qlcz6d` (harness-assigned task branch; fast-forwarded to `origin/main` `5da7d2a` and pushed at kickoff)
- **Mode:** unattended, confirmed 2026-10-15 in session ef0db142 (dialog: "Unattended (Recommended)"; session: "This session")
- **Status:** waves 1 and 2/m1 done and reviewed (PASS); wave 2 unit m2 s1-s4 [deep] next (gate 4 passes unattended as a checkpoint).
- **Spend:** ~$28.50 of ~$31 expected (parent ~$12.91, wave 1 ~$0.60, wave 2/m1 ~$14.99). Wave 2/m1 alone ran ~$15 against ~$19 for all of wave 2, so the run will pass the expected total; guard ~$93.
- **Next unit:** wave 2 [deep] `nowline m2 s1-s4` (F2, F3), then m3 s1-s2, m4 s1; then wave 3 [exec] m4 s2-s4.
- **Gates the plan crosses:** 2 before wave 2; 4 at m2, m3 and m4. No canary (wave 1 has one group). No `[xdeep]`.
- **Resume:** run `/compact` if needed, then paste the plan's Kickoff prompt.

## Pending question

None.

## Done

- wave 1 [exec] `nowline m1 s1` 4e3870f..c3e5c96: PASS. Spec §5/§8 carry decisions 5-13; F6, F7, F8 rows added.
- wave 2 [deep] `nowline m1 s2` 30a5c0e..fd989f4: PASS. Merge of origin/main (2206c8c: #160, #161, #162, no conflicts), then F8 (fd989f4). G1 differs only in tests/weekends-show; weekends-show snapshot and its determinism cells bumped (declared).

## Deviations from plan

- m1.s2 merged origin/main itself (the plan wanted each milestone's first step to; m1.s1 was docs-only and didn't). `check_wave.py` then flagged main's own commits 3d8b606, 766bc38 and 0e948e9 (subject, trailers, Co-authored-by) because the merge brings them into the range. Logged PASS rather than CONCERNS: an automatic fix-up would reword main's published history. The worker's own commits pass. Later merges of main will draw the same flag and are handled the same way.

- The kickoff's parent spend (~$10.78) exceeds the orchestrator row's kickoff share (~$1.0): the same session did the decision dialogs and scratch prototypes before kicking off.

## Decisions so far

- m1.s2 (review PASS): `resolvePinnedOrSequentialStart` keeps its name (m2.s1 cites it) though it no longer pins. The `after:<date>` hint fires on items, groups and parallels, not swimlanes (inline dates are NL.E0411 there). core `waves-order.ts` dropped pins too. Historical records (milestones.md m2o row, scheduler-unification.md §1.4/§3/§6, working-calendar.md Phase 3 known limits) were left as written for m4.s3's close-out. Determinism goldens were edited by hand for the declared cells only (`make determinism-update` regenerates everything and installs chromium).

- Gary, 2026-10-15, after the resume: "after all is done, also, use an [exec] subagent to merge any changes from main". Added as m4.s4 [exec] at the end of wave 3 (before the PR question).

The planning session's decisions 5-13 are in the plan's Context section; m1.s1 records them in `specs/scheduler-unification.md` §8. Notably:

- F8 removes item `date:`/`start:` pins outright (items only), which also settles F3 (f). The specs gain a "pinning is not supported" note (resource-level splits conflict with `principles.md`; may be revisited).
- F6 (status dot ≥ 24 px) and F7 (caption cap at the chart's end) are m4.11 follow-ups in this plan.
- F3 (b): each clamped bar's own register entry stays as presentation (decision 6); everything else in the register goes.

## Environment notes

- env: Bun 1.4.2 is on the runner, so `make compile TARGET=local` and `make determinism` work.
- env: a G1/G3 CLI render of one tree takes ~15 min (60 files × 6 outputs); run it in the background.
- env: `make changelog-check BASE=origin/main REQUIRE=1` only sees committed fragments; run it after the commit.
- env: the G1 script is `.scratch/g1.sh <repo root> <out dir>`; m1.s2's base worktree is `.scratch/base-m1s2` (2206c8c). Remove stale base worktrees when done with them.

- Node 22.22.0 on the runner (`.nvmrc` pins 26.2.0); `make doctor` passed at session start.
- A scratch prototype of F2/F3 lived in the session's scratchpad clone, not in the repo; the plan's step text carries what it showed (e.g. the clipped "Screens" caption under F2).
