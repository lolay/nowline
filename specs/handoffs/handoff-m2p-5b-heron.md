# Handoff: m2p Phase 5b (declarations on the chart and in exports)

**Temporary runner file.** It reaches `main` with [`plan-m2p-5b-heron.md`](./plan-m2p-5b-heron.md) through a plan-only PR, as 5a's plan did (lolay/nowline#114). The 5b branch removes both files as its last commit before merge.

## Where things stand

- **Phases 1–4 and 5a** are on `main`: lolay/nowline#96 as `9c0982d`, #97 as `c74c795`, #115 as `e3b2479`. The plan was written against `main` `a758c72` (2026-10-12).
- **Branch:** `claude/plan-m2p-5b-heron-5bcx5v`, the executing session's harness-assigned branch, cut from `main` at `7ac0d44` (the plan PR, lolay/nowline#117). The planning session's `claude/hopeful-dirac-g9dll4` is gone; the Kickoff prompt's `On branch` line now names this branch.
- **Mode:** unattended, confirmed 2026-10-12 by the executing session (session `d2e6b266-7085-567a-b805-c4269ef5a3e8`). Gate 2 before wave 2 is a logged checkpoint.
- **Done:** wave 1 `[exec]` s1-s3, `72b4376..84f3b6d`, review PASS (s1 `2210b06` empty baseline commit, s2 `ad7b7cb` tooling, s3 `84f3b6d` red layout and renderer tests). Wave 2 `[deep]` s4-s6, `9a6b159..50206d6`, review PASS (s4 `a204075` labels and packing, s5 `20995fa` renderer, s6 `50206d6` empty: byte identity clean, bundle 193.33 KB of 200 KB). Byte-identity baselines live in `.scratch/m2p-5b/` (gitignored; rebuild per § Byte identity step 1 if the container is lost).
  - The research is in the plan: three read-only code maps and a scratch probe.
  - The probe laid out Example B in both views, ran `packMarkerRow` with the real re-pack bounds, and exported Examples B, D and E row 1 to Mermaid and MS Project. It was deleted afterwards, and `dist/` was restored.
- **Next unit:** wave 3 `[exec]` (s7–s10). Gate 2 passed as an unattended checkpoint before wave 2. s10's PR opening waits for the maintainer (outward action).
- **Spend:** ~$10.22 logged (wave 1 ~$4.06, wave 2 ~$3.47, orchestrator ~$2.68) of ~$23 expected; guard ~$69. The planning session is outside the Cost table.

## Pending question

None. Wave 3 `[exec]` (s7-s10) is the next launch.

## How to resume

Start a cloud session on `lolay/nowline` from branch `claude/plan-m2p-5b-heron-5bcx5v` and paste the plan's Kickoff prompt.

## Deviations

- **Gate 2 passed as an unattended checkpoint** before wave 2 (exec to deep), per the recorded mode.
- **Wave 2 commits per step.** The plan has s6 commit and push; the orchestrator had s4 and s5 commit their own steps (s4 under the red-test exception for the s3 renderer cases), s6 an empty commit after the proof, and the parent push.

- **The kickoff question was deferred** (answered `unattended` on 2026-10-12 by the executing session). The skill asks it right after the plan is written. Here the planning session wrote the Kickoff block in its pending form (`mode: pending`, Status `BLOCKED at gate mode`, no mode line in the prompt) and left the question to the executing session. That session needs the maintainer's approval of the plan PR first, and was asked to drive only the 5b plan. `plan_state.py` reports only `gate-mode`.
- **Decision 6 deviates from spec §8** (no `<WorkWeeks>`). s9 updates the spec in the 5b PR.
- **Decision 3 adds a run-label canvas growth** that the milestone handoff doesn't mention. Without it, Example B's label under `hide` draws over the header card. The probe showed this.

## Decisions so far

The plan's Decisions section holds all eight. From wave 1 (review PASS):

- `declarationAt` now returns `NonWorkingDeclaration` / `WorkingDeclaration`, so the LSP rename and references providers skip them through a new `isCalendarDeclaration` helper (tests pin it). s9's docs should describe hover on declarations but no rename or references.
- The snippet validation test wraps each snippet in a roadmap that also has a swimlane and an item, because NL.E0004 rejects a roadmap with no swimlane; it asserts no diagnostics of any severity via a new `parseAndValidate` helper.
- s3's Launch show-column case already passes (it pins existing behaviour); the 12 red layout and 7 red renderer cases are the ones s4 and s5 turn green.

From wave 2 (review PASS):

- `nonWorkingRunLabel` (exported from `layout/src/view-preset.ts`) builds the label; `buildNonWorkingRuns` sets `label` and, under hide, `cut`; `labelBox` / `labelSide` come only from the re-pack of the final runs.
- The pre-pack packs against a right edge widened for the provisional run labels (beyond decision 3), so a label the later canvas growth puts on the right doesn't take the left fallback and oversize the marker band. `ctx.chartRightX` is untouched; files without titled runs see no change.
- Commit subjects use the bare step ID (`s7 ...`), as waves 1 and 2 did.
- Bundle size: 192.84 KB before wave 2, 193.33 KB after (200 KB budget).

## Environment notes

- **Node 26.2.0** from the official linux-x64 tarball, verified against `SHASUMS256.txt`, extracted into `$HOME`, with its `bin` first on `PATH` in every shell.
- **pnpm 12.8.1 is preinstalled** at `/opt/node22/bin/pnpm`. Append `/opt/node22/bin` to `PATH`. Do not run `corepack enable` under Node 26: its shim looks for `bin/pnpm.cjs`, pnpm 12 ships `bin/pnpm.mjs`, and `make init` fails with `MODULE_NOT_FOUND`.
- **`make init && make build-fast`** take about two minutes on a fresh container.
- **Vitest suppresses `console.log`**: a temporary probe test has to write to a file.
- **`pnpm -r` stops at the first failing package**, so with red tests in layout, `make pre-commit` never reaches renderer, integration or later packages; run their vitest per package to see them.
- **Write temp files only under the session scratchpad**: a redirect to a root path followed by `rm` trips the rm safety check.
- **MS Project `<StartDate>`** is the export date. `--now 2026-02-09` on the CLI pins it, which the byte-identity export baseline needs.

## Gotchas

- **The extension pass rebuilds the runs** (`roadmap-node.ts:688`). Compute labels from the final runs, never from the pre-pack's copies.
- **The packer sorts by `centerX` with a stable sort.** Run entries go after the markers, so a marker wins a tie at the same x. Example B under `hide` is exactly that tie.
- **Omit every new model key on untitled runs.** Never `undefined` or `[]`, and no empty `<g data-layer="non-working-label">`.
- **`textmate-wave.test.ts` indexes grammar patterns by position.** Widen the existing line-start pattern at index 0; don't insert a new one before it.
- **Only dated, titled, non-working rules carry titles** (`titledRules`). A titled bounded recurrence or a titled `working` rule is never labelled.
- **The French `nowline.5` has a translation stamp** that `make test` checks. Carry every English edit into it, then replace the stamp with the line the failing test prints.
- **5a and 5b ship in the same release.** Don't let a release cut land between them.
