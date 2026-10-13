```
--- KICKOFF: plan complete ---

  Status: 6/6 groups done | completed 2026-10-13

  mode: unattended | proposed unattended (harness=claude-code runner=cloud; CLAUDE_CODE_REMOTE=true, assigned branch) | guard 3x min $50 | fixups 2 | confirmed 2026-10-13 session 3d92f75d-ed43-5e74-a58c-e29cd0970783 by Kickoff prompt: Run in unattended mode.

  review: every-wave (log-only)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-surface-options-heron.md. The plan is already tagged.
    On branch claude/serene-archimedes-ida865 (task branch): subagents commit each finished step.
    Run in unattended mode.
    Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's
    procedure, and pause only where the recorded mode stops. Do not
    execute plan work inline. Update plan progress after each wave
    returns per the skill's procedure. The mode line above is the
    kickoff answer. If the Status line shows BLOCKED, re-post that
    question and wait; otherwise record the mode, print the kickoff
    summary and begin dispatching.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ | actual tokens | actual $ |
|---|---|---|---|---|
| 1 [deep] nowline m1 s1 | ~2.7M | ~$1.4 | ~4.9M | ~$2.74 |
| 2 [exec] nowline m1 s2-s7 | ~8.3M | ~$3.1 | ~31M | ~$9.52 |
| 3 [deep] nowline m2 s1 | ~2.7M | ~$1.4 | ~4.6M | ~$2.70 |
| 4 [exec] nowline m2 s2 | ~2.0M | ~$0.90 | ~3.3M | ~$1.46 |
| 5 [deep] nowline m2 s3 | ~6.1M | ~$3.2 | ~5.2M | ~$2.89 |
| 6 [exec] nowline m2 s4-s7 | ~9.0M | ~$3.3 | ~23M | ~$7.18 |
| orchestrator | ~11M | ~$9.2 | ~19M | ~$10.73 |
| **Total** | ~42M | ~$22 | ~91M | ~$37.22 |

Expected values are estimates, good to about 2-3× per wave.

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

--- WAVE 1 [deep] ---

#### s1 - [deep] Add the schema to `@nowline/config` (done)

Add `packages/config/src/surface-options.ts` per spec §3.1: `SurfaceOptionKey`, `SurfaceOptions`, `OptionSource`, `OptionLayer`, `OptionError`, `NowPolicy`, `resolveSurfaceOptions`, `rcLayer`, one parser per option (theme via `normalizeThemeName`; width via the CLI's exact `parseInt` integer ≥ 320 rule; now via `resolveToday`, `-` suppresses; pageSize via `parsePageSize`; nonWorking via `NON_WORKING_DISPLAYS`), and the rc-key table (`theme`, `width`, `pdfPageSize`; `now`/`nonWorking` none). Include `assetRoot` in the key table only as a recorded rc key with no consumer yet (m1.s7 wires it). Expose a way for a surface to register extra option specs (the CLI-only keys in s2) on the same layer mechanism. Type `NowlineRc`'s schema-owned keys. Add `@nowline/layout` and `@nowline/export-core` deps (no cycle). Export from `src/index.ts`.
Acceptance: table-driven tests per option and per source kind, precedence, exact `OptionError` fields, "a valid higher layer hides a bad lower one"; no caller changes; G2.

--- WAVE 2 [exec] ---

#### s2 - [exec] Use it in CLI render (done)

Replace `render.ts:127-151` and `pickSetting`/`stringFromConfig`/`boolFromConfig`/per-key parsers with one resolution over flag and rc layers; register `defaultFormat`, `pdfOrientation`, `pdfMargin`, `fontSans`, `fontMono`, `headlessFonts`, `useSystemFonts`, `locale` as CLI option specs; `resolveTheme` in `cli/src/cli/theme.ts` goes through the schema; format `OptionError` with today's exact templates. Delete `mergeConfig` (and its re-export and tests) or reimplement on layers. Keep `resolveNowCli`'s `--timezone` handling via `NowPolicy`.
Acceptance: `cli.rc.test.ts`, `render-rc.test.ts`, `cli.render.test.ts` pass unchanged; G1, G2.

#### s3 - [exec] Use it in MCP (done)

`theme`, `pageSize`, `nonWorking`, `now` arguments resolve through the schema (one `argument` layer); `parseThemeArg`/`parsePageSizeArg` in `mcp/src/diagnostics.ts:276-305` go; `InputRequiredError` text unchanged. `width` keeps accepting any number (until s5) and `now` keeps UTC (until s6), e.g. by passing a UTC `NowPolicy`.
Acceptance: `option-normalizers.test.ts`, `mcp.smoke.test.ts` unchanged; G1, G2; `make pack-mcpb`.

#### s4 - [exec] Use it in the VS Code extension (done)

`preview/option-resolver.ts` parses rc values through `rcLayer`, keeping "toolbar, setting, rc, editor theme" precedence and its silent ignore of bad rc values. Diagram-theme literal unions become `ThemeName` (spec §3.2 list: `export/in-process.ts`, `export/cli-runner.ts`, `extension.ts`, `preview/preview-panel.ts`, and `preview-shell/src/apply-result.ts`, `mount.ts` as type-only imports). Add a minimal vitest setup for the extension's pure modules, run by `make test`, with tests for `resolvePreviewOptions` precedence; this is also where s5's tests go.
Acceptance: new resolver tests; extension smoke scripts pass; G1, G2.

#### s5 - [exec] *Behaviour:* one width rule (done)

Decision 4. MCP `render`'s `width` argument: integer ≥ 320 or `InputRequiredError` in MCP's existing wording style. VS Code: a bad `nowline.preview.width` setting or rc `width` is reported as a row in the preview's diagnostic table (synthetic `DiagnosticRow`, merged into the outcome before `postOutcome`) and the width falls back to fit-content. Add parity tests (spec §5): one table of option inputs through CLI, MCP and extension resolution giving the same `SurfaceOptions` for width.
Docs: `specs/mcp.md` (width), `specs/ide.md` (preview diagnostics for bad width), extension README if it documents the setting. Fragments: `.changelog/one-width-rule.txt` (`changed`), `packages/vscode-extension/.changelog/one-width-rule.txt` (`changed`).
Acceptance: G1, G2; `make pack-mcpb`.

#### s6 - [exec] *Behaviour:* one `now` default (done)

Decision 2. MCP's omitted `now` becomes the local civil date; new optional MCP `timezone` argument accepting `--timezone`'s forms (via `normalizeZone`; bad zone is an input error in MCP wording) on every tool that takes `now` (`render`, `export`, `validate`, and any other caller of `todayUtc`, such as `convert`). `todayUtc()` (`server.ts:197-207`, `:383`, `convert`) goes. Rewrite the `now` description (`server.ts:600-608`) to drop UTC, reversing #122's wording. Parity table extends to `now`.
Docs: `specs/mcp.md` (replace the UTC wording, document `timezone`). Fragment `.changelog/mcp-now-local.txt` (`changed`).
Acceptance: G1, G2; `make pack-mcpb`.

#### s7 - [exec] *Behaviour:* `.nowlinerc` `assetRoot` (done)

Decision 5. `assetRoot` becomes an official rc key and the default for `--asset-root` in CLI render (and, via the shared resolution, `--serve` once m2.s7 lands; wire serve's resolution here too if it already reads the rc). A relative rc value resolves against the `.nowlinerc` file's directory (a flag still resolves against cwd); flag wins; a non-string value is a usage error with the existing `invalid .nowlinerc <key>` template. The VS Code extension keeps reading it through `rcLayer`.
Docs: `specs/cli.md` `.nowlinerc` table (`:389-402`) and `--asset-root` text; `packages/cli/man/nowline.1` if it lists rc keys (plus French restamp). Fragment `.changelog/rc-asset-root.txt` (`added`).
Acceptance: CLI tests for rc relative path, flag override, bad type; G1, G2.

## m2 - One staging function

--- WAVE 3 [deep] ---

#### s1 - [deep] Add `stageRoadmap` (done)

Add `packages/renderer/src/stage.ts` per spec §3.3 (`StageInputs`, `StageResult` with `invalid` / `include-error` / `staged`), exported from `@nowline/renderer`; make `@nowline/core` a runtime dependency of renderer. It parses and validates (or reuses `document`), resolves includes, applies the include-error precedence once (first uncoded error wins and hides routed ones, `waves.md` §6.1; match `export/src/index.ts:288-298` and `browser/src/pipeline.ts:253-270`, leaving the browser's no-op-include filtering to the browser caller), loads the logo once (warnings returned, `strict` left to callers), lays out. No callers change.
Acceptance: tests per result kind with in-memory `readSource` and `AssetResolver` fakes: validator errors, uncoded include error hiding routed ones, routed errors alone, missing logo (warning, laid out without it), success; G2.

--- WAVE 4 [exec] ---

#### s2 - [exec] Read the logo once (done)

`loadLogo` returns `LoadedLogo {ref, dimensions, asset}` (spec §3.4); `renderSvg` accepts `RenderOptions.logo` and embeds those bytes instead of resolving; without it, it resolves as today. Kernel portable and font-pinned renders both pass it; browser and `--serve` callers adapt to the new return type without behaviour change.
Acceptance: a test counting resolver calls: one per kernel export, raster included; G1, G2, G3.

--- WAVE 5 [deep] ---

#### s3 - [deep] Stage the export kernel (done)

`stageDocument` becomes `stageRoadmap` plus the kernel's error mapping (plain `Error`, `IncludeResolveError`, `strict` on logo warnings, `onResolveDiagnostics`, `onWarning`). Add `exportStaged(stage, format, inputs, host)`; `exportDocument` = `stageRoadmap` + `exportStaged`, unchanged for callers. `exportStaged` throws when the stage's layout inputs (theme, today, width, locale, non-working) differ from `inputs`. Render the portable SVG only for svg/html/png/pdf. If R1 has landed on main by now, build the wave plan and schedule inside `stageRoadmap` and return them (decision 1); otherwise leave it to R1's m2.s2 and record that in the artifact.
Acceptance: integration-tests kernel suites unchanged plus a mismatch test for `exportStaged`; G1, G2, G3.

--- WAVE 6 [exec] ---

#### s4 - [exec] Stage the browser pipeline (done)

`renderSource` calls `stageRoadmap` with the no-op include reader and the host resolver; its `DiagnosticRow` mapping, `onSkippedInclude`, timezone handling, insights and `renderSvg` call stay as they are.
Acceptance: `packages/browser/test/pipeline.test.ts` unchanged; `make determinism-browser` if Chromium is available; G1, G2.

#### s5 - [exec] Stage MCP once per call (done)

`render`, `export`, `validate` stage once, reuse `diagnosticsErrorBlock`'s document (or `validate`'s), read insights from the staged model, and export with `exportStaged`. *Behaviour* for files with `logo:`: insights see the drawn header. Fragment `.changelog/mcp-insights-logo.txt` (`fixed`).
Acceptance: a counting test (one stage per MCP call), a logo insights test; G1, G2, G3; `make pack-mcpb`.

#### s6 - [exec] Stage CLI render once (done)

`produce` stages with the CLI's services, reports diagnostics from the staged document in the operator's locale, calls `exportStaged`; the second parse (`render.ts:266-271`) goes.
Acceptance: a test that one render builds one Langium document; G1, G2, G3.

#### s7 - [exec] *Behaviour:* `--serve` on the shared path (done)

`--serve` resolves options through m1's resolution (so `--width`, rc `width`, rc `assetRoot`, `--no-links`, `--strict` apply), stages with `stageRoadmap`, renders with `noLinks` and `strict`; `resolveNowArg` (`serve.ts:275-296`) goes.
Docs: `specs/cli.md` where it says what `--serve` reads; man page if it does (plus French restamp). Fragment `.changelog/serve-honours-flags.txt` (`fixed`). Also mark the work implemented: `specs/surface-options.md` Status line and the m4.13 entry in `specs/milestones.md`.
Acceptance: `cli.serve.test.ts` tests for each flag; a served SVG equals `nowline <file>`'s SVG for the same flags; G1, G2.

## Verification (end of run)

`make ci` and `make pack-mcpb` green on the final head; G1 and G3 against the reference from the last merged main; `make changelog-check BASE=origin/main REQUIRE=1`; every behaviour step has its fragment and doc update; every refactor step's artifact records its gate results. Then the last commit removes `specs/handoffs/plan-surface-options-heron.md` and its handoff, and I ask before opening the PR (one PR, squash-merged; the spec's "one PR per step" collapses to one commit per step in it).

## Waves (no-thrash grouping, applied at kickoff)

1 [deep] m1.s1 · 2 [exec] m1.s2-s7 · 3 [deep] m2.s1 · 4 [exec] m2.s2 · 5 [deep] m2.s3 · 6 [exec] m2.s4-s7. One working directory, so one group per wave and no canary. Gates crossed: 4 and 2 before wave 3, 2 before wave 5. Rough expected total ~$22 API-equiv (~42M tokens) including the orchestrator; exact Cost table written at kickoff. Runner, so the kickoff question proposes unattended.

## Review log

review wave-1 (nowline m1 s1) a2fb3b2..5231496: PASS - schema, parsers, rc-key table and surface-registered spec tables match spec §3.1 and today's CLI rules; 72/72 config tests; no caller changes - 2026-10-13
review wave-2 (nowline m1 s2-s7) 910085c..e27c444: PASS - CLI templates, error order and empty-string handling unchanged; MCP and extension through the schema; width rule, MCP local now plus timezone, rc assetRoot with docs, fragments and French man restamp; G1 tree equals ref-c34804c; make pre-commit green - 2026-10-13
review wave-3 (nowline m2 s1) 7aaab18..d7f48cf: PASS - stageRoadmap with invalid/include-error/staged, kernel include precedence, logo once, 9 fake-backed tests, no callers changed; merged origin/main ff8eb8b (3de45e3); check_wave.py flagged only ff8eb8b ('first line ... does not start with one of m2.s1', Co-authored-by, trailers), which is origin/main's own commit reached through the mandated merge; both first-parent commits pass; passed unattended: gate 4, gate 2 - 2026-10-13
review wave-4 (nowline m2 s2) bf004a2..ea3707d: PASS - LoadedLogo per spec §3.4; renderSvg embeds RenderOptions.logo when its ref matches, else resolves; kernel portable and font-pinned renders pass it; staged.logo widened; logo-read-once test 4/4 (svg/html/png/pdf); G1, G2, G3 reported identical - 2026-10-13
review wave-5 (nowline m2 s3) 8c735ef..e48332f: PASS - kernel stageDocument is stageRoadmap plus the old error mapping, message text kept; exportStaged with layout-mismatch check; portable SVG only for svg/html/png/pdf; kernel suites unedited, new export-staged test; R1 not on main, schedule left to R1 m2.s2 (decision 1); G1, G2, G3 reported identical; passed unattended: gate 2 - 2026-10-13
review wave-6 (nowline m2 s4-s7) 9b64c58..9d12547: CONCERNS - worker disclosed: Ran npx vitest directly on single test files in packages/mcp and packages/cli while iterating, and once ran pnpm --filter @nowline/integration-tests exec vitest run --config vitest.browser.config.ts directly; the Makefile-only rule was bypassed. Both ran locally and were not outward. The browser run failed to launch Chromium. I did not run playwright install.; review PASS: found no outward action (branch ref and origin/main unchanged, no tags, no publish in npm logs), and one undisclosed local `npm exec -- tsc --noEmit -p .` in packages/cli, also a Makefile bypass; code, tests, docs, fragments and spec §3.3 follow-ups all check out; check_wave.py ok - 2026-10-13
review wave-6 (nowline m2 s4-s7) 9b64c58..9d12547: WAIVED - waive - 2026-10-13

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`nowline-m1-s2-s7`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`, matched by prefix when long; without the id, the newest `.jsonl` there), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl` in the same directory. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.

tokens orchestrator-kickoff explore-options (claude-opus-5-5): input ~28 / cache read ~850k / cache write ~61k / output ~13k | ~$0.74 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-kickoff explore-staging (claude-opus-5-5): input ~16 / cache read ~420k / cache write ~44k / output ~8k | ~$0.47 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-kickoff plan-surface-options-heron (claude-opus-5-5): input ~96 / cache read ~6.4M / cache write ~0 5m + ~370k 1h / output ~36k | ~$4.94 API-equiv
tokens wave-1 nowline-m1-s1 (claude-opus-5-5): input ~66 / cache read ~4M / cache write ~110k / output ~33k | ~$2.02 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens review-wave-1 nowline-m1-s1 (claude-opus-5-5): input ~28 / cache read ~620k / cache write ~63k / output ~14k | ~$0.72 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-wave-1 nowline-m1-s1 (claude-opus-5-5): input ~18 / cache read ~1.2M / cache write ~0 5m + ~21k 1h / output ~10k | ~$0.61 API-equiv
tokens wave-2 nowline-m1-s2-s7 (claude-sonnet-5-5): input ~260 / cache read ~27M / cache write ~330k / output ~130k | ~$7.55 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens review-wave-2 nowline-m1-s2-s7 (claude-opus-5-5): input ~76 / cache read ~3.1M / cache write ~120k / output ~37k | ~$1.97 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-wave-2 nowline-m1-s2-s7 (claude-opus-5-5): input ~18 / cache read ~1.4M / cache write ~0 5m + ~27k 1h / output ~11k | ~$0.71 API-equiv
tokens wave-3 nowline-m2-s1 (claude-opus-5-5): input ~82 / cache read ~4.1M / cache write ~130k / output ~41k | ~$2.29 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens review-wave-3 nowline-m2-s1 (claude-opus-5-5): input ~16 / cache read ~220k / cache write ~41k / output ~8.1k | ~$0.41 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-wave-3 nowline-m2-s1 (claude-opus-5-5): input ~18 / cache read ~1.6M / cache write ~0 5m + ~23k 1h / output ~11k | ~$0.72 API-equiv
tokens wave-4 nowline-m2-s2 (claude-sonnet-5-5): input ~66 / cache read ~3M / cache write ~69k / output ~33k | ~$1.11 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens review-wave-4 nowline-m2-s2 (claude-opus-5-5): input ~16 / cache read ~180k / cache write ~32k / output ~8k | ~$0.35 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-wave-4 nowline-m2-s2 (claude-opus-5-5): input ~12 / cache read ~1.1M / cache write ~0 5m + ~18k 1h / output ~8.6k | ~$0.53 API-equiv
tokens wave-5 nowline-m2-s3 (claude-opus-5-5): input ~82 / cache read ~4.7M / cache write ~150k / output ~39k | ~$2.47 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens review-wave-5 nowline-m2-s3 (claude-opus-5-5): input ~18 / cache read ~280k / cache write ~37k / output ~9k | ~$0.42 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-wave-5 nowline-m2-s3 (claude-opus-5-5): input ~12 / cache read ~1.2M / cache write ~0 5m + ~21k 1h / output ~9.8k | ~$0.59 API-equiv
tokens wave-6 nowline-m2-s4-s7 (claude-sonnet-5-5): input ~230 / cache read ~22M / cache write ~260k / output ~120k | ~$6.16 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens review-wave-6 nowline-m2-s4-s7 (claude-opus-5-5): input ~42 / cache read ~1M / cache write ~74k / output ~22k | ~$1.02 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783
tokens orchestrator-wave-6 nowline-m2-s4-s7 (claude-opus-5-5): input ~26 / cache read ~2.9M / cache write ~0 5m + ~31k 1h / output ~10k | ~$1.03 API-equiv
tokens orchestrator-final verification-nowline (claude-opus-5-5): input ~20 / cache read ~190k / cache write ~31k / output ~10k | ~$0.39 API-equiv (output est.) session 3d92f75d-ed43-5e74-a58c-e29cd0970783

## Completion summary

- **Done:** m1 (one options schema) and m2 (one staging function), 14 steps in 6 waves, one commit per step: m1.s1 5231496, m1.s2 2229e57, m1.s3 55f7bb1, m1.s4 3ed7afd, m1.s5 7fe1cbd, m1.s6 d1705a2, m1.s7 e27c444, m2.s1 d7f48cf (after merge 3de45e3 of origin/main ff8eb8b), m2.s2 ea3707d, m2.s3 e48332f, m2.s4 d4da29a, m2.s5 57d711d, m2.s6 8ccb470, m2.s7 9d12547.
- **Reviews:** waves 1-5 PASS; wave 6 review PASS, logged CONCERNS for a worker-disclosed Makefile bypass (local only), waived by Gary.
- **Final verification (read-only reviewer on b38315e):** `make ci` exit 0; `make pack-mcpb` exit 0; `make changelog-check BASE=origin/main REQUIRE=1` exit 0 with 7 fragments; every behaviour step has its fragment and docs; no new mention of private sibling repos. G1/G3 rest on each refactor step's worker report against `ref-ff8eb8b` (identical to `ref-c34804c`).
- **Decision 1:** R1 (m4.11) had not landed on main, so the schedule and wave plan stay with R1's m2.s2.
- **Spend:** ~$37.22 API-equiv against ~$22 expected (waves 2 and 6, the multi-step Sonnet waves, ran about 3x and 2x their estimates). Subagent lines are `(output est.)`.

**Deviations from plan**

- Checkpoints passed unattended: gate 4 and gate 2 before wave 3; gate 2 before wave 5.
- Gate 4's milestone handoff file was written as a section of the session handoff, since this plan's m1/m2 are the spec's internal milestones inside repo milestone m4.13.
- Wave 3: `check_wave.py` failed only on ff8eb8b, origin/main's own commit reached through the mandated merge; logged PASS with the failure quoted, since a fix-up would have to reword a commit on main.
- Wave 6: worker ran vitest (and once tsc) outside the Makefile while iterating; gate 1, waived. `make determinism-browser` was not run (Playwright wants chromium_headless_shell-1243, the runner has 1194, and the target runs `playwright install`).
- Parent bookkeeping commits a2fb3b2 and 910085c have `Assisted-by:` above `Claude-Session:`; left as is (dropped by the squash merge).
- No fix-ups and no automatic retries.
