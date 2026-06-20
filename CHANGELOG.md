# Changelog

All notable changes to Nowline are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Packages in this monorepo share a single version and ship together. Contributors append entries to `## [Unreleased]` as part of their PR; maintainers move them into a new `## [vX.Y.Z]` section as part of the release-cut commit (see [`specs/releasing.md`](./specs/releasing.md#changelog-workflow)).

## [Unreleased]

### Fixed

- **`@nowline/mcp` — in-chat preview `auto` theme follows harness dark mode**: the MCP Apps widget reads `getHostContext().theme` from the Claude harness and resolves the default `auto` diagram theme to that light/dark mode (re-rendering on `onhostcontextchanged`). When the host does not report a theme, `auto` falls back to the iframe's `prefers-color-scheme`.

## [0.8.4] - 2026-06-19

## [0.8.3] - 2026-06-19

### Added

- **`@nowline/mcp` — `share` tool**: dedicated tool (`{ source?, path? }` → `{ shareUrl }`) as the sole share surface. Encodes the roadmap client-side into a `free.nowline.io/open` link for view + export. Tool description and server `instructions` steer agents to prefer `render` for in-chat presentation.
- **`@nowline/mcp` — `export` `delivery` parameter**: new `delivery: "file" | "inline" | "both"` parameter controls how exported binaries reach the caller. `"file"` writes to disk (defaulting to `<allowedRoot>/<roadmap-id>.<ext>` when no `output` path is given); `"inline"` returns bytes in the response; `"both"` does both. Smart per-format default: `pdf`/`xlsx` write to disk when a root folder is configured, else return inline; `png` and text formats always return inline.
- **`@nowline/mcp` — `export` accepts `svg`**: the `export` tool now lists `svg` alongside `pdf`/`html`/`mermaid`/`xlsx`/`msproj`/`png`, so agents can save a vector file directly with `delivery:"file"` instead of working around the gap (e.g. writing PNG bytes into a `.svg` path). `render` continues to return `svg`/`png` inline for in-chat preview.
- **`@nowline/mcp` — `export` binary formats auto-save `png`**: `png` now joins `pdf`/`xlsx` in the smart-default write-to-disk group — when a root folder is configured, `png` is saved to the configured folder (no inline bytes in context). Without a configured root, `png` falls back to an inline image block as before.
- **`@nowline/mcp` — `export` text artifact guidance**: `svg`/`html`/`mermaid` exports are returned as typed inline text (with `mimeType` set) and the server `instructions` + tool description now steer Claude to surface these as downloadable artifacts of the matching type.
- **`@nowline/mcp` `.mcpb` — user-configurable output folder**: `manifest.json` now declares a `user_config.output_dir` directory picker (default `~/Downloads`) so Claude Desktop users can set an export destination at install time. The folder is injected as `--root`, enabling the smart delivery default to write `pdf`/`xlsx` files directly to the host filesystem instead of returning inline bytes (which Claude Desktop drops silently). Manifest version updated to `0.4`.

### Changed

- **`@nowline/mcp` — binary `export` artifacts**: inline `pdf`/`xlsx` results return embedded MCP resource blocks (not mislabeled `image` blocks); inline `png` stays an image block. When no local `output` path is given for `pdf`/`xlsx`, a hint points agents at the `share` tool.
- **`@nowline/mcp` — `export` hint for binary formats without a written file**: reworded to point at `output:`/`delivery:"file"` (and the server output-folder setting on Claude Desktop) before falling back to `share` for a link.
- **`@nowline/mcp` — `export` no-file hint is `rootConfigured`-aware**: when an output folder is already configured and `delivery:"inline"` was requested, the hint now tells agents to omit `delivery` to save to the configured folder instead of (incorrectly) suggesting they configure a folder.
- **`@nowline/mcp` — `export` description steers away from sandbox paths**: the `output` parameter description now explicitly warns against sandbox paths (`/home/claude/…`, `/mnt/user-data/…`) and instructs agents to pass a bare filename to save into the configured folder.

### Removed

- **`@nowline/mcp` — `share` param on `render`/`export`**: share links are generated only via the `share` tool (no `shareUrl` on render/export structured output).

### Fixed

- **`@nowline/mcp` — `.mcpb` `${HOME}` root not expanded**: the server now expands mcpb path tokens (`${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`, `${DOWNLOADS}`), a leading `~`, and generic environment variables in `--root`. Claude Desktop's single-pass substitution can pass the `output_dir` default through verbatim (e.g. literal `${HOME}/Downloads`) when the user installs without opening the directory picker, which left the allowed root pointing at a non-existent path and broke `pdf`/`xlsx` export-to-file. A blank value (optional field left unset) now collapses to the cwd fallback (inline delivery) instead of a bogus root.
- **`@nowline/mcp` — export guidance for agents**: server `instructions` and tool descriptions state the in-chat preview is view-only (no download/export button), reducing hallucinated widget export controls.
- **`@nowline/mcp` — `.mcpb` bundle crash on startup**: `.mcpbignore` patterns (`src/`, `scripts/`, `test/`) were applied recursively, stripping `node_modules/@chevrotain/regexp-to-ast/lib/src/api.js` from the bundle. Changed to root-anchored patterns (`/src/`, `/scripts/`, `/test/`) so only the top-level staging directories are excluded. Fixes "Server disconnected" on Claude Desktop install.
- **`@nowline/mcp` — `.mcpb` manifest author corrected**: `author.name` changed from `"Lolay"` to `"Nowline"` so the Claude Desktop Extensions directory shows "Developed by Nowline".
- **`@nowline/preview-shell` — initial fit timing**: re-applies the default fit on the next animation frame after the first SVG render so zoom is correct when the viewport dimensions settle after layout.

## [0.8.2] - 2026-06-18

### Added

- **MCP integration harness**: three test legs for `@nowline/mcp` — official `AppBridge` UI e2e (`make mcp-app-e2e`), MCP Inspector CLI cross-process smoke (`make mcp-inspector-smoke`), and gated real-Claude headless e2e (`make mcp-claude-e2e`, skips without `ANTHROPIC_API_KEY`). Deterministic legs run in CI's `mcp-harness` job; Claude leg runs via `.github/workflows/mcp-claude.yml` (`workflow_dispatch`). `.mcpb` staging verify now uses the shared Inspector CLI client.

### Changed

- **`@nowline/mcp` — slim Claude Desktop `.mcpb` bundle**: `make pack-mcpb` now esbuild-bundles the server into a single `dist/index.js` (~6 MiB) and ships only `@resvg/resvg-wasm`, `pdfkit`, and `langium` (with its vscode-jsonrpc/chevrotain transitives) in `node_modules`. The first two are kept for on-disk WASM/AFM asset I/O; langium is kept because its Node entry uses dynamic `require()` incompatible with esbuild ESM output. Replaces `pnpm deploy --prod --legacy`, which produced ~608 MiB / 55k files via nested workspace `node_modules` duplication. Bundle size guard: 30 MiB max.

## [0.8.1] - 2026-06-17

### Fixed

- **Branding: logo alignment corrected**: `branding/logo.svg` and `branding/logo-dark.svg` now use `textLength`/`lengthAdjust` to pin glyph widths, eliminating the gap between "now" and the red now-line and the right timeline overhang. Geometry is now identical to `nowline-site/src/assets/`. `README.md` updated to reference SVGs directly instead of PNGs.

### Added

- **`@nowline/mcp` — human-readable titles on tools, resources, and prompts**: every tool declares `annotations.title` (Title Case, base-verb labels per Anthropic Software Directory Policy § 5.E); resources and prompts declare a top-level `title`; registry `server.json` adds `"title": "Nowline"`.

### Changed

- **`@nowline/mcp` — complete tool annotations for directory policy**: every tool declares `openWorldHint: false` (closed local world); `update` marks `destructiveHint` explicitly; `read`/`delete`/`list` and path/IO failures return structured `{ ok: false, error: { code, message } }` with stable `NL.MCP.*` codes instead of raw JSON-RPC errors (Anthropic Software Directory Policy § 5.A/§ 5.E).

## [0.8.0] - 2026-06-17

### Added

- **`@nowline/mcp` — Nowline icon on MCP surfaces**: `serverInfo.icons` in the `initialize` response (inline data URIs, no network dependency); `.mcpb` bundle `icon.png` for Claude Desktop; `icons` in `server.json` for the MCP registry (`https://nowline.io/branding/icon-128.png`). Per-tool/per-prompt icons deferred until `@modelcontextprotocol/sdk` exposes `icons` on `registerTool` / `registerPrompt` config.
- **`@nowline/mcp` — discovery tools `reference`, `examples`, `schema`**: callable alternatives to the `nowline://*` resources so agents can learn DSL syntax without `resources/read`. `examples` resolves names with or without the `.nowline` extension. `schema` returns the structured DSL key vocabulary (directive keys, entity types, item properties) — all keys are real DSL tokens; render/CLI options are excluded.
- **`@nowline/mcp` — `render` `review` flag**: opt-in downscaled inspection PNG for multimodal layout self-review. Insight hint is now included on inline `svg`/`png` branches (not just write-to-disk), matching `validate`.
- **`@nowline/mcp` — structured diagnostics**: every authoring tool (`validate`, `render`, `export`, `create`, `update`) returns `{ ok: false, diagnostics }` with stable `NL.E####` codes and optional `suggestion` on error-severity input; `validate` and `render` return `insights` on success. Server instructions rewritten as a numbered tool-keyed workflow.
- **`@nowline/layout` — `collectLayoutInsights`**: layout-time informational insights (`NL.I####`) and layout warnings (`NL.W1000`) from positioned-model geometry. `NL.I1002` (narrow bar) triggers only when decorations actually spilled, not on bars that merely fall below a theoretical threshold.
- **`@nowline/browser` — `diagnosticLevel` on `renderSource`**: opt-in surfacing of layout insights in preview warnings (default `error` preserves today's behavior). Layout insights are filtered once in the combined `warnings` array rather than twice.
- **`@nowline/browser` — `fromLayoutInsight`**: adapts a `LayoutInsight` to the shared `DiagnosticRow` shape; exported from the package.
- **`@nowline/core` — `NL.W1000`, `NL.I1000`–`NL.I1005` codes**: new layout-warning and layout-insight message codes with `info` severity; registered in `codes.ts`, `messages.en.ts`, and `ALL_CODES`.
- **`@nowline/preview-shell` — `applyRenderResult`**: shows non-error warnings/insights in the non-dimming diagnostics table on successful renders when present.
- **`@nowline/preview-shell` — `exportControls` option**: `mountPreview(rootEl, { exportControls: 'show' | 'hide' })`
  gates the Format / Copy / Export rows in the toolbar more-menu (default `'show'`). Hide in
  sandboxed hosts where clipboard/download are unreliable and export is tool-owned.
- **`@nowline/preview`** — new package. `mountLivePreview(rootEl, opts)` is a Layer 2
  live-preview controller that wraps `mountPreview` (Layer 0) and owns the
  `renderSource → applyRenderResult` loop. Every entry point is injectable: `render?`
  (default `renderSource`), `apply?` (default `applyRenderResult`), `beforeRender?` (pre-render
  gate, e.g. LSP errors). Returns the raw `PreviewHandle` for direct imperative control.
  Lives in a separate package so importing `mountPreview` alone never pulls in the render engine.
- **`@nowline/preview-shell` — convention helpers**: `applyRenderResult(handle, result)`,
  `classifyRenderResult(result)`, `themeOverrideToDiagramTheme(theme)`, and
  `nowOverrideToToday(now)` are now exported from `@nowline/preview-shell`. These encode the
  canonical "svg-vs-diagnostics" convention (a successful render shows the diagram; warnings
  do not veil) in one place. All have a **type-only** `@nowline/browser` dependency so
  shell-only bundles stay render-engine-free.
- **`@nowline/integration-tests` — MCP Apps preview e2e leg + `make mcp-app-e2e`**: a
  headless-Chromium Playwright regression (`test/mcp-app-preview.e2e.test.ts`) that reproduces
  the Claude-like opaque-origin `sandbox="allow-scripts"` iframe under a strict CSP, plays the
  full AppBridge handshake (`ui/initialize → initialized → tool-input → tool-result`), sizes the
  iframe from `size-changed` like a real web host, and asserts the widget reports a non-zero
  height and paints. Kept out of `make ci` (needs a browser); see [`specs/mcp.md`](./specs/mcp.md)
  § Debugging the in-chat preview (Claude Desktop).

### Changed

- **`@nowline/mcp` — MCP Apps preview re-architecture**: migrated from per-call embedded HTML resources to the official MCP Apps model — pre-declared `ui://nowline/preview-v1` resource, `_meta.ui.resourceUri` on `render`, `ontoolresult` hydration via `@modelcontextprotocol/ext-apps`, and lean `nowline.preview` JSON results on UI-capable hosts (full SVG/PNG inline on non-apps hosts).
- **`@nowline/mcp` — `render`/`export` validate first**: invalid input returns structured `{ ok: false, diagnostics }` instead of a raw `@nowline/export` kernel error string.
- **`@nowline/mcp` — tool descriptions and server instructions**: per-tool `.nowline` syntax anchors, numbered tool-keyed workflow, and `render` positioned as combined validate+render.
- **`@nowline/mcp` — `path`/`output` parameter descriptions**: `render`, `export`, and `convert` now state these must be real local filesystem paths and must never be virtual/sandbox paths (e.g. `/mnt/user-data/…`), so sandboxed hosts pass `source` inline instead of an unreadable artifact path that the `--root` guard rejects.
- **`@nowline/mcp` — condensed `reference` (progress & status)**: the cheatsheet now documents the real item-property set (drops the non-existent `effort:`/`color:` item keys), adds a "Progress & status" section listing the `status:` values, and explains that completion is expressed with `status:` + `remaining:` (work *left*) — there is no `progress:` key. Prevents agents from emitting `progress:60` (silently ignored via `NL.W0700`) or `status:active` without a percentage.
- **`@nowline/core` — `NL.W0700` concept-aware suggestions**: the unknown-property warning now maps common conceptual mistakes to the canonical DSL instead of staying silent when Levenshtein finds no near-typo. `progress:`/`percent:`/`pct:`/`complete:`/`completion:` on an entity that supports `remaining:` (e.g. an `item`) now suggests `status: + remaining:`, surfaced both in the message and the structured `suggestion` field. Gated on the target key, so it never fires where `remaining:` is unsupported (e.g. a `roadmap` line).
- **`@nowline/mcp` — MCP Apps in-chat preview**: toolbar export/copy controls are hidden
  (`exportControls: 'hide'`); artifacts come from the `render`/`export` tools, not the iframe
  sandbox.
- **`@nowline/mcp` — MCP Apps in-chat preview**: migrated from a hand-rolled
  `mountPreview` + `renderSource` + coercion loop to `mountLivePreview`, which uses the shared
  `applyRenderResult` convention by construction.
- **`vscode-extension` — render-pipeline**: `renderDocument` now uses `classifyRenderResult`
  from `@nowline/preview-shell` for the svg-vs-diagnostics decision instead of an inline copy,
  so all surfaces share one definition.
- **`@nowline/preview-shell` — viewport background in light mode**: `--nl-preview-bg` and
  `--nl-preview-fg` now follow `data-nl-mode="light"` (white canvas, dark text), matching the
  embed's default appearance.

### Fixed

- **`@nowline/mcp` — in-chat preview blank on Claude Desktop (iframe collapsed to height 0)**: the live preview is a fill-the-container layout (`html`/`body`/`#nl-preview-root` are `height:100%`), so the `@modelcontextprotocol/ext-apps` SDK's default `autoResize` — which measures `documentElement` at `max-content` — reported `ui/notifications/size-changed` height **0**, and size-to-content web hosts (Claude Desktop) shrank the iframe to nothing: blank, with **no** console error in any log. `entry.ts` now constructs `App` with `autoResize: false` and drives the iframe height from `hostContext.containerDimensions` (with a clamped fixed fallback), re-applying on `host-context-changed`. VS Code and embed own their panel height and are unaffected. The widget further sizes to the diagram's **fit-width height** (clamped to the host's available height) rather than filling the container, so a short roadmap stays compact instead of being pushed below the fold; user zoom no longer resizes the iframe. See [`specs/mcp.md`](./specs/mcp.md) § Sizing in size-to-content hosts.
- **`@nowline/mcp` — in-chat preview now paints from tool input**: the widget previously hydrated from `ontoolresult` only, so on hosts that deliver the tool result late (or not at all) to a freshly mounted iframe the preview stayed blank. It now mounts from `ontoolinput` (the LLM's `render` arguments, available before the server returns) as the primary path — mirroring the official `ext-apps` examples — and keeps `ontoolresult` as the authoritative reconciliation (it carries the server-resolved `source` when the caller passed `path:`). Mounting is idempotent across the two signals.
- **`@nowline/mcp` — MCP Apps preview payload cap**: lean tool results on apps hosts avoid the ~150K inline offload that prevented widget hydration when full SVG + bundle exceeded host limits.
- **`@nowline/mcp` — PNG render / `review` flag**: added `@resvg/resvg-wasm` as a direct
  dependency so `render --format png` and `render --review` resolve the rasterizer. Previously
  `loadWasm` failed with `Cannot find module '@resvg/resvg-wasm'` under strict (non-hoisted)
  `node_modules`, forcing hosts to fall back to SVG and rasterize it themselves.
- **`@nowline/mcp` — in-chat preview auto-detect**: `clientSupportsAppsUi` now probes
  `capabilities.extensions` (where Claude Desktop advertises `io.modelcontextprotocol/ui`) in
  addition to `capabilities.experimental`, so the interactive preview auto-enables without the
  caller having to pass `preview: true`.
- **`@nowline/mcp` — validator diagnostic codes**: MCP tools now emit stable `NL.E####` codes (via `resolveDiagnosticCode`) instead of `unknown`, with optional `suggestion` on validation diagnostics.
- **`@nowline/mcp` — in-chat preview dimming**: the preview panel no longer shows a dark
  50 % opacity overlay and "No problems" diagnostic bar on a clean roadmap in Claude Desktop
  (and any other MCP Apps host). Root cause: `entry.ts` was calling
  `handle.setDiagnostics(result.warnings)` after every successful render; even an empty
  `warnings: []` triggered `showDiagnosticsMode` which unconditionally dimmed the canvas.
  Fixed at two levels: (1) `mountLivePreview` uses `applyRenderResult` which never calls
  `setDiagnostics` on a successful render; (2) `showDiagnosticsMode` in `@nowline/preview-shell`
  now dims only when `rows` contains at least one `'error'`-severity entry, so even a raw
  `setDiagnostics([])` call cannot produce the veil.

### Fixed

- **`@nowline/mcp` — server instructions**: added `instructions` to the MCP server
  initialization so agent harnesses receive guidance that `.nowline` DSL text is the
  authoring format, not JSON. Previously the absence of server-level instructions caused
  agents to infer from the JSON-shaped tool responses that JSON was also the input format.

## [0.7.0] - 2026-06-09

### Added

- **`triage.yaml` + `make doctor` via triage**: declarative environment health check (`triage --profile default|release|ci`) replaces vendored `scripts/doctor.sh` + `doctor.*.conf`. Checks git, gh, node (`version_from: .nvmrc`), and pnpm; `release` adds bun. CI runs `lolay/triage-action@v0.3` with `profile: ci`.
- **`make gh-runs-list` / `make gh-runs-watch`**: list and watch this repo's in-flight GitHub Actions runs (`status != completed`). Tunable via `GH_LIMIT` (default 50).

- **`make gh-runs-status`**: show pass/fail of the last completed run per workflow. Groups completed runs by workflow name, picks the most recent per group, and prints `✓` (success), `-` (skipped), or `✗` (failure) with workflow name, branch, age (e.g. `3d`, `12h`, `5m`), and URL. Rows are sorted chronologically — oldest run at top, most recent at bottom. Tunable via `GH_LIMIT` (default 50).
- **`@nowline/mcp` — `convert` tool**: converts a `.nowline` source to its JSON AST (`to:json`) or pretty-prints a JSON AST back to canonical `.nowline` text (`to:nowline`). Bidirectional, round-trip-stable, reuses the same `exportDocument` kernel the CLI uses.
- **`@nowline/mcp` — `capabilities` tool**: returns all supported themes, icons, locales, export formats, and template names in one call — lets an agent prime itself before writing `.nowline` without multiple discovery round trips.
- **`@nowline/mcp` — `list-themes`, `list-icons`, `list-locales`, `list-formats`, `list-templates` tools**: granular projections of the `capabilities` payload, one vocabulary slice each. Mirrors Mermaid Chart's `listSupportedTypes` / D2's `list_themes` shape.
- **`@nowline/mcp` — `nowline://conversions` resource**: hand-authored LLM-mediated conversion guide covering Mermaid `gantt`, MS Project XML/CSV, Excel/XLSX, Google Sheets timeline view, and generic CSV into Nowline DSL.
- **`@nowline/mcp` — MCP prompts**: three server-authored prompts (`create-roadmap`, `fix-diagnostics`, `convert-to-nowline`) that compose the `nowline://reference`, `nowline://examples`, and `nowline://conversions` resources into slash-command-ready workflow templates.
- **`@nowline/mcp` — Streamable HTTP transport (`--port`)**: `nowline --mcp --port <n>` (and `@nowline/mcp --port <n>`) binds a localhost Streamable HTTP listener. stdio remains the default; no SSE.
- **`@nowline/mcp` — share links**: `render` and `export` accept `share?: boolean`; when set, the result includes a `shareUrl` built from the `free.nowline.io/open` fragment grammar. No network call — purely client-side encoded.
- **`@nowline/mcp` — MCP Apps in-chat preview**: `render` returns an embedded `text/html` resource (self-contained IIFE bundle of `@nowline/browser` + `@nowline/preview-shell`) when the client advertises the MCP Apps UI capability or `preview: true` is passed. Plain stdio operation is unchanged.
- **`@nowline/mcp` — tool annotations**: every tool declares `readOnlyHint`, `idempotentHint`, and/or `destructiveHint` per the MCP spec § annotations.
- **`@nowline/mcp` — structured output**: every tool declares an `outputSchema` (Zod) and returns `structuredContent` alongside the human-readable text block. Shared schemas live in `src/schemas.ts`.
- **MCP marketplace distribution (m4.9)**: `@nowline/mcp` is listed on the public MCP registry as `io.nowline/nowline` (automated on each release). Claude Desktop users can install via the `nowline.mcpb` bundle attached to GitHub Releases. Cursor Marketplace and VS Code MCP gallery surface the server from the registry entry.

### Changed

- **`printNowlineFile` + `parseNowlineJson` + `TEMPLATE_NAMES`** relocated from `@nowline/cli` into `@nowline/core` so `@nowline/mcp` can import them without creating a circular dependency. Both CLI and MCP now import from `@nowline/core`.

### Fixed

- **`make gh-runs-status`**: `neutral` run conclusions now display as `-` (skipped) instead of `✗` (failure).
- **`make help`**: target-name pattern widened (`[a-zA-Z0-9_.-]+`) so targets containing digits or dots render in the help list.

## [0.6.0] - 2026-06-06

### Added

- **`make doctor` target**: config-driven environment health check (`scripts/doctor.sh` + `scripts/doctor.default.conf` / `scripts/doctor.release.conf`). Checks git, gh, node (pinned to `.nvmrc`), and pnpm; `MODE=release` additionally checks bun. Read-only; exits non-zero on any missing or under-minimum tool. Two-state contract: exit 0 healthy, exit 1 on any problem (Make surfaces as exit 2).

- **XLSX Items `Start`/`End` columns**: the Items sheet now includes two date columns (`Start`, `End`) populated from the chart's computed schedule (same sequencing rules as the rendered chart — `date:` wins, then `start:`, then `after:`, then sequential). Named items get a real date cell; anonymous items are blank.
- **XLSX Milestones computed `Date`**: the Milestones sheet `Date` cell is a real Excel date. When the milestone has `date:` it uses that value; otherwise the cell is filled from the schedule-computed date (via `after:` predecessors).
- **`scheduleRoadmap` + `RoadmapSchedule`** in `@nowline/layout`: new public API that walks the resolved content tree and returns a map of per-id start/end dates for items, milestones, and anchors. Reuses the layout's calendar and sequencing primitives; does not run the full SVG layout.

- **`--timezone` CLI flag** (`nowline render`, `nowline --serve`): override the timezone used for the clock-based "today" default. Accepts `local` (default), `UTC`, ISO 8601 fixed offsets (`Z`, `+05:30`, `-07:00`), or IANA names (`America/Los_Angeles`). Only consulted when `--now` is omitted; ignored when `--now` carries an explicit date or embedded offset.
- **ISO 8601 `--now`**: `--now` now accepts bare `YYYY-MM-DD` (unchanged) plus full ISO 8601 instants (`YYYY-MM-DDTHH:MM:SSZ`, `YYYY-MM-DDTHH:MM:SS±HH:MM`, `YYYY-MM-DDTHH:MM:SS`). An embedded Z or offset overrides `--timezone`.
- **`resolveToday()` + `normalizeZone()`** in `@nowline/layout` (re-exported from `@nowline/browser` and `@nowline/export`): shared helpers for timezone-aware civil-date resolution used by all rendering surfaces.
- **`timezone` option** in `@nowline/browser` `RenderOptions` and `@nowline/embed` `EmbedRenderOptions`/`InitializeOptions`: lets embed and browser surfaces specify the zone for the clock-based now-line default.
- **`nowline.preview.timezone` VS Code setting**: override the zone for the now-line's clock-based default in the preview panel and export.

### Changed

- **XLSX Milestones `Depends` → `After`**: the Milestones sheet column was renamed from `Depends` to `After` and now reads the `after:` property (the canonical milestone predecessor DSL key). The former `depends:` property is not a valid milestone property in the grammar. Both XLSX and MS Project exporters now read `after:` for milestone predecessors.
- **XLSX swimlane column falls back to title**: the Items sheet `Swimlane` cell uses the swimlane's DSL id if present, otherwise the swimlane title. Previously the cell was blank for title-only swimlanes.
- **XLSX empty sheets omitted**: the Milestones, Anchors, and People and Teams sheets are omitted when the roadmap contains no entities of that type. The Roadmap and Items sheets are always present.
- **XLSX Anchors `Date` is a real date cell**: the Anchors sheet `Date` column is now an Excel date cell formatted `yyyy-mm-dd` (was a plain string).

- **Default now-line date is local** (all surfaces): the clock-based "today" default now uses the **viewer's local civil date** instead of UTC. Fixes the off-by-one visible when it is late evening on the west side of UTC midnight (e.g., `2026-06-04T23:00 PDT` = `2026-06-05T06:00Z` — the old UTC default showed June 5). Use `--timezone UTC` to restore the previous behaviour.
- **Embed now draws a now-line by default**: when `today` is not supplied, the embed (and browser pipeline) defaults to the local civil today instead of omitting the now-line. Pass `today: null` to suppress.

### Changed

- `@nowline/export-core`: font resolution is now **bundled-first** by default. The bundled DejaVu Sans / DejaVu Sans Mono pair is used for PNG and PDF raster export on every OS without any configuration. System fonts are available via the new `--use-system-fonts` CLI flag (`useSystemFonts` in `.nowlinerc` / config). This makes Mac/Windows/Linux render identically by default and fixes the text-loss bug that occurred when macOS SF Pro (a variable font) was handed to `@resvg/resvg-wasm`. Variable fonts supplied via `--font-sans` / `--font-mono` are detected and replaced by the bundled pair, with a warning (`--strict` makes it an error).
- VS Code extension: the live preview now renders with the same bundled DejaVu fonts as PNG/PDF raster export, via injected `@font-face` rules (served from `dist/fonts/` via `asWebviewUri`). Preview and export are now WYSIWYG. Saving SVG from the preview re-exports through the kernel so the saved file retains the portable `system-ui` font stack.

### Fixed

- PNG / PDF: text rendered as blank boxes on macOS when the system font probe resolved to SF Pro (`SFNS.ttf`), which is a variable font that `@resvg/resvg-wasm` cannot rasterize. The bundled-first default eliminates this entirely.
- Markdown+Mermaid export: the generated `gantt` block failed to render (`Mermaid Syntax Error` / `Invalid date: <id>`) for any roadmap whose items lacked an explicit `after:` dependency. Mermaid strips a leading status keyword and then reads `id, duration` as `start, duration`, mis-reading the task id as a start date. Every task now carries an explicit start token: declared `after:` deps, otherwise `after <previous lane item>`, otherwise the roadmap start date (lane / parallel-track leaders). Parallel tracks now correctly anchor at the block's entry point instead of serializing. Top-level milestones now read their predecessors from `after:` (they were incorrectly reading a non-existent `depends:` and emitting an unrenderable bare milestone).

### Added

- VS Code: the right-click commands now live under a single **Nowline** submenu on every surface (editor tab, editor body, and Explorer), instead of being scattered inline. The submenu collapses **Open Preview** (same tab), **Open Preview to the Side**, **Open Link in Side Browser** (editor only), and **Export…** into one consistent group. This restores the same-tab **Open Preview** entry, which was previously only reachable via `Cmd/Ctrl+Shift+V` and the Command Palette.
- New `@nowline/export` kernel package: `exportDocument(source, format, inputs, host)` is the single shared entry point for every export format (svg, png, pdf, html, mermaid, xlsx, msproj, json, nowline). CLI, VS Code extension, and MCP server all call this kernel; the `HostEnv` interface adapts environment I/O (file reads, asset reads, WASM loading) to the host.
- `@nowline/export-core`: new `loadBundledFontsForBrowser()` export (also `./fonts` subpath) returns the canonical bundled DejaVu font pair decoded with `atob()` (no Node `Buffer` dependency) — allows browser apps to supply canonical fonts to the kernel without a separate font fetch.
- `@nowline/preview-shell`: new `onCopyPng?: () => Promise<Blob>` option in `MountOptions`. When supplied, the shell passes the returned `Promise<Blob>` directly to `ClipboardItem` for the copy-PNG action, so async WASM rasterization runs inside the user gesture (Chrome/Safari `Promise<Blob>` form). When absent, the shell falls back to the existing `<canvas>` quick-grab path.
- New `@nowline/mcp` package: an MCP stdio server (`npx @nowline/mcp`) with eight tools (`validate`, `read`, `create`, `update`, `delete`, `list`, `render`, `export`) and two resources (`nowline://reference`, `nowline://examples`). The `render` and `export` tools produce byte-identical output to `nowline -f <format>` for the same inputs.
- CLI: `nowline --mcp [--root <dir>]` starts the same MCP server in-process, sharing the `@nowline/mcp` server factory. The `--root` flag sets the allowed root for file tools (defaults to cwd).
- PNG rasterizer replaced: `@nowline/export-png` now uses `@resvg/resvg-wasm` everywhere (CLI, extension, MCP). The native `@resvg/resvg-js` addon is removed. All Node-surface PNG exports are byte-identical.
- VS Code: **Save PNG** and the **Copy PNG** temp-file fallback both re-rasterize through the kernel (WASM) so saved PNG files are byte-identical to `nowline -f png`. The in-clipboard PNG (when the webview clipboard write is available) remains a documented non-canonical exception (VS Code's `env.clipboard` is text-only).
- Cross-surface export-determinism gate: a dedicated CI job (`make determinism` + `make determinism-browser`) hashes every fixture × format through the compiled CLI binary, the kernel in Node, and the kernel in a headless browser (Playwright/Chromium), asserting byte-identity across all three. Goldens are checked in at `packages/integration-tests/determinism/hashes.json` and regenerated deliberately with `make determinism-update`. Under the current toolchain the browser reproduces the Node bytes for the entire fixture set; the only recorded Node-surface divergence is each `pdf`'s `bun compile`-vs-Node zlib difference. See [`specs/export-determinism.md`](./specs/export-determinism.md) § Enforcement.

### Changed

- `@nowline/export-png` no longer imports the font resolver (and its `node:fs` dependency) at module top — the resolver is loaded lazily and only when a caller omits `fonts`. Canonical callers (the kernel, the CLI) always pass `fonts`, so behavior is unchanged, but the package now bundles cleanly for the browser (the determinism gate's headless leg and the Free/Pro web apps).

### Fixed

- Title-only roadmap declarations (swimlanes, anchors, milestones, and other entities with a quoted title but no explicit id) now render instead of being silently dropped during include resolution. Auto-derived map keys and id-less `parallel`/`group` flow handles are internal only — declare an explicit id to reference an entity from `after:`, `before:`, or `on:`. An explicit id always wins its key over an auto-derived slug regardless of source order, and auto-slug collisions de-dupe silently (no spurious "shadowed" warning).
- Title-only items that declare `after:` or `before:` now draw their dependency arrow. Previously the arrow only appeared if the item also carried an (otherwise unused) explicit id, because the target item registered its attach geometry only when it had a `name`. Id-less items now get an internal, non-referenceable layout handle so they participate as dependency-edge targets; references still require an explicit id.
- PDF export (`nowline -f pdf`) no longer fails with `ENOENT` on the pdfkit data files (`data/` and `js/` directories) when the CLI binary runs from a path that doesn't contain a `node_modules` layout. The pdfkit data-file resolver now uses the bundled path correctly in all deployment contexts.
- VS Code extension no longer crashes on activation with an `import.meta.url` reference error. The activation entry point was compiled as CJS for the VS Code host, and a top-level `import.meta.url` call in an ESM submodule leaked through the bundle. The submodule is now wrapped to guard the reference.

## [0.5.1] - 2026-06-01

### Changed

- `@nowline/preview-shell`: the preview minimap can no longer be manually dismissed (the `×` close button is removed). It still auto-hides when the whole diagram fits in the viewport and still respects `nowline.preview.showMinimap`.

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
