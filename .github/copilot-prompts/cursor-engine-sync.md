# Cursor engine sync — agent task

## Context

This issue is opened automatically on the 1st of each month by `.github/workflows/cursor-engine-sync.yml`. Your job is to decide whether the VS Code extension's `engines.vscode` and `@types/vscode` floors need bumping, following the policy in `CONTRIBUTING.md § VS Code extension engine floor policy`.

The policy in brief:

- Both floors always equal each other (`engines.vscode` and `@types/vscode` in `packages/vscode-extension/package.json`).
- They track the VS Code engine version embedded in the **latest stable Cursor release** (not Beta / Nightly).
- The floors bump 30 days after Cursor first ships a new engine version, to give users time to update.

## Inputs

- [`.github/cursor-engine.json`](.github/cursor-engine.json) — current tracked state (schema at `.github/cursor-engine.schema.json`)
- [`packages/vscode-extension/package.json`](packages/vscode-extension/package.json) — current `engines.vscode` and `@types/vscode` floors
- Today's date (UTC) — use the date of this workflow run, available in the issue's creation timestamp

## Step 1 — Detect the current Cursor stable VS Code engine version

Determine the `vscodeVersion` embedded in the **latest stable Cursor release**. Use these sources in order:

1. **cursor.com/changelog** — find the most recent stable release entry (e.g. "3.5 May 20, 2026"). Look for any explicit "VS Code N.M.P" mention. Cursor does not always publish the engine version; if absent, move to step 2.
2. **Download and inspect `product.json`** — fetch the latest stable macOS `.dmg` or Linux `.AppImage` from the official Cursor downloads page (`https://www.cursor.com/downloads` or the API at `https://download.todesktop.com/230313mzl4w4u92/latest-linux.yml`). Extract the archive / mount the disk image and read `Cursor.app/Contents/Resources/app/product.json` (macOS) or the equivalent path (`resources/app/product.json`) from the AppImage / Windows installer. Read the `vscodeVersion` field.
3. **Stop if uncertain** — if you cannot determine the version with high confidence from the above sources, post a comment explaining what you tried and what was unclear, then close this issue without opening a PR. Do **not** guess.

## Step 2 — Read the state file

Read `.github/cursor-engine.json`. Note:

- `vscode_version` — the engine version last recorded
- `first_observed_at` — the date it was first seen
- `cursor_app_version` — the Cursor version when it was first seen

Read `packages/vscode-extension/package.json`. Note:

- `engines.vscode` — the current floor specifier (e.g. `^1.105.0`)
- `devDependencies["@types/vscode"]` — the current types floor specifier (must match)

## Step 3 — Apply the decision rules

**Exactly one** of Rule 1, Rule 2, or Rule 3 applies on any given run. Determine which one matches the inputs, then take that path — and only that path.

**Rule 1 — New engine version detected:**

If the detected `vscode_version` differs from the state file's `vscode_version`, open **PR A**:

- Update `.github/cursor-engine.json`:
  - Set `vscode_version` to the newly-detected version
  - Set `first_observed_at` to today's date (`YYYY-MM-DD`, UTC)
  - Update `cursor_app_version` to the current Cursor app version
  - Update `source` to cite where you found the version
  - Update `notes` with a one-line summary
- Do **not** touch `packages/vscode-extension/package.json` in this PR — the engine floor bumps in a future cycle once the 30 days have elapsed.
- PR title: `chore(ci): update Cursor engine state to vscodeVersion X.Y.Z`
- After opening the PR, enable auto-merge: `gh pr merge <PR_NUMBER> --auto --squash`

**Rule 2 — 30-day window has elapsed; bump the floor:**

If all of the following are true:
- The detected `vscode_version` equals the state file's `vscode_version` (no new engine), AND
- `first_observed_at` is 30 or more days before today (UTC), AND
- The state's `vscode_version` is strictly greater than the current `engines.vscode` floor in `package.json` (e.g. state says `1.106.0` but floor is still `^1.105.0`)

…open **PR B**:

- In `packages/vscode-extension/package.json`:
  - Set `engines.vscode` to `^MAJOR.MINOR.0` (use major and minor from `vscode_version`, always set patch to 0 — extension floors are never patch-specific)
  - Set `devDependencies["@types/vscode"]` to the same specifier
- Run `pnpm install --no-frozen-lockfile` and include the refreshed `pnpm-lock.yaml` in the commit
- PR title: `chore(vscode-extension): bump engines.vscode floor to ^X.Y.0`
- After opening the PR, enable auto-merge: `gh pr merge <PR_NUMBER> --auto --squash`

**Rule 3 — Nothing to do (close-only, no PR):**

If the detected version matches the state, AND either the 30-day window hasn't elapsed OR the floor already matches the state's version, there is nothing to commit. In this case:

- **Do not open a pull request.** No file changes are needed; an empty PR is forbidden (see Constraints).
- Skip directly to Step 4b below.

## Step 4 — Final action

This step has exactly two branches. Take the one that matches what you did in Step 3.

**Step 4a — You opened a PR (Rule 1 or Rule 2 fired):**

1. Post a single comment on this issue with the PR link, e.g. `Opened #<PR_NUMBER> per Rule <1|2>.`
2. Close this issue.

**Step 4b — You did not open a PR (Rule 3 fired):**

1. Post a single comment on this issue: `No action needed — Cursor's VS Code engine version is unchanged and within the 30-day observation window (or the floor is already current).`
2. Close this issue.
3. Do not open any PR. The only artifact of a Rule 3 run is this closing comment.

## Constraints

- Open **at most one PR** per run (Rule 1 and Rule 2 are mutually exclusive — Rule 1 fires when there is a new version, Rule 2 fires when the version is stable and aged). When Rule 3 fires, open **zero** PRs.
- **Never open an empty PR.** If you have no file changes to commit, the correct action is to close the issue per Step 4b — not to open a no-op PR documenting that you decided not to act. The act of closing the issue is the audit trail.
- Do **not** touch any other package or any field other than `engines.vscode`, `@types/vscode`, and `pnpm-lock.yaml` (in PR B), or the four fields of `.github/cursor-engine.json` (in PR A).
- Do **not** bump `engines.node`, `engines.pnpm`, or any other engines field.
- Do **not** bump past the detected version (no speculative bumps).
- Do **not** merge the PR manually or bypass auto-merge — the branch ruleset on `main` gates the merge on a clean CI run.
- Use squash merge: `gh pr merge <PR_NUMBER> --auto --squash`.
