# Handoff: m4.11 scheduler unification (R1), plan-scheduler-unification-quilt

Plan: [`plan-scheduler-unification-quilt.md`](./plan-scheduler-unification-quilt.md). Spec: [`specs/scheduler-unification.md`](../scheduler-unification.md).

## State

- **Branch:** `claude/eloquent-archimedes-fkbc5e` (harness-assigned task branch, cut from `origin/main` at `c34804c`, pushed). Single working directory, `lolay/nowline`.
- **Mode:** pending (proposed unattended; runner=cloud). Waiting on the kickoff question below.
- **Done:** kickoff only (plan tagged, waves marked, Kickoff, Cost table and counting header written). No plan step has run.
- **Spend:** ~$6.2 API-equiv so far (kickoff plus two planning Explore agents) against ~$16 expected total; guard stops past $50.
- **Next unit:** wave 1 `[deep]`, `nowline m1 s1-s3` (one group, no canary).

## How to resume

Gary runs `/compact` after the kickoff answer is recorded and pushed, then pastes the plan's Kickoff prompt. Do not dispatch before that paste.

## Pending question (verbatim)

```
Plan plan-scheduler-unification-quilt: 2 waves in 4 dispatch units, expected ~$16 API-equiv (Cost table in the plan; ~$6.2 already spent on kickoff and planning).
  Wave 1 [deep] m1 s1-s3 (register, C gains B's scope, window from schedule).
  Wave 2 [exec] m1 s4-s5 (start terms, F1), then m2 s1-s3, then m3 s1-s3.
Gates it crosses: 4 before the m2 unit and before the m3 unit. No canary (one group per unit), no gate 2/3/7.
Runner detected (CLAUDE_CODE_REMOTE=true). Proposed mode: unattended.
  unattended: gate 4 is logged, not asked. A failed commit check or a CONCERNS gets an automatic
    fix-up, up to 2 per group. I stop to ask for information, at a plan error, a scope breach, a
    worker's disclosed breach, a failure after one retry, a group's third failed check or review,
    a merge from main that conflicts, F1 moving any sample beyond showcase/sizing/late-row-shifts,
    unplanned [xdeep] or Fable work, or projected spend past 3x expected or $50, whichever is higher ($50).
  gated: every gate stops, and so does every failed check or repeat CONCERNS.
Either way, after every unit I commit and push the plan and its handoff
(specs/handoffs/handoff-scheduler-unification-quilt.md). Opening the PR waits for you.
Per your instructions I stop after recording this answer so you can /compact, then resume from the Kickoff prompt.
Reply unattended or gated.
```

## Milestone notes (gate 4)

- m1 (engine B becomes a projection of C, plus F1 as m1.s5): not started.
- m2 (one plan and one schedule per staging): not started. R2 (m4.14) steps that touch `RoadmapNode.place` may start once m1 and m2 are done; say so here when they are.
- m3 (tests describe behaviour, not agreement): not started.

## Decisions so far

The plan's "Decisions made while planning" (1-8) stand; none added by a unit yet.

## Environment notes

- env: Node is v22.22.0 at `/opt/node22`; `.nvmrc` pins 26.2.0 but `engines.node` is `>=22` and CI has a Node 22 cell. pnpm 12.8.1 via corepack, Bun 1.4.2 (for `make compile TARGET=local`), Python 3.13.
- env: `make init` has not been run; there is no `node_modules` or `packages/*/dist` yet.
- env: `.scratch/` exists and is gitignored; G1/G3 render caches go in `.scratch/g1/<sha>/` and `.scratch/g3/<sha>/`.
- env: git identity is the runner's (`noreply@anthropic.com`), accepted per the runner rule.

## Deviations from plan

None yet.
