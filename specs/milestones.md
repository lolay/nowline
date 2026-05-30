# Nowline — OSS Milestones

## Overview

The OSS tooling (`lolay/nowline` and its satellite repos) ships incrementally across milestones m1–m4.8. A four-phase layout-engine refactor (m2.5a–m2.5d), a rendering-polish pass (m2i), capacity & utilization (m2j), and a dependency-arrow attach + routing pass (m2k) sit between the sample-fidelity work (m2h) and IDE support (m3). Manual pages (m2l), French localization (m2m), and inline date pins (m2n) close out the m2 series with distribution polish and DSL refinements. The IDE work ships before the GitHub-bound rendering paths (m3.5 GitHub Action, m4 browser embed) so authors can edit `.nowline` files in VS Code / Cursor with live preview before either surface goes wide. m3.5 (action) and m4 (embed) are independent of each other and could ship in either order; the chain numbers them m3.5 → m4. m4.7 follows m4 with a browser-tooling extraction (browser pipeline, preview shell, LSP worker, showcase example) so commercial browser surfaces can stand on a shared OSS base instead of duplicating glue. m4.8 follows m4.7 with the OSS MCP server (`@nowline/mcp`), which exposes the CLI's capabilities as a typed MCP tool surface so agent harnesses get discoverability, structured I/O, and an optional in-chat live preview. Two independent post-m4 add-ons round out the chain: m4.5 expands IDE coverage (Obsidian, Neovim, JetBrains), m4.6 expands Windows install coverage (Scoop, WinGet). Each milestone has a clear scope and set of Apache-2.0 deliverables. Later milestones depend on earlier ones.

Commercial milestones (hosted editor, free viewer, cloud MCP server, enterprise, FedRAMP) are tracked in a separate, private spec and are out of scope here.

## Milestone Summary

