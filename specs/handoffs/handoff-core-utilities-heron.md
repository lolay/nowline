# Handoff: m4.12 core AST, style and calendar utilities (plan-core-utilities-heron)

- **Branch:** `claude/zealous-thompson-tur82q` (lolay/nowline), assigned by the cloud harness. Started on it at `c34804c` (= `origin/main`).
- **Plan:** `specs/handoffs/plan-core-utilities-heron.md`. Spec: `specs/core-ast-utilities.md`.
- **Mode:** unattended, confirmed 2026-10-13 in session 462f378b-01ae-572c-b81b-c39199f8207a (harness=claude-code runner=cloud), re-confirmed by the pasted Kickoff prompt after `/compact`.
- **Status:** resumed after `/compact`; `origin/main` merged (`512265b`, clean: #149, #150). 0/5 waves done. Wave 1 launching.
- **Spend:** ~$5.8 logged (kickoff and planning) against ~$24 expected (guard ~$72).

## Waves

| wave | tier | steps | state |
|---|---|---|---|
| 1 | exec | m1.s1 | next |
| 2 | deep | m1.s2-s3 | |
| 3 | exec | m1.s4 | |
| 4 | deep | m2.s1-s3 | |
| 5 | exec | m2.s4, then m3.s1-s3 (two units) | |

Gates on the way: 2 before waves 2 and 4; 4 before wave 4 (m2) and before the m3 unit of wave 5. No canary (one working directory), no gate 7.

## Pending question (verbatim)

None.

## How to resume

Paste the plan's Kickoff prompt (in the plan's Kickoff block). Before each unit the parent fetches `origin/main` and merges it when clean (plan, "Merging main").

## Decisions so far

- Gary, 2026-10-13 (after the kickoff answer): merge `origin/main` into the branch before wave 1. Main then carried #149 and #150 (m4.11, R1), so R1 landed first and R3 uses its helpers; workers re-locate the spec's `file:line` references by symbol in layout, and m1.s3 and m2.s1 cover copies R1 added or moved.
- Gary, 2026-10-13 (plan mode): the m2.s1 behaviour commit makes the validator strict too. NL.E0405 fires for an impossible day (`2026-02-30`) on every date key, not only in calendar declarations, and layout reads such a date as no date. Recorded in the plan's Decisions (2) and to be written into the spec as §7 decision 5.
- The new helpers ship only through `@nowline/core/internal` (unstable, documented in `packages/core/README.md`).
- `effectiveWave` / `leadWave` are removed outright in m3.s3 with a `removed` fragment.
- One changelog file for the branch: `.changelog/core-ast-utilities.txt`.

## Environment notes

- Cloud runner: Node 22.22.0 is installed; `.nvmrc` pins 26.2.0. Since #149 (merged in `512265b`) `make doctor` accepts Node >=22 and passes. `make` targets are the entry point; `packages/cli/dist/` is not built at kickoff (run `make init build-fast` first).
- Gate script lives in the plan (Gates section); workers write it to `.scratch/gates.sh`. Cached gate renders go to `.scratch/gates/`, base worktrees to `.scratch/gate-wt/` (both gitignored).

## Deviations from plan

- One PR at the end instead of one PR per spec step (Gary's instruction).
- The parent merges `origin/main` between units when the merge is clean, outside every worker's range (plan, "Merging main").
