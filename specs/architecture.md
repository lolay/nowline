# Nowline — Architecture Specification

## Organization and Repositories

The core tooling lives under the **lolay** GitHub organization. Copyright **Lolay, Inc.**

| Repo | Type | License | Contents |
|------|------|---------|----------|
| `lolay/nowline` | OSS monorepo | Apache 2.0 | Core packages, CLI, embed, examples, docs |
| `lolay/nowline-vscode` | OSS | Apache 2.0 | VS Code / Cursor extension |
| `lolay/nowline-obsidian` | OSS | Apache 2.0 | Obsidian plugin |
| `lolay/nowline-action` | OSS | Apache 2.0 | GitHub Action |

Proprietary web apps (free viewer, Pro editor, enterprise) are developed in private repositories owned by Lolay, Inc. They consume the OSS packages documented here via npm.

### Dependency Rule

Dependencies flow one direction: downstream consumers depend on OSS, never the reverse. All paid apps consume OSS packages via npm. No OSS package may import from a proprietary repo.

### Discoverability

`lolay/nowline` is the hub. Its README links to all satellite OSS repos. Each satellite repo links back to `lolay/nowline`. GitHub topics (`nowline`, `roadmap`, `dsl`) reinforce discoverability under the `lolay` org.

## OSS Monorepo Structure (`lolay/nowline`)

Managed with **pnpm workspaces**. All packages share a single version and release cycle.

```
nowline/
  packages/
    core/                        # @nowline/core — Langium grammar, parser, AST, validation
    layout/                      # @nowline/layout — Positioning engine (AST → positioned model)
    renderer/                    # @nowline/renderer — SVG renderer (positioned model → SVG)
    export-core/                 # @nowline/export-core — Shared types, unit converter, PDF page-size parser, font resolver
    export-png/                  # @nowline/export-png — PNG via @resvg/resvg-js (WASM)
    export-pdf/                  # @nowline/export-pdf — Vector PDF via PDFKit + svg-to-pdfkit
    export-html/                 # @nowline/export-html — Self-contained HTML page with inline pan/zoom
    export-mermaid/              # @nowline/export-mermaid — Markdown + Mermaid `gantt` block
    export-xlsx/                 # @nowline/export-xlsx — Five-sheet workbook via ExcelJS
    export-msproj/               # @nowline/export-msproj — MS Project import XML
    cli/                         # @nowline/cli — `nowline` CLI, every export format, ~70 MB standalone binary
    lsp/                         # @nowline/lsp — Language server (validation, completion, navigation)
    vscode-extension/            # VS Code / Cursor extension wrapping @nowline/lsp
  grammars/
    nowline.tmLanguage.json      # TextMate grammar for syntax highlighting
  examples/                      # Example .nowline files (also `nowline --init` templates)
  tests/                         # Renderer manual-validation fixtures (one stressed axis per file)
  scripts/                       # Repo-wide build / packaging scripts
  specs/                         # Design specs for the OSS tooling
  package.json                   # Workspace root
  LICENSE                        # Apache 2.0
```

## Package Dependency Graph

```
@nowline/core
  ├── @nowline/layout
  │     ├── @nowline/renderer
  │     │     └── (used by @nowline/cli, @nowline/vscode-extension)
  │     └── @nowline/export-core
  │           ├── @nowline/export-html
  │           ├── @nowline/export-pdf
  │           ├── @nowline/export-png
  │           ├── @nowline/export-mermaid
  │           ├── @nowline/export-xlsx
  │           └── @nowline/export-msproj
  └── @nowline/lsp
        └── @nowline/vscode-extension

@nowline/cli depends on core, layout, renderer, export-core, and every @nowline/export-*.
```

Dependencies flow downward only. No upward or sideways imports. The graph is enforced by package.json declarations, not just convention.

### Core layers

- **@nowline/core** — Langium grammar, parser, typed AST, and validator. Pure TypeScript; no DOM, no Node-specific APIs in the hot path. Zero internal deps.
- **@nowline/layout** — Layout engine. Takes the AST and produces a positioned model (x/y coordinates, dimensions, connection points). Pure computation, no rendering.
- **@nowline/renderer** — SVG renderer. Takes the positioned model and produces a deterministic SVG string. Reads local assets referenced from the roadmap (e.g. company logos) via an injectable asset resolver so the package stays browser-safe — see § Local Asset Resolution.

### Export packages

