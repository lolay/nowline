# Handoff: m4.13 surface options (plan-surface-options-heron)

Session handoff for the `personal-plan-orchestrate` run of
`specs/handoffs/plan-surface-options-heron.md`. Removed (or promoted) in the
last commit before the PR merges.

## Branch and mode

- Repo `lolay/nowline`, branch `claude/serene-archimedes-ida865` (assigned by
  the cloud session; task branch). Started on it; nothing cut.
- Mode: unattended, confirmed 2026-10-13 by Gary in session 3d92f75d (harness=claude-code runner=cloud).
- Guard: 3x the Cost table Total, min $50 (about $66). Fix-up cap 2 per group.

## Done

- Plan written and approved by Gary (2026-10-13). Kickoff block, wave
  markers, Cost table, Review log and Token log written.
- No wave has run.

## Review log verdicts, fix-ups, retries, checkpoints

None yet.

## Spend

~$4.71 API-equiv so far (kickoff and planning) of ~$22 expected.

## Next unit

Wave 1 [deep] nowline m1 s1 (add the schema to `@nowline/config`).

## Pending question

None. Kickoff answered `unattended`. Halted for Gary's `/compact` before
any dispatch.

## How to resume

Paste the plan's Kickoff prompt.

## Decisions so far

- Plan-level (approved with the plan): `assetRoot` rc gets its own step,
  m1.s7; a relative rc `assetRoot` resolves against the `.nowlinerc`
  directory, a relative `--asset-root` flag against cwd; CLI width keeps the
  lenient `parseInt` rule (byte-identity); the VS Code extension gains a
  minimal vitest setup in m1.s4; one PR at the end with one commit per step.

## Environment notes

- Cloud runner: Chromium at `/opt/pw-browsers`; do not run `playwright install`.
- Gate reference renders go in `.scratch/gates/ref-<sha>/` (gitignored),
  built from the last merged `origin/main` (c34804c at kickoff).

## Deviations from plan

None yet.
