# Contributing to Nowline

Thanks for your interest in Nowline. This guide covers how to set up a development environment, where the code lives, what the expected workflow looks like, and how to get a pull request merged.

Nowline is early-stage: the parser, validator, and CLI are usable, but layout, rendering, IDE integration, and the distribution pipeline are still in flight. Small, focused PRs are much easier to review than large refactors.

Non-trivial changes — grammar, AST shape, layout or renderer behavior, new packages, anything outside [`specs/principles.md`](./specs/principles.md) — should start with a GitHub issue so we can agree on the shape before code gets written. PRs that skip that step may be closed without review. AI-assisted contributions are welcome on the same terms; see [`AI_POLICY.md`](./AI_POLICY.md).

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Toolchain & Supported Versions](#toolchain--supported-versions)
  - [VS Code extension engine floor policy](#vs-code-extension-engine-floor-policy)
- [Getting the code](#getting-the-code)
- [Repository layout](#repository-layout)
- [Common tasks](#common-tasks)
- [Running the CLI from source](#running-the-cli-from-source)
- [Working on the VS Code / Cursor extension](#working-on-the-vs-code--cursor-extension)
- [Working on the grammar](#working-on-the-grammar)
- [Code style](#code-style)
- [Linting and formatting](#linting-and-formatting)
- [Tests](#tests)
- [Commits and pull requests](#commits-and-pull-requests)
  - [Auto-merge policy](#auto-merge-policy)
- [Versioning](#versioning)
- [Reporting bugs](#reporting-bugs)
- [Proposing features](#proposing-features)
- [Licensing](#licensing)

## Code of conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Reports of unacceptable behavior may be sent to **security@nowline.io**.

## Prerequisites

You'll need:

- **Node.js** ≥ 22 to **consume** `@nowline/*` packages (matches `engines.node` in every published `package.json`). To **develop** in this repo, install **Node 26** — `.nvmrc` pins `26.2.0` and CI runs on it. See [Toolchain & Supported Versions](#toolchain--supported-versions) for the full policy.
- **pnpm** ≥ 11 (the repo is a pnpm workspace and pins the package manager via `packageManager: pnpm@11.2.2` in the root `package.json`). Install with `corepack enable && corepack prepare pnpm@latest --activate`.
- **Git**.
- **Bun** (optional) — only required if you want to produce standalone binaries locally with `pnpm --filter @nowline/cli compile`. Skip it otherwise; nothing in the default dev loop uses Bun.

No other global tooling is required.

## Toolchain & Supported Versions

This repo runs a **two-tier Node policy**: a low floor for what we ship to consumers, a high ceiling for what we build and test on. Both numbers live in the repo (`engines.node` in every `package.json`; `.nvmrc`); this section documents *why* and *how to change them*.

### Tier 1 — Consumer floor (what published packages support)

| Pin | Where | Value | Why |
| --- | --- | --- | --- |
| `engines.node` | every `@nowline/*` `package.json` | **`>=22`** | Node 22 is the oldest non-EOL LTS; supported through April 2027. Choosing the oldest non-EOL LTS as the floor doesn't lock out users on Node 22 LTS while still giving us modern language features. Matches the effective floor of comparable libraries (e.g. Mermaid). |
| `engines.pnpm` | every `@nowline/*` `package.json` | **`>=11`** | Soft floor matching the `packageManager` pin below. |
| `runs.using` | `packages/nowline-action/action.yml` | **`node24`** | GitHub controls the GitHub Action runtime ladder separately. `node26` is not yet available; revisit when GitHub adds it. |
| `engines.vscode` | `packages/vscode-extension/package.json` | **`^1.105.0`** | VS Code bundles its own Node ABI. Independent of the policy above. Tracks Cursor's embedded VS Code engine + 30-day grace; see [VS Code extension engine floor policy](#vs-code-extension-engine-floor-policy). |

Tightening any of these — e.g. moving the consumer floor from `>=22` to `>=24` — is a **breaking change** for users still on the dropped version. Bump it alongside the EOL date of the floor LTS, and bundle it into a minor or major version bump of every `@nowline/*` package in the same release.

### Tier 2 — Developer / CI version (what we build with)

| Pin | Where | Value | Why |
| --- | --- | --- | --- |
| Node | `.nvmrc` (root) | **`26.2.0`** | Latest current; gives us early signal on Node 26 features before it becomes LTS in October 2026. Single source of truth — `nvm use` / `fnm use` picks it up automatically. |
| Node | `actions/setup-node` calls in `.github/workflows/**` + the composite at `.github/actions/setup-node-pnpm/action.yml` | **`26`** (with a `22` cell in the `ci.yml` unit-test matrix) | Default uses 26 to match `.nvmrc`. The 22-cell exists to exercise the consumer floor on every PR, so we catch any accidental dependence on Node 26-only APIs leaking into published code. |
| pnpm | root `package.json` `packageManager` field | **`pnpm@11.2.2`** | Pinned to a specific version so every dev gets the same `pnpm install` resolution. CI provisions pnpm via `corepack enable` (reads `packageManager` from `package.json`); `pnpm/action-setup` was dropped because its Windows self-update path crashed intermittently with STATUS_STACK_BUFFER_OVERRUN (pnpm/action-setup#260). |
| Bun | `bun-version:` in `ci.yml` and `release.yml` | **`1.3.14`** | The Bun runtime is baked into shipped `bun compile` binaries (Homebrew, apt, GitHub Releases). Pinning makes those binaries reproducible. Tracked by a Renovate custom manager. |

### How to bump

- **Bump the dev/CI Node version (Tier 2):** edit `.nvmrc`, then every `node-version:` in `.github/workflows/**` and `.github/actions/setup-node-pnpm/action.yml`. Run `pnpm install`, `pnpm -r build`, `pnpm -r test` locally on both the new version *and* the consumer floor (currently Node 22). The matrix in `ci.yml` will continue to test both versions on every PR; verify both cells pass before merging.
- **Bump the consumer floor (Tier 1):** this is a **breaking change** for `@nowline/*` consumers — tighten `engines.node` on the root and all 17 `packages/*/package.json` files in one PR. Bundle into a minor (pre-1.0) or major (post-1.0) version bump of every package; update the changelog accordingly. Don't do this casually — schedule it alongside the EOL date of the floor LTS, not as a side-effect of another change.

### Adjacent automation

- **Renovate** ([shared preset](./.github/renovate-shared.json)) opens a single grouped PR per week for minor/patch updates across npm, GitHub Actions, Terraform, Bun, and actionlint. Major updates open individually with a 30-day cooldown. See the per-repo `renovate.json` files for repo-specific overrides. The Dependency Dashboard issue in each repo is the single triage entry point.
- **Node version is explicitly disabled in Renovate's `packageRules`** — version bumps are governed manually by this section, not by Renovate, because changing the consumer floor is policy work, not a routine dependency bump.
- **`@types/vscode` is explicitly disabled in Renovate's `packageRules`** — the floor is governed by the Cursor-tracking policy below, not Renovate. Renovate would otherwise bump `@types/vscode` past `engines.vscode` and break `vsce package` (as seen in the v0.3.0 release-run failure). `editor-release-monitor.yml` + `vscode-extension-engine-bump.yml` are the source of truth for when and how this field changes.
- **Cross-references:** [Node release schedule](https://nodejs.org/en/about/previous-releases) · [`.nvmrc`](./.nvmrc) · [`.github/renovate-shared.json`](./.github/renovate-shared.json).

### VS Code extension engine floor policy

The `engines.vscode` field in `packages/vscode-extension/package.json` and the `@types/vscode` devDependency **always equal each other** and **track the VS Code engine embedded in the latest stable Cursor release**, with a 30-day grace period so users have time to update before the extension requires the newer engine. The floor is expressed as `^MAJOR.MINOR.0` — patch is never floor-specific.

**What drives changes:**

Two workflows operate in tandem. No custom secrets or PATs are required; both run on the default `GITHUB_TOKEN`.

1. **Daily monitor** ([`editor-release-monitor.yml`](./.github/workflows/editor-release-monitor.yml)) polls each tracked fork's stable channel and appends new releases to that fork's `.github/*-release-history.json`. Releases land via a single `[skip ci]` commit to `main`. One job step per fork runs with `continue-on-error: true` so a network hiccup for one fork doesn't abort the others.

2. **Weekly analyzer** ([`vscode-extension-engine-bump.yml`](./.github/workflows/vscode-extension-engine-bump.yml)) runs every Friday at 09:00 UTC. It reads all `*-release-history.json` files, filters each to releases that are at least 30 days old, takes the min `vscode_version` across forks, and opens a GitHub Issue when that min is at a higher `MAJOR.MINOR` than the current floor. The issue is idempotent — a second run with the same target floor finds the open issue and exits without creating a duplicate.

**The issue as deliverable.** The analyzer opens a plain GitHub Issue describing what needs to change (which fields, target value, reasoning). A separate generic issue-to-PR worker picks it up and does the mechanical edits. The issue does not prescribe *how* the work is done; that's the worker's domain.

**Issue contract.** The title is always `chore(vscode-extension): bump engines.vscode floor to ^X.Y.0`. The body has four sections: `## Why` (derivation narrative), `## Required changes` (exact field edits), `## Source data` (per-fork evidence table), and `## Audit` (link to workflow run, history file pointers). A machine-readable HTML comment `<!-- engine-floor-bump:target=^X.Y.0;current=^A.B.0 -->` is appended for workers that want to parse it without scraping the body.

**Adding a new fork.** Fork detection is deliberately extensible:

1. Write `.github/scripts/monitor-<slug>-releases.sh` following the same contract as `.github/scripts/monitor-cursor-releases.sh`: hits the fork's stable channel, downloads a package if needed, extracts `vscode_version` from `product.json` or equivalent, appends `{version, released_at, vscode_version, source_url}` to `.github/<slug>-release-history.json`, applies 2-year roll-off.
2. Seed `.github/<slug>-release-history.json` with a `fork_name` matching the display name you want in issue bodies.
3. Add one step to the `update-release-history` job in `editor-release-monitor.yml` (with `continue-on-error: true`).
4. The analyzer picks up the new file automatically — no changes to `.github/scripts/compute-engine-floor.sh` or `.github/scripts/open-engine-bump-issue.sh` are needed.

**Branch-protection requirement.** The daily monitor pushes a direct commit to `main`. Add `github-actions[bot]` to `main`'s branch ruleset bypass list (Settings → Rules → main → Bypass list) so the push is not blocked by the CI-gate ruleset. The bump analyzer only creates issues and does not push, so it is not affected.

**First-30-days caveat.** A freshly seeded history file whose only entry was observed within the last 30 days produces `floor=` (empty) on the first analyzer run — no issue is opened. The system becomes self-correcting once the seed entry ages past the grace window.

**Manual bump.** Edit `engines.vscode` and `devDependencies["@types/vscode"]` in `packages/vscode-extension/package.json` to the same `^MAJOR.MINOR.0` specifier, run `pnpm install --no-frozen-lockfile` to refresh `pnpm-lock.yaml`, and open a PR.

**Why not let Renovate handle it:** `@types/vscode` bumps must stay in lock-step with `engines.vscode`. Renovate updates devDependencies independently of `engines.*`, so an unconstrained `@types/vscode` bump breaks `vsce package` (error: "types floor exceeds engines floor"). Pinning `@types/vscode` in Renovate and delegating to the purpose-built workflows is the only way to keep the two in sync automatically.

## Getting the code

```bash
git clone https://github.com/lolay/nowline.git
cd nowline
pnpm install
pnpm build
pnpm -r test
```

`pnpm install` sets up the workspace. `pnpm build` walks every package in dependency order — it regenerates the Langium parser in `@nowline/core`, bundles templates in `@nowline/cli`, type-checks everything, and then renders every example under [`examples/`](./examples) and every renderer-validation fixture under [`tests/`](./tests) to sibling `.svg` files for inspection. Set `NOWLINE_SKIP_RENDER=1` to skip the render step (useful while iterating on a broken renderer). `pnpm -r test` runs the Vitest suites.

If you want to work offline or have a pre-populated pnpm store, check the `.pnpm-store/` folder — the repo is set up so `pnpm install` uses a local store when present.

## Repository layout

```
nowline/
├── packages/          # Workspace packages (@nowline/core, @nowline/cli, exporters, layout, renderer, lsp, vscode-extension)
├── examples/          # User-grounded .nowline files: progressive samples, `nowline --init` templates, sample-fidelity references
├── tests/             # Renderer manual-validation fixtures: one stressed axis per file, gitignored SVG output
├── grammars/          # TextMate grammar for editor syntax highlighting
├── scripts/           # Repo-wide scripts: .deb build, Homebrew tap seed, render-samples, render-tests, render aggregator
├── specs/             # Design specs for the DSL, renderer, CLI, IDE integrations, and OSS milestones
├── .github/           # Issue and PR templates, CI and release pipelines
├── branding/          # Logos and marks
└── pnpm-workspace.yaml
```

The repo-level `tests/` folder (plural) holds renderer manual-validation fixtures and is distinct from each package's own `test/` folder (singular) which holds Vitest unit/integration tests.

Packages have a shared version and are published together. The full dependency graph and tech choices live in [`specs/architecture.md`](./specs/architecture.md).

### Design docs

Before making a non-trivial change, skim the specs under [`specs/`](./specs) — they describe the intended shape of the product and are the best reference for "why" questions. The specs live in-repo so PRs can update them alongside code when behavior changes. Start with:

- [`specs/principles.md`](./specs/principles.md) — what's in scope and what's deliberately not.
- [`specs/dsl.md`](./specs/dsl.md) — canonical language design. Required reading if you're touching the grammar, parser, or validator.
- [`specs/architecture.md`](./specs/architecture.md) — package graph, tech choices, and the `AssetResolver` contract.
- [`specs/cli.md`](./specs/cli.md), [`specs/rendering.md`](./specs/rendering.md), [`specs/ide.md`](./specs/ide.md), [`specs/embed.md`](./specs/embed.md) — surface-area specs for the rest of the toolchain.
- [`specs/milestones.md`](./specs/milestones.md) — OSS roadmap (m1–m4.5).
- [`specs/releasing.md`](./specs/releasing.md) — maintainer release process (tagging, npm publish order, Homebrew tap update).

## Common tasks

> **Use the Makefile.** Every build / test / lint / package / publish command is wrapped by a `make` target — run `make help` for the grouped list or see [`Makefile.md`](./Makefile.md). Always use the Makefile rather than calling `pnpm` / `npm` / `vsce` / `ovsx` / `firebase` / `gcloud` directly for build, test, lint, or deploy: the Makefile is the single source of truth (CI calls the same targets), and the guarded `publish-*` targets keep an accidental publish/deploy behind a `CONFIRM_*` variable. `make ci` is the one command to run before pushing. The raw `pnpm` invocations below remain valid for ad-hoc use and document what each target wraps.

Run these from the repo root. Most are simple pnpm re-runs across the workspace.

| Task | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Build everything (regenerates grammar + bundles templates + tsc + renders `examples/` and `tests/`) | `pnpm build` |
| Build packages without rendering SVGs | `NOWLINE_SKIP_RENDER=1 pnpm build` (or `pnpm -r build`) |
| Render `examples/` and `tests/` only (CLI must be built) | `pnpm render` |
| Render `examples/` (rebuilds CLI first; one or more slugs optional) | `pnpm samples [slug ...]` |
| Render `tests/` fixtures (rebuilds CLI first) | `pnpm fixtures` |
| Render without rebuilding (faster; errors if dist is stale) | `node scripts/render-samples.mjs [slug ...]` / `node scripts/render-tests.mjs` |
| Regenerate the README screenshot | `node packages/cli/dist/index.js examples/minimal.nowline -f png -o docs/screenshots/minimal.png --now 2026-02-09 --theme light` |
| Run all tests | `pnpm -r test` |
| Run tests for one package | `pnpm --filter @nowline/core test` |
| Watch tests for one package | `pnpm --filter @nowline/core test:watch` |
| Lint and format check | `pnpm check` (Biome — runs lint + format check + import organization in one pass) |
| Auto-fix lint and format | `pnpm check:fix` |
| Format only | `pnpm format` (writes) / `pnpm format:check` (read-only) |
| Lint only | `pnpm lint` (read-only) / `pnpm lint:fix` (writes safe fixes) |
| Lint GitHub Actions workflows | `pnpm lint:workflows` (requires `brew install actionlint`) |
| Type-check (vscode-extension; other packages type-check via `pnpm -r build`) | `pnpm typecheck` |
| Regenerate Langium AST only | `pnpm langium:generate` |
| Compile standalone binaries | `pnpm --filter @nowline/cli compile` (requires Bun) |
| Compile only the host platform's binary | `pnpm --filter @nowline/cli compile:local` |
| Build the VS Code / Cursor extension `.vsix` | `pnpm -F vscode run package` |

The pre-hooks (`prebuild`, `pretest`) handle code generation automatically — you generally don't need to run `langium:generate` or `bundle-templates` by hand.

## Running the CLI from source

During development you usually want to invoke the CLI against local changes without reinstalling. Three options:

1. **Run the built JS directly.** After `pnpm build`:

    ```bash
    node packages/cli/dist/index.js validate examples/minimal.nowline
    ```

2. **`npm link` the CLI** so `nowline` is on your `PATH`:

    ```bash
    cd packages/cli
    npm link
    nowline validate examples/minimal.nowline
    # later:
    npm unlink -g @nowline/cli
    ```

3. **Use a watch build** so the dist stays fresh while you edit:

    ```bash
    pnpm --filter @nowline/cli watch
    # in another terminal:
    node packages/cli/dist/index.js validate examples/minimal.nowline
    ```

Because the CLI bundles example templates at build time, changes to files under `examples/` are picked up by `pnpm build` (the `prebuild` hook re-runs `bundle-templates.mjs`).

## Working on the VS Code / Cursor extension

The extension at `packages/vscode-extension/` bundles `@nowline/lsp`, `@nowline/core`, `@nowline/layout`, and `@nowline/renderer` into a single self-contained `.vsix`. Three iteration loops, in order of preference:

### 1. Fast loop — Extension Development Host (F5)

For day-to-day extension code, grammar, snippets, or preview changes, skip packaging entirely:

1. Open `packages/vscode-extension/` as its own workspace in VS Code or Cursor.
2. Press `F5`. The committed [`.vscode/launch.json`](packages/vscode-extension/.vscode/launch.json) runs `pnpm build` and launches a second editor window with your in-tree build attached. Pick **Run Extension (no other extensions)** from the launch dropdown when you want a clean-room repro that disables every other installed extension.
3. Edit, save, and reload the host window (`Cmd+R` / `Ctrl+R` inside the dev-host window) to pick up changes.

The Extension Development Host swaps the dev build in for the marketplace `nowline.vscode-nowline` automatically — they share the same `publisher.name`, so VS Code suppresses the installed copy while the dev path is mounted. There's no collision and no need to uninstall first.

This is much faster than rebuilding the `.vsix` and avoids the install-cache gotchas below.

### 2. Sandboxed-profile loop — install the `.vsix` into a throwaway profile

When you need to test the *packaged* extension exactly as users will receive it (signed bundle, sealed `dist/`, real `vsce` output) but **don't** want to clobber the marketplace build that powers your main editor, install into a sandboxed profile via `--user-data-dir` / `--extensions-dir`:

```bash
# from the repo root
pnpm -F vscode run package
# → packages/vscode-extension/dist/nowline-vscode.vsix

# Cursor:
cursor \
  --user-data-dir /tmp/cursor-nowline-dev \
  --extensions-dir /tmp/cursor-nowline-dev-ext \
  --install-extension packages/vscode-extension/dist/nowline-vscode.vsix
cursor --user-data-dir /tmp/cursor-nowline-dev --extensions-dir /tmp/cursor-nowline-dev-ext

# VS Code:
code \
  --user-data-dir /tmp/vscode-nowline-dev \
  --extensions-dir /tmp/vscode-nowline-dev-ext \
  --install-extension packages/vscode-extension/dist/nowline-vscode.vsix
code --user-data-dir /tmp/vscode-nowline-dev --extensions-dir /tmp/vscode-nowline-dev-ext
```

The first invocation installs the dev `.vsix` into the sandbox; the second opens an editor window pointed at it. The sandboxed dirs hold the dev extension and its settings; the main profile (and the marketplace install in it) are untouched. `rm -rf /tmp/cursor-nowline-dev*` to throw the sandbox away.

Both editors also expose this as a built-in **Profiles** feature in the GUI (`Cmd+Shift+P` → **Profiles: Create Profile…**) — same isolation, no CLI flags. Use whichever feels natural.

### 3. Full loop — install the `.vsix` in place (overwrites the marketplace build)

If you specifically want the dev build to *be* your daily driver (e.g. you're debugging something that only reproduces with your full extension set enabled), install in place:

```bash
pnpm -F vscode run package

# VS Code:
code  --install-extension packages/vscode-extension/dist/nowline-vscode.vsix --force
# Cursor:
cursor --install-extension packages/vscode-extension/dist/nowline-vscode.vsix --force
```

`--force` reinstalls in place without an explicit uninstall. Then in the editor: `Cmd+Shift+P` → **Developer: Reload Window**.

**Heads up:** because the dev `.vsix` shares `publisher.name = nowline.vscode-nowline` with the marketplace build, this overwrites the marketplace bundle on disk. Reverting requires either an `Uninstall` from the marketplace UI followed by a reinstall, or deleting the `~/.cursor/extensions/nowline.vscode-nowline-*` directory and reinstalling from the marketplace. Prefer the sandboxed-profile loop above unless you have a specific reason to need this one.

The `package` script chains `sync-grammar` (pulls `grammars/nowline.tmLanguage.json` into `packages/vscode-extension/syntaxes/`) → `build-icon` → production esbuild → `vsce package`, so a single command produces a fresh `.vsix` from current sources.

### Gotchas

- **Reload Window isn't always enough.** The extension host occasionally caches the old `.cjs` bundle. If your changes don't appear after reload, fully quit the editor (`Cmd+Q`) and reopen.
- **Confirm the loaded build.** `Cmd+Shift+P` → **Developer: Show Running Extensions**, find Nowline, check the path next to it points at `~/.cursor/extensions/nowline.vscode-nowline-<version>/` (or `~/.vscode/extensions/...`).
- **Stuck install.** If `--install-extension --force` reports success but the new bundle doesn't appear, remove the extension directory by hand — `ls ~/.cursor/extensions/ | grep -i nowline`, `rm -rf` the matching folder — then reinstall.
- **`cursor` CLI missing.** Open Cursor and run **Shell Command: Install 'cursor' command** from the command palette to put it on `$PATH`.
- **Don't rename `publisher`/`name` to install side-by-side.** It's tempting to fork `packages/vscode-extension/package.json` to a unique id (e.g. `nowline-dev.vscode-nowline-dev`) so the dev build can run in the same window as the marketplace build. Don't — duplicate command IDs (`nowline.openPreview`, `nowline.openPreviewToSide`, etc.), duplicate language registration for `.nowline`, and duplicate keybindings collide silently and produce confusing repros that don't match what users see. The sandboxed-profile loop above gives you the same A/B-in-isolation outcome without the bookkeeping.

## Working on the grammar

The DSL grammar lives in `packages/core/src/language/nowline.langium`. Langium generates the AST, parser, and module files into `packages/core/src/generated/` during `prebuild` / `pretest`. **Never edit generated files by hand** — changes will be overwritten on the next build.

Typical workflow when changing the language:

1. Edit `nowline.langium`.
2. Run `pnpm langium:generate` (or just `pnpm build`).
3. Update `packages/core/src/language/nowline-validator.ts` if the change introduces new validation rules.
4. Add or update tests under `packages/core/test/`.
5. If the visible `.nowline` syntax changed, update `grammars/nowline.tmLanguage.json` so editor highlighting keeps up.
6. If the AST shape changed, update the CLI's canonical printer in `packages/cli/src/convert/printer.ts` so round-trips still work, and run `pnpm -r test` to confirm.

If you're changing the spec'd behavior of the language, also update the relevant docs under `packages/core/README.md`.

## Code style

- **TypeScript, strict mode.** Prefer narrow, well-named types over `any`. Avoid `as` casts unless there's no other way; leave a comment if you have to use one.
- **Indentation: 4 spaces** for TypeScript source. Don't mix tabs and spaces.
- **`.nowline` indentation: 2 spaces.** This is the language's canonical indent (see `packages/cli/src/convert/printer.ts`).
- **Module system.** Everything is ESM (`"type": "module"`). Use `.js` import specifiers in TypeScript source when importing other TS files in the same package (required by Node's ESM resolver).
- **Imports.** Prefer named imports. Group stdlib → third-party → workspace → relative. No default exports in new modules unless an external API (e.g. a bin entry) requires one.
- **Comments.** Only write them when the code itself can't communicate the intent. No `// Increment the counter`-style narration. Explain *why*, not *what*.
- **Error handling.** The CLI uses a `CliError` + numeric `ExitCode` scheme (`packages/cli/src/io/exit-codes.ts`). New error paths should throw `CliError` with the appropriate code so `process.exit` gets the right value.
- **No emojis in source, commit messages, or user-facing output unless explicitly requested.**
- **AI-assisted commits.** Every commit that materially relied on AI assistance must carry an `Assisted-by:` trailer naming the specific agent and version — e.g. `Assisted-by: Claude Opus 4.7`. The trailer is a standard Git footer (same shape as `Co-Authored-By:` / `Signed-off-by:`), so it survives squash-merge and stays grep-able in `git log`. Multiple trailers are fine if more than one agent contributed. Write `Assisted-by: None` for entirely hand-written work. See [`AI_POLICY.md`](./AI_POLICY.md) for the rationale.

Formatting and lint enforcement are described in the next section.

## Linting and formatting

The repo uses [Biome](https://biomejs.dev) as a single tool for linting, formatting, and import organization. One Rust binary, one config file ([`biome.json`](./biome.json)), and one script entry point — `pnpm check` runs everything CI runs.

### Day-to-day

| Task | Command |
|---|---|
| Run the full check (what CI runs) | `pnpm check` |
| Auto-fix everything safe | `pnpm check:fix` |
| Format only | `pnpm format` (writes) / `pnpm format:check` (read-only) |
| Lint only | `pnpm lint` / `pnpm lint:fix` |
| Type-check the vscode-extension | `pnpm typecheck` |

`pnpm check` is the gate: lint + format-drift + import organization, all in one Biome invocation. CI fails the PR if it isn't clean.

`pnpm typecheck` is a separate step because most packages type-check as part of `pnpm -r build` (via `tsc -b`); the VS Code extension bundles via esbuild and skips that, so its `tsc --noEmit` runs under `typecheck` instead.

### Style baseline

Set in [`biome.json`](./biome.json) — change there if you have a strong reason to deviate:

- 4-space indent, LF line endings, 100-column line width.
- Single quotes, semicolons, trailing commas everywhere, parens around arrow params.
- Imports auto-organized on `pnpm check:fix`.

### Rule overrides (and why)

These rules are explicitly disabled in `biome.json`. Each is a deliberate codebase decision; new code should follow the same pattern rather than re-enabling these:

- `complexity/noUselessConstructor` — Langium service-injection providers (`packages/lsp/src/providers/*`) accept a `services` argument even when they currently store nothing, so the API contract is stable when collaborators are added later. Removing the constructor would break that contract.
- `correctness/noVoidTypeReturn` — the canonical printer in `packages/cli/src/convert/printer.ts` uses `return this.someVoidMethod(...)` as an early-exit pattern inside long `switch` and `if-else` chains. The returned value is `void`; the `return` is for control flow only. Refactoring 16 sites to `{ this.fn(); return; }` adds noise without changing semantics.
- `style/noNonNullAssertion` — `!` is widely used as a documented assertion idiom across the layout and renderer code where the surrounding logic guarantees non-null. We accept the trade-off in exchange for readable hot paths.

When you legitimately need to suppress a rule for one specific call site, prefer an inline `// biome-ignore lint/<group>/<rule>: <reason>` comment over a config-level disable. Examples in the codebase:

- `packages/layout/src/nodes/{group,parallel,swimlane}-node.ts` — `noUnusedPrivateClassMembers` (the analyzer doesn't see `const { deps } = this`).
- `packages/cli/scripts/bundle-templates.mjs` — `noTemplateCurlyInString` (literal placeholder in a code generator).
- `packages/layout/test/lane-utilization.test.ts` — `noExplicitAny` (test scaffolding).

### IDE integration

Install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) (`biomejs.biome`) and Biome will format on save and surface lint diagnostics inline. Recommended VS Code settings:

```json
"editor.defaultFormatter": "biomejs.biome",
"editor.formatOnSave": true,
"editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit"
}
```

The Biome extension reads [`biome.json`](./biome.json) automatically, so the IDE matches CI byte-for-byte.

## Editing GitHub Actions workflows

Install [actionlint](https://github.com/rhysd/actionlint) and run it locally before pushing changes to `.github/workflows/`:

```
brew install actionlint
pnpm lint:workflows
```

CI runs the same `pnpm lint:workflows` step on every PR — catches YAML errors, action-input mismatches, expression typos, and bash issues inside `run:` blocks (via shellcheck) before they break a workflow run.

## Tests

All tests use [Vitest](https://vitest.dev/).

- **Parser and validator tests** live in `packages/core/test/` — parse fixtures, assert expected diagnostics, verify AST shape.
- **CLI unit tests** in `packages/cli/test/{validate,convert,init,config,exit-codes}/` cover individual modules directly.
- **CLI integration tests** in `packages/cli/test/integration/` spawn the compiled `dist/index.js` and assert exit codes + stdout/stderr. These catch bundling bugs that unit tests miss (especially around `bun compile` and templated resources). They're skipped if `dist/index.js` is missing, so run `pnpm build` first.
- **Round-trip tests** in `packages/cli/test/convert/roundtrip.test.ts` assert that every example file round-trips text → JSON → text and JSON → text → JSON without drift, modulo comment loss.
- **Renderer manual-validation fixtures** under [`tests/`](./tests) are tiny `.nowline` files that each stress a single layout / rendering axis (sized titles, text-fit-vs-spill, etc.). They are *not* Vitest tests — `pnpm build` (or `pnpm render`) re-renders each fixture to a sibling `.svg` so you can eyeball the result. The byte-stable regression gate is the snapshot suite under `packages/layout/test/__snapshots__/`; the `tests/` fixtures complement it by making specific behaviors easy to spot when something drifts.
- **Visual reference** for what the renderer aims to match lives in [`specs/samples/`](./specs/samples). Open [`specs/samples/index.html`](./specs/samples/index.html) for a side-by-side gallery of the SVG outputs alongside their DSL snippets.

When you add a feature, add at least one test that would fail without your change. When you fix a bug, add a regression test that reproduces it.

## Commits and pull requests

### Commit messages

We prefer short, imperative subject lines describing *what the change does*, optionally followed by a body explaining *why*. Match existing history in `git log --oneline`.

Good examples:

```
add @nowline/cli (m2a): validate, convert, init + distribution
fix round-trip printer quoting for template strings
```

Less useful:

```
fix bug
update files
WIP
```

### AI-assisted contributions

Nowline ships [`AGENTS.md`](./AGENTS.md) and welcomes AI-assisted PRs. Read [`AI_POLICY.md`](./AI_POLICY.md) before opening one — the short version:

- Disclose the specific agent (name + version) with an `Assisted-by:` trailer on each AI-assisted commit *and* under the **AI assistance** section of the PR description. Write `Assisted-by: None` if the PR is entirely hand-written.
- Own every line you submit. You should be able to explain the change in your own words without re-prompting the AI.

### Changelog entries

User-observable changes — DSL syntax, CLI flags, AST JSON shape, exporter output, extension UX, the `embed.nowline.io` surface — should land with an entry appended to `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md). Use the right [Keep-a-Changelog](https://keepachangelog.com) heading (`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`) and link to the PR or issue where it helps. Internal-only changes (build scripts, CI, dependency bumps with no behavior change) don't need an entry.

The maintainer moves your entry into a new `## [vX.Y.Z] - YYYY-MM-DD` section as part of the release-cut commit — see [Changelog workflow](./specs/releasing.md#changelog-workflow) in `specs/releasing.md` for the full contract.

### Pull requests

1. **Fork** the repo (or branch, if you have write access) and create a feature branch: `git checkout -b feat/short-description`.
2. Make your change. Keep the diff focused — one logical change per PR.
3. **Run `make ci` locally** before pushing — it chains lint + typecheck + build + test, the same gate CI runs across Linux, macOS, and Windows.
4. **Update documentation** — package READMEs, the top-level `README.md`, inline comments, plus a `## [Unreleased]` entry in [`CHANGELOG.md`](./CHANGELOG.md) for any user-observable change (see [Changelog entries](#changelog-entries) above).
5. **Open a PR** against `main` with:
    - A clear summary of the change.
    - The motivation (linked issue, bug repro, or design doc).
    - A short "how I tested this" note.
    - Screenshots or terminal output if the change is user-visible.
6. **Respond to review feedback** with follow-up commits; we squash-merge, so intermediate history doesn't need to be pristine.

For changes touching the language or the published AST JSON schema, please open an issue first so we can discuss the shape before you invest implementation time — these are contracts we want to keep stable.

> **Hotfix exception.** PRs that patch a *released* version target a `release/vX.Y` branch instead of `main`. Apply the **`backport main`** label so the merged hotfix is auto-cherry-picked back onto `main` (see [Versioning](#versioning) below).

### Auto-merge policy

`main` is protected by a [branch ruleset](https://github.com/lolay/nowline/settings/rules) that requires every job in [`ci.yml`](./.github/workflows/ci.yml) to pass before any PR can merge — auto or manual. The ruleset is intentionally CI-gated only; no required reviewers, because GitHub's auto-merge cannot fire on a PR whose ruleset demands an approving review.

| PR source | Auto-merge? | Why |
| --- | --- | --- |
| Renovate **minor/patch** | yes | Bounded blast radius; CI is the gate. Configured by `automerge: true` + the top-level `platformAutomerge: true` in [`.github/renovate-shared.json`](./.github/renovate-shared.json). |
| Renovate **major** | no | Major bumps hide breaking changes; humans review before merging. |
| Engine-floor bump PRs | depends on the issue worker | `vscode-extension-engine-bump.yml` opens a GitHub Issue, not a PR. The generic issue-to-PR worker that executes the work decides whether to enable auto-merge on the resulting PR. |
| Copilot agent PRs (from the nowline triage flow) | no | Agent review labels the PR `maintainer-pr-safe` (low-risk) or `maintainer-pr-review` (needs attention). A maintainer reviews and clicks **Approve + Merge** in the UI. Nothing auto-merges. |
| Hand-authored PRs | no | Default behavior — open, review, click merge. The same ruleset still requires CI to be green. |

**Bypassing auto-merge on an automated PR.** If you need to hold an auto-merge-enabled PR (e.g. to push a follow-up commit before it lands), either convert it to a draft, or disable auto-merge explicitly: `gh pr merge <PR> --disable-auto`. Re-enabling later is `gh pr merge <PR> --auto --squash`.

**Hotfix exception.** Hotfix PRs against `release/vX.Y` branches do **not** auto-merge. The `backport main` workflow opens a follow-up PR onto `main` which also does not auto-merge — hotfixes can conflict with newer work, so they always get a human click.

## Versioning

All packages in this repo (the `@nowline/*` npm packages and the VS Code extension) ship under [Semantic Versioning](https://semver.org/) and are kept lock-step — every release tag bumps every package to the same `MAJOR.MINOR.PATCH`. The DSL itself uses an independent integer-only version (`nowline v1`) declared inside `.nowline` files; see [`specs/dsl.md`](./specs/dsl.md) for that contract.

The maintainer-facing release process (cut a tag, what publishes where, how to rotate secrets) lives in [`specs/releasing.md`](./specs/releasing.md). Contributors only need to know the rules below.

### Branching

- **`main` is the only long-lived branch.** Feature work happens on short-lived `feat/*`, `fix/*`, or `docs/*` branches and lands via squash-merge.
- **`release/vX.Y` branches exist only when a released line needs a hotfix** (e.g. `release/v0.1` to ship `0.1.1` after `0.2.0` is out). They are cut on demand from the relevant tag and deleted once the line is end-of-life.
- We do **not** maintain a `develop` branch or a release-candidate channel before 1.0; every tag is a stable release.

### Dev builds vs. releases

`package.json#version` always reflects the *last released* version on `main`. To distinguish a dev build from the real thing, the CLI appends git build metadata to its `--version` output (per SemVer §10):

| Build | `nowline --version` |
|---|---|
| Tagged release | `0.1.0` |
| Dev build, clean tree | `0.1.0+abc1234` |
| Dev build, uncommitted changes | `0.1.0+abc1234.dirty` |

The `+...` suffix is informational metadata only; npm and the VS Code Marketplace strip it (and the `+` is invalid in their version fields), so it never reaches a published artifact. The metadata is captured at compile time by `packages/cli/scripts/bundle-templates.mjs`.

### Hotfix flow

1. Cut `release/vX.Y` from the tag you need to patch (`git switch -c release/v0.1 v0.1.0`) and push it.
2. Open a PR against that branch with the fix.
3. Apply the **`backport main`** label.
4. After CI passes, merge. `.github/workflows/backport.yml` opens a follow-up PR cherry-picking the squash-commit onto `main` — review and merge it once green. Auto-merge is intentionally off because hotfixes can conflict with newer work on `main`.
5. The maintainer cuts a new tag from `release/vX.Y` (`v0.1.1`) via the manual `Release` workflow dispatch (see `specs/releasing.md`).

## Agent triage

Issues in this repo can be routed through a four-phase AI agent flow. The flow is opt-in during rollout: check the "Let an AI agent take a first pass" box when filing an issue, or add `agent-triage` manually to an existing issue.

- **`agent-*` labels** — the agent owns the next move.
- **`originator-*` labels** — the issue filer owns the next move. The flow is paused waiting on the person who filed the issue.
- **`maintainer-*` labels** — a repo maintainer owns the next move. Either a judgment call is needed, or a PR is ready to merge.
- **Override** any state by adding the new target state label (the cleanup workflow removes the old one automatically).
- **Stop the flow** at any time: add `maintainer-only`. To resume, add `agent-triage`.

Full reference: [`.github/AGENT_TRIAGE.md`](./.github/AGENT_TRIAGE.md).

## Reporting bugs

Open a bug report using the [bug template](./.github/ISSUE_TEMPLATE/bug_report.yml) — it walks you through the minimum repro, command, output, and version information we need.

For security issues, follow [`SECURITY.md`](./SECURITY.md) and **do not** open a public issue.

## Proposing features

Open an issue using the [feature template](./.github/ISSUE_TEMPLATE/feature_request.yml). Nowline has an opinionated scope (see [`specs/principles.md`](./specs/principles.md)); features that don't fit the core DSL/tooling remit may be better implemented as external consumers of `@nowline/core`.

## Licensing

By contributing, you agree that your contributions will be licensed under the project's [Apache 2.0 license](./LICENSE). You retain copyright on your contributions; Apache 2.0 grants the project and its users the necessary rights.

We don't currently require a CLA or DCO sign-off. If that changes, it will be announced clearly in an issue and this document will be updated.