- **@nowline/export-core** — Shared types, unit converter, PDF page-size parser, 5-step font resolver, bundled DejaVu fonts. The other `export-*` packages depend on this for common plumbing.
- **@nowline/export-png** — PNG via [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) (WASM).
- **@nowline/export-pdf** — Vector PDF via [`pdfkit`](https://github.com/foliojs/pdfkit) + `svg-to-pdfkit`.
- **@nowline/export-html** — Self-contained HTML page with inline pan/zoom JS.
- **@nowline/export-mermaid** — Markdown file with a Mermaid `gantt` block, for embedding in READMEs and wikis that already render Mermaid.
- **@nowline/export-xlsx** — Five-sheet workbook via [`exceljs`](https://github.com/exceljs/exceljs).
- **@nowline/export-msproj** — MS Project import XML.

### Surfaces

- **@nowline/cli** — Command-line entry point. Wraps core + layout + renderer + every exporter. Compiled to standalone binaries via `bun compile`. See [`cli.md`](./cli.md) and [`cli-distribution.md`](./cli-distribution.md).
- **@nowline/lsp** — Language server. Reuses core's parser/validator behind the LSP wire protocol so editors get the same diagnostics as the CLI. See [`ide.md`](./ide.md).
- **vscode-extension** — VS Code / Cursor extension that boots `@nowline/lsp` and registers commands. Will eventually be published to the marketplace from a satellite repo (`lolay/nowline-vscode`); developed in-tree until it stabilises.

A planned `@nowline/embed` (browser bundle) will sit beside `@nowline/renderer` in the same way — see [`embed.md`](./embed.md).

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Single language across parser, renderer, CLI, embed. Langium requires TS. |
| Parser | Langium | TypeScript-native, generates typed AST from a grammar file, provides LSP server for free. |
| Package manager | pnpm | Strict dependency resolution prevents phantom imports. Fast installs, content-addressable store, superior workspace filtering. Pin via `"packageManager": "pnpm@9"` in root `package.json`. |
| CLI binary | `bun compile` | Produces standalone binaries (~55MB) from TypeScript. No Node.js install required for end users. |
| SVG rendering | Custom (TypeScript) | SVG is a text format — template-based generation is simpler than a rendering library dependency. |
| PNG conversion | resvg-js (WASM) | SVG → PNG rasterization. Better SVG fidelity than librsvg, no native addons (WASM works everywhere), smaller footprint, clean `bun compile` story. |
| PDF generation | PDFKit | Pure JS, no native deps (~2MB). Walks the positioned model to produce true vector PDFs. Bundles cleanly with `bun compile` — no Chromium dependency. |
| XLSX generation | ExcelJS | Mature (13M weekly downloads), excellent data/formatting/auto-filter support. ~1 MB JS — negligible impact on the ~55 MB CLI binary. No chart support; stacked-bar Gantt sheet deferred. |
| Embed bundling | esbuild | Fast, zero-config bundling of core + layout + renderer into a single IIFE browser script. No plugins needed for this use case. |
| Testing | Vitest | Fast, TypeScript-native, compatible with the monorepo structure. |
| Lint and format | Biome | Single Rust binary handling lint, format, and import organization. Type-aware rules in v2.4 cover the promise hygiene we want (`noFloatingPromises`, `noMisusedPromises`) without a typescript-eslint dependency. Replaces the aspirational ESLint+Prettier reference that was never wired up. |
| CI | GitHub Actions | Standard for GitHub-hosted repos. |

## Local Asset Resolution

The DSL allows local file references for assets rendered inside the chart — currently the roadmap `logo:` property (`dsl.md` § Roadmap `logo:` and `logo-size:`). These files must be read, sanitized, and inlined into the output artifact so the result is self-contained.

To keep `@nowline/renderer` browser-safe (no `fs`, no `path`, no `process`), the renderer never reads files directly. It accepts an **`AssetResolver`** — an injectable function with the signature `(relPath: string) => Promise<AssetBytes | null>` — and the caller supplies an environment-appropriate implementation:

| Environment | Resolver implementation |
|-------------|-------------------------|
| `@nowline/cli` | Node resolver rooted at the input file's directory. Rejects paths that escape the root (no `..` traversal beyond the project root), rejects absolute paths outside an explicit `--asset-root`, and returns `null` on missing files so the renderer can emit its warning. |
| Browser embed (m4) | Resolver that looks up assets in an author-supplied map (inline `data:` URIs or pre-bundled bytes). No network fetches — the embed script never hits disk or remote servers for DSL-referenced assets. |

Downstream consumers (e.g. a hosted editor or an MCP server) plug in their own resolvers against the same contract without adding new environment coupling to `@nowline/renderer`.

Embedding format is decided by the renderer from the resolved bytes + original extension:

- `.svg` — parsed, sanitized (strip `<script>`, strip external `href`/`src`, strip `<foreignObject>`), namespaced, and inlined as a `<g>` subtree.
- `.png`, `.jpg` / `.jpeg`, `.webp` — wrapped in `<image href="data:image/<type>;base64,...">`. The renderer does not re-encode; it passes the raw bytes through.

The resolver abstraction is reused for any future asset-bearing property (e.g. per-entity icons) without adding new environment coupling to `@nowline/renderer`.

## Build and Release

- **Build:** TypeScript compilation. esbuild bundles the embed script into a single IIFE.
- **Test:** Vitest across all packages.
- **Lint and format:** Biome (single tool, type-aware rules, single config). See `CONTRIBUTING.md` § "Linting and formatting" for the rule overrides we adopted and why.
- **Release:** Single version across all packages. npm publish for library packages. GitHub Releases for CLI binaries.
- **CLI distribution:** `bun compile` produces binaries for macOS (arm64, x64), Linux (x64, arm64), Windows (x64, arm64). Published to Homebrew (macOS, Linux, WSL), apt-get, GitHub Releases (Windows .exe direct download), and npm.
