# CI platform matrix: what has to run where

Status: Tiers 1, 2 (merge queue, step 5) and 3 are implemented on this branch and wait on a CI run, which needs a PR. Tier 2 step 6 (docs-only fast path) is not done. Rollout order: merge this branch first, confirm `CI gate` reported on `main`, then run `scripts/apply-branch-policies.sh`, which switches the required check to `CI gate`, turns on the merge queue and drops `strict`. Remove this file, or promote the chosen design into `specs/` and `Makefile.md`, before the branch merges.

## Answer

PR latency is about 5.4 minutes, and 2 of those minutes come from one `needs:` edge, not from macOS or Windows. Fix that edge and slim what the non-Linux cells run, and PRs drop to about 2.8 minutes without losing any coverage. To go further, add a merge queue: PR pushes run the Linux set only, and the merge queue runs the full macOS and Windows matrix before anything reaches `main`. That gets PR feedback to about 2.3 minutes, with zero macOS or Windows jobs per push, and every platform still gates `main`.

The repo is public, so standard runners cost nothing (run usage reports `billable: 0 ms` on every OS). Every saving here is wall clock and concurrency headroom, not dollars. The concurrency part matters: each push starts 19 jobs (3 macOS, 3 Windows), and agent sessions often have several PRs pushing at once.

Do not trim the Windows Vitest suite. Every platform bug this repo has hit was a Windows path bug, and the Vitest suite caught every one of them.

## Where the time goes today

Data from PR #96, run 37513190443 (a typical green run, 323 s wall clock):

| Job | Starts at | Duration | Notes |
|---|---|---|---|
| Build & test (ubuntu, node 26) | +2 s | 126 s | `make ci`: 109 s |
| Build & test (ubuntu, node 22) | +3 s | 122 s | |
| Build & test (macos, node 26) | +8 s | 185 s | setup 36 s, `make ci` 113 s |
| Build & test (windows, node 26) | +3 s | **204 s** | setup 51 s, `make ci` 141 s |
| Export determinism gate | +3 s | 140 s | |
| MCP harness gate | +4 s | 83 s | runs full `make build` (with render) for no reason |
| Release build smoke (10 cells) | **+215 s** | 27–100 s | `needs: build-test`, so it waits for the slowest OS cell |

The critical path is the Windows test cell (204 s) followed by the slowest release-smoke cell (`bin-macos-x64`, 100 s). That adds up to the 323 s run.

Inside the Windows `make ci` (141 s): lint 4 s, build 41 s (31 s of that is `scripts/render.mjs` writing about 45 SVGs), typecheck 2 s, Vitest 94 s. The CLI integration suite alone is 50 s and is the last package `pnpm -r test` reaches.

## What actually differs by platform

The git history has 473 commits. These are the platform-specific fixes:

- `29d358e` `.nowlinerc` discovery tests (cli, config)
- `f5d4115` include-resolver `sourcePath` assertion (core)
- `a309680`, `6a37df1` font-resolve tests (export-core)
- `7bbd78d` POSIX paths in the action's changed-files output (nowline-action)
- `4cf7e24` `pathToFileURL` for `--import` (lsp-worker)
- `26129db` PDF Subject leaked the absolute path (export-pdf)
- `7997950` CRLF checkout drift, fixed by `.gitattributes`

All of them are Windows. All of them are filesystem or path handling, and Vitest or Biome caught every one. There are **zero** macOS-specific fixes. Nothing in lint, typecheck, or the SVG render step has ever behaved differently by OS. Biome is a native binary, and TypeScript 7 is the native compiler, so neither depends on Node version or OS either.

## What other OSS projects do

I read the current workflows of 15 JS/TS monorepos (vite, vitest, biome, TypeScript, prettier, eslint, pnpm, astro, turborepo, rollup, sveltejs/kit, nuxt, typescript-eslint, mermaid, vscode) plus bun's Buildkite config. Five patterns show up:

- **Lint, format, and typecheck run on Linux only.** Almost everyone does this. The exceptions (TypeScript's Windows lint, Nuxt's Windows typecheck) drop those jobs in the merge queue anyway.
- **macOS is the first thing cut.** pnpm, nuxt, typescript-eslint, and mermaid run no macOS at all on PRs. TypeScript, biome, and bun run full macOS only on push to `main`. vitest and kit run a single smoke or e2e leg on macOS.
- **Windows stays, sometimes trimmed.** The usual reason given is path and line-ending bugs, which is exactly our history.
- **The Node version matrix lives on Linux.** macOS and Windows get one Node version.
- **A changed-files job plus one aggregate required check.** vite, vitest, astro, nuxt, and pnpm all use a first job that detects what changed and skips the matrix on docs-only diffs. Each pairs it with an always-run aggregate job (`ci-ok`, `Success`) that is the only required check, so a skipped job never blocks a merge.

## Recommendation

### Tier 1: same coverage, about 5.4 min to about 2.8 min

