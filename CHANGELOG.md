# Changelog

All notable changes to Nowline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Packages in this monorepo share a single version and ship together. Contributors append entries to `## [Unreleased]` as part of their PR; maintainers move them into a new `## [vX.Y.Z]` section as part of the release-cut commit (see [`specs/releasing.md`](./specs/releasing.md#changelog-workflow)).

## [Unreleased]

### Added

- **DSL: inline date pins on `after:` and `before:`.** Bind an item, group, or parallel directly to a calendar position with `after:2026-03-15` / `before:2026-04-13` (or mixed lists like `after:[upstream, 2026-03-15]`) without declaring a named anchor. The heavyweight `anchor` declaration is still the right tool when you want a chart-spanning cut line and header diamond; inline dates fill the very common one-off-pin case with a quiet per-entity visual.
- `@nowline/embed` now deploys to `embed.nowline.io` on every release. The `pack-embed` cell of the release matrix builds a CDN-shaped artifact at `dist-cdn-prod/{X.Y.Z,X.Y,latest}/`, and a new `embed-prod` job ships it to Firebase Hosting via Workload Identity Federation, lock-step with `npm publish @nowline/embed`. Use `<script src="https://embed.nowline.io/latest/nowline.min.js">` (or pin a specific version).
- `packages/embed/examples/index.html` — a self-contained runnable harness demonstrating the four public entry points (`auto-scan` of fenced ` ```nowline ` blocks, manual `nowline.render()`, `nowline.parse()` with diagnostics, theme switching via `initialize()` + `run()`). Surfaces `nowline.version` and `nowline.sha` in the page chrome so the running build is identifiable.
- VS Code extension: `Nowline: Show Source` command and a reverse-direction title-bar button on the preview panel. Click it to jump back to the source `.nowline` file (revealing an existing editor if visible, otherwise opening it beside the preview).
- [`AI_POLICY.md`](./AI_POLICY.md) at the repo root, a pointer subsection in [`CONTRIBUTING.md`](./CONTRIBUTING.md), and a required `Assisted-By: <agent name + version>` trailer on every AI-assisted commit (also surfaced in the PR template). Single 🤖 marker in the PR title for fully autonomous-agent PRs.
- VS Code extension: committed `packages/vscode-extension/.vscode/launch.json` makes F5 a single-keystroke Extension Development Host launch (with `pnpm build` as the preLaunchTask). Two configs ship: `Run Extension` (default) and `Run Extension (no other extensions)` for clean-room repros that disable every other installed extension.

### Changed

- VS Code extension: removed the redundant `Nowline: Open Preview` command from the editor / explorer / title-bar context menus (still available from the command palette and via the existing `Cmd/Ctrl+Shift+V` keybinding). `Open Preview to the Side` is the canonical menu entry, matching how Markdown's title-bar UX has settled.
- Toolchain bumps for fork rebuilders: pnpm 10 → 11 (with `onlyBuiltDependencies` → `allowBuilds` migration in `pnpm-workspace.yaml`), TypeScript 5.7 → 6.0, Vitest 3 → 4, `@types/node` 22 → 25, plus per-package majors (firebase 12, happy-dom 20, esbuild 0.28, pdfkit 0.18, `@clack/prompts` 1, `@actions/core` and `@actions/exec` 3). No user-visible behavior change.
- GitHub Actions used by the release pipeline bumped to current majors: `pnpm/action-setup@v6`, `google-github-actions/auth@v3`, `w9jds/firebase-action@v15`. Internal-only change.
- `CONTRIBUTING.md` "Working on the VS Code / Cursor extension" restructured from two iteration loops (Fast / Full) into three (F5 / sandboxed profile via `--user-data-dir` + `--extensions-dir` / in-place `--force`). The sandboxed-profile loop preserves the marketplace install instead of clobbering it; new Gotchas note explains why renaming `publisher`/`name` for side-by-side install is not the right answer.
- README `## Quick start` and `## Status` rewritten for post-v0.1.0 reality: `brew install lolay/tap/nowline`, `npm install -g @nowline/cli`, plus links to the .deb / .exe / Marketplace artifacts. `SECURITY.md` "Supported versions" updated to the `0.x` policy (latest `0.x.y` supported; older `0.x` lines are not). Stale `apt install` reference dropped (we ship `.deb` assets, not an apt repo).
- Embed CDN deploy runbook moved to [`lolay/nowline-infra:ops/embed-deploy.md`](https://github.com/lolay/nowline-infra/blob/main/ops/embed-deploy.md) so the env-per-stack `terraform output` invocations stay accurate alongside the stacks they describe.

### Fixed

- Embed CDN deploy: pin `w9jds/firebase-action` to `v15.18.0` instead of `v15`. The action publishes specific patch tags only (`v15.X.Y`); there is no moving major-only `v15` ref, so the previous pin failed to resolve (`Unable to resolve action w9jds/firebase-action@v15`) and broke the `embed.nowline.dev` deploy step on every push to `main`. Reproduced in [run 26263517719](https://github.com/lolay/nowline/actions/runs/26263517719/job/77301975164).
- Embed CDN deploy: bootstrap the local `prepare-firebase-deploy` composite action with a minimal pre-checkout step in each caller (`embed-dev`, `embed-preview`, `embed-prod`). The composite was extracted from inline steps in commit `ae8702d`, but local composite actions can't be loaded until their `action.yml` is on disk — and the composite's own (broader) sparse-checkout fires too late. The error surfaced once the `v15` pin above was fixed. Reproduced in [run 26264969442](https://github.com/lolay/nowline/actions/runs/26264969442).
- Embed CDN deploy: rephrased two `${{ vars.X }}` references in the `prepare-firebase-deploy` composite action's input descriptions. GitHub Actions evaluates `${{ … }}` expressions in `description` text, and the `vars` context is not available inside composite actions — so manifest validation rejected the file with `Unrecognized named-value: 'vars'`. Surfaced once the bootstrap fix above let the manifest load. Reproduced in [run 26265376977](https://github.com/lolay/nowline/actions/runs/26265376977).

### Removed

- _Nothing yet._

## [0.2.0]

Reconstructed from git history — these entries shipped with `v0.2.0` (commit `38352de`) but were never moved out of `[Unreleased]`. Versioning is `0.x`, so DSL renames are allowed between minor versions per [`specs/releasing.md`](./specs/releasing.md#versioning-scheme).

### Added

- Status aliases for international audiences: `active` (= `in-progress`) and `completed` (= `done`). Both spellings are valid input; aliases canonicalize at the layout boundary so downstream consumers see one normalized form.
- Color aliases for international audiences: `grey` (= `gray`) and `violet` (= `purple`). Both spellings are valid input; aliases canonicalize at the theme boundary so themes don't grow new fields.

### Changed

- **DSL rename:** `glyph` config keyword → `symbol`. No in-code alias provided. Update files using `glyph budget unicode:"💰"` to `symbol budget unicode:"💰"`.
- **DSL rename:** shadow value `fuzzy` → `soft`. Update files using `shadow:fuzzy` to `shadow:soft`. The `nl-*-root-shadow-fuzzy` SVG filter id becomes `nl-*-root-shadow-soft`.
