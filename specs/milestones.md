# Nowline — OSS Milestones

## Overview

The OSS tooling (`lolay/nowline` and its satellite repos) ships incrementally across milestones m1–m4b. Each milestone has a clear scope and set of Apache-2.0 deliverables. Later milestones depend on earlier ones.

Commercial milestones (hosted editor, free viewer, MCP, enterprise, FedRAMP) are tracked in a separate, private spec and are out of scope here.

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
| m3 | Embed | Apache 2.0 | Browser embed script, GitHub Action |
| m4 | IDE | Apache 2.0 | LSP server, VS Code/Cursor extension with live preview |
| m4b | IDE Expansion | Apache 2.0 | Obsidian, Neovim, JetBrains (timing TBD) |

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

The visual milestone: render a `.nowline` file to an SVG. This is what m3 (embed) and m4 (IDE live preview) both consume.

- Layout engine (`@nowline/layout`) — AST → positioned model (pure, browser-safe)
- SVG renderer (`@nowline/renderer`) — positioned model → SVG string
- `nowline render` command with SVG output (all flags except format-specific ones)
- `nowline serve` — local dev server that watches a file and live-reloads the SVG in the browser (originally slated for m4b; pulled forward because `serve` needs only SVG and unlocks preview for editors without a native panel)
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

### m3 — Embed

Roadmaps render anywhere on the web and in CI.

- Browser embed script (`<script>` tag, like mermaid.js)
- CDN hosting via npm-backed CDNs (jsDelivr, unpkg)
- GitHub Action with two modes:
  - File mode: render `.nowline` files to SVG/PNG, commit output
  - Markdown mode: scan markdown for ` ```nowline ` blocks, render and insert images

Spec: [`specs/embed.md`](./embed.md)

### m4 — IDE

First-class editing experience in VS Code and Cursor.

- Langium LSP server (autocomplete, validation, go-to-definition)
- VS Code / Cursor extension (LSP + side panel live preview that re-renders on save/keystroke)

Spec: [`specs/ide.md`](./ide.md)

### m4b — IDE Expansion (timing TBD)

Extend IDE support beyond VS Code/Cursor.

- Obsidian plugin (edit + inline preview)
- Neovim LSP config
- JetBrains plugin

Spec: [`specs/ide.md`](./ide.md)

## Dependency Chain

```
m1 → m2a → m2b → m2b.5 → m2c → m2d → m2e → m2f → m2g → m2h → m3 → m4
                                                                    ↘
                                                                     m4b (independent — depends only on m4)
```

m1 is the critical foundation — every subsequent milestone depends on the DSL, parser, and typed AST it produces.

## Beyond m4b

Hosted products (pro editor, free viewer, MCP server, enterprise, FedRAMP) consume these OSS packages via npm but are built in separate, proprietary repos. See the commercial roadmap for that scope.
