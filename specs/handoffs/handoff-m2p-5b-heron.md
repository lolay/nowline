# Handoff: m2p Phase 5b (declarations on the chart and in exports)

**Temporary runner file.** It reaches `main` with [`plan-m2p-5b-heron.md`](./plan-m2p-5b-heron.md) through a plan-only PR, as 5a's plan did (lolay/nowline#114). The 5b branch removes both files as its last commit before merge.

## Where things stand

- **Phases 1–4 and 5a** are on `main`: lolay/nowline#96 as `9c0982d`, #97 as `c74c795`, #115 as `e3b2479`. The plan was written against `main` `a758c72` (2026-10-12).
- **Branch:** `claude/plan-m2p-5b-heron-5bcx5v`, the executing session's harness-assigned branch, cut from `main` at `7ac0d44` (the plan PR, lolay/nowline#117). The planning session's `claude/hopeful-dirac-g9dll4` is gone; the Kickoff prompt's `On branch` line now names this branch.
- **Mode:** unattended, confirmed 2026-10-12 by the executing session (session `d2e6b266-7085-567a-b805-c4269ef5a3e8`). Gate 2 before wave 2 is a logged checkpoint.
- **Done:** nothing is implemented.
  - The research is in the plan: three read-only code maps and a scratch probe.
  - The probe laid out Example B in both views, ran `packMarkerRow` with the real re-pack bounds, and exported Examples B, D and E row 1 to Mermaid and MS Project. It was deleted afterwards, and `dist/` was restored.
- **Next unit:** wave 1 `[exec]` (s1–s3), then gate 2, then wave 2 `[deep]` (s4–s6), then wave 3 `[exec]` (s7–s10).
- **Spend:** the planning session is outside the Cost table. Expected total ~$23, guard ~$69.

## Pending question

None. Wave 1 `[exec]` (s1-s3) is the next launch.

## How to resume

Start a cloud session on `lolay/nowline` from branch `claude/plan-m2p-5b-heron-5bcx5v` and paste the plan's Kickoff prompt.

## Deviations

- **The kickoff question was deferred** (answered `unattended` on 2026-10-12 by the executing session). The skill asks it right after the plan is written. Here the planning session wrote the Kickoff block in its pending form (`mode: pending`, Status `BLOCKED at gate mode`, no mode line in the prompt) and left the question to the executing session. That session needs the maintainer's approval of the plan PR first, and was asked to drive only the 5b plan. `plan_state.py` reports only `gate-mode`.
- **Decision 6 deviates from spec §8** (no `<WorkWeeks>`). s9 updates the spec in the 5b PR.
- **Decision 3 adds a run-label canvas growth** that the milestone handoff doesn't mention. Without it, Example B's label under `hide` draws over the header card. The probe showed this.

## Decisions so far

The plan's Decisions section holds all eight; nothing has run yet.

## Environment notes

- **Node 26.2.0** from the official linux-x64 tarball, verified against `SHASUMS256.txt`, extracted into `$HOME`, with its `bin` first on `PATH` in every shell.
- **pnpm 12.8.1 is preinstalled** at `/opt/node22/bin/pnpm`. Append `/opt/node22/bin` to `PATH`. Do not run `corepack enable` under Node 26: its shim looks for `bin/pnpm.cjs`, pnpm 12 ships `bin/pnpm.mjs`, and `make init` fails with `MODULE_NOT_FOUND`.
- **`make init && make build-fast`** take about two minutes on a fresh container.
- **MS Project `<StartDate>`** is the export date. `--now 2026-02-09` on the CLI pins it, which the byte-identity export baseline needs.

## Gotchas

- **The extension pass rebuilds the runs** (`roadmap-node.ts:688`). Compute labels from the final runs, never from the pre-pack's copies.
- **The packer sorts by `centerX` with a stable sort.** Run entries go after the markers, so a marker wins a tie at the same x. Example B under `hide` is exactly that tie.
- **Omit every new model key on untitled runs.** Never `undefined` or `[]`, and no empty `<g data-layer="non-working-label">`.
- **`textmate-wave.test.ts` indexes grammar patterns by position.** Widen the existing line-start pattern at index 0; don't insert a new one before it.
- **Only dated, titled, non-working rules carry titles** (`titledRules`). A titled bounded recurrence or a titled `working` rule is never labelled.
- **The French `nowline.5` has a translation stamp** that `make test` checks. Carry every English edit into it, then replace the stamp with the line the failing test prints.
- **5a and 5b ship in the same release.** Don't let a release cut land between them.
