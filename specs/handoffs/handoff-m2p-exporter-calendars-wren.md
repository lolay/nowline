# Handoff: m2p Phase 3 (exporters read the file's calendar)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-exporter-calendars-wren.md`, as the branch's last commit before merge.

## Where things stand

- **Branch:** `claude/tender-babbage-mjx733`. PR lolay/nowline#96 covers phases 1–2 and is open; CI is green on `67b0eb9`.
- **Plan:** [`plan-m2p-exporter-calendars-wren.md`](./plan-m2p-exporter-calendars-wren.md), approved by the maintainer and orchestrated from the session that wrote it. Gates 5 and 2 were approved after wave 1.
- **Wave 1 (`[exec]`, s1–s3) is done and reviewed: PASS.** It wrote the failing tests: four new test files and updates in four. The red run showed 100 failures, all in those files, with every guard green.
- **Wave 2 (`[deep]`, s4–s5) is done and reviewed: PASS.** It implemented Phase 3 against those tests and edited none of them:
  - `resolveWorkingCalendar`, `WorkingCalendar.workingWeekdays`, `RoadmapSchedule.calendar` and `ScheduledItem.days` in `@nowline/layout`;
  - the three exporters read durations and the weekly pattern from the schedule.
- **Gates from the wave:** `make pre-commit` green, bundle 188.45 KB of 200 KB, and `make determinism` 266/266 with the compiled-CLI leg.
- **Goldens:** a script compared old and new outputs before regeneration and found no disallowed move. `hashes.json` changed only the `node` value of the 27 expected cells.
- **The implementation is committed** on the branch, together with the tests and the regenerated goldens.

## Pending

Nothing waits on the maintainer. Wave 3 (`[exec]`, s6–s7) is next with no gate before it. Gate 1 applies only on an error.

## How to resume

1. If wave 3 has not run, dispatch it as a one-agent Workflow at the [exec] tier, high effort. Its prompt quotes § Change "Docs", Decision 6 and the wave 3 steps verbatim, and gives the exact commit trailers.
2. Wave 3 writes the docs. Then it runs `make pre-commit`, `make bundle-size`, `make compile TARGET=local` and `make determinism`; commits and pushes; and retitles and extends PR #96.
3. After CI is green, remove both runner files as the branch's last commit.

## Gotchas

- **Docs details from wave 2:**
  - the XLSX Calendar label lists days off Monday first, joined with `, ` and ` and `;
  - Mermaid `excludes` names are lowercase, Monday first, joined with `, `;
  - the Roadmap sheet's value column stays 36 wide, so the Calendar string spills into column C (left as is).
- **Expected movers are already regenerated.** No further golden may move in wave 3. Never set `UPDATE_DETERMINISM_GOLDENS` or `UPDATE_LAYOUT_SNAPSHOTS` there.
- **`make` targets only.** Never run `playwright install`.
- **Release.** Phases 2 and 3 must ship in the same release.
