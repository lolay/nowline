# Handoff: m2p Phase 2 (working-day schedule under `hide`)

**Temporary runner file.** It rides the branch and is removed as the branch's last commit before merge, together with `plan-m2p-working-day-schedule-heron.md`.

## Where things stand

- **Branch:** `claude/tender-babbage-mjx733`, PR lolay/nowline#96 (Phase 1, CI green, open). Phase 2 stacks on it.
- **Plan:** [`plan-m2p-working-day-schedule-heron.md`](./plan-m2p-working-day-schedule-heron.md), approved by the maintainer, orchestrated from the session that wrote it.
- **Wave 1 (`[exec]`, s1–s3) is done and reviewed: PASS.**
  - 66 new tests in three new files: `packages/layout/test/working-day-schedule.test.ts`, `packages/layout/test/non-working-identity.test.ts` and `packages/renderer/test/non-working.test.ts`.
  - Updates in ten existing test files. Every § Tests bullet is covered with literal values.
  - Red runs, staged through `make test` only: 142 failures, all in new or updated tests. The whole suite is green with the new and updated tests parked.
- **The red tests are not committed.** nowline needs a green `make pre-commit` for every commit, so they were set aside while this file and the plan were committed. If the container is lost, rerun wave 1 from the plan; it took about 25 minutes. The wave 1 report, red list and SVG baseline are in the gitignored `.scratch/`, so they are lost with the container.

## Pending question (gates 5 and 2, fail closed)

> Wave 1 passed review. Approve dispatching wave 2 (s4–s5 on Opus/high: implement Phase 2, then the category review and the deliberate snapshot and golden regeneration)?

Part of the same approval: wave 2 also switches the days-scale test fixtures from a scale-block `unit: days`, which the validator rejects, to a roadmap `scale:days` plus a scale block holding only `label-every: 2`. The expectations stay the same. That the validator rejects a field `resolveScale` reads is a pre-existing inconsistency (`SCALE_FIELDS` in `nowline-validator.ts`). It is out of m2p scope (decision 17) and will be reported as an incidental finding.

No answer means no dispatch.

## How to resume

1. If the red tests are missing, rerun wave 1 (s1–s3) from the plan.
2. With explicit approval, dispatch wave 2 as a one-agent Workflow on opus/high. Its prompt follows the skill's subagent context contract and quotes § Change, § Tests, § Snapshots and the wave 2 steps verbatim.
3. Wave 1's open points belong to wave 2:
   - the closing tick's `major` flag;
   - the `labelX` of a dropped label;
   - `tickBoundaryAtOrAfter` for months when the count is zero or negative.

## Gotchas

- **Use `make` targets only.** `make test` stops at the first failing package. Wave 1 got full red coverage by parking its test edits package by package; the scripts are in the gitignored `.scratch/p2/`.
- **Regeneration flags.** Never set `UPDATE_LAYOUT_SNAPSHOTS` or `UPDATE_DETERMINISM_GOLDENS`, except in s5 after the category review.
- **Never run `playwright install`.** CI covers the browser determinism leg.
- **Bundle budget.** The embed bundle was 197.27 KB of 200 KB before Phase 2. Dropping d3 `scaleTime` should free about 27 KB minified. Going over budget is a STOP.
- **Choices the maintainer may push back on** (from the plan):
  - narrow-column labels are judged against a full unit;
  - an after-only milestone takes the point date, Monday;
  - decision 5 ships now.
- **Known limit.** An isolated include on a different calendar than the root places its durations on the root's working-day axis.
- **Release.** Phases 2 and 3 must ship in the same release.