1. **Drop `needs: build-test` from `release-build-smoke`.** The edge exists to avoid running the 10-cell matrix when tests fail. On a public repo those minutes are free, and the edge costs about 2 minutes on every green run. If you want a cheap tripwire, make it `needs: lint-workflows` (about 25 s) instead. Saves about 115 s.
2. **Give the non-Linux cells and the Node 22 cell a slimmer gate:** `make build-fast` plus Vitest, with no lint, typecheck, or render. Only the `ubuntu / node 26` cell keeps the full `make ci`, so `make pre-commit` still equals what one CI cell runs. This needs a new Makefile target, for example `make test-platform: build-fast`, which runs `pnpm -r test` without going through `test: build`. Saves about 37 s on Windows (that cell then sets the critical path at about 165 s) and about 35 s on macOS.
3. **Switch `mcp-harness` from `make build` to `make build-fast`.** This one is off the critical path; it only frees the runner sooner.
4. **Add an aggregate `CI gate` job** (`needs:` every job, `if: always()`, fails if any dependency failed or was cancelled) and make it the only required check. Today the ruleset in `scripts/apply-branch-policies.sh` lists 16 contexts by job name, and it has already drifted: it requires `Build pack-embed`, which no longer exists (the cell is `pack-mcp-mcpb`), and it omits determinism, mcp-harness, and triage. Every matrix change in this proposal would otherwise mean editing the ruleset in lockstep.

### Tier 2: trust Linux on pushes, all platforms before merge, about 2.3 min

5. **Turn on GitHub merge queue and split by event.**
   - `pull_request`: lint, both Linux build-test cells, determinism, mcp-harness, bundle-size, and the Linux binary and pack cells.
   - `merge_group` and `push: main`: everything, meaning the macOS and Windows Vitest cells and all 6 binary cells with their smokes.

   The ruleset already sets `strict_required_status_checks_policy: true`, which forces every open PR to update and re-run its full CI after each merge. Merge queue replaces that with a single validated run per merge. This is the design that directly answers "trust Linux on PRs" while keeping "every platform gates main." Agent PRs push 3 to 5 times each (#96 had 4 runs in two hours), so moving the 6 macOS and Windows jobs per push to once per merge is where most of the concurrency goes back.

   If you don't want a merge queue, the fallback is what TypeScript, biome, and bun do. Keep the Windows Vitest cell on PRs, since Windows is the platform with a bug history. Move the macOS Vitest cell to `push: main` only, and keep the macOS binary smoke on PRs, since that binary is what Homebrew users run. A macOS regression would then land on `main` and surface there, which matches the risk the history shows (none so far).
6. **Docs-only fast path.** Add a `changes` job (`dorny/paths-filter`) that skips the matrix when only `specs/**`, `**/*.md` (excluding package READMEs that ship in tarballs), or handoffs change. A good share of agent PRs are spec or handoff only (#94, #95). The aggregate gate from step 4 is what makes this safe with required checks.

### Tier 3: close real gaps while we're in here

7. **The Windows binary is never executed in CI.** `build.yml` skips the smoke step when `matrix.runner == 'windows-latest'`, and `scripts/smoke-binary.sh` can't derive a host target on MINGW. The standalone `.exe` is a shipped surface (and m4.6 plans Scoop and WinGet for it). This is a bigger hole in "test every platform" than anything Tier 2 removes.
8. **No arm64 binary is ever executed.** `linux-arm64` and `windows-arm64` are cross-compiled and never run. `ubuntu-24.04-arm` and `windows-11-arm` runners are free for public repos. Running each smoke on its native arm runner is one matrix field per cell.
9. Optional: merge the per-arch binary cells per OS (darwin arm64 and x64 on one macOS runner, using Rosetta for the x64 smoke). That halves the macOS job count. It touches `release.yml` artifact names, though, so do it only if macOS concurrency is actually biting.

## Projected result

| | PR wall clock | Jobs per push | macOS + Windows jobs per push |
|---|---|---|---|
| Today | about 5.4 min | 19 | 6 |
| Tier 1 | about 2.8 min | 20 (adds the gate job) | 6 |
| Tier 1 + 2 (merge queue) | about 2.3 min | about 13 | 0 (6 per merge) |
| + Tier 3 | unchanged | +2 arm smokes | +1 Windows smoke |

The estimates come from one run's step timings. Setup time on Windows (35 s for `setup-node`, mostly restoring the pnpm cache) varies by run.

## Open decision

Decided: merge queue. Still open: whether to add the docs-only fast path (Tier 2, step 6), and whether push to `main` should keep running the full matrix now that the queue already ran it on the same tree.

## Risks and gotchas

- Changing job names or matrix shape changes check contexts. Land step 4 (the aggregate gate) first, or in the same PR as the ruleset update in `scripts/apply-branch-policies.sh`, or PRs will block on missing checks.
- Merge queue changes who performs the merge (`github-merge-queue[bot]`). `agent-pr-merged.yml` keys off `pull_request: closed` with `merged == true`, which still fires, but check the agent label workflows before enabling it.
- `release.yml` calls `build.yml` with `upload: true`. Event-based skipping in `build.yml` must never apply under `workflow_call` from a tag push.
- Keep `fail-fast: false` on PRs. If you want fail-fast in the merge queue (nuxt and TypeScript do this), use `fail-fast: ${{ github.event_name == 'merge_group' }}`.

Branch: `claude/eloquent-fermi-i85oy0`.
