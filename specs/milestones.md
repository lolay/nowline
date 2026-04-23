# Nowline — OSS Milestones

## Overview

The OSS tooling (`lolay/nowline` and its satellite repos) ships incrementally across milestones m1–m4b. Each milestone has a clear scope and set of Apache-2.0 deliverables. Later milestones depend on earlier ones.

Commercial milestones (hosted editor, free viewer, MCP, enterprise, FedRAMP) are tracked in a separate, private spec and are out of scope here.

## Milestone Summary

| Milestone | Name | License | Deliverables |
|-----------|------|---------|--------------|
| m1 | DSL | Apache 2.0 | Grammar, parser, AST, validation, TextMate grammar |
| m2a | CLI Core | Apache 2.0 | CLI scaffold, `validate`, `convert`, `init`, `version`, distribution pipeline |
| m2b | Layout + SVG | Apache 2.0 | Layout engine, SVG renderer, `render` (SVG only), `serve` live-reload |
| m2c | Export Formats | Apache 2.0 | PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML |
| m3 | Embed | Apache 2.0 | Browser embed script, GitHub Action |
| m4 | IDE | Apache 2.0 | LSP server, VS Code/Cursor extension with live preview |
| m4b | IDE Expansion | Apache 2.0 | Obsidian, Neovim, JetBrains (timing TBD) |

## Milestone Details

### m1 — DSL

Define and implement the `.nowline` language.

- DSL grammar (Langium), parser, typed AST
- Validation rules (30 rules), error messages with suggestions
- Config block (scale, calendar, styles, defaults) and roadmap-section vocabulary (labels, durations, statuses)
- Include mechanism with config/roadmap merge modes
- Parallel/group blocks for parallel execution
- Person/team declarations, anchors, milestones, footnotes
- TextMate grammar for syntax highlighting

Repo: `lolay/nowline` | Handoff: [`specs/handoffs/m1.md`](./handoffs/m1.md)

### m2a — CLI Core

CLI scaffold and the subset of commands that do not need a layout engine. Ships the distribution pipeline so every later milestone inherits it.

- `@nowline/cli` package wrapping `@nowline/core` (from m1)
- Commands: `nowline validate`, `nowline convert` (bidirectional text ↔ JSON AST), `nowline init` (minimal/teams/product templates), `nowline version`
- `.nowlinerc` config discovery; exit codes 0/1/2/3; text and JSON diagnostic formats
- Distribution: `bun compile` binaries (macOS arm64/x64, Linux x64/arm64, Windows x64/arm64), Homebrew custom tap, apt, npm, GitHub Releases

Spec: [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2a.md`](./handoffs/m2a.md)

### m2b — Layout + SVG

The visual milestone: render a `.nowline` file to an SVG. This is what m3 (embed) and m4 (IDE live preview) both consume.

- Layout engine (`@nowline/layout`) — AST → positioned model (pure, browser-safe)
- SVG renderer (`@nowline/renderer`) — positioned model → SVG string
- `nowline render` command with SVG output (all flags except format-specific ones)
- `nowline serve` — local dev server that watches a file and live-reloads the SVG in the browser (originally slated for m4b; pulled forward because `serve` needs only SVG and unlocks preview for editors without a native panel)
- Light and dark themes

Spec: [`specs/rendering.md`](./rendering.md), [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2b.md`](./handoffs/m2b.md)

### m2c — Export Formats

Everything else `nowline render` can emit. Each format is an adapter on top of the SVG renderer or the positioned model.

- PNG — SVG → raster via resvg-js (WASM)
- PDF — positioned model → vector PDF via PDFKit
- HTML — self-contained page embedding the SVG
- Markdown+Mermaid — best-effort `gantt` transpile (Trojan horse for adoption)
- XLSX — ExcelJS workbook (Roadmap, Items, Milestones, Anchors, People and Teams)
- MS Project XML — lossy export for PM tool import

Spec: [`specs/rendering.md`](./rendering.md) § Output Formats, [`specs/cli.md`](./cli.md) | Handoff: [`specs/handoffs/m2c.md`](./handoffs/m2c.md)

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
m1 → m2a → m2b → m2c → m3 → m4
                  ↘
                   m4b (independent — depends only on m4)
```

m1 is the critical foundation — every subsequent milestone depends on the DSL, parser, and typed AST it produces.

## Beyond m4b

Hosted products (pro editor, free viewer, MCP server, enterprise, FedRAMP) consume these OSS packages via npm but are built in separate, proprietary repos. See the commercial roadmap for that scope.
