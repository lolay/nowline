# Changelog

All notable changes to Nowline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Packages in this monorepo share a single version and ship together. Contributors append entries to `## [Unreleased]` as part of their PR; maintainers move them into a new `## [vX.Y.Z]` section as part of the release-cut commit (see [`specs/releasing.md`](./specs/releasing.md#changelog-workflow)).

## [Unreleased]

### Added

- _Nothing yet._

### Changed

- `@nowline/preview-shell`: the preview minimap can no longer be manually dismissed (the `×` close button is removed). It still auto-hides when the whole diagram fits in the viewport and still respects `nowline.preview.showMinimap`.

### Deprecated

- _Nothing yet._

### Removed

- _Nothing yet._

### Fixed

- _Nothing yet._

### Security

- _Nothing yet._

## [0.5.0] - 2026-06-01

### Added

- **Canary channel**: every push to `main` publishes a `0.0.0-dev.<UTC>.<sha>` pre-release to npm under the `next` dist-tag via `.github/workflows/canary.yml`. The version sorts strictly below every real release so it can never satisfy a `^X.Y` range off `latest` — no prod leakage. After publish, the jsDelivr `@next` cache for `@nowline/embed` is purged. Install with `@nowline/embed@next` or reference `https://cdn.jsdelivr.net/npm/@nowline/embed@next/dist/nowline.min.js`.
- VS Code: `nowline.preview.theme` now offers `grayscale` (the Theme/diagram-palette axis) in addition to `auto` / `light` / `dark`, and the preview toolbar's `Grayscale` selection now renders the grayscale palette instead of silently falling back to light/dark. The chrome/workbench Mode axis is unchanged (stays light/dark).
- `@nowline/preview-shell`: Redesigned toolbar — single-row chrome with mode-aware palette (`data-nl-mode`), separate **Fit width** (`↔`) and **Fit page** (`⤢`) buttons, consolidated more-menu (Format, Copy, Export, Theme, Now, Show Links dropdowns), hand-rolled calendar picker for the Now control, and minimap auto-hide. The Export action uses a download glyph, and Copy / Export each take half the action row and are centred. VS Code extension wires `locale` and `themeControl:'show'`.
- `@nowline/preview-shell`: New public API on `MountPreviewOptions` — `mode` (`'light' | 'dark' | 'system'`; sets the chrome color scheme; defaults to `'system'`, which auto-detects VS Code webview body classes or `prefers-color-scheme`), `themeControl` (`'show' | 'hide'`; whether the Theme row appears in the more-menu; defaults to `'show'`), `availableThemes` (`string[]`; diagram themes listed in the Theme dropdown, with **Auto** always prepended; defaults to `['light', 'dark', 'grayscale']`), and `locale` (`string`; date-formatting locale for the Now calendar picker; defaults to `navigator.language`). New `PreviewHandle` methods: `setMode(mode)`, `setAvailableThemes(themes)`, and `setLocale(locale)` for imperative post-mount updates. `NowOverride` is now `'today' | 'hide' | (string & {})`, accepting any `'YYYY-MM-DD'` date string in addition to the two sentinels.
- `@nowline/preview-shell`: Toolbar drag grip — reposition anywhere in the preview root with pointer capture and bounds clamping; position persists within the JS session. The toolbar defaults to the upper-right corner and tracks it on resize; a narrowing viewport shifts the whole toolbar left (it keeps its natural width) instead of squishing the row. Collapse toggle (`«`) shrinks the toolbar to a translucent puck (drag grip + `»` restore); `»` expands it again. After a manual zoom/pan the viewport centre point is preserved across resize events (`isDirty` state).
- VS Code extension: **Expand / collapse preview** button in the tab title bar (`$(screen-full)` / `$(screen-normal)`) maximizes the editor group so the preview fills VS Code's editor area, then restores it. Mirrors the free web app's fullscreen toggle. Commands: `nowline.preview.expand` / `nowline.preview.collapse`, driven by the `nowline.previewMaximized` context key.

### Changed

- The grayscale render theme's canonical token is now `grayscale` (US spelling), matching the canonical `gray` color token; the UK spelling `greyscale` is accepted as an alias everywhere a theme is named (`--theme`, embed `theme`, preview toolbar). The rendered `data-theme` attribute and the `theme:`-keyed sample outputs now emit `grayscale` — update any CSS or tooling that keys off `data-theme="greyscale"`.
- Embed bundle banner `built=` timestamp is now the git commit date rather than the wall-clock build time, making builds of the same tag byte-identical across the npm tarball and the branded CDN. Downstream integrity checks (`sha256sum`, Content-Length assertions) are stable across re-deploys.

### Deprecated

- _Nothing yet._

### Removed

- **`@nowline/embed`**: Branded Firebase Hosting CDN (`embed.nowline.{io,dev}`) retired. jsDelivr (`cdn.jsdelivr.net/npm/@nowline/embed@…/dist/nowline.min.js`) is now the documented CDN channel — byte-identical to the npm tarball. The `embed-cdn.yml` workflow, `embed-prod` release job, `prepare-firebase-deploy` composite action, `packages/embed/firebase/`, dev/prod CDN layout scripts (`build-cdn-history.mjs`, `gen-index.mjs`, `lib/templates.mjs`), and the Firebase dev auth gate (`src/auth/`) are all removed. The sole trade-off is branding (`embed.nowline.io` custom domain goes away). The canary workflow (see Added below) replaces `embed.nowline.dev` as the HEAD-tracking channel.
- **`@nowline/embed`**: `bundle:dev` script and `firebase` devDependency removed from `packages/embed/package.json`.

### Fixed

- `@nowline/preview-shell`: more-menu flyouts (Format / Theme / Show-links sub-dropdowns and the Now calendar) now flip and clamp to stay inside the preview root and its gutters instead of spilling off the right edge of the screen when the toolbar sits at the far right.
- `@nowline/preview-shell`: sub-menu checkmarks no longer collide with the option label (the active-item `✓` had its indent overridden by the diagnostics `.menu` rules), and sub-menus size to their content rather than a fixed min-width, removing the dead whitespace beside short options like `svg` / `png`.
- `@nowline/preview-shell`: menu controls use `:focus-visible` for the focus ring, so a mouse click no longer leaves a sticky highlight/outline on a toolbar button or menu option (keyboard focus still shows a ring).
- `@nowline/browser`: the preview / embed diagnostic table no longer double-counts syntax errors. `parseSource()` collected `parseResult.lexerErrors` + `parserErrors` *and* all of `doc.diagnostics`, but Langium's `validateDocument()` already folds the lexer/parser errors into `doc.diagnostics` — so each syntax error appeared twice (once as `lex-error`/`parse-error`, once as `validation`) while the LSP Problems panel showed it once. The re-folded copies (tagged `data.code` `lexing-error` / `parsing-error`) are now skipped, keeping the friendlier dedicated codes.
- `@nowline/cli`: `nowline render` / `validate` diagnostics had the same double-counting bug as the browser pipeline (lexer/parser errors emitted from `parseResult` *and* again from `doc.diagnostics`). The CLI's `parseSource()` now skips the re-folded `lexing-error` / `parsing-error` copies, so each syntax error is reported once.
- `@nowline/browser`: preview / embed diagnostics now show the validator's stable code (`NL.Exxxx`) carried in `data` instead of a code inferred from the message, so the same diagnostic is labelled identically in the preview table, the CLI, and the VS Code Problems panel (e.g. `NL.E0500` rather than `missing-date`). Diagnostic collection now flows through the shared `@nowline/core/diagnostics` collector, so the browser and CLI stay consistent by construction.
- VS Code: the live preview's toolbar, menus, and minimap are styled again. After the m4.7 `@nowline/preview-shell` extraction the webview's nonce-only CSP (`style-src` with no `'unsafe-inline'`) refused the non-nonced `<style>` that `mountPreview()` injected at runtime, so the shell rendered unstyled (stacked controls, "Rendering preview…" stuck on screen). The webview HTML now serves `PREVIEW_SHELL_CSS` from its existing nonced `<style>` block, and `mountPreview()` skips its own injection when a `data-nl-preview-shell` stylesheet is already present.
- `@nowline/preview-shell`: Canvas is now flex-centered; a `ResizeObserver` re-applies fit presets when the pane is resized without a window resize event.

### Security

- _Nothing yet._

## [0.4.2] - 2026-05-28

### Added

- **`@nowline/embed`**: "Share on Nowline" link generation — `share` and `sourceUrl` `initialize()` options append a share link beneath each rendered diagram, encoding the source via the OSS share-link grammar (`#text=`/`#url=`). See `specs/embed.md`.

### Changed

- Moved CI-only helper scripts from `scripts/` to `.github/scripts/` (`bump-version.mjs`, `compute-engine-floor.sh`, `open-engine-bump-issue.sh`, `monitor-cursor-releases.sh`).

## [0.4.1] - 2026-05-28

Hotfix for two bugs in the v0.4.0 release pipeline. v0.4.0 itself shipped the GitHub Release binaries, the `lolay/nowline-action` mirror, and the VS Code Marketplace + Open VSX publishes; it did **not** complete the npm publish loop (7 of 17 packages reached 0.4.0; the loop halted on a glob ambiguity) and did **not** deploy `embed.nowline.io/0.4.0/` (the deploy job failed at sparse-checkout). v0.4.1 ships a corrected pipeline that publishes all 17 packages and the embed CDN cleanly. All v0.4.0 content is present in v0.4.1 modulo the two fixes below — see [`[0.4.0]`](#040---2026-05-27) for the full feature changelog.

### Fixed

- **`release.yml` npm publish loop: tighten tarball glob.** The `for pkg in …; do find dist-pack -name "${pkg}-*.tgz"; done` loop used an unanchored glob; for `pkg=nowline-lsp` the pattern matched both `nowline-lsp-0.4.0.tgz` and `nowline-lsp-worker-0.4.0.tgz`, and `find … -print -quit` returned whichever appeared first in the directory walk. In v0.4.0, the `nowline-lsp` iteration accidentally published `lsp-worker`; the next iteration (`nowline-lsp-worker`) then hit `403 already published` on its second attempt and halted the loop, leaving `@nowline/lsp`, `@nowline/config`, `@nowline/cli`, and all seven `@nowline/export-*` packages at their previous versions on the registry. The fix anchors the glob to `${pkg}-[0-9]*.tgz` so semver-prefixed tarballs match only their owning package.
- **`prepare-firebase-deploy` composite action: disable sparse-checkout cone-mode.** The composite's `actions/checkout@v6` step used the default cone-mode sparse-checkout, which rejects file-path arguments (`packages/embed/package.json`, passed by `release.yml`'s `embed-prod` caller for the deploy step's banner-version assertion). v0.4.0's deploy job failed at sparse-checkout with `fatal: 'packages/embed/package.json' is not a directory`. Setting `sparse-checkout-cone-mode: false` switches to gitignore-style patterns that accept individual files. The fixed-path entries (`.github/actions/prepare-firebase-deploy`, `${{ inputs.firebase-config-path }}`) are single-segment so cone-vs-no-cone matching behavior is identical for them; only the variable `extra-checkout-paths` input benefits.

## [0.4.0] - 2026-05-27

### Added

- **build.yml reusable matrix (shift-left release validation).** Extracted the 10-cell build matrix from `release.yml` into a new reusable workflow `build.yml`. `ci.yml` now calls it with `upload: false` on every PR commit and every squash-merge to `main` (via the `release-build-smoke` job), so PRs exercise the exact surface a tag push would — including cross-platform `bun compile` binaries, `.deb` packaging, `.vsix` build, action-mirror staging, and embed CDN integrity. `release.yml` calls the same workflow with `upload: true`, gated on tag push. Root cause of the v0.3.0 failed release run ([#26337633859](https://github.com/lolay/nowline/actions/runs/26337633859)) — CI did not cover cross-target binary and `vsce package` paths — is now structurally closed.
- `@nowline/lsp` is now published to npm — third-party editors (Neovim, JetBrains, Helix, Emacs, …) can install and run the language server via `npx nowline-lsp` or pin the package directly. Previously this package was workspace-only; the README always documented the `npx nowline-lsp` path but it wasn't deliverable until this release.
- **m4.7 — browser tooling extraction.** Four new packages plus a canonical sample roadmap, all Apache-2.0 and shipped through the existing `release.yml` pipeline. See [`specs/handoffs/handoff-m4.7-browser-pipeline.md`](./specs/handoffs/handoff-m4.7-browser-pipeline.md) for the full rundown.
  - `@nowline/browser` — single-call browser pipeline at [`packages/browser/`](./packages/browser/). `parseSource(source, options)` and `renderSource(source, options)` consolidate the previously-duplicated parse → resolveIncludes → layout → render glue from `@nowline/embed` and `@nowline/vscode-extension`. Pluggable `readFile` and `assetResolver` hooks let the embed pass `noOpIncludeReadFile` (warn-once + skip) while VS Code passes a `node:fs`-backed reader, without `@nowline/browser` ever importing `node:fs`.
  - `@nowline/preview-shell` — framework-agnostic viewport chrome at [`packages/preview-shell/`](./packages/preview-shell/). `mountPreview(rootEl, options) → PreviewHandle` ships zoom / pan / Figma-style keyboard presets (`1`/`2`/`3`/`0`) / Fit Page / Fit Width / minimap / clickable diagnostic table — all the behaviour that used to live inline in the VS Code webview's HTML template. Uses neutral `--nl-preview-*` CSS custom properties; a `VSCODE_THEME_BRIDGE_CSS` export maps them to VS Code's `--vscode-*` palette.
  - `@nowline/lsp-worker` — browser-side packaging of `@nowline/lsp` at [`packages/lsp-worker/`](./packages/lsp-worker/). `./worker` runs `createNowlineServices` over `BrowserMessageReader` / `BrowserMessageWriter`; `./client` exports `createNowlineLanguageClient` with `didOpen` / `didChange` / `didClose` / `onDiagnostics` / `completion` / `hover` / `definition` / `references` / `dispose`. The client guards the LSP range-delta contract from [`specs/lsp.md`](./specs/lsp.md) § Document sync by rejecting whole-document `didChange` and throwing if the server ever advertises non-`Incremental` `textDocumentSync`.
  - `examples/showcase.nowline` — canonical sample roadmap (two swimlanes, one parallel + group, one anchor, one milestone). Available as `nowline --init --template showcase`; re-exported as a string from `@nowline/browser` via a generated module so downstream apps can ship it as empty-state content without copy-paste drift.
- `packages/embed/scripts/bundle.mjs` now fails the dev IIFE build outright in CI when any of `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_APP_ID` is unset, instead of silently shipping a non-functional auth gate to `embed.nowline.dev`. Local `pnpm bundle:dev` keeps the existing graceful-degradation path (`startDevAuthGate` console.warns and exits) so laptop work isn't blocked. The error message points to the infrastructure deploy runbook § 2.5 for the operator-side fix.
- **DSL: inline date pins on `after:` and `before:`.** Bind an item, group, or parallel directly to a calendar position with `after:2026-03-15` / `before:2026-04-13` (or mixed lists like `after:[upstream, 2026-03-15]`) without declaring a named anchor. The heavyweight `anchor` declaration is still the right tool when you want a chart-spanning cut line and header diamond; inline dates fill the very common one-off-pin case with a quiet per-entity visual.
- `@nowline/embed` now deploys to `embed.nowline.io` on every release. The `pack-embed` cell of the release matrix builds a CDN-shaped artifact at `dist-cdn-prod/{X.Y.Z,X.Y,latest}/`, and a new `embed-prod` job ships it to Firebase Hosting via Workload Identity Federation, lock-step with `npm publish @nowline/embed`. Use `<script src="https://embed.nowline.io/latest/nowline.min.js">` (or pin a specific version).
- `packages/embed/examples/index.html` — a self-contained runnable harness demonstrating the four public entry points (`auto-scan` of fenced ` ```nowline ` blocks, manual `nowline.render()`, `nowline.parse()` with diagnostics, theme switching via `initialize()` + `run()`). Surfaces `nowline.version` and `nowline.sha` in the page chrome so the running build is identifiable.
- VS Code extension: `Nowline: Show Source` command and a reverse-direction title-bar button on the preview panel. Click it to jump back to the source `.nowline` file (revealing an existing editor if visible, otherwise opening it beside the preview).
- [`AI_POLICY.md`](./AI_POLICY.md) at the repo root, a pointer subsection in [`CONTRIBUTING.md`](./CONTRIBUTING.md), and a required `Assisted-by: <agent name + version>` trailer on every AI-assisted commit (also surfaced in the PR template). The trailer convention follows the [Linux Kernel](https://docs.kernel.org/process/coding-assistants.html), [LLVM](https://github.com/llvm/llvm-project/blob/main/llvm/docs/AIToolPolicy.md), Fedora, and OpenTelemetry.
- VS Code extension: committed `packages/vscode-extension/.vscode/launch.json` makes F5 a single-keystroke Extension Development Host launch (with `pnpm build` as the preLaunchTask). Two configs ship: `Run Extension` (default) and `Run Extension (no other extensions)` for clean-room repros that disable every other installed extension.

### Changed

- CI now exercises the full 10-cell release build on every PR and main push via `release-build-smoke` calling `build.yml` (`upload: false`). The previous `compile-smoke` job (host-only `bun compile`) is replaced.
- The bump commit produced by `cut-release` (`author.email = nowline-release-bot@lolay.com`) skips the heavy `release-build-smoke` matrix via an `if:` filter in `ci.yml` — lint/test/typecheck still run; the 10-cell matrix is skipped because `release.yml` is already running the same cells in parallel with `upload: true`.
- VS Code extension `engines.vscode` and `@types/vscode` floors are now managed by a Cursor-tracking policy instead of Renovate. Both are set to `^1.105.0`, matching the VS Code engine embedded in Cursor stable 3.5.33. Going forward, `.github/workflows/cursor-engine-sync.yml` opens a monthly Copilot-agent task that bumps the floors 30 days after Cursor adopts a new VS Code engine, gated on a clean CI run. `@types/vscode` is pinned in Renovate to prevent independent bumps that would re-introduce the `vsce` floor mismatch that broke the v0.3.0 release ([run #26337633859](https://github.com/lolay/nowline/actions/runs/26337633859)).
- `cursor-engine-sync.yml` auth simplified from a GitHub App with user-to-server token + refresh-chain rotation to a single fine-grained PAT (`CURSOR_ENGINE_SYNC_PAT`). The original App pattern was needed because Copilot assignment requires a user-associated identity; we discovered the non-atomic gap between OAuth refresh-token consumption and secret-store persistence is a genuine fragility (a mid-rotation failure breaks the refresh chain). A user-issued fine-grained PAT satisfies the Copilot identity requirement without any of the rotation machinery — removed `scripts/refresh-copilot-app-token.sh` and the four `COPILOT_APP_*` secrets + `COPILOT_APP_ID` variable. The App-based version is preserved at commit `08c4533` for reference.
- **`cursor-engine-sync.yml` replaced by a deterministic monitor + analyzer pair.** The Copilot-agent-driven approach (monthly issue → Copilot SWE-agent → PR with auto-merge) was replaced because non-deterministic LLM execution is not appropriate for a deterministic task. The new architecture separates concerns: a daily `editor-release-monitor.yml` workflow maintains per-fork release history in `.github/*-release-history.json` (no network-heavy downloads on the weekly path); a weekly `vscode-extension-engine-bump.yml` workflow reads those files, computes the 30-day-grace-filtered semver-min across all tracked forks, and opens a structured GitHub Issue when `MAJOR.MINOR` should advance. The issue is the deliverable for a separate generic issue-to-PR worker; this workflow has no opinion on how the work is executed. No custom secrets or PATs are required — both workflows run on the default `GITHUB_TOKEN`. The `CURSOR_ENGINE_SYNC_PAT` secret previously set in the repo can be deleted.
- Auto-merge is now enabled on `main`, gated on a branch ruleset that requires every CI job in [`ci.yml`](./.github/workflows/ci.yml) to pass. Renovate's minor/patch PRs and the `cursor-engine-sync` agent's PRs land themselves once CI is green; Renovate **major** bumps and hand-authored PRs continue to require a human merge click. See [`CONTRIBUTING.md` § Auto-merge policy](./CONTRIBUTING.md#auto-merge-policy) for the full contract.
- **m4.7 consumer rewires.** `@nowline/embed`'s pipeline is now a thin shim that wraps `renderSource` / `parseSource` from `@nowline/browser`, preserving the Mermaid-shaped throwing-error contract and the page-scoped warn-once latch for skipped `include` directives (auto-scan, the Mermaid surface, the dev auth gate, the esbuild bundle, and the 175 KB gzipped CI gate all stayed put). `@nowline/vscode-extension`'s render pipeline shrank to a `node:fs`-backed `readFile` + `createAssetResolver(assetRoot)` forwarded to `renderSource`; the webview's `shell-html.ts` is now a small CSP-aware HTML wrapper that loads a bundled `preview-webview.js` script which calls `mountPreview` from `@nowline/preview-shell`. The host ↔ webview `postMessage` protocol is unchanged, so `extension.ts` handlers and the m3c integration tests don't shift.
- VS Code extension: removed the redundant `Nowline: Open Preview` command from the editor / explorer / title-bar context menus (still available from the command palette and via the existing `Cmd/Ctrl+Shift+V` keybinding). `Open Preview to the Side` is the canonical menu entry, matching how Markdown's title-bar UX has settled.
- Toolchain bumps for fork rebuilders: pnpm 10 → 11 (with `onlyBuiltDependencies` → `allowBuilds` migration in `pnpm-workspace.yaml`), TypeScript 5.7 → 6.0, Vitest 3 → 4, `@types/node` 22 → 25, plus per-package majors (firebase 12, happy-dom 20, esbuild 0.28, pdfkit 0.18, `@clack/prompts` 1, `@actions/core` and `@actions/exec` 3). No user-visible behavior change.
- GitHub Actions used by the release pipeline bumped to current majors: `pnpm/action-setup@v6`, `google-github-actions/auth@v3`, `w9jds/firebase-action@v15`. Internal-only change.
- `CONTRIBUTING.md` "Working on the VS Code / Cursor extension" restructured from two iteration loops (Fast / Full) into three (F5 / sandboxed profile via `--user-data-dir` + `--extensions-dir` / in-place `--force`). The sandboxed-profile loop preserves the marketplace install instead of clobbering it; new Gotchas note explains why renaming `publisher`/`name` for side-by-side install is not the right answer.
- README `## Quick start` and `## Status` rewritten for post-v0.1.0 reality: `brew install lolay/tap/nowline`, `npm install -g @nowline/cli`, plus links to the .deb / .exe / Marketplace artifacts. `SECURITY.md` "Supported versions" updated to the `0.x` policy (latest `0.x.y` supported; older `0.x` lines are not). Stale `apt install` reference dropped (we ship `.deb` assets, not an apt repo).
- Embed CDN deploy runbook moved to the infrastructure repository (`ops/embed-deploy.md`) so the env-per-stack `terraform output` invocations stay accurate alongside the stacks they describe.
- `specs/releasing.md` "After release" verification list now enumerates all 17 published `@nowline/*` packages explicitly (was a single `npm view @nowline/cli version` placeholder). Includes the four packages first published in v0.4.0 (`@nowline/browser`, `@nowline/preview-shell`, `@nowline/lsp`, `@nowline/lsp-worker`) and `@nowline/config` (new this release).

### Fixed

- `@nowline/config` is now published to npm, fixing `npm install -g @nowline/cli`'s workspace-dep resolution failure (`ERESOLVE` on `@nowline/config@0.x.y`). `@nowline/cli`'s tarball lists `@nowline/config` as a runtime dep; with the package absent from the registry, npm-installed CLI was broken. The primary distribution channels (Homebrew, `.deb`, GitHub Releases, VS Code Marketplace) are unaffected — they use `bun compile` binaries where `@nowline/config` is bundled at compile time. Resolves the v0.4.0 `[Unreleased]` Known Issue.
- `specs/releasing.md` publish matrix table corrected to reference `softprops/action-gh-release@v3` (was `@v2`). Doc-only — the workflow has run on `@v3` since before v0.4.0.
- Embed CDN deploy: pin `w9jds/firebase-action` to `v15.18.0` instead of `v15`. The action publishes specific patch tags only (`v15.X.Y`); there is no moving major-only `v15` ref, so the previous pin failed to resolve (`Unable to resolve action w9jds/firebase-action@v15`) and broke the `embed.nowline.dev` deploy step on every push to `main`. Reproduced in [run 26263517719](https://github.com/lolay/nowline/actions/runs/26263517719/job/77301975164).
- Embed CDN deploy: bootstrap the local `prepare-firebase-deploy` composite action with a minimal pre-checkout step in each caller (`embed-dev`, `embed-preview`, `embed-prod`). The composite was extracted from inline steps in commit `ae8702d`, but local composite actions can't be loaded until their `action.yml` is on disk — and the composite's own (broader) sparse-checkout fires too late. The error surfaced once the `v15` pin above was fixed. Reproduced in [run 26264969442](https://github.com/lolay/nowline/actions/runs/26264969442).
- Embed CDN deploy: rephrased two `${{ vars.X }}` references in the `prepare-firebase-deploy` composite action's input descriptions. GitHub Actions evaluates `${{ … }}` expressions in `description` text, and the `vars` context is not available inside composite actions — so manifest validation rejected the file with `Unrecognized named-value: 'vars'`. Surfaced once the bootstrap fix above let the manifest load. Reproduced in [run 26265376977](https://github.com/lolay/nowline/actions/runs/26265376977).
- Embed CDN deploy: include `.github/actions/prepare-firebase-deploy` in the composite action's own `sparse-checkout` list. The composite's first step is `actions/checkout@v6` parameterized by `firebase-config-path`, which wipes the workspace and leaves only the firebase config — including the manifest the runner was loaded from. Steps run fine, but the post-phase cleanup then fails with `Can't find 'action.yml' … Did you forget to run actions/checkout?` after the `firebase deploy` step has already published. Reproduced in [run 26268913877](https://github.com/lolay/nowline/actions/runs/26268913877).
- Embed CDN deploy: reference `vars.PROJECT_ID` (the actual variable name emitted by the infrastructure repository's WIF outputs and configured on both the `embed-dev` and `embed-prod` GitHub environments) instead of the never-populated `vars.FIREBASE_PROJECT_ID`. The empty expression was being passed to `firebase deploy --only hosting --project '' --non-interactive`, which caused the CLI to consume `--non-interactive` as the project name and fail with `Failed to get Firebase project --non-interactive`. Updated `release.yml` and `embed-cdn.yml` deploy steps plus the `prepare-firebase-deploy` preamble and m4 handoff to match the canonical name. Reproduced in [run 26269428360](https://github.com/lolay/nowline/actions/runs/26269428360).
- Embed CDN deploy: land the downloaded CDN artifact under `packages/embed/firebase/{dev,prod}/public/` (was `packages/embed/dist-cdn-{dev,prod}/`) and update each `firebase.json` to `"public": "public"`. Firebase tools refuse a `public` path that escapes the directory containing `firebase.json` (`Error: ../../dist-cdn-dev is outside of project directory`); colocating the artifact and the config inside one project directory satisfies that constraint without touching the bundler's local output path (`packages/embed/dist-cdn-{dev,prod}/`, still authored by `bundle.mjs` and read by `check-size.mjs`). Reproduced in [run 26292909615](https://github.com/lolay/nowline/actions/runs/26292909615).

### Removed

- `.github/workflows/cursor-engine-sync.yml`, `.github/cursor-engine.json`, `.github/cursor-engine.schema.json`, and `.github/copilot-prompts/cursor-engine-sync.md` — superseded by the deterministic monitor + analyzer pair described above. Release history is now tracked in `.github/cursor-release-history.json` (and a per-fork schema at `.github/cursor-release-history.schema.json`); the old point-in-time state file is no longer needed.

## [0.3.0]

Tagged on 2026-05-23 but not released — the release pipeline failed in the `build` phase (see [run #26337633859](https://github.com/lolay/nowline/actions/runs/26337633859)). No artifacts published. All content originally targeted for `v0.3.0` shipped under [`v0.4.0`](#040---2026-05-27).

## [0.2.0]

Reconstructed from git history — these entries shipped with `v0.2.0` (commit `38352de`) but were never moved out of `[Unreleased]`. Versioning is `0.x`, so DSL renames are allowed between minor versions per [`specs/releasing.md`](./specs/releasing.md#versioning-scheme).

### Added

- Status aliases for international audiences: `active` (= `in-progress`) and `completed` (= `done`). Both spellings are valid input; aliases canonicalize at the layout boundary so downstream consumers see one normalized form.
- Color aliases for international audiences: `grey` (= `gray`) and `violet` (= `purple`). Both spellings are valid input; aliases canonicalize at the theme boundary so themes don't grow new fields.

### Changed

- **DSL rename:** `glyph` config keyword → `symbol`. No in-code alias provided. Update files using `glyph budget unicode:"💰"` to `symbol budget unicode:"💰"`.
- **DSL rename:** shadow value `fuzzy` → `soft`. Update files using `shadow:fuzzy` to `shadow:soft`. The `nl-*-root-shadow-fuzzy` SVG filter id becomes `nl-*-root-shadow-soft`.
