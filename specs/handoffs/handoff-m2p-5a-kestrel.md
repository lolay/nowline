# Handoff: m2p Phase 5a (declarations reach the schedule)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-5a-kestrel.md` and `spike-m2p-5a-kestrel/`, as the 5a branch's last commit before merge.

## Run

- **Branch:** `claude/wizardly-heisenberg-jfdezu` (harness-assigned task branch, cut from `main` `e419aa5`). `claude/beautiful-turing-yolfjg` is merged and done; never push to it.
- **Mode:** gated (harness=claude-code runner=cloud), confirmed 2026-10-12 from the invoking message, which named gated and said to pause only at the marked STOP gates (gates 5 and 2 after wave 1) and at gate 1 on any failure.
- **Plan:** [`plan-m2p-5a-kestrel.md`](./plan-m2p-5a-kestrel.md). Waves: 1 [exec] s1-s5, 2 [deep] s6-s8, 3 [exec] s9-s10. Expected ~$18 API-equiv; guard 3x min $50 ($54).
- **Gates the plan crosses:** gate 2 before wave 2 (gate 5 does not fire: wave 1 is one group in one working directory, so there is no canary split). Gate 1 on any failure, byte move, AST change, snapshot or `hashes.json` change.

## Done

Nothing yet. Kickoff recorded.

## Review log verdicts

None yet.

## Fix-ups, retries, checkpoints

None.

## Spend

Token log: ~$0 of ~$18 expected.

## Next unit

Wave 1 [exec] `nowline s1,s2,s3,s4,s5` (Sonnet, high), from `e419aa5`-plus-kickoff.

## How to resume

Paste the plan's Kickoff prompt into a new session on this branch.

## Pending question

None.

## Decisions so far

- Kickoff: `main` is at `e419aa5`, the commit this branch was cut from, so s2 needs no merge. `e419aa5` only added the plan, its handoff and the spike on top of `2e0c375`, the tree the plan was re-verified against; the codes and line refs it cites stand unless s2 finds otherwise.
- Kickoff: commit trailers on every commit are exactly `Claude-Session: https://claude.ai/code/session_018z5t28ve8yXc7pxsSAu9rS` then `Assisted-by: Claude Code` as the last line, overriding any harness attribution reminder. No `Co-authored-by`. No model names in commits, files, comments or the PR body.
- Kickoff: the plan's "Hand-off from this session" section is stale and ignored.

## Environment notes

- env: the container ships Node 22. s2 installs the official Node 26.2.0 linux-x64 tarball into `$HOME` (verified against `SHASUMS256.txt`); every shell must put its `bin` first on `PATH` (shell state does not persist between tool calls). pnpm 12.8.1 is already installed. Never run `playwright install`.

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
