# Nowline — Feature Scoring Matrix

## Scoring Rubric

Each feature is scored on three dimensions using a **1-3-9 scale** (logarithmic, not linear):

| Dimension | 1 | 3 | 9 |
|-----------|---|---|---|
| **Identity** | Nice to have, not differentiated | Supports the core value prop | Defines what Nowline is |
| **Demand** | Niche ask, few users need it | Common request, many users benefit | Table stakes, users expect it |
| **Effort** | Large (months, new infrastructure) | Medium (weeks, known patterns) | Small (days, straightforward) |

**Score = Identity x Demand x Effort.** Higher is better (high identity, high demand, low effort).

Features are assigned to milestones: m1–m4.7 (OSS tooling tracked here) or m4.5-deferred. Later commercial milestones are scoped in a separate roadmap and are out of scope for this file. Feature numbers 44–69 are reserved for commercial-only features in the proprietary commercial repos so that adding new OSS features here does not collide with the existing commercial scoring matrices; m4.7 OSS features pick up at 70 to keep that gap intact.

## Feature Matrix

### m1 — DSL

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 1 | Langium grammar + parser | 9 | 9 | 3 | 243 | Foundation for everything |
| 2 | Sequential items with duration + scale | 9 | 9 | 9 | 729 | Core time model — items sequenced by document order within swimlanes |
| 3 | Swimlanes | 9 | 9 | 9 | 729 | Primary structural element |
| 4 | Item properties (status, owner, duration, remaining, labels) | 9 | 9 | 9 | 729 | Grammar-level metadata |
| 5 | Dependencies (after:) | 9 | 9 | 3 | 243 | Cross-item relationships |
| 6 | Labels + styles | 9 | 3 | 3 | 81 | Cross-cutting visual tagging via roadmap-defined labels and config-defined styles |
| 7 | Milestones | 3 | 9 | 9 | 243 | Common roadmap element |
| 8 | Link directive | 9 | 9 | 9 | 729 | Items as thin references |
| 9 | Validation rules | 3 | 9 | 3 | 81 | Error messages, ref checking |
| 10 | TextMate grammar | 3 | 3 | 9 | 81 | Syntax highlighting everywhere |
| 11 | Comments (// and /* */) | 1 | 3 | 9 | 27 | Standard language feature |

### m2a — CLI Core

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 17 | Bidirectional JSON convert (AST) | 1 | 3 | 9 | 27 | `nowline convert` — text ↔ JSON for tooling integration |
| 20 | nowline validate command | 3 | 9 | 9 | 243 | CI integration |
| 21 | nowline init command | 1 | 3 | 9 | 27 | Onboarding convenience |
| 29 | bun compile binaries | 3 | 9 | 3 | 81 | Zero-dep install |
| 30 | Homebrew/apt/winget/Scoop | 3 | 9 | 3 | 81 | Platform package managers |

### m2b — Layout + SVG

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 12 | SVG output | 9 | 9 | 3 | 243 | Primary output format |
| 19 | nowline render command | 9 | 9 | 3 | 243 | Core CLI action (SVG only in m2b; other formats in m2c) |
| 22 | nowline serve (live reload) | 3 | 3 | 3 | 27 | Browser preview for editors without native preview (Neovim, Emacs, etc.) — needs only SVG, so ships with m2b |
| 23 | Layout engine | 9 | 9 | 1 | 81 | Complex — positioning, routing |
| 24 | Card rendering (status dots, link icons) | 9 | 9 | 3 | 243 | Visual identity |
| 25 | Timeline and now-line rendering | 9 | 9 | 9 | 729 | Hero visual element — vertical "today" marker on the timeline |
| 26 | Dependency arrow rendering | 3 | 9 | 3 | 81 | Visual relationships |
| 27 | Label/style region rendering | 3 | 3 | 3 | 27 | Visual grouping via styled labels |
| 28 | Dark theme | 1 | 3 | 9 | 27 | Common request |
| 28b | Company logo in roadmap header | 3 | 9 | 9 | 243 | `roadmap logo:"./logo.svg"` — SVG inlined, raster (PNG/JPEG/WEBP) embedded as data-URI. Local paths only. Renders next to the title. |

### m2c — Export Formats

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 13 | PNG output | 3 | 9 | 3 | 81 | Common sharing format |
| 14 | PDF output | 3 | 3 | 3 | 27 | Print/presentation |
| 15 | HTML output | 3 | 3 | 9 | 81 | Self-contained viewer |
| 16 | Markdown+Mermaid bridge | 9 | 3 | 3 | 81 | Trojan horse for adoption |
| 18 | XLSX output | 1 | 3 | 9 | 27 | Formatted Excel workbook — data table, future stacked-bar Gantt sheet |
| 18b | MS Project XML output | 1 | 3 | 3 | 9 | `render -f msproj` — lossy export for PM tool import |

### m3 — IDE (VS Code / Cursor)

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 37 | LSP server (autocomplete, validation) | 3 | 9 | 3 | 81 | Langium provides most of this |
| 38 | Go-to-definition / find references | 3 | 3 | 9 | 81 | ID navigation |
| 39 | VS Code extension | 3 | 9 | 3 | 81 | Largest editor market share |
| 40 | Live preview side panel | 9 | 9 | 3 | 243 | Key differentiator for IDE |

### m4 — Embed

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 31 | Browser embed script | 9 | 9 | 3 | 243 | Mermaid-like embedding |
| 32 | CDN hosting (`embed.nowline.{io,dev}`) | 3 | 9 | 9 | 243 | Branded URLs in embedders' `view-source`; Firebase-Hosted, two projects (prod tag-driven, dev `main`-driven + per-PR ephemeral channels). Drops jsDelivr/unpkg from docs. |
| 35 | GitHub Action — file mode | 3 | 9 | 3 | 81 | CI rendering |
| 36 | GitHub Action — markdown mode | 3 | 3 | 3 | 27 | README rendering |

### m4.5 — IDE Expansion (timing TBD)

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 41 | Obsidian plugin | 3 | 3 | 3 | 27 | Text-first audience overlap |
| 42 | Neovim LSP config | 1 | 1 | 9 | 9 | Docs only, near-zero effort |
| 43 | JetBrains plugin | 1 | 3 | 3 | 9 | Smaller audience for DSLs |

### m4.7 — Browser pipeline + preview shell + LSP worker + showcase

Feature numbers start at 70 to skip the 44–69 commercial-only block reserved for the proprietary commercial repos. See § Scoring Rubric.

| # | Feature | Identity | Demand | Effort | Score | Notes |
|---|---------|----------|--------|--------|-------|-------|
| 70 | `@nowline/browser` (single-call browser pipeline) | 9 | 3 | 3 | 81 | Consolidates today's `packages/embed/src/pipeline.ts` and `packages/vscode-extension/src/preview/render-pipeline.ts`; one ESM `renderSource()` + `parseSource()`. |
| 71 | `@nowline/preview-shell` (framework-agnostic viewport chrome) | 3 | 3 | 3 | 27 | Hoists the ~1000-LOC inline preview shell out of the VS Code webview into a reusable ES module with `mountPreview()` API; consumed by VS Code webview and downstream browser apps. |
| 72 | `@nowline/lsp-worker` (Langium LSP in a Web Worker) | 3 | 3 | 1 | 9 | Browser-side packaging of `@nowline/lsp` (m3a). Worker entry + CodeMirror client adapter; pinned to LSP-spec range deltas as standard discipline. |
| 73 | `examples/showcase.nowline` (canonical sample) | 1 | 9 | 9 | 81 | Roadmap with swimlanes, linear flow, parallel block with groups, anchor, milestone. Wired into `--init showcase` and re-exported as a string from `@nowline/browser`. |
