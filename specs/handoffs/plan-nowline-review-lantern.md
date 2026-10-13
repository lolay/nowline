```text
--- KICKOFF: begin orchestration at [deep] ---

  Status: 1/4 groups done | last review: wave-1 PASS | current: nowline m2 s1-s6 [exec] | updated 2026-10-13

  mode: unattended | proposed unattended (harness=claude-code runner=cloud; CLAUDE_CODE_REMOTE=true, assigned branch) | guard 3x min $50 | fixups 2 | confirmed 2026-10-13 session 8c78f794-2944-59bb-8116-4413104e9100 by Kickoff prompt: Run in unattended mode.

  review: every-wave (log-only)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-nowline-review-lantern.md. The plan is already tagged.
    On branch claude/ecstatic-babbage-qsrxbx (task branch): subagents commit each finished step.
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

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [exec] nowline m1 s1, m2 s1-s6 | ~4.8M | ~$2.1 |
| 2 [deep] nowline m3 s1-s3 | ~9.5M | ~$5.0 |
| 3 [xdeep] nowline m3 s4 | ~11M | ~$6.8 |
| orchestrator | ~7.8M | ~$7.1 |
| **Total** | ~33M | ~$21 |

Expected values are estimates, good to about 2-3× per wave.

# Plan: nowline review follow-ups (v0.8.6 to main)

## Context

Gary asked for a review of nowline changes since its last release (v0.8.6, 2026-10-01; PRs #72-#144), consistency with the other repos, and whether nowline needs refactoring to make those changes cleaner. This plan covers only the public repos, `lolay/nowline` and `lolay/nowline-action`. Findings about the private repos are held for Gary's own follow-up and must not be written to this repo. nowline-action is a write-only mirror (`action.yml` + `dist/` synced by `release.yml`); its only change since 10-01 was the v0.8.6 cut.

Line refs below are at origin/main 0062df3 (#144).

## Verdict

The features are well built at the feature level: waves (m2o) and the working calendar (m2p) are specified, tested to a high bar (engine A/B/C agreement tests, golden i18n strings, fr parity for every new code), and calendar date math lives once in `WorkingCalendar`. The debt is structural. Both features were bolted onto the composition root and the validator instead of the measure/place node model m2.5c promised, and the same rules now live in two or three hand-synced copies. nowline does need refactoring, but targeted: four changes carry most of the value (scheduler unification, a core AST/style/calendar utility layer, a shared options schema with one staging function, layout phases).

## Findings since v0.8.6

**Done well.** `WorkingCalendar` (`packages/layout/src/working-calendar.ts`) is the single date-math implementation reused by TimeScale, view-preset, schedule and every exporter; per-exporter duration tables are gone. `-q` goes through a real `Log` abstraction (`packages/cli/src/io/log.ts`). Diagnostic codes have a registry and a both-directions coverage test (`packages/core/src/i18n/codes.ts`, `test/i18n/messages-coverage.test.ts`). Fragment changelogs (#133) remove the merge-queue conflict class. No TODO/FIXME added.

**Structural drift (the refactor case).**

1. Layout has no phase separation. `RoadmapNode.place` (`packages/layout/src/nodes/roadmap-node.ts:272-1128`) grew from 612 lines at v0.8.6 to 856 in one method and applies ~10 post-placement fixups: wave barrier re-placement up to n+1 times, slack-corridor rerun (~714), a timeline extension that swaps `ctx.scale` after items were placed, lane re-stretch, a marker re-pack that patches milestones, a marker band `deltaY` shift (~933), footnotes built twice. Three fixes this cycle were ordering bugs (#80, #93, b82abb3). m2.5c says it "replaces the monolithic layout.ts"; `layout.ts` is back to 1,934 lines with `sequenceItem` at ~520 (410-929), and only `ItemNode` implements `Renderable`. `predictItemBarExtraHeight` (`layout.ts:1071`) is a hand-kept copy of `sequenceItem`.
2. Scheduling rules exist three times. Engine A (pixel layout), engine B `computeContentEndDay` (`layout.ts:1469-1715`), engine C `scheduleRoadmap` (`schedule.ts:111-347`, whose header says it "exactly mirror[s]" engine B). Walkers and barrier loops are near copies; `buildWavePlan` runs three times per export. Every scheduling feature costs 3x plus agreement tests.
3. Core layering inversion. `include-resolver.ts` imports `include-waves.ts`, which imports `registerEntity` from the 2,558-line validator (`include-waves.ts:30`). The swimlane/parallel/group/team content walk exists ~6 times in core and twice in LSP.
4. Cross-package rule copies. NL.W0704 (`nowline-validator.ts:1461-1517`) re-implements layout's style precedence (`style-resolution.ts:178-195`); #109 had to change both. Calendar-declaration shape is classified three times (validator 2325-2439, `layout/src/calendar-resolver.ts:69-148`, LSP `hover.ts:136-149`). `DATE_RE`, `stripColon`, `propKey` have 3-7 copies.
5. Surfaces bypass the kernel. architecture.md says every surface goes through `@nowline/export`. `--serve` re-implements parse/resolve/layout/render (`cli/src/commands/serve.ts`) and silently ignores `--width`, `--no-links`, `--strict`. MCP normalizes options on its own: `pageSize: z.string()` (`mcp/src/server.ts:869`) skips #137's validation; theme is a case-sensitive `z.enum` without the `greyscale` alias; `now` defaults to UTC where the CLI uses local time. Theme names are hard-coded in ~15 places outside `THEME_NAMES` (MCP, preview-shell, VS Code).
6. God files. `render.ts` grew 2,249 to 3,172 (`renderItem` 345 lines, waves ~580, layout math like `waveTextWidth` redone in the renderer). Validator 2,138 to 2,558 with calendar and style checks inline.

**Small correctness items.** `loadConfigFor` (`cli/src/commands/render.ts:519-532`) swallows a malformed `.nowlinerc`, contradicting cli.md:404; it matters more since #123 made the rc drive theme and width. LSP `BUILTIN_ICON_NAMES` lacks `calendar` (the validator has it). `triage.yaml` and CONTRIBUTING prerequisites omit `python3`, which #133 now needs. The `codes.ts` header misdescribes E09xx. Pre-existing: msproj `<StartDate>` falls back to a hard-coded `2026-01-05` and ignores `start:` (`export-msproj/src/index.ts:604-614`).

**Public-repo consistency.** nowline-action is consistent by construction: `packages/nowline-action/action.yml:33` documents `light, dark, or grayscale` (#105) and the mirror catches up at the next release. `specs/embed.md:147` reserves `/edit` + `/d/{id}` for "m5c" persisted routes; both are retired and the page is republished on nowline.io/docs/embed. `AGENTS.md:27-29` says Renovate updates the site submodule; it doesn't. `specs/architecture.md:11` describes `lolay/nowline-obsidian` and `packages/obsidian-plugin/` as existing; both are planned m4.5 work. The shared Renovate preset's 14-day `minimumReleaseAge` has no `@nowline/*` exception, so every consumer lags a release by two weeks. The #125 keyword guard covers grammar keywords to TextMate only.

**Latest main (#142-#144).** #144 (logo rendering) is sound: the sanitizer folds `style` and plain class rules into presentation attributes under the same value checks and narrows `url()` to local fragments, stricter than before. It copies the new pre-layout step (`roadmapLogoRef` then `loadLogo` then `LayoutOptions.logo`) into the export kernel (`packages/export/src/index.ts:308`), the browser pipeline (`packages/browser/src/pipeline.ts:306`) and `--serve` (`serve.ts:171`), while MCP layout insights (`mcp/src/diagnostics.ts:211`) skips it; it reads the logo twice per render; it split header sizing further between `sizeBesideHeader` and `RoadmapNode.place`; and sanitized logos keep `class` attributes after their rules are inlined, so host-page CSS can still restyle them. #142 grew `view-preset.ts` 601 to 681. #143 is docs only and leaves Gary a decision on titled recurrences; a period bracket would add a span mode to `packMarkerRow`, which R2 consolidates.

## Recommended refactors (priority order)

R1 first because the triple-copy scheduler is the highest ongoing cost and bug risk; R3 is cheap and unblocks clean core APIs; R4 fixes user-visible drift; R2 is the biggest and easier once R1 shrinks engine B.

- **R1. One day-level scheduler.** `schedule.ts` becomes the only day-space engine; engine B's date window is a projection of its result; engine A floors from it. Build the wave plan once and carry it on `ExportInputs` (export-core) so exporters stop re-calling `scheduleRoadmap`/`buildWavePlan`. Replace A=B=C agreement tests with direct tests.
- **R2. Layout phases.** Split `RoadmapNode.place` into date-window, measure, place, finalize stages with an explicit finalize context (scale, canvas, marker band) so the fixups become one ordered pass. Derive the predictor from `ItemNode.measure`. Extract a `HeaderNode` (beside/above sizing, logo slot, text inset). Merge the swimlane/group child loop (`swimlane-node.ts:276-391`, `group-node.ts:158-262`), the five `*Deps` callback interfaces, and the two hand-built `LayoutContext`s. Move status tints out of `sequenceItem` (`layout.ts:568` on) into theme tokens.
- **R3. Core utility layer.** New `ast-walk.ts` (content walk, `registerEntity`, `collectReferenceableIds`, `visitPropertiesDeep`) used by validator, resolver, waves and LSP, removing the resolver-to-validator edge. Move the style-precedence chain into core so layout and W0704 share it. One calendar-declaration classifier in core. Split the validator into per-feature modules. Drop unused waves exports (`effectiveWave`, `leadWave`).
- **R4. Shared options schema and one staging function.** `packages/config` owns theme (via `normalizeThemeName`), width, now, page-size, non-working and one `.nowlinerc` merge (the exported `mergeConfig` is unused today). One staging function (parse, resolve includes, load assets such as the logo, layout) that the export kernel, browser pipeline, `--serve` and MCP insights all call.
- **R5 (opportunistic).** Split `render.ts` by layer and `view-preset.ts` by job; move duplicated measurement helpers into layout.
- **R6 (opportunistic).** Generate TextMate and LSP value lists from the grammar plus core tables; extend the #125 guard; publish the grammar as a package artifact.

## Execution

Driven by `personal-plan-orchestrate`. One working directory: `/workspace/nowline` (repo `lolay/nowline`, public). Every step ends with its own commit; workers never push. Write nothing about the private sibling repos into this repo.

Standards for every worker: `AGENTS.md`, `CONTRIBUTING.md`, `.changelog/README.md` in this repo; personal standards `code-style.md`, `testing.md`, `documentation.md` (paths passed at dispatch).

--- WAVE 1 [exec] ---

### m1 - Record the review

#### s1 - [exec] Write the standalone review doc (done)

Create `specs/handoffs/review-since-v086-lantern.md`: a title, a one-paragraph context (what was reviewed: v0.8.6 to main 0062df3, public repos only), then this plan's sections "Verdict", "Findings since v0.8.6" and "Recommended refactors (priority order)" copied in, with the "Latest main (#142-#144)" paragraph kept. Re-check every `file:line` reference against HEAD and correct any that drifted; keep the wording otherwise. Add nothing about private repos.

Acceptance: the file exists; every file:line in it resolves at HEAD to the code it describes; no private-repo content; no other file changes. No changelog fragment (docs only).

### m2 - Quick fixes

#### s1 - [exec] Route MCP options through the shared normalizers

In `packages/mcp/src`: validate `pageSize` with `parsePageSize` from `@nowline/export-core` (`packages/export-core/src/pdf-page.ts:75`) for every format, not only PDF, returning the tool's normal input-error result with the parser's detail when it throws `PageSizeParseError` (mirror the CLI's `parsePageSizeSetting`, `packages/cli/src/commands/render.ts:618`). Accept `theme` as a string normalized with `normalizeThemeName` from `@nowline/layout` (so `Greyscale` and the `greyscale` alias work), rejecting unknown names with a message that lists `THEME_NAMES`; replace the hard-coded theme lists and alias switches in `server.ts` (~623, ~866, ~1198), `capabilities.ts:19`, `diagnostics.ts:171` and `ui/entry.ts:49-58` with those exports. Build `nonWorking`'s enum from `NON_WORKING_DISPLAYS`. Do not change `now`, `width`, or anything outside `packages/mcp`.

Acceptance: tests in `packages/mcp/test` cover an invalid `pageSize` on a non-PDF export (rejected), `theme: "Greyscale"` (accepted, renders grayscale), an unknown theme (rejected, lists names); the package's tests and `pnpm lint` pass. Changelog fragment `.changelog/mcp-option-normalizers.txt` (`release-note:fixed`).

#### s2 - [exec] Report a malformed .nowlinerc as a usage error

`loadConfigFor` (`packages/cli/src/commands/render.ts:519-532`) catches every error and returns `null`, so a malformed YAML or JSON rc is silently ignored, contradicting `specs/cli.md:404` (an invalid rc value is a usage error, exit 2). Keep returning `null` when no rc file exists; when one exists but can't be parsed, raise the CLI's usage error naming the file and the parser's reason (match the cli.md:404 message style, `nowline: invalid .nowlinerc ...`). `--serve` uses the same function and gets the same behavior. Update `specs/cli.md` only if its wording needs to name this case.

Acceptance: an integration test in `packages/cli/test/integration/` renders with a malformed `.nowlinerc` beside the input and asserts exit code 2 and the message; a missing rc still renders; CLI tests and `pnpm lint` pass. Changelog fragment `.changelog/cli-malformed-nowlinerc.txt` (`release-note:fixed`).

#### s3 - [exec] Drop class attributes from sanitized SVG logos

`sanitizeSvg` (`packages/renderer/src/svg/sanitize.ts`) now folds plain `<style>` class rules into presentation attributes but still emits each element's `class`, so CSS on the host page (another inline SVG's `.cls-1` rule, under the embed) can restyle the logo. After `applyStyles` has folded the rules, drop `class` from the emitted attributes without a warning (it is bookkeeping once inlined). Keep everything else in the sanitizer as is.

Acceptance: `packages/renderer/test/sanitize.test.ts` covers an Illustrator-style `<style>.cls-1{fill:#123456}</style>` logo whose output has the fill as an attribute and no `class`; existing sanitizer tests updated only where they asserted `class` survives; `tests/logo-*.nowline` renders unchanged; renderer tests and `pnpm lint` pass. Changelog fragment `.changelog/sanitizer-drop-class.txt` (`release-note:fixed`).

#### s4 - [fast] Offer the calendar icon in LSP completion

Add `'calendar'` to `BUILTIN_ICON_NAMES` in `packages/lsp/src/references/ast-utils.ts:116`, in the same position the validator's built-in icon list uses (see `packages/core/src/language/nowline-validator.ts` ~164). Add or extend an LSP completion test asserting `calendar` is offered where icon names complete.

Acceptance: the LSP test passes; `pnpm lint` passes. Changelog fragment `.changelog/lsp-calendar-icon.txt` (`release-note:fixed`).

#### s5 - [exec] Fix stale comments and public docs

- `packages/core/src/i18n/codes.ts` header: change the `NL.E0900–E0999` line to `NL.E0900–E0999  calendar declarations (non-working / working)`.
- `specs/embed.md:147`: replace "keeps `/edit` + `/d/{id}` free for m5c's persisted-diagram routes" with "keeps other paths free for the paid editor's persisted-diagram routes", and "(no persistence until m5c)" with "(the free viewer never persists a diagram)". Change nothing else in the paragraph.
- `AGENTS.md:27-29`: the `nowline-site` bullet becomes "`nowline-site` pulls docs via the `external/nowline` git submodule + `sync-docs`; its build checks out the latest release tag." Leave the `nowline-app` bullet as is.
- `specs/architecture.md:11`: mark the `lolay/nowline-obsidian` row as planned (m4.5): start its Contents cell with "*Planned (m4.5).*" and say the source *will* live at `packages/obsidian-plugin/`.
- `triage.yaml`: add a `python3` tool to `default` (hint `https://www.python.org`). `CONTRIBUTING.md` Prerequisites: add a **Python 3** bullet saying `scripts/changelog.py` needs it (stdlib only).

Acceptance: only those lines change; `python3 scripts/changelog.py check` and `pnpm lint` pass. No changelog fragment (docs and comments).

#### s6 - [fast] Exempt @nowline packages from the Renovate release-age wait

In `.github/renovate-shared.json`, append a last `packageRules` entry matching `@nowline/**` that sets `minimumReleaseAge` to `"0 days"`, with a `description` saying consumers should pick up a nowline release the week it ships (lockstep with the CLI). It must come after the `major` rule so it also overrides that rule's 30 days.

Acceptance: `npx --yes renovate-config-validator .github/renovate-shared.json` passes (or, if the validator can't run, the JSON parses and the rule is last); no other change. No changelog fragment.

--- WAVE 2 [deep] ---

### m3 - Refactor specs

Each step writes one design spec in `specs/` (lowercase-kebab name, no `-spec` suffix) and changes no code and no other file. Read `specs/handoffs/review-since-v086-lantern.md` (written in m1.s1) first. Each spec has: Problem (with evidence as file:line at HEAD), Goals and non-goals, Design, a migration plan as milestones `m1..` with steps `s1..`, each independently mergeable and gated on byte-identical renders of every `examples/` and `tests/*.nowline` sample, Test strategy, Risks, and Open questions for Gary. Name a proposed milestone ID but don't edit `specs/milestones.md`. No changelog fragment.

#### s1 - [deep] Spec R1: one day-level scheduler

Write `specs/scheduler-unification.md` for R1. Cover how engines A (`sequenceItem`, `resolvePinnedOrSequentialStart`, `wave-layout.ts`), B (`computeContentEndDay`, `layout.ts:1469-1715`) and C (`scheduleRoadmap`, `schedule.ts`) differ today, which one becomes canonical and why, how the date window and pixel placement derive from it, how `wave-barrier.ts`'s fixpoint is shared, how the wave plan and schedule reach exporters once through `ExportInputs` (`packages/export-core`), and how the A=B=C agreement tests (`packages/layout/test/waves.test.ts`, `layout.test.ts`) are replaced.

#### s2 - [deep] Spec R3: core AST, style and calendar utilities

Write `specs/core-ast-utilities.md` for R3: the `ast-walk.ts` module and its API (replacing the walks in `waves.ts`, `include-waves.ts`, the validator's `registerEntity`/`collectReferenceableIds`/`visitPropertiesDeep`, and LSP `ast-utils.ts`), removing the `include-resolver` to validator import, the style-precedence chain moved into core and consumed by layout's `style-resolution.ts` and NL.W0704, one calendar-declaration classifier shared by the validator, `layout/src/calendar-resolver.ts` and LSP hover, the validator split into per-feature modules, and the consolidation of `DATE_RE`/`propKey`/`stripColon` copies.

#### s3 - [deep] Spec R4: shared surface options and one staging function

Write `specs/surface-options.md` for R4: an options schema in `packages/config` (theme, width, now, page-size, non-working; one `.nowlinerc` merge replacing the per-field code in `cli/src/commands/render.ts`) consumed by the CLI, `--serve`, MCP and the VS Code extension; one staging function (parse, resolve includes, load assets such as the logo, layout) used by the export kernel, `packages/browser/src/pipeline.ts`, `--serve` and MCP layout insights, so `--serve` stops ignoring `--width`/`--no-links`/`--strict` and the logo is read once. Resolve the `now` default (UTC in MCP, local in the CLI) as an open question with a recommendation.

--- WAVE 3 [xdeep] ---

#### s4 - [xdeep] Spec R2: layout phases

Write `specs/layout-phases.md` for R2, building on `specs/rendering-v2.md` (m2.5c) and on the R1 spec from s1. Inventory every post-placement mutation in `RoadmapNode.place` (`packages/layout/src/nodes/roadmap-node.ts:272-1128`), `row-packer.ts`, `swimlane-node.ts`, `group-node.ts`, `include-node.ts` and `wave-node.ts`, with its ordering dependency; design date-window, measure, place and finalize phases with an explicit finalize context so those fixups become one ordered pass; derive the item predictor from `ItemNode.measure` instead of `predictItemBarExtraHeight`; extract a `HeaderNode`; merge the swimlane/group child loop, the `*Deps` interfaces and the two `LayoutContext` builders; move status tints into theme tokens. Sequence the migration so each step stays byte-identical, and say which steps depend on R1 landing first.

## Review log

review wave-1 (nowline m1 s1) 0357e12..c233919: PASS - review doc written; six drifted file:line refs corrected (layout.ts status tints :531, sequenceItem 410-928, calendar-resolver.ts 105-135, lsp hover.ts full path, cli render.ts loadConfigFor 520-533, style-resolution.ts 178-196); no private-repo content - 2026-10-13

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`nowline-m2-s1-s6`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`, matched by prefix when long; without the id, the newest `.jsonl` there), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl` in the same directory. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.

tokens orchestrator-kickoff plan-nowline-review-lantern (claude-opus-5-5): input ~210 / cache read ~20M / cache write ~0 5m + ~370k 1h / output ~94k | ~$8.80 API-equiv
tokens wave-1 nowline-m1-s1 (claude-sonnet-5-5): input ~34 / cache read ~1.4M / cache write ~110k / output ~17k | ~$0.71 API-equiv (output est.) session 8c78f794-2944-59bb-8116-4413104e9100
tokens review-wave-1 nowline-m1-s1 (claude-opus-5-5): input ~36 / cache read ~480k / cache write ~41k / output ~17k | ~$0.65 API-equiv (output est.) session 8c78f794-2944-59bb-8116-4413104e9100
