# Handoff: m2p Phase 2 (working-day schedule under `hide`)

**Temporary runner file.** It rides the branch and is removed as the branch's last commit before merge, together with `plan-m2p-working-day-schedule-heron.md`.

## Where things stand

- **Branch:** `claude/tender-babbage-mjx733`, PR lolay/nowline#96.
  - Phase 1 is done: `4a596b6` (rules and indices in `WorkingCalendar`) and `92558b9` (removed Phase 1's runner files).
  - CI is green on `92558b9`, including the browser determinism leg. The PR waits on maintainer review.
- **Phase 2 plan:** [`plan-m2p-working-day-schedule-heron.md`](./plan-m2p-working-day-schedule-heron.md). It was drafted, then checked against the code by a separate review agent; its fixes are folded in.
- **Not yet approved.** Nothing is implemented and no wave has been dispatched.
- The maintainer asked to keep using this branch, so Phase 2 stacks on Phase 1 and PR #96 becomes "phases 1–2". If #96 merges first, the branch restarts from `main` and gets a new PR.

## Pending question

The maintainer rejected the first approval request with:

> Did this plan use the same type of plan-tier-orchestration skill approach that was used in the prior plan?

Answer given: yes. It uses `personal-plan-orchestrate` with the Phase 1 Claude Code adaptation:
- tagged steps in three waves (`[exec]`, `[deep]`, `[exec]`);
- one-agent Workflow runs with `model` + `effort` (Sonnet high for `[exec]`, Opus high for `[deep]`);
- canary and exec→deep gates after wave 1, gate 1 on errors or a bundle overrun;
- a log-only parent review, the token tally, and the runner rules.

There are two differences:
- the snapshot regeneration step (s5) is `[deep]` and rides wave 2;
- the plan had a code-grounded review before approval.

The plan is waiting on explicit approval. A non-answer is not approval.

## How to resume

1. Get explicit approval of the plan.
2. Run the plan's Kickoff, orchestrating from this chat, as the maintainer chose in Phase 1:
   - Dispatch wave 1 (`[exec]`, s1–s3) as a one-agent Workflow on sonnet/high. Its prompt follows the skill's subagent context contract and quotes § Change and § Tests verbatim.
   - At the canary gate, commit the plan and this handoff (red tests set aside), push, and ask gates 5 and 2 together.

## Gotchas

- **Use `make` targets only.**
- **Never set `UPDATE_LAYOUT_SNAPSHOTS` or `UPDATE_DETERMINISM_GOLDENS`** except in s5, after the category review.
- **Never run `playwright install`.** The browser determinism leg cannot run in this container (Playwright 1.63 wants chromium-1243; the image has 1194), so CI covers it.
- **Embed bundle:** 197.27 KB of 200 KB before Phase 2. Dropping d3 `scaleTime` (plan choice 2) should free about 27 KB minified. Going over budget is a STOP.
- **Commits:** nowline requires a green `make pre-commit` before every commit, including runner saves.
- **Decisions in the plan the maintainer may push back on:**
  - narrow-column labels are judged against a full unit (choice 3);
  - an after-only milestone takes the point date, Monday, while a span's exclusive end is Saturday (choice 1);
  - decision 5 ships in Phase 2.
- **Known limit:** an isolated include on a different calendar than the root places its durations on the root's working-day axis. Not fixed in Phase 2.
- **Release:** Phases 2 and 3 must ship in the same release.
