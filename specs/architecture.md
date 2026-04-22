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
    cli/                         # @nowline/cli — CLI entry point, wraps core + layout + renderer
    embed/                       # @nowline/embed — Browser embed script bundle
  grammars/
    nowline.tmLanguage.json      # TextMate grammar for syntax highlighting
  examples/                      # Example .nowline files
  docs/                          # GitHub Pages documentation site
  specs/                         # Design specs for the OSS tooling
  package.json                   # Workspace root
  LICENSE                        # Apache 2.0
```

## Package Dependency Graph

```
@nowline/cli ──→ @nowline/renderer ──→ @nowline/layout ──→ @nowline/core
@nowline/embed ──→ @nowline/renderer ──→ @nowline/layout ──→ @nowline/core
```

- **@nowline/core** — Zero dependencies beyond Langium. Parses `.nowline` text into a typed AST. Runs validation. Exports the AST for consumers.
- **@nowline/layout** — Takes the AST and produces a positioned model (x/y coordinates, dimensions, connection points). Pure computation, no rendering.
- **@nowline/renderer** — Takes the positioned model and produces SVG. Also handles PNG (via resvg-js) and PDF (via PDFKit) for the CLI. Reads local assets referenced from the roadmap (e.g. company logos) via an injectable asset resolver so the package stays browser-safe — see § Local Asset Resolution.
- **@nowline/cli** — Command-line entry point. Wraps core + layout + renderer. Compiled to standalone binaries via `bun compile`.
- **@nowline/embed** — Browser bundle. Finds ` ```nowline ` blocks in the DOM, parses, lays out, and renders inline. No server required.

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
| CI | GitHub Actions | Standard for GitHub-hosted repos. |

## Local Asset Resolution

The DSL allows local file references for assets rendered inside the chart — currently the roadmap `logo:` property (`dsl.md` § Roadmap `logo:` and `logo-size:`). These files must be read, sanitized, and inlined into the output artifact so the result is self-contained.

To keep `@nowline/renderer` browser-safe (no `fs`, no `path`, no `process`), the renderer never reads files directly. It accepts an **`AssetResolver`** — an injectable function with the signature `(relPath: string) => Promise<AssetBytes | null>` — and the caller supplies an environment-appropriate implementation:

| Environment | Resolver implementation |
|-------------|-------------------------|
| `@nowline/cli` | Node resolver rooted at the input file's directory. Rejects paths that escape the root (no `..` traversal beyond the project root), rejects absolute paths outside an explicit `--asset-root`, and returns `null` on missing files so the renderer can emit its warning. |
| Browser embed (m3) | Resolver that looks up assets in an author-supplied map (inline `data:` URIs or pre-bundled bytes). No network fetches — the embed script never hits disk or remote servers for DSL-referenced assets. |

Downstream consumers (e.g. a hosted editor or an MCP server) plug in their own resolvers against the same contract without adding new environment coupling to `@nowline/renderer`.

Embedding format is decided by the renderer from the resolved bytes + original extension:

- `.svg` — parsed, sanitized (strip `<script>`, strip external `href`/`src`, strip `<foreignObject>`), namespaced, and inlined as a `<g>` subtree.
- `.png`, `.jpg` / `.jpeg`, `.webp` — wrapped in `<image href="data:image/<type>;base64,...">`. The renderer does not re-encode; it passes the raw bytes through.

The resolver abstraction is reused for any future asset-bearing property (e.g. per-entity icons) without adding new environment coupling to `@nowline/renderer`.

## Build and Release

- **Build:** TypeScript compilation. esbuild bundles the embed script into a single IIFE.
- **Test:** Vitest across all packages.
- **Lint:** ESLint + Prettier.
- **Release:** Single version across all packages. npm publish for library packages. GitHub Releases for CLI binaries.
- **CLI distribution:** `bun compile` produces binaries for macOS (arm64, x64), Linux (x64, arm64), Windows (x64, arm64). Published to Homebrew (macOS, Linux, WSL), apt-get, GitHub Releases (Windows .exe direct download), and npm.
