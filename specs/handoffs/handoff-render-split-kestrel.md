# Handoff: R5 render split (orchestrate run `plan-render-split-kestrel`)

- **Branch:** `claude/lucid-cannon-6tq5ly` (harness-assigned task branch, cut from `main` at `5b17389`). Name was assigned, not guessed.
- **Plan:** [`plan-render-split-kestrel.md`](./plan-render-split-kestrel.md).
- **Mode:** unattended, confirmed 2026-10-19 in session `fc39e88b` (dialog: Unattended; session: This session).
- **Done:** wave 1 (m1 `831468b..8938c21`, m2 `8307d3e..e2275d5`, both PASS) and wave 2 (m3 `283bf38..0d3a6af`, PASS after fix-up 1: s4 float summation order). `render.ts` 3192 -> 239 lines; measurement moved into layout per `r5-measurement-survey-kestrel.md`, follow-ups F1 (all-empty wave placeholder halo) and F2 (lane owner tab sized from id, drawn from person title; item bar can overlap the owner text, a real visual bug).
- **Spend:** ~$26 of ~$15 expected (wave 2 deep worker ran ~$8 vs ~$4.7 estimate, plus one review/fix-up cycle); guard 3x min $50.
- **Next unit:** wave 3, m4 s1 [exec] (`nowline m4 s1`), from `0d3a6af`.
- **Resume:** paste the plan's Kickoff prompt into a new session.
- **Orchestrator note:** session `db6b66a7` had no `personal-plan-orchestrate` skill installed in its cloud container; it ran the procedure as the plan file describes it (worker subagent per unit, review subagent, plan update), without the skill's gate hooks.

## After the run, before the PR

- Last commit removes `specs/handoffs/plan-render-split-kestrel.md`, this handoff, `specs/handoffs/r5-parity.sh` and `specs/handoffs/r5-measurement-survey-kestrel.md`, after m4.s1 has carried the durable parts into `specs/review-since-v086.md`.
- Ask before opening the PR. Use `.github/PULL_REQUEST_TEMPLATE.md`, AI assistance section last, ending `Assisted-by: Claude Code`. Label `no-changelog`. PR body records: `view-preset.ts` left as is; every m3 follow-up the survey left.

## Decisions so far

- review wave-1 (nowline m1 s1-s7) 831468b..8938c21: PASS. m1.s6: `renderMilestone` never calls `renderInlineDatePin` (only a doc comment mentions it), so `renderInlineDatePin`, `renderInlineDatePins` and `hasAfterPin` stay in `render.ts` for m2.s2 to move into `item.ts`; no `date-pins.ts`. `hasOverrunArrow` stays in `waves.ts`, exported for `renderSvg`. Names used only inside their own module stay unexported. Modules reach the option types with `import type { FontFamilies } from './render.js'`.

## Environment notes

- `origin/HEAD` was unset in the cloud checkout; set with `git remote set-head origin --auto`.
- `make doctor` passed at session start.
- `node_modules` was absent in the container: run `make init` first.
- `make format` rewrites `packages/layout/src/start-rules.ts` (a `useImportType` fix) on a clean tree; this predates R5 and is out of scope. Revert it after any `make format` and never stage it. `make lint` shows the same 10 warnings before and after.
- Parity: `specs/handoffs/r5-parity.sh check` renders 252 files (63 fixtures x 4 variants) in about 38 s; state under `.git/r5-parity/`; the first baseline builds the base worktree itself.

## Deviations from plan

- Container restart mid-m2; partial m2.s5 committed by the parent as `22db375` (see Pending).
