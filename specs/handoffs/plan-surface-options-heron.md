# Plan: m4.13 shared surface options and one staging function (R4)

Saved at kickoff as `specs/handoffs/plan-surface-options-heron.md` on branch `claude/serene-archimedes-ida865`; handoff beside it.

## Context

The v0.8.6 review (`specs/review-since-v086.md`, finding 5) found that every render surface (CLI render, `--serve`, MCP, VS Code) resolves theme, width, now, page size, non-working and asset root its own way, and that four pipelines (export kernel, browser, `--serve`, MCP insights) each re-implement parse, resolve includes, load logo, lay out. Consequences: `--serve` ignores `--width`/`--no-links`/`--strict`; MCP accepts any width and defaults `now` to UTC; MCP insights lay out without the logo; the logo is read two or three times per render. `specs/surface-options.md` is the accepted design (decisions 1-5, Gary 2026-10-13). This plan implements its migration milestones m1-m2, step for step, plus decision 5 (`assetRoot` rc key) as its own behaviour step at the end of m1.

Read before any step: `specs/surface-options.md` (all), `AGENTS.md`, `CONTRIBUTING.md`, `.changelog/README.md`, `.claude/skills/steward/SKILL.md`.

## State found at planning (2026-10-13, main at c34804c)

- R1 (m4.11) has not landed: `ExportInputs` (`packages/export-core/src/types.ts:10-28`) has no schedule or wave plan. Re-check at m2.s3 (decision 1).
- `@nowline/config` deps: `js-yaml` only. `mergeConfig` is used only in tests (`packages/config/test/load-config.test.ts`, `packages/cli/test/config/config.test.ts`) and re-exported by `packages/cli/src/io/config.ts:8`.
- Shared parsers: `THEME_NAMES`/`normalizeThemeName` (`packages/layout/src/themes/index.ts`), `NON_WORKING_DISPLAYS` (`layout/src/non-working-display.ts`), `normalizeZone`/`resolveToday`/`TimezoneError` (`layout/src/resolve-today.ts`), `parsePageSize` (`export-core/src/pdf-page.ts`).
- CLI `parseWidth` (`cli/src/commands/render.ts:677-688`) uses `parseInt`, so `"1200px"` passes. The schema keeps that exact rule (byte-identical CLI behaviour).
- MCP `width` exists only on `render` (`mcp/src/server.ts:636-641`); `nowSchema` accepts `YYYY-MM-DD` or `-` only; `validate` does not use `diagnosticsErrorBlock`.
- VS Code extension has no unit tests (its `test` script runs smoke scripts). `option-resolver.ts` is pure; preview errors reach the webview only as `RenderOutcome {kind:'diagnostics', rows}` (`preview/preview-panel.ts:378-384`).
- `@nowline/renderer` has `@nowline/core` as a devDependency only; `roadmapLogoRef` lives in `layout/src/header-logo.ts:24`.
- No `.nowlinerc` exists under `examples/` or `tests/`.

## Run-wide rules (every worker)

- **Gates (spec §4).** G1 (CLI SVG + exit status for every `examples/**.nowline` and `tests/*.nowline`, three themes, `--now 2026-02-09`), G2 (`make pre-commit`, no `UPDATE_*` env), G3 on steps touching kernel or renderer (`make determinism` without `UPDATE_DETERMINISM_GOLDENS`, plus `-f png|pdf|html|xlsx|msproj|mermaid` bytes per sample). Byte identity is transitive across steps, so the reference trees are rendered once from the last `origin/main` merged into the branch, cached in `.scratch/gates/ref-<sha>/` (gitignored, rebuilt when missing or after a main merge), and every step compares against them. Use spec §4's script; write it to `.scratch/gates/run.sh` if missing. A worker reports the gate commands and results in its artifact.
- **Merging main.** At the start of each wave the worker runs `git fetch origin main`; if the branch is behind, it merges `origin/main` (merge commit, subject `<first step ID> Merge origin/main`, never rebase), resolves conflicts per the steward skill (keep both sides; narrow ours where main already landed part of it; restamp the French man page), rebuilds the gate reference, and runs `make pre-commit` before starting the step.
- **Behaviour steps** each add their own fragment under `.changelog/` (named for the change, not the branch, since one branch carries several) and update the docs named in the step. Pure refactor steps add none.
- **Man pages.** Any edit to `packages/cli/man/nowline.1` or `nowline.5` carries the change into `man/fr/` and restamps it in the same commit.
- **MCP.** Any step touching `packages/mcp/` runs `make pack-mcpb` after `make pre-commit`.
- **No message text changes** except where a behaviour step names it. Existing message assertions are the proof.
- Public repo: write nothing about private sibling repos.

