# Handoff: m2p Phase 3 (exporters read the file's calendar)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-exporter-calendars-wren.md`, as the branch's last commit before merge.

## Where things stand

- **Branch:** `claude/tender-babbage-mjx733`. PR lolay/nowline#96 covers phases 1–2 and is open; CI is green on `d436a36`.
- **Plan:** [`plan-m2p-exporter-calendars-wren.md`](./plan-m2p-exporter-calendars-wren.md), approved by the maintainer and orchestrated from the session that wrote it.
- **Wave 1 (`[exec]`, s1–s3) is done and reviewed: PASS.**
  - Four new test files: `packages/layout/test/calendar-resolver.test.ts` and a `test/calendar.test.ts` in each of `export-xlsx`, `export-msproj` and `export-mermaid`.
  - Updates in `packages/layout/test/schedule.test.ts` and the three exporters' main test files. Every § Tests bullet is covered with literal values.
  - Red runs, staged through `make test` only: 100 failures (layout 41, mermaid 27, msproj 9, xlsx 23), all in new or updated tests. Every guard is green.
  - 33 baselines (11 fixtures × mermaid, msproj, xlsx) captured with `node packages/cli/dist/index.js`; every hash matches its `hashes.json` node cell.
- **The red tests are not committed.** nowline needs a green `make pre-commit` for every commit, so they were set aside while this file and the plan were committed. If the container is lost, rerun wave 1 from the plan; it took about 15 minutes. The wave 1 report, red list and baselines are in the gitignored `.scratch/`, so they are lost with the container too.

## Pending question (gates 5 and 2, fail closed)

> Wave 1 passed review. Approve dispatching wave 2 (s4–s5 at the [deep] tier, high effort: implement Phase 3, then the determinism category review and the deliberate golden regeneration)?

No answer means no dispatch.

## How to resume

1. If the red tests are missing, rerun wave 1 (s1–s3) from the plan.
2. With explicit approval, dispatch wave 2 as a one-agent Workflow at the [deep] tier, high effort. Its prompt follows the skill's subagent context contract and quotes § Decisions, § Change, § Tests, § Determinism and the wave 2 steps verbatim, with the exact commit trailers.
3. Wave 1 added two `workingWeekdays` cases beyond the plan, which wave 2 must satisfy: an open-ended week rule that makes Friday and Saturday the weekend works Sunday to Thursday, and dated rules and bounded recurrences don't change the weekly pattern.
4. After wave 2, wave 3 (`[exec]`, s6–s7) writes the docs, runs the gates, commits, pushes and retitles PR #96.

## Gotchas

- **The compiled CLI is stale.** `packages/cli/dist-bin/` is from Phase 2. Run `make compile TARGET=local` before regenerating goldens.
- **Expected movers.** All 11 xlsx and 11 mermaid cells, and 5 msproj cells (platform-2026, -dark, sizing, nested-both-headers, waves). No Mermaid date may move. The full `waves` cells move as fixes.
- **Regeneration flags.** Never set `UPDATE_DETERMINISM_GOLDENS` or `UPDATE_LAYOUT_SNAPSHOTS`, except in s5 after a clean category review.
- **`make` targets only.** `make test` stops at the first failing package; wave 1 parked package by package to see every failure. Never run `playwright install`.
- **Release.** Phases 2 and 3 must ship in the same release.