| Milestone | Name | License | Deliverables |
|-----------|------|---------|--------------|
| ~~m1~~ | ~~DSL~~ | Apache 2.0 | Grammar, parser, AST, validation, TextMate grammar |
| ~~m2a~~ | ~~CLI Core~~ | Apache 2.0 | CLI scaffold, `validate`, `convert`, `init`, `version`, distribution pipeline |
| ~~m2b~~ | ~~Layout + SVG~~ | Apache 2.0 | Layout engine, SVG renderer, `render` (SVG only), `serve` live-reload |
| ~~m2b.5~~ | ~~CLI Redesign~~ | Apache 2.0 | Verbless `nowline <input>` default; mode flags (`--serve`, `--init`, `--dry-run`); hard cut on old verbs |
| ~~m2c~~ | ~~Export Formats~~ | Apache 2.0 | PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML |
| ~~m2d~~ | ~~Sample minimal alignment~~ | Apache 2.0 | Light-theme palette overhaul + minimal sample fidelity (header card, timeline panel, frame tab, status dot upper-right, bottom progress strip, solid now-line, attribution wordmark) |
| ~~m2e~~ | ~~Sample platform-2026~~ | Apache 2.0 | Full-feature sample fidelity: unified anchor+milestone header row, anchor/milestone cut lines, owner/footnote-in-tab, inline label chiclets, link-icon tile, footnote panel, styled group chiclets, marker arrowheads |
| ~~m2f~~ | ~~Sample platform-2026-dark~~ | Apache 2.0 | Dark-theme palette tightened to match the dark reference sample |
| ~~m2g~~ | ~~Sample dependencies~~ | Apache 2.0 | Cross-swimlane orthogonal edge routing, parallel `[ ]` brackets, `before:` overflow refinement, floating milestone slack arrow |
| ~~m2h~~ | ~~Sample isolate-include~~ | Apache 2.0 | Dashed-bordered isolate region with label tab + external-link badge, cross-region arrows |
| ~~m2.5a~~ | ~~Layout v2: Time Axis~~ | Apache 2.0 | `TimeScale` + `ViewPreset` + `WorkingCalendar` replace `timeline.ts`; multi-row headers, `invert()`, `weekendsOff()` |
| ~~m2.5b~~ | ~~Layout v2: Band Heights~~ | Apache 2.0 | `BandScale` drives swimlane heights; `defaults > spacing` and item `text-size` + `padding` actually consulted |
| ~~m2.5c~~ | ~~Layout v2: Measure/Place Tree~~ | Apache 2.0 | `Renderable` nodes per entity (item/swimlane/group/parallel/anchor/milestone/footnote/include) replace the monolithic `layout.ts` |
| ~~m2.5d~~ | ~~Layout v2: Theme in Model~~ | Apache 2.0 | Resolved palette carried in the positioned model; renderer drops `theme === 'dark'` branches |
| ~~m2i~~ | ~~Sample fidelity polish~~ | Apache 2.0 | Post-Layout-v2 rendering refinements: row-packing for items/markers/groups, caption + chip spill, narrow-bar decoration spill, luminance-aware status dots, now-pill flag mode, canvas growth helpers, geometry-constant centralization |
| ~~m2j~~ | ~~Capacity & utilization~~ | Apache 2.0 | `capacity:` on swimlanes and items, `capacity-icon:` glyph vocabulary, `size <id> effort:N` declarations with item-derived durations, `remaining:` literal form, tri-state lane utilization underline (`utilization-warn-at:N`, `utilization-over-at:N`) |
| ~~m2k~~ | ~~Dependency arrow attach + routing~~ | Apache 2.0 | Visual-edge attach with flow dedupe; channel-based orthogonal router (item-bar obstacles, parallel/group bracket-clearance nudge, slot assignment, under-bar fallback); min-stub constraints + parallel bracket-foot clearance |
| ~~m2l~~ | ~~Manual pages~~ | Apache 2.0 | Hand-authored mdoc `nowline.1` (CLI flags + LANGUAGE cheatsheet) and `nowline.5` (full DSL reference) shipped through every install channel (Homebrew tap, `.deb`, npm `"man"`, GitHub Release asset) so `man nowline` and `man 5 nowline` both work after any package-manager install |
| ~~m2m~~ | ~~Localization (fr)~~ | Apache 2.0 | `locale:` on the `nowline` directive; `--locale` flag and `LC_ALL`/`LC_MESSAGES`/`LANG` fallback; CLDR-style bundle tree (`fr` neutral base + empty `fr-CA` / `fr-FR` overlays); error-code-keyed validator messages; translated `man/fr/nowline.1` and `man/fr/nowline.5`; per-channel install wiring for translated man pages |
| ~~m2n~~ | ~~Inline date pins~~ | Apache 2.0 | `after:DATE` / `before:DATE` ISO literals on `item` / `parallel` / `group` pin an entity to a calendar position without a named `anchor`; mixed lists (`after:[upstream, 2026-03-09]`) supported; renderer paints a `calendar` glyph (built-in icon) in the entity's top-LEFT (`after`) / top-RIGHT (`before`) corner with narrow-bar spill matching the status-dot family; four new validator codes (`NL.E0410`–`NL.E0413`) shipped with EN + FR bundles; new validation rules 24a/24b plus extended rules 27/28 |
| ~~m3a~~ | ~~LSP server~~ | Apache 2.0 | Langium-based language server (`@nowline/lsp`): validation, definition, references, rename, hover, completion, document symbols, folding |
| ~~m3b~~ | ~~VS Code/Cursor extension scaffold~~ | Apache 2.0 | Bundled `.vsix`: TextMate grammar, language config, snippets, file icon, LSP client, trace setting |
| ~~m3c~~ | ~~Live preview~~ | Apache 2.0 | Side-or-behind preview panel; host-side render pipeline (parse + layout + renderSvg) posts SVG to a webview; clickable diagnostic table; toolbar zoom/pan/fit/save/copy; Cmd-wheel & pinch zoom; keyboard presets; minimap; five `nowline.preview.*` settings |
| ~~m3d~~ | ~~Preview parity~~ | Apache 2.0 | `.nowlinerc` reader + workspace watcher; new preview-affecting settings (`nowline.preview.{locale,now,strict,showLinks,width,assetRoot}` + `nowline.ignoreRcFile`); preview toolbar overrides (theme, now-line, show-links) |
| ~~m3e~~ | ~~Export from VS Code~~ | Apache 2.0 | `Nowline: Export…` shell-out command for PDF / pixel-strict PNG / HTML / Markdown+Mermaid / XLSX / MS Project XML; `nowline.export.*` settings (cliPath, PDF page-size/orientation/margin, sans/mono fonts, headless, PNG scale, MS Project start); per-export Override… quickPick |
| ~~m3f~~ | ~~Authoring commands~~ | Apache 2.0 | `Nowline: New Roadmap…` (`--init` parity); `.nowlinerc`-vs-settings disagreement diagnostic in the preview (suppressed when `nowline.ignoreRcFile` is `true`) |
| ~~m3.5~~ | ~~GitHub Action~~ | Apache 2.0 | `packages/nowline-action/` (in this monorepo) + `lolay/nowline-action` Marketplace mirror: file mode + markdown mode, shells out to `@nowline/cli`. Five releases (`v0.2.2`–`v0.2.5`) shipped; Marketplace listing live. One small carry-forward: bundled-action smoke test — see [`specs/handoffs/handoff-m3.5-action.md`](./handoffs/handoff-m3.5-action.md) → "Remaining work". |
| ~~m4~~ | ~~Embed~~ | Apache 2.0 | Browser embed script (`@nowline/embed`), branded `embed.nowline.{io,dev}` Firebase-Hosted CDN (both tiers live 2026-05-28), and share-link generator (`share`/`sourceUrl`, OSS grammar in `specs/embed.md`) shipped in v0.4.2. |
| m4.5 | IDE Expansion | Apache 2.0 | Obsidian, Neovim, JetBrains (timing TBD) |
| m4.6 | Windows distribution | Apache 2.0 | Scoop bucket (`lolay/scoop-bucket`) and WinGet central-registry submission via `wingetcreate`; new `update-scoop-bucket` + `submit-winget-pkg` jobs in `release.yml`; `SCOOP_BUCKET_TOKEN` + `WINGET_PR_PAT` secrets |
| ~~m4.7~~ | ~~Browser pipeline + preview shell + LSP worker + showcase~~ | Apache 2.0 | `@nowline/browser` (single-call browser pipeline; consolidates today's embed + VS Code render-pipeline glue), `@nowline/preview-shell` (framework-agnostic viewport chrome — zoom/pan/fit/minimap/diagnostic table), `@nowline/lsp-worker` (browser-side packaging of `@nowline/lsp` as a Web Worker + CodeMirror client adapter), `examples/showcase.nowline` (canonical sample roadmap re-exported as a string asset). See [`specs/handoffs/handoff-m4.7-browser-pipeline.md`](./handoffs/handoff-m4.7-browser-pipeline.md). |

## Milestone Details

### ~~m1 — DSL~~

Define and implement the `.nowline` language.

- DSL grammar (Langium), parser, typed AST
- Validation rules (30 rules), error messages with suggestions
- Config block (scale, calendar, styles, defaults) and roadmap-section vocabulary (labels, durations, statuses)
- Include mechanism with config/roadmap merge modes
- Parallel/group blocks for parallel execution
- Person/team declarations, anchors, milestones, footnotes
- TextMate grammar for syntax highlighting

Repo: `lolay/nowline` | Handoff: [`specs/handoffs/m1.md`](./handoffs/m1.md)

### ~~m2a — CLI Core~~

CLI scaffold and the subset of commands that do not need a layout engine. Ships the distribution pipeline so every later milestone inherits it.

- `@nowline/cli` package wrapping `@nowline/core` (from m1)
- Commands: `nowline validate`, `nowline convert` (bidirectional text ↔ JSON AST), `nowline init` (minimal/teams/product templates), `nowline version`
- `.nowlinerc` config discovery; exit codes 0/1/2/3; text and JSON diagnostic formats
- Distribution: `bun compile` binaries (macOS arm64/x64, Linux x64/arm64, Windows x64/arm64), Homebrew custom tap, apt, npm, GitHub Releases

Spec: [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2a.md`](./handoffs/m2a.md)

### ~~m2b — Layout + SVG~~

The visual milestone: render a `.nowline` file to an SVG. This is what m3 (IDE live preview) and m4 (embed) both consume.

- Layout engine (`@nowline/layout`) — AST → positioned model (pure, browser-safe)
- SVG renderer (`@nowline/renderer`) — positioned model → SVG string
- `nowline render` command with SVG output (all flags except format-specific ones)
- `nowline serve` — local dev server that watches a file and live-reloads the SVG in the browser (originally slated for m4.5; pulled forward because `serve` needs only SVG and unlocks preview for editors without a native panel)
- Light and dark themes

Spec: [`specs/rendering.md`](./rendering.md), [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2b.md`](./handoffs/m2b.md)

### ~~m2b.5 — CLI Redesign~~

Verbless, all-flags CLI. Lands before m2c so the six new export formats inherit the new shape from day one.

- Default mode: `nowline <input>` renders.
- Mode flags (mutually exclusive): `--serve`, `--init`, `--dry-run`.
- Standard flags: `-h/--help`, `-V/--version`, `-v/--verbose`, `-q/--quiet`.
- Format resolution: `-f` flag → `-o` extension → `.nowlinerc defaultFormat` → `svg`.
- Hard cut on every old verb (`render`, `serve`, `validate`, `convert`, `init`, `version`).

Spec: [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2b.5.md`](./handoffs/m2b.5.md)

### ~~m2c — Export Formats~~

Every other format the verbless render mode can emit. Each format is an adapter on top of the SVG renderer or the positioned model.

- PNG — SVG → raster via resvg-js (WASM)
- PDF — positioned model → vector PDF via PDFKit
- HTML — self-contained page embedding the SVG
- Markdown+Mermaid — best-effort `gantt` transpile (Trojan horse for adoption)
- XLSX — ExcelJS workbook (Roadmap, Items, Milestones, Anchors, People and Teams)
- MS Project XML — lossy export for PM tool import

Spec: [`specs/rendering.md`](./rendering.md) § Output Formats, [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2c.md`](./handoffs/m2c.md)

### ~~m2d — Sample minimal alignment~~

The first of five sample-fidelity milestones. Pairs [`examples/minimal.nowline`](../examples/minimal.nowline) with [`specs/samples/minimal.svg`](./samples/minimal.svg) and brings the renderer's light-theme output into the same visual family as the hand-built reference.

- Light-theme palette overhaul in [`packages/layout/src/themes/light.ts`](../packages/layout/src/themes/light.ts) (slate page background, white panels, slate borders, slate text, sample status palette)
- Header card — rounded white rect with subtle drop shadow, title + author on two lines
- Timeline panel — rounded white rect behind tick labels; thin dotted vertical grid lines drop through the swimlanes
- Swimlane frame tab — small rounded chiclet at the top-left of each band carrying the swimlane title
- Item bar status indicator moved to the upper-right of the bar; title moves left
- Bottom 4px progress strip in `style.fg` (replaces the full-height fill)
- Solid red now-line at 2.25px stroke with a pill label
- "now|ine" wordmark anchored bottom-right of the last swimlane (or footnote panel when present)

Spec: [`specs/rendering.md`](./rendering.md) | Handoff: [`specs/handoffs/m2d.md`](./handoffs/m2d.md)

### ~~m2e — Sample platform-2026~~

Full-feature reference. Pairs [`examples/platform-2026.nowline`](../examples/platform-2026.nowline) with [`specs/samples/platform-2026.svg`](./samples/platform-2026.svg) and adds the chrome that covers anchors, milestones, owners, footnotes, labels, and styled groups.

- Unified anchor + milestone header row (with collision stacking) layered above the tick-label row
- Anchor cut lines (thin dashed) and milestone cut lines (prominent dashed indigo) drawn over swimlane fills
- Frame tab carries owner badge and footnote superscript inline
- Inline label chiclets sit inside the item bar above the progress strip
- Link-icon tile (small colored square + arrow glyph) in the item bottom-right
- Footnote panel — rounded white rect with shadow, red-numbered entries, attribution wordmark anchored to the panel
- Styled group with a chiclet label tab overhanging the box top
- Dependency arrow `<marker>` arrowheads attached to visual bar edges

Spec: [`specs/rendering.md`](./rendering.md) | Handoff: [`specs/handoffs/m2e.md`](./handoffs/m2e.md)

### ~~m2f — Sample platform-2026-dark~~

Re-renders the m2e source with `--theme dark` to [`examples/platform-2026-dark.svg`](../examples/platform-2026-dark.svg) and tightens the dark-theme palette in [`packages/layout/src/themes/dark.ts`](../packages/layout/src/themes/dark.ts) to match [`specs/samples/platform-2026-dark.svg`](./samples/platform-2026-dark.svg). No new geometric features.

Spec: [`specs/rendering.md`](./rendering.md) | Handoff: [`specs/handoffs/m2f.md`](./handoffs/m2f.md)

### ~~m2g — Sample dependencies~~

Cross-lane dependencies and parallel-block visuals. Pairs [`examples/dependencies.nowline`](../examples/dependencies.nowline) with [`specs/samples/dependencies.svg`](./samples/dependencies.svg).

- Cross-swimlane dependency arrow routing with rounded corners and detour around parallel blocks
- Parallel `[ ]` brackets (`bracket:solid` / `bracket:dashed`) framing nested tracks with group-style padding
- `before:` overflow refinement — red tail on the offending portion of the item bar
- Floating milestone slack arrow — dotted arrow from earlier predecessor's visual right to the milestone line

Spec: [`specs/rendering.md`](./rendering.md) | Handoff: [`specs/handoffs/m2g.md`](./handoffs/m2g.md)

### ~~m2h — Sample isolate-include~~

The final sample-fidelity milestone. Pairs [`examples/isolate-include.nowline`](../examples/isolate-include.nowline) (+ `examples/partner.nowline` for the include target) with [`specs/samples/isolate-include.svg`](./samples/isolate-include.svg).

- Dashed-bordered isolate region with rounded corners and a region label tab on the top edge
- Small external-link badge to the right of the region label
- Cross-region dependency arrows render on top of the region fill

Spec: [`specs/rendering.md`](./rendering.md) | Handoff: [`specs/handoffs/m2h.md`](./handoffs/m2h.md)

### ~~m2.5a — Layout v2: Time Axis~~

First phase of the layout-engine v2 refactor. Replaces the imperative tick math in [`packages/layout/src/timeline.ts`](../packages/layout/src/timeline.ts) with a declarative pair of primitives validated end-to-end in a standalone prototype during planning (now retired; see commit `771127c`).

- `TimeScale` (d3-scale wrapper) replaces `buildTimelineScale` + `pixelsPerDay` + `xForDate`. Adds `forward(date)` / `invert(x)` / `ticks()` so m3's editor gets click-to-date for free.
- `ViewPreset` replaces the `LABEL_THINNING` table and per-unit format functions. Multi-row time headers (year over month over day) drop out for free.
- `WorkingCalendar` lands alongside `CalendarConfig` in [`packages/layout/src/calendar.ts`](../packages/layout/src/calendar.ts) as a strategy: `continuousCalendar()` (default), `weekendsOff()`, `withHolidays(...)`. The DSL's `business` calendar mode becomes a factory call.
- `PositionedTimelineScale` shape stays stable so the renderer needs no changes.

Validation: existing CLI render tests stay byte-stable on continuous calendars; new tests assert `weekendsOff()` shrinks the chart's `pixelsPerDay` and that `invert(forward(d)) === d` on continuous mode.

Spec: [`specs/rendering-v2.md`](./rendering-v2.md) § m2.5a

### ~~m2.5b — Layout v2: Band Heights~~

Wires `BandScale` (d3-scale-band wrapper) into the swimlane row sizing. Replaces the hardcoded `ITEM_ROW_HEIGHT` constant and the currently-ignored `defaults > spacing` parsing path in [`packages/layout/src/layout.ts`](../packages/layout/src/layout.ts).

- `BandScale.bandwidth()` drives swimlane row height; `paddingInner` exposes `defaults > spacing` to the DSL author for the first time.
- `ItemNode.measure()` returns `height = (text-size * 1.4) * lineCount + padding * 2` so the bar grows with `text-size` instead of clipping.

Validation: bumping `defaults > spacing` from `none` to `md` widens the visible gap between bands; bumping `text-size` from `md` to `lg` grows item heights.

Spec: [`specs/rendering-v2.md`](./rendering-v2.md) § m2.5b

### ~~m2.5c — Layout v2: Measure/Place Tree~~

The load-bearing rewrite. Replaces the monolithic [`layout.ts`](../packages/layout/src/layout.ts) (~1.6 KLOC) with a tree of `Renderable` nodes, one file per entity type:

- `ItemNode`, `SwimlaneNode`, `GroupNode`, `ParallelNode`, `AnchorNode`, `MilestoneNode`, `FootnoteNode`, `IncludeNode`
- Each node implements `measure(ctx)` (returns intrinsic size) and `place(origin, ctx)` (returns a `Positioned*` subtree).
- A `RoadmapNode` composition root walks children top-to-bottom; X stays time-driven via `TimeScale`, Y becomes content-driven.
- Style resolution stays in [`style-resolution.ts`](../packages/layout/src/style-resolution.ts); `measure()` calls take a resolved style as input.
- Edge routing keeps its current orthogonal router as-is — `Renderable.place()` just provides clean endpoint geometry.

Validation: every existing sample (`minimal`, `platform-2026`, `platform-2026-dark`, `dependencies`, `isolate-include`) re-renders byte-stable. Adding a new entity type means a new node file with no edits to existing nodes.

Spec: [`specs/rendering-v2.md`](./rendering-v2.md) § m2.5c | Handoff: [`specs/handoffs/handoff-m2.5c-measure-place.md`](./handoffs/handoff-m2.5c-measure-place.md)

### ~~m2.5d — Layout v2: Theme in Model~~

Cosmetic but valuable for the embed bundle. Resolved palette tokens move into the positioned model so [`packages/renderer/src/svg/render.ts`](../packages/renderer/src/svg/render.ts) drops every `theme === 'dark' ? ...` branch.

- `PositionedItem.fill`, `PositionedItem.stroke`, etc. carry resolved color strings instead of palette tokens.
- The renderer becomes pure data → SVG with no theming logic.
- Bundle savings on the embed script (m4's primary artifact).

Validation: `--theme dark` still emits the expected palette; renderer file shrinks measurably; no theme branches remain in the renderer.

Spec: [`specs/rendering-v2.md`](./rendering-v2.md) § m2.5d

### ~~m2i — Sample fidelity polish~~

Post-Layout-v2 rendering refinements that landed once the measure/place tree was in place. Not planned as a discrete milestone up front — surfaced from sample reviews of `examples/long.nowline`, `examples/nested.nowline`, and `examples/platform-2026.nowline` as the v2 nodes exposed seams that the monolithic `layout.ts` had hidden. Recorded here so the milestone chain reflects what shipped before m3 begins.

Item-bar geometry:
- Restructured item-bar layout (groups, label chiclets, link icons in upper-left, footnote indicator)
- Stack spilled label chips and grow the bar vertically to enclose them
- Stack in-bar chips below the meta baseline and grow the bar to fit
- Spill the status dot, link icon, and footnote past narrow item bars (with `MIN_BAR_WIDTH_FOR_*` thresholds + a reading-order spill column)
- Wrap bracket-style group titles inside the bracket glyph (`GROUP_BRACKET_LABEL_OVERHANG_PX`)

Group / parallel layout:
- Reserve inter-row gap below a styled group inside parallel layouts
- Pack markers + chart rows so anchor / milestone / item collisions bump out of the way (with `topmost-fit` row packer)
- Repack markers tick-first

Color & contrast:
- Pick status-dot tone per-bar from a luminance-aware dual palette (`onLight` / `onDark`)
- Deepen the status-dot palette so dots read on label-tinted bars
- Use chart-tuned color for spilled captions and bar text for footnote indicators
- Theme dark header card

Now-pill & canvas:
- Reserve canvas room for the now-pill via a single growth helper
- Flag-mode the now-pill at chart edges instead of growing the canvas; align the flag-mode pill edge with the now-line's outer stroke edge
- Fit canvas and lanes to spilled captions
- Centralize layout geometry constants and reposition slack arrows
- Standardize roadmap dates and default missing `start:` to today
- Halo include-region source-path text to clear the dashed border
- Refine output: gutter token, tighter trailing tick, attribution mark
- Resolve `after:<anchor>` and reverse-side footnotes on items

Timeline visibility on tall canvases:
- Add `timeline-position` style (`top` (default), `bottom`, `both`); `both` mirrors the date strip at the chart bottom so dates stay readable without scrolling back to the top. The mirrored strip shares fill, border, label color, and tick positions with the top strip; it has no now-pill and no marker row.
- Add `minor-grid` style (boolean, opt-in) — draws faint solid grid lines at every tick boundary in addition to the major-tick lines.
- Promote chart-body grid lines to a dedicated `grid` layer drawn after swimlane backgrounds so they actually appear in the chart body (previously occluded by the opaque swimlane fills, only visible inside the timeline header).
- Tune palette so the major grid line is darker than the minor line, both solid — visual hierarchy by color rather than texture (`theme.timeline.gridLine` + `theme.timeline.minorGridLine`).
- Major grid lines thread the entire timeline strip (top date panel through bottom date panel when one is mirrored); minor grid lines stay inside the chart body, starting at the topmost swimlane top edge and stopping above the bottom date panel so they don't streak through the marker row or compete with date labels.
- Introduce `swimlaneBottomY` on the layout context, distinct from `chartBottomY`. Milestone and anchor cut-lines now stop at the last swimlane (no longer invading the bottom date strip when one is mirrored). The now-line stops at the bottom date panel when present, otherwise at the last swimlane; it no longer extends through the footnote area.

Test harness:
- Add `tests/` harness for renderer manual validation; add `item-bumps-up` and `isolate-include-multi` fixtures
- Strip dead `layout-v2/` links from spec + code; remove the layout-v2 prototype

Spec: [`specs/rendering.md`](./rendering.md) (post-m2.5 sections covering item bars, narrow-bar spill, bracket-style groups, now-pill flag mode, row packing)

### ~~m2j — Capacity & utilization~~

Adds a first-class capacity model so swimlanes and items can express throughput, with a tri-state visualization for lane utilization. Lands in two phases on `feat/capacity`.

**Phase A — Effort-based sizing (m1–m8 of the in-flight branch):**

- `capacity:N` on swimlanes (integer/decimal) and items (integer/decimal/percent).
- `capacity-icon:` style vocabulary (`none`, `multiplier` (default), `person`, `people`, `points`, `time`) plus custom `symbol` declarations and inline Unicode literals.
- `size <id> ["title"] effort:N` declarations replace the old `duration` entity. Items reference a size via `size:NAME` and derive their bar duration as `effort ÷ item_capacity`. Explicit `duration:` literal always wins.
- `remaining:` accepts both percent (`30%`) and single-engineer effort literals (`0.5d`, `1w`); literal form normalizes to a percent of total effort with overflow clamped + soft warning.
- Renderer paints an inline size chip on the meta line (chip text uses size's `title` when provided, falls back to id-as-typed) and a `N[glyph]` capacity suffix after the duration.

**Phase B — Tri-state utilization indicator (m9–m14 of the in-flight branch):**

- `utilization-warn-at:N` and `utilization-over-at:N` properties on `swimlane` (and `default swimlane`). Defaults: `warn-at:80%`, `over-at:100%`.
- Layout sweeps the lane's per-timestep load function and classifies half-open segments as `green | yellow | red`.
- Renderer paints a continuous health-bar underline along the bottom of each lane band that has `capacity:` declared.
- `utilization-warn-at:none` / `utilization-over-at:none` opt out of individual color bands; setting both to `none` suppresses the underline outright. Replaces the old `overcapacity:show|hide` toggle.

Spec: [`specs/dsl.md`](./dsl.md) § Capacity, [`specs/rendering.md`](./rendering.md) § Swimlane Capacity | Handoff: [`specs/handoffs/handoff-m9-utilization.md`](./handoffs/handoff-m9-utilization.md)

### ~~m2k — Dependency arrow attach + routing~~

Three-step refinement of the m2g edge routing once Layout v2 (m2.5a–m2.5d) and the m2i polish were in place. Sample reviews of [`examples/dependencies.svg`](../examples/dependencies.svg) exposed three escalating issues that the original Manhattan `routeEdge` couldn't address: arrows piercing entity centers, vertical legs crashing through item bars, and tight gutters with no visible target stub. m2k collects the fixes.

Attach geometry:
- Arrows terminate at the **left visual edge** of the dependent item (not the logical column center), so the arrowhead lands on the painted bar.
- Source point exits the **right visual edge** at the row midline, dropping to the **vertical center of the bottom progress strip** when the caption spills past the bar (so the arrow runs underneath the spilled text rather than through it).
- Anchor / milestone predecessors attach to the marker's **vertical cut line** at the *target* item's row mid-Y — the cut line is the visible stem; the arrow is the short horizontal stub from the line into the target's left edge.
- Same-row immediate-successor chains in one swimlane skip drawing — the spatial flow already conveys ordering. Marker → item stubs always draw.

Milestone slack arrows — flow dedupe:
- Predecessors are grouped by their enclosing **flow** (deepest single-track container — swimlane root, sequential `group`, or one `parallel` sub-track). Within one flow, only the **latest** predecessor (rightmost x) draws a slack arrow; siblings to its left collapse silently because file order in a single-track container already encodes the chain. Across flows (e.g., two predecessors in different `parallel` sub-tracks), each flow's last entry contributes its own slack arrow.

Channel-based orthogonal router:
- Replaced the single-elbow Manhattan `routeEdge` with a router that drops the vertical leg in the cleanest **inter-column gutter** between source and target. Item bars are obstacles; containers (`group`, `parallel`) are NOT obstacles (looping arrows around container edges produced unsatisfying detours).
- Visible parallel `[ ]` brackets and bracket-style groups get a **bracket-clearance nudge**: the elbow X is shifted at least `BRACKET_NUDGE_PX` (4 px) away from any bracket whose Y span overlaps the leg. Both the vertical bar AND the inward foot tips of `[ ]` brackets are modelled.
- Edges sharing a channel get distinct **slot indices** assigned by greedy interval coloring on their Y spans (slots map to ±3, ±6 px offsets around the channel centerline), so parallel arrows fan out instead of stacking.
- **Under-bar fallback**: when no clean channel fits, the edge is tagged `kind: 'underBar'` and the renderer paints it BEFORE swimlane / item fills with a thinner 0.8 px stroke so the bar stays the visual foreground (vs the standard 1.1 px for normal edges).

Min-stub constraints:
- Every left-to-right edge guarantees `MIN_SOURCE_STUB_PX` (6 px) of horizontal lead-out from the source AND `MIN_TARGET_STUB_PX` (6 px) of horizontal lead-in to the target's arrowhead. The router computes a **satisfiable range** `[from.x + MIN_SOURCE_STUB_PX, to.x - MIN_TARGET_STUB_PX]` and confines the elbow X to it. When the gutter is narrower than the combined stubs, the router pins the elbow at `to.x - MIN_TARGET_STUB_PX` and forces under-bar so the leg paints behind the bars while the visible arrowhead lead-in is preserved.
- Bracket-clearance nudge candidates are constrained to the satisfiable range; when neither side fits inside the range, the router signals under-bar.

Spec: [`specs/rendering.md`](./rendering.md) § Dependency Arrows (Attach geometry + Channel Routing) | Handoff: [`specs/handoffs/m2k.md`](./handoffs/m2k.md)

### ~~m2l — Manual pages~~

Distribution-polish milestone: hand-authored `nowline.1` (CLI flags + a `LANGUAGE` cheatsheet) and `nowline.5` (full DSL reference) so `man nowline` and `man 5 nowline` both work after any normal package-manager install. The CLI page mirrors the existing `--help` text and the [`specs/cli.md`](./cli.md) flag tables; the section-5 page mirrors [`specs/dsl.md`](./dsl.md). Neither is generated from either source, deliberately, so each can be edited as a man page first and a derived doc afterwards. The DSL is the product (per [`AGENTS.md`](../AGENTS.md)), so it gets its own section-5 page in the Unix file-format convention (`gitignore(5)`, `crontab(5)`, `ssh_config(5)`).

- **Sources:** [`packages/cli/man/nowline.1`](../packages/cli/man/nowline.1) and [`packages/cli/man/nowline.5`](../packages/cli/man/nowline.5) — mdoc format (`.Dd`, `.Sh NAME`, `.Bl -tag`, etc.). Co-located with the CLI package so they travel with the npm publish.
- **Homebrew tap:** the `Formula/nowline.rb` heredoc emitted by [`.github/workflows/release.yml`](../.github/workflows/release.yml) ships `resource "manpage"` + `resource "manpage5"` blocks plus matching `man1.install "nowline.1"` and `man5.install "nowline.5"` lines in `def install`.
- **Debian:** [`scripts/build-deb.sh`](../scripts/build-deb.sh) installs the pages at `/usr/share/man/man1/nowline.1.gz` and `/usr/share/man/man5/nowline.5.gz` (`gzip -n -9` for byte-deterministic output, per Debian policy 12.3).
- **npm:** [`packages/cli/package.json`](../packages/cli/package.json) lists both pages in the `"man"` array (`"./man/nowline.1"`, `"./man/nowline.5"`) and includes `man/` in the `"files"` array; `npm install -g @nowline/cli` installs both pages on Unix automatically.
- **GitHub Release asset:** the `github-release` cell of the `publish` matrix stages both `packages/cli/man/nowline.1` and `packages/cli/man/nowline.5` alongside the six platform binaries and two `.deb`s; advanced direct-download users can grab them from the same release page.

The mdoc `.Dd $Mdocdate$` placeholder is substituted by groff at render time from the file's mtime, so the source bytes don't change between releases. Mirrors the d2 pattern; we evaluated `pandoc -t man`, `marked-man`, and `scdoc` and picked hand-authored mdoc for its zero build dependencies (see [`specs/cli-distribution.md`](./cli-distribution.md)).

### ~~m2m — Localization (fr)~~

Localization milestone landing the architecture (file-level locale property, env-var-aware CLI flag, CLDR-style fallback resolver, error-code-keyed validator messages) plus the first non-English bundle. Quebec is the driver: `fr-CA` users get a translated man page and validator messages immediately; the architecture leaves room for future `es`, `de`, `ja`, RTL/CJK locales without rework.

Three surfaces become locale-aware:

- **Render** — axis tick labels (`Intl.DateTimeFormat` keyed on the resolved locale), now-pill text, quarter prefix (`Q`/`T`), footnote sort.
- **Pipeline** — validator messages and CLI help, extracted into stable error-coded bundles (`NL.E####`); a CI check enforces every key in `messages.en.ts` exists in `messages.fr.ts`.
- **Man page** — `packages/cli/man/fr/nowline.1` (full neutral-French translation) plus per-channel install wiring (Homebrew loop, `.deb` `/usr/share/man/<locale>/man1/`, npm `"man"` array, GitHub Release assets).

Bundle layout mirrors the CLDR tree (`root → fr → {fr-CA, fr-FR}`); regional overlays start empty and exist only as a contract for future divergence. The loader strips trailing subtags and retries, so future `fr-BE` / `fr-CH` resolve through `fr` automatically.

DSL non-goals: keywords and identifier characters stay English/ASCII (every diagram-tool peer that translated keywords regretted it). Author-facing localization runs through arbitrary-UTF-8 titles (`item research "Investigación"`).

Spec: [`specs/localization.md`](./localization.md)

### ~~m2n — Inline date pins~~

Lightweight, calendar-bound counterpart to a declared `anchor`. Lets an author pin a single `item`, `parallel`, or `group` to a specific date by typing the date directly into `after:` / `before:` instead of declaring a named `anchor` and referring to it.

```nowline
item ship "Ship release" size:m after:2026-03-15
item code-review size:s before:2026-05-01
item integration size:l after:[auth-refactor, 2026-04-01]
group api-track after:2026-02-01
parallel rollouts before:2026-06-30
```

DSL surface:

- `after:DATE` / `before:DATE` accept a single ISO date literal (`YYYY-MM-DD`) — already a terminal in the grammar so no parser changes were needed.
- Mixed lists are allowed (`after:[kickoff, 2026-03-15]`) and resolve to the latest (`after`) / earliest (`before`) of all elements; ids and dates can intermix freely.
- Allowed only on `item`, `parallel`, `group` — *not* `milestone` (which already has `date:`), `swimlane`, `anchor`, `footnote`, `person`, or `team`.
- At most one inline date per direction — multiple dates in the same `after:` (or same `before:`) collapse to one binding date.
- File-level rules unchanged: any file with an inline date requires `roadmap … start:YYYY-MM-DD`, and every inline date must be ≥ that start.

Validator:

- Four new error codes — `NL.E0410` (multiple dates per direction), `NL.E0411` (date on a disallowed entity), `NL.E0412` (missing roadmap `start:`), `NL.E0413` (date before roadmap `start:`). EN + FR bundles both ship.
- New validation rules `24a` / `24b` plus extended `27` / `28` in [`specs/dsl.md`](./dsl.md) § Validation Rules.
- Inline date literals are *not* graph nodes — cycle detection (rule 25) and reference resolution both skip them so a self-`after:DATE` neither becomes a phantom node nor a cycle.

Layout / renderer:

- New `inline-date-pin-geometry.ts` module — pure placement helpers for items (with narrow-bar spill + decoration-row interleaving) and containers (group / parallel — always flush in the bounding-box corner, never spill).
- `PositionedItem` / `PositionedGroup` / `PositionedParallel` carry an optional `inlineDatePins?: InlineDatePin[]` payload (0–2 entries per entity, one per direction).
- Renderer paints a 12×12 px `calendar` glyph from the curated icon library at top-LEFT (`after`) / top-RIGHT (`before`); coloured with the entity's resolved meta colour; wrapped in `<g><title>YYYY-MM-DD</title></g>` so browsers surface a hover tooltip. **No caption, no chart-spanning cut line** — those visuals remain reserved for declared `anchor` / `milestone`.
- `calendar` is reserved as a built-in icon name (rule `17i`) so a `symbol calendar` declaration can't shadow the inline-date glyph.

Fixtures / tests:

- New example `examples/inline-date-pins.nowline` covering single-direction pins, mixed lists, group, and parallel; rendered by `pnpm build`.
- New renderer fixture `tests/inline-date-corners.nowline` exercising the corner-glyph placement matrix (bare item, link icon only, link + dot + footnotes, mixed list, styled group, unstyled group, bracketed parallel, bare parallel).
- New vitest suites: `packages/core/test/validation/inline-date-pins.test.ts` (6 happy paths + 6 error paths + 2 negative checks for cycle / reference resolution) and `packages/layout/test/inline-date-pins.test.ts` (snapshot guard on the geometry numbers for item / group / parallel).
- `inline-date-pins.nowline` joined the roundtrip allow-list in `packages/cli/test/convert/roundtrip.test.ts` so the printer keeps the new syntax stable.

Spec: [`specs/dsl.md`](./dsl.md) § "Inline date pins" + rules `24a`, `24b`, `27`, `28`; [`specs/rendering.md`](./rendering.md) § "Inline-date glyph" | Handoff: [`specs/handoffs/handoff-m2n-inline-date-pins.md`](./handoffs/handoff-m2n-inline-date-pins.md)

### ~~m3a — LSP server~~

Langium-based language server (`@nowline/lsp`) shipped as a standalone package. Provides validation, go-to-definition, find-references, rename, hover, completion (IDs and status values), document symbols, and folding for `.nowline` files.

### ~~m3b — VS Code / Cursor extension scaffold~~

Bundled `.vsix` (`@nowline/vscode`) shipping the TextMate grammar, language configuration, snippets, file icon, LSP client, and `nowline.trace.server` setting. Live preview deferred to m3c.

### ~~m3c — Live preview~~

Live preview lands in the same extension as m3b. The extension host runs the CLI's pipeline (`parseSource` → `resolveIncludes` → `layoutRoadmap` → `renderSvg`) and posts the SVG into a webview that owns viewport + diagnostics chrome. Two open commands match VS Code's markdown UX (`Cmd+Shift+V` same tab, `Cmd+K V` beside) and the preview is also reachable from the editor title bar, editor right-click, tab right-click, and Explorer right-click.

Webview shell ships:

- Toolbar (zoom −/+, zoom %, Fit Width, Fit Page, Save ▾, Copy ▾)
- `Cmd/Ctrl + scroll-wheel` and trackpad pinch zoom (centered on cursor)
- Spacebar-drag pan + Figma-style keyboard presets (`1`/`2`/`3`/`0`)
- Minimap with viewport rect, click-to-recenter, drag-to-pan, auto-hide
- Clickable diagnostic table (jump-to-line, link to Problems panel)
- Save / Copy SVG (passthrough) and Save / Copy PNG (browser-canvas raster, with documented ~95% fidelity caveat vs. `nowline --format png`)

Five new settings: `nowline.preview.refreshOn`, `debounceMs`, `theme`, `defaultFit`, `showMinimap`.

Spec: [`specs/ide.md`](./ide.md) | Handoff: [`specs/handoffs/m3c.md`](./handoffs/m3c.md)

### ~~m3d — Preview parity~~

Brings the live preview into option-parity with `nowline render`. Today the preview pipeline only consumes `text + fsPath + theme + today`; CLI flags like `--locale`, `--width`, `--strict`, `--no-links`, `--asset-root`, and `--now` are silently the default. m3d widens the pipeline input and threads a single resolution chain through it (settings → `.nowlinerc` → DSL directive → defaults; toolbar overrides on top for the active panel).

- `.nowlinerc` reader with workspace `FileSystemWatcher('**/.nowlinerc')`; cached per-directory; same `loadConfig` helper as `@nowline/cli` (extracted to the shared `@nowline/config` package so both consumers stay byte-identical).
- New preview-affecting settings: `nowline.preview.locale`, `now`, `strict`, `showLinks`, `width`, `assetRoot`.
- New global setting: `nowline.ignoreRcFile` (default `false`).
- Preview toolbar overrides: theme (light/dark/auto), now-line (today/at-date/hide), show links — per-session, not persisted.

Spec: [`specs/ide.md`](./ide.md) § Configuration

### ~~m3e — Export from VS Code~~

Adds `Nowline: Export…` (palette + editor-title menu + tab right-click), which shells out to the bundled `nowline` CLI to produce PDF, pixel-strict PNG, HTML, Markdown+Mermaid, XLSX, or MS Project XML. Avoids bundling resvg / pdfkit / exceljs / etc. into the `.vsix`; mirrors the README's existing PNG-fidelity caveat ("for pixel-strict output run the CLI").

- New `nowline.export.*` settings: `cliPath`, `pdf.pageSize`, `pdf.orientation`, `pdf.margin`, `fonts.sans`, `fonts.mono`, `fonts.headless`, `png.scale`, `msproj.start`.
- Per-export **Override…** quickPick for format-specific flags (overrides not persisted).
- Spawn streams stderr to the existing `Nowline Language Server` output channel; failures surface via `vscode.window.showErrorMessage`.
- Missing CLI surfaces an "Install Nowline CLI…" notification and falls back to the existing in-webview SVG / browser-canvas-PNG buttons.

Spec: [`specs/ide.md`](./ide.md) § Export to other formats

### ~~m3f — Authoring commands~~

Closes the remaining gap with the verbless CLI by exposing the parts of `--init` that make sense from the editor.

- `Nowline: New Roadmap…` writes a starter `.nowline` file from the same template the CLI's `--init` writes; prompts for a name and target folder.
- `.nowlinerc`-vs-settings disagreement diagnostic in the preview, surfaced inline so authors notice when a workspace `.nowlinerc` is being shadowed by a personal VS Code setting (suppressed when `nowline.ignoreRcFile` is `true`).

Spec: [`specs/ide.md`](./ide.md) § Authoring commands

### ~~m3.5~~ — GitHub Action

Renders Nowline files in CI for hosts that strip `<script>` tags (GitHub READMEs, issue comments, etc.). Two modes:

- **File mode** — render `.nowline` files to SVG/PNG.
- **Markdown mode** — scan markdown for ` ```nowline ` blocks, render each one, and insert / refresh the generated image adjacent to the block.

The action is render-only — it writes / refreshes output files and emits the list of changed paths. Persistence is composed downstream via [`stefanzweifel/git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action), [`peter-evans/create-pull-request`](https://github.com/peter-evans/create-pull-request), or a bare `git diff --exit-code` step. See [`specs/embed.md`](./embed.md) § "Render-only contract" for the rationale.

**Repo posture (matches Mermaid's `mermaid-cli` shape):** the action source lives in this monorepo at `packages/nowline-action/` so cross-cutting PRs with the CLI stay atomic. On each release, `release.yml` mirrors the compiled `action.yml` + `dist/` to the `lolay/nowline-action` repo for GitHub Marketplace listing — the mirror is a publish target like Homebrew tap or npm, not a source-of-truth repo. See [`specs/architecture.md`](./architecture.md) § Organization and Repositories.

The action shells out to `@nowline/cli` (from m2a) and has no dependency on the embed bundle, so it ships before m4 — depending on the embed package would force the action to wait for m4 without buying anything in return.

Depends on: m2a (CLI distribution pipeline), m2c (export formats — PNG, in particular), m3e (CLI shell-out pattern reused for repeatability).

Status: **shipped.** `packages/nowline-action/` source, esbuild bundle (`dist/index.cjs`, ~1.2 MB CJS), 29-case vitest suite, and the `release.yml` mirror cell all live. Five releases (`v0.2.2` → `v0.2.5`) pushed end-to-end through the mirror cell, with the moving `v0` tag tracking the latest. Marketplace listing live at [`github.com/marketplace/actions/nowline-roadmap-builder`](https://github.com/marketplace/actions/nowline-roadmap-builder) (Continuous integration + Utilities); subsequent releases roll the listing forward automatically via a `gh release create` step. One remaining gap: a bundled-action smoke test that exercises `node dist/index.cjs` with `INPUT_*` env vars from CI — tracked as deliverable 8 in [`specs/handoffs/handoff-m3.5-action.md`](./handoffs/handoff-m3.5-action.md) → "Remaining work".

Spec: [`specs/embed.md`](./embed.md) § GitHub Action

### ~~m4~~ — Embed (browser bundle)

`@nowline/embed`: a single esbuild-built IIFE that finds ` ```nowline ` fenced code blocks in a page and renders them client-side. Mirrors Mermaid's surface (`initialize`, `render`, `parse`, `init`/`run`) so users coming from Mermaid don't have to relearn anything.

- Browser-safety refactor of `@nowline/core` (`include-resolver` lazy-imports `node:fs`; `posix-path` helper replaces `node:path`; `sideEffects: false` on core / layout / renderer for tree-shaking).
- New `packages/embed/` package, published to npm in lock-step with the rest of the workspace.
- esbuild script emits `dist/nowline.min.js` (IIFE), `dist/nowline.esm.js` (ESM), and source maps; CI bundle-size gate at 175 KB gzipped (first measurement landed at ~163 KB; budget headroom buys ~12 KB for incremental growth and still beats Mermaid's 200 KB by a comfortable margin).
- happy-dom smoke covers auto-scan replacement, multi-block style isolation, manual `nowline.render`, and the once-per-page `include`-warning behaviour.
- Distribution: branded CDN at `embed.nowline.{io,dev}` (Firebase-Hosted, two projects, per-PR ephemeral channels). GitHub `embed-dev` / `embed-prod` environments wired from [`nowline-infra`](https://github.com/lolay/nowline-infra) terraform outputs (2026-05-28). `embed.nowline.dev/nowline.min.js` live 2026-05-26; `embed.nowline.io/{X.Y.Z,X.Y,latest}/nowline.min.js` live 2026-05-28 via `release.yml` tag-driven prod deploy (`v0.4.2`). See [`specs/handoffs/handoff-m4-embed.md`](./handoffs/handoff-m4-embed.md) § "What shipped" and [`nowline-infra/ops/embed-deploy.md`](https://github.com/lolay/nowline-infra/blob/main/ops/embed-deploy.md) § Verification.
- Share-link generator (2026-05-28, `v0.4.2`): `share` and `sourceUrl` `initialize()` options append a "Share on Nowline" anchor beneath each rendered diagram, encoding the source via the OSS share-link grammar (`#text=` / `#url=`). Canonical contract in [`specs/embed.md`](./embed.md) § Share on Nowline; consumed by [`lolay/nowline-app`](https://github.com/lolay/nowline-app) m5b (Free anonymous share modes).

Single-file mode: the embed warns once and skips `include` directives. Multi-file rendering remains the CLI's / m3.5 action's job.

Spec: [`specs/embed.md`](./embed.md) | Handoff: [`specs/handoffs/handoff-m4-embed.md`](./handoffs/handoff-m4-embed.md)

### ~~m4.7 — Browser pipeline + preview shell + LSP worker + showcase~~

Browser-tooling extraction milestone. Lifts three pieces of duplicated browser glue out of the embed bundle and the VS Code extension into reusable packages, plus a canonical sample example. Lands as a doc-only PR in this slot; the four code packages ship in a follow-up implementation PR. Apache-2.0 across the board.

Why this exists: today the embed bundle (`packages/embed/src/pipeline.ts`) and the VS Code extension (`packages/vscode-extension/src/preview/render-pipeline.ts`) carry near-duplicate "parse → resolve includes → layout → render → diagnostics" glue, and the VS Code webview's viewport chrome (`packages/vscode-extension/src/preview/shell-html.ts`, ~1000 LOC) lives in an inline string template that no other surface can reuse. The Langium LSP from m3a is Node-only and can't run in a browser without a packaging layer. Extracting these makes commercial browser surfaces (Free SPA at `free.nowline.io`, future browser-hosted IDE wrappers) consume the same battle-tested OSS code instead of forking, and gives any third-party building a Nowline-aware web tool a clean dependency target. Nothing about this milestone widens the OSS scope past today's tools — it's a refactor that reshapes existing code into smaller, more reusable units.

Four code deliverables (plus this doc-only PR):

1. **`packages/browser/` (`@nowline/browser`)**
   - One ESM `renderSource(source, options) → { svg } | { diagnostics }` and a matching `parseSource(source, options) → { ast, diagnostics }`.
   - Consolidates [`packages/embed/src/pipeline.ts`](../packages/embed/src/pipeline.ts) and [`packages/vscode-extension/src/preview/render-pipeline.ts`](../packages/vscode-extension/src/preview/render-pipeline.ts). Keeps the VS Code branch's Node `fs`-backed include resolver as a pluggable hook so VS Code can keep file-system include resolution while the embed and Free SPA stick with the single-file warning behavior.
   - `@nowline/embed` re-exports `render` / `parse` from this package. VS Code extension's render pipeline becomes a thin shim. Free SPA imports it directly.
   - Bundle-size invariant: the embed's gzipped size after the migration is bounded by the existing m4 budget (175 KB CI gate); aim for net-zero or smaller.

2. **`packages/preview-shell/` (`@nowline/preview-shell`)**
   - Framework-agnostic ES module hoisted from [`packages/vscode-extension/src/preview/shell-html.ts`](../packages/vscode-extension/src/preview/shell-html.ts).
   - Public API: `mountPreview(rootEl, options) → { setSvg, setDiagnostics, dispose, fitPage, fitWidth, getZoom, setZoom, ... }`.
   - Handles zoom (`Cmd/Ctrl + scroll-wheel`, trackpad pinch, toolbar +/−), pan (spacebar-drag, drag), Figma-style keyboard presets (`1`/`2`/`3`/`0`), Fit Page / Fit Width, minimap with viewport rect + click-to-recenter + drag-to-pan + auto-hide, and a clickable diagnostic table.
   - No opinion on text editor or message bus. Consumers feed in SVG and diagnostics; consumers handle save/copy/jump-to-line in their own way.
   - VS Code webview imports it (replacing today's inline string template); Free SPA wraps it in React via `useEffect` + ref.
   - Pro does **not** consume this package. Pro's hybrid HTML+SVG canvas (drag-and-drop, inline card edit) has its own stage-transform interaction model — see the commercial application's rendering spec.

3. **`packages/lsp-worker/` (`@nowline/lsp-worker`)**
   - Browser-side packaging of [`packages/lsp`](../packages/lsp). Today `@nowline/lsp` runs as a Node language server; this package wraps the same Langium services (`createNowlineServices()` from `@nowline/core`) in a Web Worker entry plus a `MessageReader` / `MessageWriter` over `postMessage`.
   - Ships a Worker entry (`@nowline/lsp-worker/worker`) and a thin client adapter (`@nowline/lsp-worker/client`) that CodeMirror's `@codemirror/lint`, `@codemirror/autocomplete`, `@codemirror/view` (hover tooltip) extensions can consume via standard LSP-over-`postMessage`.
   - **Wire-protocol requirement (standard LSP discipline, not collab-specific):** the `textDocument/didChange` notification accepts LSP-spec range deltas (`range` + `text`), not whole-document replacement. This matches what VS Code's language client already emits today, makes incremental analysis cheap on large documents, and is the protocol shape every conforming LSP implementation already speaks. We pin it explicitly so future contributors don't regress to whole-document sends and silently quadruple parse cost on every keystroke.
   - Surface: `textDocument/publishDiagnostics`, `textDocument/completion`, `textDocument/hover`, `textDocument/definition`, `textDocument/references` — same set the VS Code extension exercises against the Node LSP today.
   - VS Code extension keeps using the Node-side `@nowline/lsp` (no behaviour change for the extension). Only browser surfaces (Free SPA, future browser-hosted IDE wrappers) consume the worker package.

4. **`examples/showcase.nowline`**
   - Canonical sample roadmap: a couple of swimlanes, a simple linear flow, one parallel block with groups, one anchor, one milestone. Renders well at typical browser viewport sizes.
   - Wired into [`packages/cli/scripts/bundle-templates.mjs`](../packages/cli/scripts/bundle-templates.mjs) as a `nowline --init showcase` template alongside the existing minimal/teams/product templates.
   - Re-exported as a string from `@nowline/browser` (or a tiny `@nowline/showcase` sibling) so commercial Free SPAs can ship it as empty-state content without copy-paste drift from the canonical source.

Why no collab schema in OSS: the commercial application's principles and AGENTS docs carve collaboration out as the value Pro and Enterprise charge for. Even a doc-only Yjs schema would tip Lolay's hand on the moat. The schema doc lives in the commercial application's specs (proprietary). The LSP `didChange` range-delta requirement above is **standard LSP discipline**, not a collab-prep concession — VS Code's existing language client already emits range deltas, and the requirement is what makes incremental analysis on large documents tractable. Any side benefit to a future CRDT layer is incidental.

Depends on: m1 (DSL + parser), m2b (layout + renderer), m3a (LSP server). Independent of m4 (`@nowline/browser` and `@nowline/preview-shell` consolidate code that today lives in m4 and m3c respectively, but neither requires the m4 CDN deploy to ship).

Spec: [`specs/architecture.md`](./architecture.md) (workspace map updates), [`specs/lsp.md`](./lsp.md) (range-delta requirement + browser worker packaging), [`specs/embed.md`](./embed.md) (cross-references for `@nowline/browser` consolidation) | Handoff: [`specs/handoffs/handoff-m4.7-browser-pipeline.md`](./handoffs/handoff-m4.7-browser-pipeline.md)

### m4.8 — MCP server (`@nowline/mcp`)

MCP server milestone. Ships one TypeScript package (`@nowline/mcp`, `packages/mcp/`) in two install forms — **MCP CLI** (stdio, added to a harness's MCP config as `npx @nowline/mcp`) and **MCP Desktop** (a `.mcpb` bundle for Claude Desktop's one-click Extensions directory). The same binary powers both; only the install wrapper differs.

Why this exists: today an agent calling the CLI passes untyped arguments and parses unstructured text output. `@nowline/mcp` exposes a typed, discoverable tool surface so harnesses get IDE-quality type hints on inputs, machine-readable structured output, and an optional in-chat rendered preview instead of raw SVG text. The two resources — `nowline://reference` (DSL grammar / man page) and `nowline://examples` (canonical example roadmaps) — prime models to emit valid `.nowline` unprompted so the DSL stays discoverable without out-of-band documentation.

**Tool surface** (tool names are shared with the Nowline Cloud MCP contract — identical names across local and cloud so agents graduate with zero relearning; cloud adds `search` + push/pull):

| Tool | Input | Output |
|------|-------|--------|
| `validate` | source text or local path | structured diagnostics |
| `render` | source / path + render options | SVG image resource + file path |
| `read` | local path | source text |
| `create` | local path + source | created path |
| `update` | local path + source | updated path |
| `delete` | local path | confirmation |
| `list` | directory | `.nowline` file list |
| `export` | source / path + format + options | image/document resource + file path |

**Resources:**

- `nowline://reference` — DSL grammar / man page (section-5 content from `nowline.5`). Gives models the full syntax vocabulary so they emit valid `.nowline` without out-of-band documentation.
- `nowline://examples` — Canonical example roadmaps from `examples/` (including `examples/showcase.nowline` from m4.7). Concrete syntax patterns the model can sample from.

**Optional MCP Apps UI variant:** when the harness supports the MCP Apps interactive-UI protocol, `@nowline/mcp` can return an HTML resource that mounts `@nowline/browser` (`renderSource`) + `@nowline/preview-shell` to render the roadmap live in-chat (the Mermaid Chart precedent). This variant exists because m4.7 extracted both packages as reusable; `@nowline/mcp` is the first consumer of both outside the VS Code extension. Basic stdio operation does not require this path.

**Transport:** stdio primary — harnesses spawn `npx @nowline/mcp` and talk over stdin/stdout. Optional local HTTP via a `--port` flag for harnesses that prefer HTTP; not the default. No network, no auth, no proprietary deps. Runs as the user, with the user's file permissions, on local `.nowline` files only.

**CLI integration (`--mcp` mode flag):** the `nowline` binary adds `--mcp` as a mode flag alongside `--serve` and `--init` to start the MCP server in stdio mode. `npx @nowline/mcp` is the canonical harness-install path; `nowline --mcp` is the power-user equivalent that reuses the installed binary without a separate package.

**Open-core boundary:** `@nowline/mcp` is purely local — no network, no auth, no cloud endpoints. At most a docs-only "upgrade to Nowline Cloud" text pointer. Cloud `search` + push/pull and OAuth-gated access to cloud-stored roadmaps live in the proprietary Nowline Cloud MCP server (`nowline-api/services/mcp`, Go, OAuth).

**Distribution (marketplace-first, from `lolay/nowline` via `release.yml`, independent of the `.vsix`):**

- npm `@nowline/mcp` — the package all harness configs reference
- `.mcpb` — submitted to Claude's Desktop Extensions directory (one-click install; MCP Desktop form)
- Public MCP registry — `io.nowline/nowline` entry (feeds the VS Code MCP gallery + Cursor Marketplace)
- Official Cursor Marketplace (in-app Settings → Tools & MCP)
- Official VS Code MCP gallery (one-click; reads the public MCP registry)
- Gemini CLI Extension (stdio + `GEMINI.md`)

Harnesses with no marketplace (Claude Code, Codex CLI) use the MCP CLI form via `claude mcp add` / `~/.codex/config.toml`. See [`specs/mcp.md`](./mcp.md) and [`specs/cli-distribution.md`](./cli-distribution.md) § MCP distribution.

**Branding:** display name "Nowline" (local OSS, no account); publishing id `nowline` (bare, no `-oss` suffix); registry id `io.nowline/nowline`; `.mcpb` manifest `name: nowline`. Relabeled "Nowline OSS" when Nowline Cloud launches. "Pro"/"Enterprise" are account tiers that gate Nowline Cloud, never MCP connector names. See [`specs/mcp.md`](./mcp.md) and [`specs/releasing.md`](./releasing.md) for the full naming/publishing-id convention.

Depends on: m1 (DSL + parser + validator), m2a (CLI binary for `--mcp` flag), m2b (layout + renderer — `render` + `export` tools), m3a (LSP — optional, enables richer navigation tools via LSP-backed results), m4.7 (`@nowline/browser` + `@nowline/preview-shell` — required only for the optional MCP Apps UI variant; basic stdio operation is independent of m4.7).

Spec: [`specs/mcp.md`](./mcp.md)

### m4.5 — IDE Expansion (timing TBD)

Extend IDE support beyond VS Code/Cursor. Depends on m3 (LSP server) and is independent of m4 (Embed); slots after m4 in the chain so the public embed ships before plugin work begins.

- Obsidian plugin (edit + inline preview)
- Neovim LSP config
- JetBrains plugin

Spec: [`specs/ide.md`](./ide.md)

### m4.6 — Windows distribution (timing TBD)

Brings Windows to parity with the Homebrew + apt + npm install paths shipped in m2a / m2l. Two complementary channels — neither requires a code-signing certificate, both reuse the existing release-job patterns:

- **Scoop bucket** — `lolay/scoop-bucket`, parallel in shape to `lolay/homebrew-tap`. JSON manifests under `bucket/nowline.json`; users install with `scoop bucket add lolay https://github.com/lolay/scoop-bucket && scoop install nowline`. The bucket update follows the same pattern as the Homebrew tap commit in [`.github/workflows/release.yml`](../.github/workflows/release.yml): inside the `github-release` cell of the `publish` matrix, after the GH release publishes, append a step that downloads the two Windows binaries, computes SHA256s, rewrites the manifest from a heredoc, and pushes to the bucket repo using a `SCOOP_BUCKET_TOKEN` PAT. Keeping it intra-cell — same as the tap — avoids racing the formula/manifest commit ahead of the release URLs becoming valid. `checkver` + `autoupdate` blocks in the manifest let `scoop update` self-pull future versions even when the workflow lags.
- **WinGet central registry** — submit to `microsoft/winget-pkgs` per release via `wingetcreate update lolay.nowline -u <release-url> -v <version> --submit`. A new `submit-winget-pkg` job runs after the GitHub Release publishes. First submission goes through manual Microsoft moderation (hours to days); subsequent updates from the same `nowline-release-bot` identity get auto-approval once Microsoft's automation marks us trusted. PAT is `WINGET_PR_PAT`, fine-grained, scoped to fork-and-submit on a personal fork of `microsoft/winget-pkgs`.
- **Both channels stay unsigned.** Mirrors the current Homebrew + apt + GitHub-Release posture; `scoop install` and `winget install` perform the trust transfer the same way `brew install` does. Code-signing the `.exe` itself (Authenticode or Azure Trusted Signing) would also benefit direct GitHub-Release downloads and head off Microsoft's tightening signing pressure on WinGet long-term — tracked separately, out of scope for m4.6.
- **Skipped: Chocolatey, custom WinGet source.** Chocolatey overlaps with WinGet's audience without adding reach. A custom WinGet source would force every user through `winget source add` plus a third-party warning, and the index has to ship as a signed MSIX — much more infra than the central-registry PR flow buys you.

Documentation:

- New [`specs/scoop-bucket.md`](./scoop-bucket.md) — parallel to [`specs/homebrew-tap.md`](./homebrew-tap.md): naming convention, manifest structure, release pipeline integration, bootstrap, install path.
- Update [`specs/cli-distribution.md`](./cli-distribution.md) Windows section: replace "download the `.exe` directly" guidance with `scoop install` and `winget install`.
- Update [`specs/releasing.md`](./releasing.md) — add `SCOOP_BUCKET_TOKEN` + `WINGET_PR_PAT` rows to the required-secrets table; add Scoop + WinGet rows to the "After release" verification reminders. (Bootstrap of the `lolay/scoop-bucket` repo itself is a one-shot manual step, parallel to the original Homebrew tap seed.)
- Update [`specs/homebrew-tap.md`](./homebrew-tap.md) Windows-on-the-tap note: replace "the `.deb` (under WSL), or by downloading the `.exe` directly" with `scoop install lolay/nowline` / `winget install lolay.nowline`.

Depends on: m2a (original distribution pipeline) and m2l (man-page-style multi-channel pattern); does not depend on m3 / m4 / m4.5. Sequenced after m4.5 by numbering only — m4.6 and m4.5 do not depend on each other and can ship in either order.

Spec: [`specs/scoop-bucket.md`](./scoop-bucket.md), [`specs/cli-distribution.md`](./cli-distribution.md) Windows section.

## Dependency Chain

```
m1 → m2a → m2b → m2b.5 → m2c → m2d → m2e → m2f → m2g → m2h → m2.5a → m2.5b → m2.5c → m2.5d → m2i → m2j → m2k → m2l → m2m → m2n → m3a → m3b → m3c → m3d → m3e → m3f → m3.5 → m4 → m4.7 → m4.8
                                                                                                                                                                                    ↘
                                                                                                                                                                                     m4.5 (depends on m3a only; sequenced after m4.7)
                                                                                                                                                                                    ↘
                                                                                                                                                                                     m4.6 (depends on m2a + m2l; sequenced after m4.5 by numbering only — independent of m4.5 and m4.7)
```

m3.5 (GitHub Action) and m4 (browser embed) are independent of each other — m3.5 shells out to `@nowline/cli`, m4 ships the browser bundle. The chain orders them m3.5 → m4 by numbering only; either could ship first.

m4.7 (browser pipeline + preview shell + LSP worker + showcase) consolidates code that today lives in m3c (the inline preview-shell template) and m4 (the embed pipeline) plus the m3a Langium services, repackaged for browser consumption. It depends on those three foundations; it does not depend on m4's CDN deploy actually shipping.

m2l, m2m, and m2n are positioned in the m2 series logically (CLI distribution polish; localization; DSL enhancement) but landed after m3c chronologically; the chain reflects logical OSS sequence rather than strict shipping order, similar to m2i.

m4.5 and m4.6 are independent post-m4.7 add-ons — m4.5 extends IDE coverage (Obsidian, Neovim, JetBrains) and only needs m3a; m4.6 extends Windows install coverage (Scoop, WinGet) and only needs m2a + m2l. Either can ship first; the `.5 / .6` numbering reflects ordering of the proposals, not a dependency. Neither depends on m4.7 or m4.8.

m4.8 (MCP server, `@nowline/mcp`) needs m1 (DSL + parser + validator) and m2b (layout + renderer, for `render` and `export` tools) as its core dependencies. m3a (LSP) is optional — richer navigation tools can use LSP-backed results. The chain places m4.8 after m4.7 because the optional MCP Apps UI variant requires `@nowline/browser` + `@nowline/preview-shell`; basic stdio operation is independent of m4.7 and could ship earlier. m4.5 and m4.6 are independent of m4.8.

m1 is the critical foundation — every subsequent milestone depends on the DSL, parser, and typed AST it produces.

## Beyond m4.8

Hosted products (pro editor, free viewer, cloud MCP server, enterprise, FedRAMP) consume these OSS packages via npm but are built in separate, proprietary repos. See the commercial roadmap for that scope.
