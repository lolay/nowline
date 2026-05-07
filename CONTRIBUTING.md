# Contributing to Nowline

Thanks for your interest in Nowline. This guide covers how to set up a development environment, where the code lives, what the expected workflow looks like, and how to get a pull request merged.

Nowline is early-stage: the parser, validator, and CLI are usable, but layout, rendering, IDE integration, and the distribution pipeline are still in flight. Small, focused PRs are much easier to review than large refactors. If you're planning something substantial, please open an issue first.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Getting the code](#getting-the-code)
- [Repository layout](#repository-layout)
- [Common tasks](#common-tasks)
- [Running the CLI from source](#running-the-cli-from-source)
- [Working on the grammar](#working-on-the-grammar)
- [Code style](#code-style)
- [Tests](#tests)
- [Commits and pull requests](#commits-and-pull-requests)
- [Versioning](#versioning)
- [Reporting bugs](#reporting-bugs)
- [Proposing features](#proposing-features)
- [Licensing](#licensing)

## Code of conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Reports of unacceptable behavior may be sent to **gary@lolay.com**.

## Prerequisites

You'll need:

- **Node.js** ≥ 22 (the CLI targets modern Node; older versions will fail TypeScript type-checks).
- **pnpm** ≥ 9 (the repo is a pnpm workspace and pins the package manager via `packageManager` in the root `package.json`). Install with `corepack enable && corepack prepare pnpm@latest --activate`.
- **Git**.
- **Bun** (optional) — only required if you want to produce standalone binaries locally with `pnpm --filter @nowline/cli compile`. Skip it otherwise; nothing in the default dev loop uses Bun.

No other global tooling is required.

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
| Lint | `pnpm -r lint` |
| Type-check without emit | `pnpm -r build` (incremental; tsc -b handles this; skips render) |
| Regenerate Langium AST only | `pnpm langium:generate` |
| Compile standalone binaries | `pnpm --filter @nowline/cli compile` (requires Bun) |
| Compile only the host platform's binary | `pnpm --filter @nowline/cli compile:local` |

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

Run `pnpm -r lint` before pushing.

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

### Pull requests

1. **Fork** the repo (or branch, if you have write access) and create a feature branch: `git checkout -b feat/short-description`.
2. Make your change. Keep the diff focused — one logical change per PR.
3. **Run `pnpm build && pnpm -r lint && pnpm -r test` locally** before pushing. CI runs the same commands across Linux, macOS, and Windows.
4. **Update documentation** — package READMEs, the top-level `README.md`, inline comments — anywhere the change affects observable behavior.
5. **Open a PR** against `main` with:
    - A clear summary of the change.
    - The motivation (linked issue, bug repro, or design doc).
    - A short "how I tested this" note.
    - Screenshots or terminal output if the change is user-visible.
6. **Respond to review feedback** with follow-up commits; we squash-merge, so intermediate history doesn't need to be pristine.

For changes touching the language or the published AST JSON schema, please open an issue first so we can discuss the shape before you invest implementation time — these are contracts we want to keep stable.

> **Hotfix exception.** PRs that patch a *released* version target a `release/vX.Y` branch instead of `main`. Apply the **`backport main`** label so the merged hotfix is auto-cherry-picked back onto `main` (see [Versioning](#versioning) below).

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

## Reporting bugs

Open a bug report using the [bug template](./.github/ISSUE_TEMPLATE/bug_report.yml) — it walks you through the minimum repro, command, output, and version information we need.

For security issues, follow [`SECURITY.md`](./SECURITY.md) and **do not** open a public issue.

## Proposing features

Open an issue using the [feature template](./.github/ISSUE_TEMPLATE/feature_request.yml). Nowline has an opinionated scope (see [`specs/principles.md`](./specs/principles.md)); features that don't fit the core DSL/tooling remit may be better implemented as external consumers of `@nowline/core`.

## Licensing

By contributing, you agree that your contributions will be licensed under the project's [Apache 2.0 license](./LICENSE). You retain copyright on your contributions; Apache 2.0 grants the project and its users the necessary rights.

We don't currently require a CLA or DCO sign-off. If that changes, it will be announced clearly in an issue and this document will be updated.
