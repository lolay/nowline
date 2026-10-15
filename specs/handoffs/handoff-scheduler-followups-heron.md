# Handoff: m4.11 follow-ups F2-F8 (orchestrate run)

- **Plan:** `specs/handoffs/plan-scheduler-followups-heron.md`
- **Branch:** `claude/friendly-babbage-qlcz6d` (harness-assigned task branch; fast-forwarded to `origin/main` `5da7d2a` and pushed at kickoff)
- **Mode:** unattended, confirmed 2026-10-15 in session ef0db142 (dialog: "Unattended (Recommended)"; session: "This session")
- **Status:** resumed after `/compact` from the pasted Kickoff prompt (mode re-confirmed, same session); wave 1 dispatching.
- **Spend:** ~$10.78 of ~$31 expected (the kickoff alone, which carried the planning session's exploration and prototypes; the orchestrator row expected ~$9.9 for the whole run). Guard 3x min $50, ~$93.
- **Next unit:** wave 1 [exec] `nowline m1 s1` (record the decisions in spec §5/§8), then wave 2 [deep] in four units (m1 s2; m2 s1-s4; m3 s1-s2; m4 s1), then wave 3 [exec] m4 s2-s3.
- **Gates the plan crosses:** 2 before wave 2; 4 at m2, m3 and m4. No canary (wave 1 has one group). No `[xdeep]`.
- **Resume:** run `/compact` if needed, then paste the plan's Kickoff prompt.

## Pending question

None.

## Done

Nothing yet.

## Deviations from plan

- The kickoff's parent spend (~$10.78) exceeds the orchestrator row's kickoff share (~$1.0): the same session did the decision dialogs and scratch prototypes before kicking off.

## Decisions so far

The planning session's decisions 5-13 are in the plan's Context section; m1.s1 records them in `specs/scheduler-unification.md` §8. Notably:

- F8 removes item `date:`/`start:` pins outright (items only), which also settles F3 (f). The specs gain a "pinning is not supported" note (resource-level splits conflict with `principles.md`; may be revisited).
- F6 (status dot ≥ 24 px) and F7 (caption cap at the chart's end) are m4.11 follow-ups in this plan.
- F3 (b): each clamped bar's own register entry stays as presentation (decision 6); everything else in the register goes.

## Environment notes

- Node 22.22.0 on the runner (`.nvmrc` pins 26.2.0); `make doctor` passed at session start.
- A scratch prototype of F2/F3 lived in the session's scratchpad clone, not in the repo; the plan's step text carries what it showed (e.g. the clipped "Screens" caption under F2).
