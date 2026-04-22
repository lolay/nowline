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
- [Reporting bugs](#reporting-bugs)
- [Proposing features](#proposing-features)
- [Licensing](#licensing)

## Code of conduct

Be respectful, assume good intent, and give concrete feedback. We'll add a formal Code of Conduct as the community grows; for now, the short version is: treat every contributor the way you'd want to be treated.

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
pnpm -r build
pnpm -r test
```

`pnpm install` sets up the workspace. `pnpm -r build` walks every package in dependency order — it regenerates the Langium parser in `@nowline/core`, bundles templates in `@nowline/cli`, and type-checks everything. `pnpm -r test` runs the Vitest suites.

If you want to work offline or have a pre-populated pnpm store, check the `.pnpm-store/` folder — the repo is set up so `pnpm install` uses a local store when present.

## Repository layout

```
nowline/
├── packages/
│   ├── core/          # @nowline/core — Langium grammar, parser, AST, validator
│   └── cli/           # @nowline/cli  — `nowline` command-line tool
├── examples/          # .nowline files used by both tests and `nowline init` templates
├── grammars/          # TextMate grammar for editor syntax highlighting
├── scripts/           # Repo-wide scripts: .deb build, Homebrew tap seed
├── specs/             # Design specs for the DSL, renderer, CLI, IDE integrations, and OSS milestones
├── .github/workflows/ # CI and release pipelines
├── branding/          # Logos and marks
└── pnpm-workspace.yaml
```

Packages have a shared version and are published together. The dependency graph is strictly:

```
@nowline/cli ──▶ @nowline/core
```

No upward or sideways imports. Future packages (`@nowline/layout`, `@nowline/renderer`, etc.) will extend this graph without breaking it.

### Design docs

Before making a non-trivial change, skim the specs under [`specs/`](./specs) — they describe the intended shape of the product and are the best reference for "why" questions:

- [`specs/principles.md`](./specs/principles.md) for what's in scope (and what's deliberately not).
- [`specs/dsl.md`](./specs/dsl.md) for the canonical language design — if you're touching the grammar, parser, or validator, start here.
- [`specs/architecture.md`](./specs/architecture.md) for the package graph, tech choices, and the `AssetResolver` contract.

The specs live in-repo so PRs can update them alongside code when behavior changes.

## Common tasks

Run these from the repo root. Most are simple pnpm re-runs across the workspace.

| Task | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Build everything (regenerates grammar + bundles templates + tsc) | `pnpm -r build` |
| Run all tests | `pnpm -r test` |
| Run tests for one package | `pnpm --filter @nowline/core test` |
| Watch tests for one package | `pnpm --filter @nowline/core test:watch` |
| Lint | `pnpm -r lint` |
| Type-check without emit | `pnpm -r build` (incremental; tsc -b handles this) |
| Regenerate Langium AST only | `pnpm langium:generate` |
| Compile standalone binaries | `pnpm --filter @nowline/cli compile` (requires Bun) |
| Compile only the host platform's binary | `pnpm --filter @nowline/cli compile:local` |

The pre-hooks (`prebuild`, `pretest`) handle code generation automatically — you generally don't need to run `langium:generate` or `bundle-templates` by hand.

## Running the CLI from source

During development you usually want to invoke the CLI against local changes without reinstalling. Three options:

1. **Run the built JS directly.** After `pnpm -r build`:

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

Because the CLI bundles example templates at build time, changes to files under `examples/` are picked up by `pnpm -r build` (the `prebuild` hook re-runs `bundle-templates.mjs`).

## Working on the grammar

The DSL grammar lives in `packages/core/src/language/nowline.langium`. Langium generates the AST, parser, and module files into `packages/core/src/generated/` during `prebuild` / `pretest`. **Never edit generated files by hand** — changes will be overwritten on the next build.

Typical workflow when changing the language:

1. Edit `nowline.langium`.
2. Run `pnpm langium:generate` (or just `pnpm -r build`).
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
- **CLI integration tests** in `packages/cli/test/integration/` spawn the compiled `dist/index.js` and assert exit codes + stdout/stderr. These catch bundling bugs that unit tests miss (especially around `bun compile` and templated resources). They're skipped if `dist/index.js` is missing, so run `pnpm -r build` first.
- **Round-trip tests** in `packages/cli/test/convert/roundtrip.test.ts` assert that every example file round-trips text → JSON → text and JSON → text → JSON without drift, modulo comment loss.

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
3. **Run `pnpm -r build && pnpm -r lint && pnpm -r test` locally** before pushing. CI runs the same commands across Linux, macOS, and Windows.
4. **Update documentation** — package READMEs, the top-level `README.md`, inline comments — anywhere the change affects observable behavior.
5. **Open a PR** against `main` with:
    - A clear summary of the change.
    - The motivation (linked issue, bug repro, or design doc).
    - A short "how I tested this" note.
    - Screenshots or terminal output if the change is user-visible.
6. **Respond to review feedback** with follow-up commits; we squash-merge, so intermediate history doesn't need to be pristine.

For changes touching the language or the published AST JSON schema, please open an issue first so we can discuss the shape before you invest implementation time — these are contracts we want to keep stable.

## Reporting bugs

Please include:

- A minimal `.nowline` or JSON input that reproduces the problem (paste it inline; don't link to a gist that may disappear).
- The exact command you ran.
- The full stderr / stdout output, including the exit code.
- The Nowline version (`nowline version`) and your OS + Node version.

If the bug is a crash, attach the stack trace. If it's a wrong diagnostic (false positive or false negative), describe what you expected the behavior to be and cite the relevant rule from the DSL spec if you can.

## Proposing features

Open an issue first. For anything non-trivial, a short design sketch — what changes, how the user sees it, what breaks — speeds up review significantly. The project has an opinionated scope (see `README.md` § Status and [`specs/principles.md`](./specs/principles.md)); features that don't fit the core DSL/tooling remit may be better implemented as external consumers of `@nowline/core`.

## Licensing

By contributing, you agree that your contributions will be licensed under the project's [Apache 2.0 license](./LICENSE). You retain copyright on your contributions; Apache 2.0 grants the project and its users the necessary rights.

We don't currently require a CLA or DCO sign-off. If that changes, it will be announced clearly in an issue and this document will be updated.
