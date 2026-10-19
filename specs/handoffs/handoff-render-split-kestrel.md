# Handoff: R5 render split (orchestrate run `plan-render-split-kestrel`)

- **Branch:** `claude/lucid-cannon-6tq5ly` (harness-assigned task branch, cut from `main` at `5b17389`). Name was assigned, not guessed.
- **Plan:** [`plan-render-split-kestrel.md`](./plan-render-split-kestrel.md).
- **Mode:** unattended, confirmed 2026-10-19 in session `fc39e88b` (dialog: Unattended; session: This session).
- **Done:** wave 1 unit m1 s1-s7, `831468b..8938c21`, review PASS (parity harness; primitives, waves, timeline, nowline, markers, edges moved; `render.ts` 3192 -> 1730 lines). Plan tagged into 3 waves: 1 [exec] m1 s1-s7 + m2 s1-s7 (two units, one per milestone), 2 [deep] m3 s1-s6, 3 [exec] m4 s1.
- **Spend:** ~$7.14 of ~$15 expected (Cost table in the plan); guard 3x min $50.
- **Next unit:** wave 1, m2 s1-s7 [exec] (`nowline m2 s1-s7`), relaunched from `8307d3e`; the worker skips steps that already have commits once they meet acceptance. Gate 4 passed unattended.
- **Resume:** paste the plan's Kickoff prompt into a new session, or answer the pending question here.

## Pending

The container restarted while run `wf_2dad70a4-aba` (m2 s1-s7) was working, so the run left no result and no review. Reconciled from git:

- Committed by the worker, **UNREVIEWED**: `ab7a1d2` m2.s1 header.ts, `7e82fce` m2.s2 item.ts, `53949f0` m2.s3 swimlanes.ts, `1634869` m2.s4 footnotes.ts.
- `22db375` m2.s5 include-region.ts (partial): the move was in the tree, uncommitted; the parent committed it as found so it survives. Its `make pre-commit` and parity check were not confirmed.
- m2.s6 and m2.s7 not started.

Gary answered "just run it here": m2 relaunches in session `fc39e88b` from `8307d3e`, with the worker re-verifying the partial m2.s5 commit before s6 and s7.

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
