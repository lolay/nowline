# Continuous integration

This document explains what CI runs, on which platforms and events, and why. The workflows are [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and the reusable [`.github/workflows/build.yml`](../.github/workflows/build.yml). Every command they run is a `make` target ([`Makefile.md`](../Makefile.md)). The branch ruleset and the merge queue are covered in [`ops/branch-policies.md`](../ops/branch-policies.md) and applied by [`scripts/apply-branch-policies.sh`](../scripts/apply-branch-policies.sh).

## Principles

- **Every platform gates `main`.** macOS, Windows, and every shipped binary are tested before a commit lands on `main`, and again on `main` itself.
- **A PR push waits on Linux only.** macOS and Windows run in the merge queue, where they gate the merge, and not on every push. Agent PRs push several times each, so this is where the latency and concurrency savings come from.
- **`main` always gets the full run.** Every push to `main` runs the whole matrix, docs-only changes included. A release is cut from a commit that was fully tested on `main`.
- **Only work that can differ by platform runs on more than one platform.** Lint, typecheck and the SVG render run once, on Linux. The Vitest suites run on every platform.
- **Every shipped binary runs on a runner that can execute it.** A binary that only compiled hasn't been tested.

## What runs where

| Job | `pull_request` | `merge_group` | push to `main` |
|---|---|---|---|
| `changes` (docs-only detection) | yes | yes | yes (always reports a code change) |
| Lint workflows, lint man pages, triage | yes | yes | yes |
| Build & test, `ubuntu-latest` Node 26: `make ci` | yes | yes | yes |
| Build & test, `ubuntu-latest` Node 22: `make ci-platform` | yes | yes | yes |
| Build & test, macOS and Windows Node 26: `make ci-platform` | no | yes | yes |
| Bundle size, export determinism, MCP harness | yes | yes | yes |
| Release build smoke (`build.yml`) | Linux cells (`platforms: linux`) | all ten cells | all ten cells |
| `CI gate` | yes | yes | yes |

On `pull_request` and `merge_group`, a docs-only change skips every job in that table except `changes`, the two lint jobs, triage and `CI gate`.

`make ci` is lint, build, typecheck and test, and equals `make pre-commit`, so a local gate run matches the canonical cell exactly. `make ci-platform` is `build-fast` plus the Vitest suites, with no lint, typecheck or render.

`release.yml` calls `build.yml` with the default `platforms: all`, so a release always builds every cell.

## Why lint, typecheck and render run on Linux only

The repo's history has a list of every platform-specific fix:

- `29d358e`: `.nowlinerc` discovery tests (cli, config).
- `f5d4115`: include-resolver `sourcePath` assertion (core).
- `a309680`, `6a37df1`: font-resolve tests (export-core).
- `7bbd78d`: POSIX paths in the action's changed-files output (nowline-action).
- `4cf7e24`: `pathToFileURL` for `--import` (lsp-worker).
- `26129db`: the PDF Subject leaked the absolute path (export-pdf).
- `7997950`: CRLF checkout drift, fixed by `.gitattributes`.

Every one of them is Windows, and every one is filesystem or path handling that a Vitest suite or Biome caught. There are no macOS-specific fixes. Lint, typecheck and the SVG render have never behaved differently by OS. Biome is a native binary and TypeScript 7 is the native compiler, so neither depends on the Node version either.

So the Vitest suites stay on every cell, Windows included, and lint, typecheck and render run once. Don't trim the Windows Vitest suite: it is the check that has caught every platform bug so far.

## The merge queue

`main` merges through GitHub's merge queue (squash, `ALLGREEN`). The flow:

1. A PR's own `CI gate` (Linux cells) is green and it has its approval.
2. **Merge when ready** queues it.
3. The queue builds the PR on top of `main` plus any entries ahead of it, and runs the full `ci.yml` on that `merge_group` commit.
4. `CI gate` passes there too, and the commit lands.

The queue replaces the ruleset's old "branch must be up to date" requirement (`strict: true`). The queue always tests against the latest `main`, so open PRs no longer need updating and re-running after every merge.

Bypass actors skip the queue. `release.yml`'s direct version-bump push to `main` relies on that.

## `CI gate`

`CI gate` is the last job in `ci.yml` and the only check the `main` ruleset requires. It `needs:` every other job in the workflow, runs `if: always()`, and fails when any of them failed or was cancelled. A skipped job counts as a pass, because skips are deliberate:

- the build and test jobs on docs-only changes;
- `release-build-smoke` on release-bot version-bump pushes.

If `changes` itself fails, the gate fails.

Requiring only this one check means adding, renaming or reshaping a job or matrix cell never needs a ruleset edit. **A job missing from `CI gate`'s `needs:` list is not gated.** Add every new `ci.yml` job to that list. Nothing checks this automatically.

## The docs-only fast path

The `changes` job lists the changed files with a three-dot compare: against the PR base for `pull_request`, and against the queue's base for `merge_group`. A queued group therefore counts as docs-only only if every PR in it is.

A change is docs-only when every file is `*.md`, with these exceptions, which count as code:

| Path | Why it counts as code |
|---|---|
| `packages/**` | Package READMEs ship in npm tarballs, the `.vsix` (where `vsce` checks the README) and the action mirror. Test fixtures live here too. |
| `.github/**` | The `agent-*.md` files compile to workflow lock files. |
| `specs/dsl.md` | `packages/layout/test/calendar.test.ts` reads it. |

Renames count both the old and the new path. A compare that lists 300 files, the GitHub API's limit, is treated as code. Lint has nothing to check on a docs-only change, because Biome ignores Markdown.

When a test or build step starts reading a Markdown file outside `packages/`, add that file to the exception list in the `changes` job (and to the table above).

## Binary smoke tests

`build.yml` compiles six standalone binaries, and `scripts/smoke-binary.sh` (via `make smoke`) runs each one to render `examples/minimal.nowline` to every export format.

| Binary | Runner | How it runs |
|---|---|---|
| `macos-arm64` | `macos-latest` | native |
| `macos-x64` | `macos-latest` | Rosetta 2 |
| `linux-x64` | `ubuntu-latest` | native |
| `linux-arm64` | `ubuntu-24.04-arm` | native |
| `windows-x64` | `windows-latest` | native, under Git Bash |
| `windows-arm64` | `windows-11-arm` | native, under Git Bash |

The script decides whether it can execute a binary from the host's `uname`, not from the runner label. Under GitHub Actions, a binary it would skip as cross-target fails the step instead. The exception is a cell that sets `SMOKE_ALLOW_CROSS_TARGET=1`, so a mistake in host detection can't quietly leave a shipped binary untested.

The ten-cell list lives once, in the `plan` job of `build.yml`, and the `platforms: linux` subset is filtered from it. A matrix `include` can't be filtered by an input any other way.

## Node versions

Every OS runs Node 26, the dev and CI major pinned in `.nvmrc`. One extra Linux cell runs Node 22, the published consumer floor (`engines.node: ">=22"`). The floor cell exists only on Linux: the macOS and Windows cells are there to catch OS-specific issues, not Node regressions. The two-tier policy is in [`CONTRIBUTING.md` § Toolchain & Supported Versions](../CONTRIBUTING.md#toolchain--supported-versions).

## Cost

The repo is public, so GitHub-hosted standard runners, including the arm runners, cost nothing. The run usage API reports 0 billable milliseconds on every OS. CI's real costs are wall-clock latency and the concurrency limits shared by every PR that agents and humans have open at once.

Before this design, a PR push started 19 jobs (three macOS, three Windows) and took about 5.4 minutes, two of them spent waiting on a `needs:` edge behind the slowest OS cell. Now a code PR takes about 2.5 minutes, measured on #111, with no macOS or Windows jobs. Export determinism, at about 2m20s, is the critical path. A docs-only PR skips the build and test jobs entirely.

## How this compares to other projects

In 2026 we read the workflows of 15 JS/TS monorepos (vite, vitest, biome, TypeScript, prettier, eslint, pnpm, astro, turborepo, rollup, sveltejs/kit, nuxt, typescript-eslint, mermaid, vscode) and bun's Buildkite config. The common patterns:

- **Lint, format and typecheck run on Linux only.** Almost every project does this.
- **macOS is the first thing cut from PRs.** pnpm, nuxt, typescript-eslint and mermaid run none. TypeScript, biome and bun run full macOS only after merge.
- **Windows stays, sometimes trimmed.** The reason given is path and line-ending bugs, which matches this repo's history.
- **The Node version matrix lives on Linux.**
- **A changed-files job plus one aggregate required check**, so a skipped job never blocks a merge (vite, vitest, astro, nuxt, pnpm).

Nowline follows all five.
