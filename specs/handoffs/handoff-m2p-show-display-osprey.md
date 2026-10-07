# Handoff: m2p Phase 4 (`show` and the display setting)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-show-display-osprey.md`, as the Phase 4 branch's last commit before merge.

## Where things stand

- **Phases 1–3** merged in lolay/nowline#96 as `9c0982d` on `main`.
- **Phase 4 plan:** [`plan-m2p-show-display-osprey.md`](./plan-m2p-show-display-osprey.md). It was drafted in the m2p session from three read-only code maps (engine A and `TimeScale`; style key, validation and renderer; option plumbing on every surface) and a design pass, all at a tree equal to `9c0982d`.
- **The plan is not approved yet.** Nothing is implemented, and no session has been started for it.

## Pending question

Approval of the Phase 4 plan.
- The maintainer asked for it with "should we do phase 4? lets plan here and then move to execute in a new agent".
- A worker restart dropped plan mode before the plan could be shown, so it is presented again for approval.
- No answer means no new session.

## How to resume

With explicit approval:
1. The m2p session creates a new cloud session from this branch, using the kickoff prompt at the top of the plan.
2. That session runs the plan with the personal-plan-orchestrate skill, and stops at gates 5 and 2 after wave 1.

## Gotchas

- **Hide must stay byte-identical** to `main`: every layout snapshot, every determinism cell, every rendered example. The baselines are taken in s2, before any source edit.
- **Snapshots and goldens:** only additions (`weekends-show`), never changes.
- **`make` targets only.** Never run `playwright install`.
