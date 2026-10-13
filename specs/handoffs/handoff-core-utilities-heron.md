# Handoff: m4.12 core AST, style and calendar utilities (plan-core-utilities-heron)

- **Branch:** `claude/zealous-thompson-tur82q` (lolay/nowline), assigned by the cloud harness. Started on it at `c34804c` (= `origin/main`).
- **Plan:** `specs/handoffs/plan-core-utilities-heron.md`. Spec: `specs/core-ast-utilities.md`.
- **Mode:** unattended, confirmed 2026-10-13 in session 462f378b-01ae-572c-b81b-c39199f8207a (harness=claude-code runner=cloud), re-confirmed by the pasted Kickoff prompt after `/compact`.
- **Status:** 3/5 waves done; m1 complete. Gate 1 on wave 3 waived by Gary (`waive`). `origin/main` merged again before wave 4 (`d3170ff`, clean: #151, m4.13, R4). Next: wave 4 [deep] m2.s1-s3 (gate 4 and gate 2, checkpoints). Milestone handoff: `specs/handoffs/handoff-m2-core-utilities.md`.
- **Spend:** ~$18.4 logged against ~$24 expected (guard ~$72).

## Waves

| wave | tier | steps | state |
|---|---|---|---|
| 1 | exec | m1.s1 | PASS `3fdba6c..6448ee4` |
| 2 | deep | m1.s2-s3 | PASS `b889c77..2286068` (gate 2 passed unattended) |
| 3 | exec | m1.s4 | CONCERNS then WAIVED `3cdb1ed..3b46f6d` (worker disclosed a direct `npx vitest` run; review PASS; Gary: `waive`) |
| 4 | deep | m2.s1-s3 | next |
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
- review wave-1 (nowline m1 s1) 3fdba6c..6448ee4: PASS. The worker made the validator's private walk helpers (`registerTeam`, `registerSwimlaneContent`, `visitPropertiesDeep`, `collectReferenceableIds`), `waves.ts`'s `collectDeclarations`/`collectWaveHosts` and layout's `collectItems` exported and `@internal` for the equivalence tests; s2-s4 remove them with their callers. Layout's `collectItems` is now at `layout.ts:1571` (moved by R1). The inline rule 24, rule 25 and person walks in the validator were not equivalence-tested (closures, not listed in s1): s2 relies on G3 for them. No difference was found between `ast-walk.ts` and any copy; the old walks' PersonDeclaration-in-team branches are dead (grammar's TeamContent cannot hold one).
- review wave-2 (nowline m1 s2-s3) b889c77..2286068: PASS. Rules 24 and 25 now walk `declarations(file)` but skip teams nested in teams (`isNestedTeam`, `nowline-validator.ts` ~2426), a caller-side filter per spec §6: the old closures never entered teams, and without it a nested team with `after:<date>` would newly get NL.E0411. No test pins this yet: **m3.s2 adds a regression test for it (nested team with `after:<date>` gets no NL.E0411, and its `after:` adds no cycle edge) before moving those rules.** The LSP equivalence test (`packages/lsp/test/references/ast-walk-equivalence.test.ts`) remains for m1.s4 to delete; a stale comment at `packages/lsp/src/references/ast-utils.ts:181` is m1.s4's to fix. `schedule.ts`'s `walkLane`/`walkNode` and the layout sequencers' child loops pre-date R1 and are outside spec §1.1: left alone (follow-up, not this milestone). `layering.test.ts` already treats `language/validator/` as part of the validator, ready for m3.
- review wave-3 (nowline m1 s4) 3cdb1ed..3b46f6d (review PASS): `collectNamedEntities` loops `declarations(file, { config: true })` with the LSP filters caller-side (unnamed nodes and calendar declarations skipped, roadmap line excluded); `buildEntityIndex` stays on `collectNamedEntities`, not `firstDeclarations` (the latter would add the roadmap line's id). `visitProperties` in `ast-utils.ts` is a re-export of core's. No m1 equivalence test and no wave-1 `@internal` test-only export remains.
- Gary, 2026-10-13, at gate 1 on wave 3: `waive` (the recommended option: waive, and let later worker prompts allow a direct single-file `vitest run` for the inner loop, with `make pre-commit` still the gate).
- Main moved again before wave 4: #151 (m4.13, R4) merged in `d3170ff`. R4 added a `now` option regex in `packages/config/src/surface-options.ts` (`/^(\d{4}-\d{2}-\d{2}|-)$/`, allows `-`, like the MCP one): it stays, as `mcp/src/server.ts:602` does. R4 moved option parsing (theme, width, now, page size, non-working) into `packages/config`; it added no DSL property-helper or content-walk copy. If its `now` parsing rolls over an impossible day, report it in m2.s1 and leave it (CLI input, outside decision 2).

## Environment notes

- Cloud runner: Node 22.22.0 is installed; `.nvmrc` pins 26.2.0. Since #149 (merged in `512265b`) `make doctor` accepts Node >=22 and passes. `make` targets are the entry point; `packages/cli/dist/` is not built at kickoff (run `make init build-fast` first).
- Gate script lives in the plan (Gates section); `.scratch/gates.sh` holds the fixed version (it rewrites the checkout root to `<checkout>` in G3 output, since `tests/grammar-properties` quotes an absolute logo path); don't overwrite it from an older copy. Cached gate renders go to `.scratch/gates/`, base worktrees to `.scratch/gate-wt/` (both gitignored). A direct single-file `vitest run` (e.g. `pnpm --filter <pkg> exec vitest run <file>`) is allowed for the inner loop (Gary's waiver, wave 3); `make pre-commit` is still the gate before every commit. A step's render takes about 3 minutes; `make build-fast` is incremental (about 5 s). `make bundle-size` was 197.16 KB of 200 KB after wave 2: watch it.

## Deviations from plan

- One PR at the end instead of one PR per spec step (Gary's instruction).
- The parent merges `origin/main` between units when the merge is clean, outside every worker's range (plan, "Merging main").
- After wave 1 the parent fixed the gate script (plan, Gates): G3 differed only by checkout root in one sample's logo warning. The rerun on `3fdba6c..6448ee4` reports G1+G3 identical.
- Gary waived gate 1 on wave 3 (`waive`); main merged again before wave 4.
- Wave 3 stopped at gate 1 on a worker-disclosed breach (a direct `npx vitest` run, local); unattended mode has no automatic fix-up for a disclosure.
- Wave 2 passed gate 2 (a `[deep]` wave after an `[exec]` one) as an unattended checkpoint.