## m1 - One options schema

#### s1 - [deep] Add the schema to `@nowline/config`

Add `packages/config/src/surface-options.ts` per spec §3.1: `SurfaceOptionKey`, `SurfaceOptions`, `OptionSource`, `OptionLayer`, `OptionError`, `NowPolicy`, `resolveSurfaceOptions`, `rcLayer`, one parser per option (theme via `normalizeThemeName`; width via the CLI's exact `parseInt` integer ≥ 320 rule; now via `resolveToday`, `-` suppresses; pageSize via `parsePageSize`; nonWorking via `NON_WORKING_DISPLAYS`), and the rc-key table (`theme`, `width`, `pdfPageSize`; `now`/`nonWorking` none). Include `assetRoot` in the key table only as a recorded rc key with no consumer yet (m1.s7 wires it). Expose a way for a surface to register extra option specs (the CLI-only keys in s2) on the same layer mechanism. Type `NowlineRc`'s schema-owned keys. Add `@nowline/layout` and `@nowline/export-core` deps (no cycle). Export from `src/index.ts`.
Acceptance: table-driven tests per option and per source kind, precedence, exact `OptionError` fields, "a valid higher layer hides a bad lower one"; no caller changes; G2.

#### s2 - [exec] Use it in CLI render

Replace `render.ts:127-151` and `pickSetting`/`stringFromConfig`/`boolFromConfig`/per-key parsers with one resolution over flag and rc layers; register `defaultFormat`, `pdfOrientation`, `pdfMargin`, `fontSans`, `fontMono`, `headlessFonts`, `useSystemFonts`, `locale` as CLI option specs; `resolveTheme` in `cli/src/cli/theme.ts` goes through the schema; format `OptionError` with today's exact templates. Delete `mergeConfig` (and its re-export and tests) or reimplement on layers. Keep `resolveNowCli`'s `--timezone` handling via `NowPolicy`.
Acceptance: `cli.rc.test.ts`, `render-rc.test.ts`, `cli.render.test.ts` pass unchanged; G1, G2.

#### s3 - [exec] Use it in MCP

`theme`, `pageSize`, `nonWorking`, `now` arguments resolve through the schema (one `argument` layer); `parseThemeArg`/`parsePageSizeArg` in `mcp/src/diagnostics.ts:276-305` go; `InputRequiredError` text unchanged. `width` keeps accepting any number (until s5) and `now` keeps UTC (until s6), e.g. by passing a UTC `NowPolicy`.
Acceptance: `option-normalizers.test.ts`, `mcp.smoke.test.ts` unchanged; G1, G2; `make pack-mcpb`.

#### s4 - [exec] Use it in the VS Code extension

`preview/option-resolver.ts` parses rc values through `rcLayer`, keeping "toolbar, setting, rc, editor theme" precedence and its silent ignore of bad rc values. Diagram-theme literal unions become `ThemeName` (spec §3.2 list: `export/in-process.ts`, `export/cli-runner.ts`, `extension.ts`, `preview/preview-panel.ts`, and `preview-shell/src/apply-result.ts`, `mount.ts` as type-only imports). Add a minimal vitest setup for the extension's pure modules, run by `make test`, with tests for `resolvePreviewOptions` precedence; this is also where s5's tests go.
Acceptance: new resolver tests; extension smoke scripts pass; G1, G2.

#### s5 - [exec] *Behaviour:* one width rule

Decision 4. MCP `render`'s `width` argument: integer ≥ 320 or `InputRequiredError` in MCP's existing wording style. VS Code: a bad `nowline.preview.width` setting or rc `width` is reported as a row in the preview's diagnostic table (synthetic `DiagnosticRow`, merged into the outcome before `postOutcome`) and the width falls back to fit-content. Add parity tests (spec §5): one table of option inputs through CLI, MCP and extension resolution giving the same `SurfaceOptions` for width.
Docs: `specs/mcp.md` (width), `specs/ide.md` (preview diagnostics for bad width), extension README if it documents the setting. Fragments: `.changelog/one-width-rule.txt` (`changed`), `packages/vscode-extension/.changelog/one-width-rule.txt` (`changed`).
Acceptance: G1, G2; `make pack-mcpb`.

#### s6 - [exec] *Behaviour:* one `now` default

Decision 2. MCP's omitted `now` becomes the local civil date; new optional MCP `timezone` argument accepting `--timezone`'s forms (via `normalizeZone`; bad zone is an input error in MCP wording) on every tool that takes `now` (`render`, `export`, `validate`, and any other caller of `todayUtc`, such as `convert`). `todayUtc()` (`server.ts:197-207`, `:383`, `convert`) goes. Rewrite the `now` description (`server.ts:600-608`) to drop UTC, reversing #122's wording. Parity table extends to `now`.
Docs: `specs/mcp.md` (replace the UTC wording, document `timezone`). Fragment `.changelog/mcp-now-local.txt` (`changed`).
Acceptance: G1, G2; `make pack-mcpb`.

#### s7 - [exec] *Behaviour:* `.nowlinerc` `assetRoot`

Decision 5. `assetRoot` becomes an official rc key and the default for `--asset-root` in CLI render (and, via the shared resolution, `--serve` once m2.s7 lands; wire serve's resolution here too if it already reads the rc). A relative rc value resolves against the `.nowlinerc` file's directory (a flag still resolves against cwd); flag wins; a non-string value is a usage error with the existing `invalid .nowlinerc <key>` template. The VS Code extension keeps reading it through `rcLayer`.
Docs: `specs/cli.md` `.nowlinerc` table (`:389-402`) and `--asset-root` text; `packages/cli/man/nowline.1` if it lists rc keys (plus French restamp). Fragment `.changelog/rc-asset-root.txt` (`added`).
Acceptance: CLI tests for rc relative path, flag override, bad type; G1, G2.

## m2 - One staging function

#### s1 - [deep] Add `stageRoadmap`

Add `packages/renderer/src/stage.ts` per spec §3.3 (`StageInputs`, `StageResult` with `invalid` / `include-error` / `staged`), exported from `@nowline/renderer`; make `@nowline/core` a runtime dependency of renderer. It parses and validates (or reuses `document`), resolves includes, applies the include-error precedence once (first uncoded error wins and hides routed ones, `waves.md` §6.1; match `export/src/index.ts:288-298` and `browser/src/pipeline.ts:253-270`, leaving the browser's no-op-include filtering to the browser caller), loads the logo once (warnings returned, `strict` left to callers), lays out. No callers change.
Acceptance: tests per result kind with in-memory `readSource` and `AssetResolver` fakes: validator errors, uncoded include error hiding routed ones, routed errors alone, missing logo (warning, laid out without it), success; G2.

#### s2 - [exec] Read the logo once

`loadLogo` returns `LoadedLogo {ref, dimensions, asset}` (spec §3.4); `renderSvg` accepts `RenderOptions.logo` and embeds those bytes instead of resolving; without it, it resolves as today. Kernel portable and font-pinned renders both pass it; browser and `--serve` callers adapt to the new return type without behaviour change.
Acceptance: a test counting resolver calls: one per kernel export, raster included; G1, G2, G3.

#### s3 - [deep] Stage the export kernel

`stageDocument` becomes `stageRoadmap` plus the kernel's error mapping (plain `Error`, `IncludeResolveError`, `strict` on logo warnings, `onResolveDiagnostics`, `onWarning`). Add `exportStaged(stage, format, inputs, host)`; `exportDocument` = `stageRoadmap` + `exportStaged`, unchanged for callers. `exportStaged` throws when the stage's layout inputs (theme, today, width, locale, non-working) differ from `inputs`. Render the portable SVG only for svg/html/png/pdf. If R1 has landed on main by now, build the wave plan and schedule inside `stageRoadmap` and return them (decision 1); otherwise leave it to R1's m2.s2 and record that in the artifact.
Acceptance: integration-tests kernel suites unchanged plus a mismatch test for `exportStaged`; G1, G2, G3.

#### s4 - [exec] Stage the browser pipeline

`renderSource` calls `stageRoadmap` with the no-op include reader and the host resolver; its `DiagnosticRow` mapping, `onSkippedInclude`, timezone handling, insights and `renderSvg` call stay as they are.
Acceptance: `packages/browser/test/pipeline.test.ts` unchanged; `make determinism-browser` if Chromium is available; G1, G2.

#### s5 - [exec] Stage MCP once per call

`render`, `export`, `validate` stage once, reuse `diagnosticsErrorBlock`'s document (or `validate`'s), read insights from the staged model, and export with `exportStaged`. *Behaviour* for files with `logo:`: insights see the drawn header. Fragment `.changelog/mcp-insights-logo.txt` (`fixed`).
Acceptance: a counting test (one stage per MCP call), a logo insights test; G1, G2, G3; `make pack-mcpb`.

#### s6 - [exec] Stage CLI render once

`produce` stages with the CLI's services, reports diagnostics from the staged document in the operator's locale, calls `exportStaged`; the second parse (`render.ts:266-271`) goes.
Acceptance: a test that one render builds one Langium document; G1, G2, G3.

#### s7 - [exec] *Behaviour:* `--serve` on the shared path

`--serve` resolves options through m1's resolution (so `--width`, rc `width`, rc `assetRoot`, `--no-links`, `--strict` apply), stages with `stageRoadmap`, renders with `noLinks` and `strict`; `resolveNowArg` (`serve.ts:275-296`) goes.
Docs: `specs/cli.md` where it says what `--serve` reads; man page if it does (plus French restamp). Fragment `.changelog/serve-honours-flags.txt` (`fixed`). Also mark the work implemented: `specs/surface-options.md` Status line and the m4.13 entry in `specs/milestones.md`.
Acceptance: `cli.serve.test.ts` tests for each flag; a served SVG equals `nowline <file>`'s SVG for the same flags; G1, G2.

## Verification (end of run)

`make ci` and `make pack-mcpb` green on the final head; G1 and G3 against the reference from the last merged main; `make changelog-check BASE=origin/main REQUIRE=1`; every behaviour step has its fragment and doc update; every refactor step's artifact records its gate results. Then the last commit removes `specs/handoffs/plan-surface-options-heron.md` and its handoff, and I ask before opening the PR (one PR, squash-merged; the spec's "one PR per step" collapses to one commit per step in it).

## Waves (no-thrash grouping, applied at kickoff)

1 [deep] m1.s1 · 2 [exec] m1.s2-s7 · 3 [deep] m2.s1 · 4 [exec] m2.s2 · 5 [deep] m2.s3 · 6 [exec] m2.s4-s7. One working directory, so one group per wave and no canary. Gates crossed: 4 and 2 before wave 3, 2 before wave 5. Rough expected total ~$22 API-equiv (~42M tokens) including the orchestrator; exact Cost table written at kickoff. Runner, so the kickoff question proposes unattended.
