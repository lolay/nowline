---
name: steward
description: Repo-specific rules for an agent driving a nowline PR to mergeable, covering merge conflicts with sibling PRs, red CI, the Changelog check, translated man pages, byte-identity gates and the merge queue. Use when acting on CI, review or merge-conflict events for a PR in this repo, or before opening one.
---

# Steward

How to drive a nowline PR to green. [`AGENTS.md`](../../../AGENTS.md) and [`specs/ci.md`](../../../specs/ci.md) are the background; this file covers the PR loop only and wins over generic PR-driving defaults on conventions.

Most PRs here come from parallel cloud sessions working off the same `main`, often touching the same specs and man pages within the hour. Most of what goes wrong comes from that.

## Before you open a PR

Search open PRs, and anything merged in the last day, for the same change. Three sessions have independently built the same TextMate grammar fix in one evening (lolay/nowline#125, lolay/nowline#130, lolay/nowline#131). If one already covers it, don't open yours: say so to the user. If yours does more, open it and say in the body which PR it overlaps.

## Local gate

`make pre-commit` before every push, and again after any merge from `main`, because a clean merge can still break a test. A green run from before the merge doesn't count. If the PR touches `packages/mcp/`, follow it with `make pack-mcpb`.

Then `make changelog-check BASE=origin/main REQUIRE=1`, unless the PR is labelled `no-changelog`.

Don't call `pnpm` directly to stand in for any of these.

## Updating the branch

Keep the branch current. On every wake (CI result, review, conflict notice, check-in), fetch `main`. If the branch is behind, merge `main` in, even if the merge is clean. Then run the local gate and push. The merge queue would catch drift anyway, but a current branch surfaces conflicts and man-page stamp breakage while the session that wrote the change is still around to fix it.

Use a merge commit, never a rebase or force-push. Squash-merge flattens the history anyway.

### Resolving conflicts

The usual conflicts are in `specs/dsl.md`, `specs/rendering.md`, `specs/cli.md`, the man pages and the MCP schema. They happen because a sibling PR edited the same row or paragraph. Keep both changes. Where the sibling already landed part of your change, keep `main`'s version of that part and narrow your branch, including its tests and changelog fragment, to what `main` still lacks. Write the resolution into the merge commit body (see the merge commits on lolay/nowline#125 and lolay/nowline#132).

`CHANGELOG.md` should never conflict, because PRs no longer edit it. If it does, your branch predates the fragment system: move the entry into `.changelog/<branch-slug>.txt` and drop the `CHANGELOG.md` hunk.

## Translated man pages

`packages/cli/man/fr/nowline.1` and `fr/nowline.5` carry a `translated-from: ... sha256:...` stamp of the English page. Any edit to `man/nowline.1` or `man/nowline.5` fails `translation-parity.test.ts` until the French page is updated and restamped.

- When you change the English page, carry the change into the French page in the same commit, then paste the stamp line the test failure prints. The stamp is the review sign-off ([`specs/localization.md`](../../../specs/localization.md)), so never paste it without updating the French text.
- After merging `main`, rerun the gate even if the man page merged cleanly. Two PRs that each stamped against their own base leave the stamp wrong once both land: lolay/nowline#106 and lolay/nowline#105 turned `main` red that way. Restamping is part of resolving the merge.

## Red CI

On a PR push, CI runs only the two Linux cells. macOS and Windows run in the merge queue. Here is where each failure usually comes from:

- **Build & test, Linux Node 26.** This is `make ci`, so it reproduces locally. If it's red in CI and green locally, suspect a stale branch, and merge `main`.
- **Changelog.** Either the fragment is missing, the `no-changelog` label is missing, or the PR adds lines to `CHANGELOG.md`. It reruns when labels change, so adding the label is enough to retry it.
- **Export determinism or snapshot mismatch.** This is a real byte change. Find the cause. Never run `make determinism-update` or update a snapshot to get green. Changing a golden is a deliberate product decision, and the PR body has to say so and list which goldens changed. Adding a new fixture and its new snapshot is fine; changing an existing one is not, unless the PR exists to make that change.
- **Embed bundle size.** The budget is 200 KB gzipped. Say how much your change adds rather than raising the budget.
- **Kicked out of the merge queue.** This is almost always Windows, and almost always path handling: `pathToFileURL`, POSIX separators, CRLF. You can't run Windows here. Read the failing Vitest output, fix the path handling, and push. Don't rerun it hoping for a flake. Every Windows failure in this repo's history has been real ([`specs/ci.md`](../../../specs/ci.md) has the list).
- **Lint workflows / lint man pages.** Run `make lint-workflows` and `make lint-man` locally (they need `actionlint`, `shellcheck` and `mandoc`).

## Reviews and labels

No review bot runs on maintainer PRs. `agent-review` only runs on Copilot PRs, and it only labels: `maintainer-pr-safe` or `maintainer-pr-review`. Don't add, remove or act on those labels yourself. Don't merge, queue or enable auto-merge. The maintainer clicking **Merge when ready** is the human gate.

`no-changelog` is the one label an agent applies, and only when the PR has no user-visible change.

## Done

A PR is done when the `CI gate` and `Changelog` checks are green on the head and there's no conflict. Then it waits on the maintainer. Plan and handoff files under `specs/handoffs/` from a plan run are deleted in the PR's last commit, unless the plan says to promote them.
