# Handoff: m2p Phase 1 calendar primitives (kestrel)

Session handoff for an orchestrated run (personal-plan-orchestrate, Claude Code adaptation). Temporary: this file and `plan-m2p-calendar-primitives-kestrel.md` are removed as the last commit on the branch before merge.

- **Branch:** `claude/tender-babbage-mjx733` (assigned by the harness, not a guess).
- **Plan:** `specs/handoffs/plan-m2p-calendar-primitives-kestrel.md` (3 waves; its Kickoff `Status:` line is the source of truth).

## What was done

- **Wave 1 [exec] m2p-1 s1-s3** ran on `claude-sonnet-5-5` (26 of 26 transcript messages): Node 26.2.0 and pnpm 12.8.1, `make init`; `packages/layout/test/working-calendar.test.ts` written (1,175 lines); red run: only that file fails, at collection (`presetRules is not a function`), 563 other layout tests pass; 40 rendered SVGs saved to `.scratch/orchestrate-baseline-svg/`. Parent review: PASS.

## What's pending

- **STOP at gate 5 (first-subagent canary) and gate 2 (`[exec] -> [deep]` review), asked together.** Question, verbatim:

  > Wave 1 is done and reviewed (PASS): Sonnet wrote `packages/layout/test/working-calendar.test.ts` and it fails only because the engine doesn't exist yet. Approve dispatching wave 2 [deep] (Opus, high effort) to implement `packages/layout/src/working-calendar.ts` against these tests?

- Then wave 3 [exec] (gates, byte-stability proof, commit, push, PR) and the end-of-phase report.

## Key decisions

All in the plan: the generalized rule model and precedence (§ Change), the agreed DSL syntax (`non-working` / `working`, `date:` single or list, inclusive `start:` / `end:`, `every:`), the Claude Code adaptation (one-agent Workflow per wave with `model` + `effort`; the user approved it and orchestration from the same chat).

## Gotchas

- The new test file is deliberately **uncommitted**: it stays red until wave 2, and nowline's AGENTS.md forbids committing with `make pre-commit` red, so this save commits only the plan and this handoff. If the container is lost, re-run wave 1 s2-s3 from the plan (§ Tests and the wave-1 prompt there describe every case).
- `.scratch/orchestrate-baseline-svg/` dies with the container. If it is lost, re-render a baseline before wave 2 touches `working-calendar.ts` (`make build`, then copy `examples/**/*.svg` and `tests/**/*.svg`).
- Every shell needs Node 26.2.0: `export NVM_DIR=/opt/nvm; . "$NVM_DIR/nvm.sh"; nvm use 26.2.0`.
- Transcript `output_tokens` are streaming placeholders; price output by chars/4 and treat it as a floor.

## How to resume

Read the plan on the branch. Its `Status:` line says `BLOCKED at gate 5 + gate 2`: re-post the question above and wait for an explicit answer. On approval, dispatch wave 2 as described in the plan's Orchestration section.
