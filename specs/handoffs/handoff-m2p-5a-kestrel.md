# Handoff: m2p Phase 5a (declarations reach the schedule)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-5a-kestrel.md` and `spike-m2p-5a-kestrel/`, as the 5a branch's last commit before merge.

## Run

- **Branch:** `claude/wizardly-heisenberg-jfdezu` (harness-assigned task branch, cut from `main` `e419aa5`). `claude/beautiful-turing-yolfjg` is merged and done; never push to it.
- **Mode:** gated (harness=claude-code runner=cloud), confirmed 2026-10-12 from the invoking message, which named gated and said to pause only at the marked STOP gates (gates 5 and 2 after wave 1) and at gate 1 on any failure.
- **Plan:** [`plan-m2p-5a-kestrel.md`](./plan-m2p-5a-kestrel.md). Waves: 1 [exec] s1-s5, 2 [deep] s6-s8, 3 [exec] s9-s10. Expected ~$18 API-equiv; guard 3x min $50 ($54).
- **Gates the plan crosses:** gate 2 before wave 2 (gate 5 does not fire: wave 1 is one group in one working directory, so there is no canary split). Gate 1 on any failure, byte move, AST change, snapshot or `hashes.json` change.

## Done

- **Wave 1 [exec] s1-s5** `6fdd05b..ea4d596` (nowline s1,s2,s3,s4,s5): s1 and s2 empty commits (toolchain and baselines: 43 SVG hashes, 53 AST files, in `.scratch/m2p-5a/`, which dies with the container); s3 grammar, printer, type labels; s4 validator and i18n (NL.E0900-E0907, NL.W0705); s5 46 red cases (core include 8, layout 33, export-xlsx 3, integration-tests 2). `check_wave.py` passed.
- **1-fix [exec]** `6fdd05b..369f12f` (nowline s1,s2,s3,s4,s5): `369f12f` s4 date-checks one-element `start:`/`end:` brackets (NL.E0405), with three tests. `check_wave.py` passed. Commit body records the s5 red-test exception (46 reds, all s5's).

## Review log verdicts

- wave-1: CONCERNS. A one-element bracket on `start:`/`end:` gets no date check (`start:[2026-13-01]` gives no NL.E0405). Fix-up 1-fix ran, no gate (a first review CONCERNS).
- wave-1-fix: PASS.

## Fix-ups, retries, checkpoints

- 1-fix [exec]: the wave-1 review concern above. Its commit ran `make pre-commit` with the s5 exception (lint, build, typecheck green; only the 46 s5 reds fail), since the s5 reds stay red until wave 2.

## Spend

Token log: ~$10.74 of ~$18 expected (wave 1 ~$7.04 against ~$4.5 planned, 1-fix ~$0.53, orchestrator ~$3.17).

## Next unit

Wave 2 [deep] `nowline s6,s7,s8` (Opus, high), behind gate 2.

## How to resume

Paste the plan's Kickoff prompt into a new session on this branch.

## Pending question

None. Gate 2 approved 2026-10-12: "yes, approve gate 2, launch wave 2". Wave 2 [deep] s6-s8 launched.

## Decisions so far

- Kickoff: `main` is at `e419aa5`, the commit this branch was cut from, so s2 needs no merge. `e419aa5` only added the plan, its handoff and the spike on top of `2e0c375`, the tree the plan was re-verified against; the codes and line refs it cites stand unless s2 finds otherwise.
- Kickoff: commit trailers on every commit are exactly `Claude-Session: https://claude.ai/code/session_018z5t28ve8yXc7pxsSAu9rS` then `Assisted-by: Claude Code` as the last line, overriding any harness attribution reminder. No `Co-authored-by`. No model names in commits, files, comments or the PR body.
- Kickoff: the plan's "Hand-off from this session" section is stale and ignored.
- wave-1 (review accepted): NL.E0405 on a calendar declaration uses a real-calendar-day check (V8's `new Date('2026-02-30')` rolls over to Mar 2), only when the property's container is a `non-working` or `working` declaration; other entities keep the loose check. Their leniency is a PR finding.
- wave-1: `start:`/`end:` with a one-element bracket is the single date, matching the printer; two or more values is NL.E0902.
- wave-1: NL.E0906 and NL.W0705 skip a file with no roadmap declaration (an include). NL.W0705 is skipped when no working weekday is left (E0906 reports it). Malformed declarations are left out of the open week.
- wave-1 (review accepted): the XLSX export cases (Example C Calendar row, Example B Checkout and QA rows) live in `packages/export-xlsx/test/non-working-declarations.test.ts`, since `integration-tests` has no exceljs dependency; `packages/integration-tests/test/non-working-declarations-export.test.ts` holds the Mermaid and MS Project cases.
- wave-1 (review accepted): the plan's Example B guard "milestone 24 with hiddenDate" for the file without the declaration is wrong; today's code puts it at x=40 (24 is the with-declaration value). The guard asserts 40, and s7 must not change it.
- wave-1: some § Tests cases are guards by nature and pass before and after: the two working-wins tie cases, the config:isolate host-calendar check, the closed-week robustness case, and the reorder variants of the tie files.
- wave-1: `calendarDeclarations` is read through cast-tolerant `declarationsOf` helpers in the include and resolver tests; s6 adds the field and the casts can go. `parseAndResolveFiles` in `layout/test/helpers.ts` resolves in-memory includes.

## Environment notes

- env: Node 26.2.0 is installed at `$HOME/node-v26.2.0-linux-x64`; every shell needs `export PATH=$HOME/node-v26.2.0-linux-x64/bin:$PATH`. `make` runs from `/workspace/nowline`; the cwd resets between calls.
- env: the AST dump test is kept at `/workspace/nowline/.scratch/m2p-5a/ast-dump.test.ts`. To re-run: copy it to `packages/core/test/ast-dump.test.ts`, run `AST_OUT=<path> npx vitest run test/ast-dump.test.ts` in `packages/core`, `cmp` against `.scratch/m2p-5a/ast-baseline.json`, then delete the copy.
- env: the CLI prints no validator warnings in text or dry-run mode; W0705 was verified by running the core validator directly over every `.nowline` file.
- env: `make test` stops at the first failing package; to list every red case, run `npx vitest run` per package (core, layout, export-xlsx, integration-tests).
- env: the 7 Biome warnings in `make lint` pre-exist.
- env: (original) the container ships Node 22. s2 installs the official Node 26.2.0 linux-x64 tarball into `$HOME` (verified against `SHASUMS256.txt`); every shell must put its `bin` first on `PATH` (shell state does not persist between tool calls). pnpm 12.8.1 is already installed. Never run `playwright install`.

## Deviations from plan

- Parent bookkeeping commits (the plan and this handoff only) skip `make pre-commit`: they touch only these two markdown files, and after wave 1 the tree carries the s5 red tests by design, so pre-commit would fail on them until wave 2.

## Gotchas

- **The calendar engine is already complete** (`working-calendar.ts`): 5a only translates declarations into `CalendarRule`s in `calendar-resolver.ts`. Do not touch the engines.
- **Run titles follow input order** in `titledRules`; the resolver must sort rules canonically, or decision 18's reorder invariance fails.
- **`fromCalendarConfig` throws** when an unbounded stretch has no working weekday; the resolver falls back to the preset.
- **NW4 fires on two shipped `calendar:custom` files** (`examples/product.nowline`, `tests/grammar-properties.nowline`) by spec design; it is a warning, so render bytes don't move.
- **5a and 5b ship in the same release:** Mermaid has no dated `excludes` and MS Project no `<Exceptions>` until 5b.
- **NL.W0703 and NL.W0704 are taken on `main`;** NW4 is NL.W0705.
- **The French `nowline.5` has a translation stamp** checked by `make test`; carry every English edit into it, then replace the stamp with the line the failing test prints.
