# Handoff: m2p Phase 5b (declarations on the chart and in exports)

**Temporary runner file.** It reaches `main` with [`plan-m2p-5b-heron.md`](./plan-m2p-5b-heron.md) through a plan-only PR, as 5a's plan did (lolay/nowline#114). The 5b branch removes both files as its last commit before merge.

## Where things stand

- **Phases 1–4 and 5a** are on `main`: lolay/nowline#96 as `9c0982d`, #97 as `c74c795`, #115 as `e3b2479`. The plan was written against `main` `a758c72` (2026-10-12).
- **Branch:** `claude/hopeful-dirac-g9dll4`. It was harness-assigned to the planning session, and it holds only this plan and this handoff. The executing session uses its own assigned branch, cut from `main` after the plan PR merges, and rewrites the Kickoff prompt's `On branch` line to match.
- **Mode:** pending. Status is `BLOCKED at gate mode`.
- **Done:** nothing is implemented.
  - The research is in the plan: three read-only code maps and a scratch probe.
  - The probe laid out Example B in both views, ran `packMarkerRow` with the real re-pack bounds, and exported Examples B, D and E row 1 to Mermaid and MS Project. It was deleted afterwards, and `dist/` was restored.
- **Next unit:** wave 1 `[exec]` (s1–s3), then gate 2, then wave 2 `[deep]` (s4–s6), then wave 3 `[exec]` (s7–s10).
- **Spend:** the planning session is outside the Cost table. Expected total ~$23, guard ~$69.

## Pending question

Two questions, in order.

1. **Approval of the plan PR** (the maintainer's review of decisions 1–8). The ones most worth a look:
   - the label day count (decision 1);
   - canvas growth for run labels only (decision 3);
   - no `<WorkWeeks>`, a deviation from spec §8 (decision 6);
   - Mermaid working exceptions as a lossy count (decision 7).
2. **The kickoff question**, which the executing session asks after the PR merges. Expected form: 3 waves, ~$23 API-equiv, gate 2 before wave 2, `Runner detected (CLAUDE_CODE_REMOTE=true). Proposed mode: unattended.`, guard ~$69.

## How to resume

1. Merge the plan PR.
2. Start a cloud session on `lolay/nowline` from `main`.
3. Paste the plan's Kickoff prompt. The session asks the kickoff question, records the answer, and dispatches.

## Deviations

- **The kickoff question is deferred.** The skill asks it right after the plan is written. Here the planning session wrote the Kickoff block in its pending form (`mode: pending`, Status `BLOCKED at gate mode`, no mode line in the prompt) and left the question to the executing session. That session needs the maintainer's approval of the plan PR first, and was asked to drive only the 5b plan. `plan_state.py` reports only `gate-mode`.
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
