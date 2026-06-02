# Nowline — MCP Server (OSS)

## Overview

The Nowline MCP server exposes the CLI's capabilities to AI agent harnesses through a typed, discoverable **Model Context Protocol** tool surface. Agents get structured inputs and outputs, schema discovery, and an optional in-chat rendered preview — instead of shelling out to `nowline` and parsing unstructured text.

**Package:** `@nowline/mcp`, in this monorepo at `packages/mcp/`.
**License:** Apache 2.0.
**Milestone:** m4.8. Depends on m1 (core), m2a/m2b (CLI/layout/renderer), m3a (LSP — optional for richer navigation tools), m4.7 (`@nowline/browser` + `@nowline/preview-shell` — required only for the optional MCP Apps UI variant). See [`specs/milestones.md`](./milestones.md) § m4.8.

> **Naming.** Display name **Nowline** today (local OSS, no account). Relabels to **Nowline OSS** once the hosted **Nowline Cloud** MCP ships. Publishing id `nowline` (bare — never `-oss`); registry id `io.nowline/nowline`; `.mcpb` manifest `name: nowline`. **Pro** and **Enterprise** are account tiers that gate Nowline Cloud — never connector names. Full convention: [`specs/releasing.md`](./releasing.md) § MCP publishing artifacts and [`specs/cli-distribution.md`](./cli-distribution.md) § MCP server distribution.

## Why MCP (not "just call the CLI")

Shelling out to `nowline` works, but agent harnesses lose:

- **Discoverability** — no typed tool list; the model must already know every flag.
- **Structured I/O** — diagnostics, render output, and file paths come back as unstructured text the model re-parses.
- **Resources** — no way to prime the model with the DSL grammar or canonical examples before it writes `.nowline`.

`@nowline/mcp` wraps `@nowline/core` and the same export capabilities the human-facing `nowline` binary exposes, behind eight stable tool names shared with the Nowline Cloud MCP contract (see [Shared tool contract](#shared-tool-contract)). Cloud adds `search` and push/pull over remote storage; the OSS server stays purely local per [Open core](#open-core-boundary).

**In-process, not a CLI shell-out.** `@nowline/mcp` runs as a Node process (`npx @nowline/mcp`), the same runtime as the CLI and the VS Code extension host, so it imports the shared `@nowline/export` kernel and `@nowline/core` directly and produces every artifact in-process — there is no `nowline` binary dependency on the canonical path. This is what lets `render`/`export` honor the byte-for-byte [export-determinism](./export-determinism.md) precedent: the MCP server, the CLI, and the extension all run the *same* kernel, so identical source + inputs yield identical bytes. The `nowline --mcp` power-user path is the one exception — it *is* the CLI hosting the same server code (see [MCP CLI vs MCP Desktop](#mcp-cli-vs-mcp-desktop)).

## MCP CLI vs MCP Desktop

One codebase, two install wrappers — not two servers.

| Form | What it is | How it installs | Transport |
|------|------------|-----------------|-----------|
| **MCP CLI** | `@nowline/mcp` spawned by the harness | `npx @nowline/mcp` in Cursor `mcp.json`, VS Code MCP settings, Claude Code `.mcp.json`, Codex `config.toml`, Gemini CLI extension | stdio (primary) |
| **MCP Desktop** | The same package as a one-click bundle | `.mcpb` in Claude's Desktop Extensions directory | stdio (Claude Desktop spawns it locally) |

Which form a harness uses depends on whether it is a terminal/IDE harness (MCP CLI) or a GUI desktop app (MCP Desktop). The server code, tool surface, and resources are identical.

**Power-user path:** `nowline --mcp` starts the same server in stdio mode using an already-installed CLI binary. `npx @nowline/mcp` is the canonical path in harness configs because it decouples the MCP server's install lifecycle from the CLI binary. See [`specs/cli.md`](./cli.md) § `--mcp`.

## Shared tool contract

Tool names are **identical** to the Nowline Cloud MCP server so agents and users graduate from local files to cloud storage with zero relearning. The OSS server addresses **local file paths**; cloud addresses **diagram ids** and adds `search`.

| Tool | Args (OSS) | Returns | Notes |
|------|------------|---------|-------|
| `validate` | `{ source?: string, path?: string }` | `{ ok: boolean, diagnostics: Diagnostic[] }` | Parse + validate via `@nowline/core`. At least one of `source` or `path` required. Same `Diagnostic` shape as the CLI — see [`specs/cli.md`](./cli.md) § Diagnostics. |
| `render` | `{ source?: string, path?: string, format?: 'svg' \| 'png' = svg, theme?, now?, width?, ... }` | image resource + `{ path?: string }` metadata | Renders in-process via the shared `@nowline/export` kernel (no `nowline` shell-out). Returns an MCP image resource (SVG/PNG) plus the output path when written to disk. PNG rasterizes via `@resvg/resvg-wasm` per [export-determinism](./export-determinism.md). |
| `read` | `{ path: string }` | `{ path, source }` | Reads a local `.nowline` file. Rejects paths outside allowed roots (project directory + `--asset-root` semantics aligned with the CLI). |
| `create` | `{ path: string, source: string }` | `{ path }` | Writes a new `.nowline` file after validation. Overwrites if the path already exists (same silent-overwrite posture as the CLI). |
| `update` | `{ path: string, source: string }` | `{ path }` | Replaces an existing file after validation. |
| `delete` | `{ path: string }` | `{ path }` | Deletes a local `.nowline` file. |
| `list` | `{ directory?: string, recursive?: boolean = false }` | `{ paths: string[] }` | Lists `.nowline` files under `directory` (default: cwd). |
| `export` | `{ source?: string, path?: string, format: 'pdf' \| 'html' \| 'mermaid' \| 'xlsx' \| 'msproj' \| 'png', ... }` | file resource + metadata | Same `@nowline/export` kernel and format adapters as `nowline <input> -f <format>`, run in-process. Byte-identical to the CLI for the same source + inputs ([export-determinism](./export-determinism.md)). Returns an MCP resource for the rendered artifact. |

Cloud-only additions (`search`, cloud `read`/`create`/`update`/`delete` by `id`) live in [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md). This doc covers the OSS local surface only.

## Resources

Two MCP resources prime models to emit valid `.nowline` without out-of-band documentation — the DSL is the product.

| URI | Content | Source |
|-----|---------|--------|
| `nowline://reference` | Full DSL reference (section-5 man page) | [`packages/cli/man/nowline.5`](../packages/cli/man/nowline.5) |
| `nowline://examples` | Canonical example roadmaps | [`examples/`](../examples/) — including `showcase.nowline` from m4.7 |

Harnesses that support MCP resources should expose both by default. The reference resource is the grammar/man-page vocabulary; the examples resource is concrete syntax patterns to sample from.

## Transport

- **stdio (primary)** — the harness spawns `npx @nowline/mcp` (or `nowline --mcp`) and communicates over stdin/stdout. This is the default for every MCP CLI harness.
- **local HTTP (optional)** — `nowline --mcp --port <n>` or `@nowline/mcp --port <n>` binds a local HTTP listener for harnesses that prefer HTTP over stdio. Not the default; no TLS; localhost only.

No remote transport, no OAuth, no network calls to Lolay infrastructure. The server runs as the user with the user's file permissions.

## Optional MCP Apps UI variant

When the harness supports the MCP Apps interactive-UI protocol, `render` (and optionally `validate` preview) may return an **HTML resource** that mounts:

- [`@nowline/browser`](./architecture.md#surfaces) — `renderSource(source, options)`
- [`@nowline/preview-shell`](./architecture.md#surfaces) — `mountPreview(rootEl, options)` viewport chrome

…to show the roadmap live in-chat (the Mermaid Chart precedent). This path requires m4.7 packages and is **optional** — basic stdio operation does not depend on `@nowline/browser` or `@nowline/preview-shell`.

## Harness coverage (OSS tier only)

The OSS local server ships wherever a harness can run a **local** stdio server with filesystem access. Web-only harnesses (ChatGPT web, Gemini app/Spark, MS Copilot) have no local runtime and are out of scope here — they use Nowline Cloud instead.

| Harness | OSS install form | Config / marketplace |
|---------|------------------|----------------------|
| Cursor | MCP CLI (stdio) | Cursor Marketplace → `io.nowline/nowline` (registry-sourced) or manual `mcp.json` |
| VS Code | MCP CLI (stdio) | VS Code MCP gallery → `io.nowline/nowline` (registry-sourced) or manual MCP config |
| Claude Code | MCP CLI (stdio) | `claude mcp add` / `.mcp.json` — no marketplace |
| Claude Desktop | MCP Desktop (`.mcpb`) | Claude Desktop Extensions directory (one-click) |
| Gemini CLI | MCP CLI (stdio) + extension bundle | Gemini CLI extension channel (`name: nowline`) |
| Codex CLI | MCP CLI (manual) | `~/.codex/config.toml` entry |
| ChatGPT / Gemini app / MS Copilot | — | not supported (no local stdio) |

Marketplace-first: where a harness has an official marketplace, publish there and **only** there — no community directories (`cursor.directory`) or self-hosted deep-link buttons (`Add to Cursor`, `vscode:mcp/install`). Manual config is the fallback where no marketplace exists.

Distribution detail (release pipeline, naming ids, `.mcpb` build): [`specs/cli-distribution.md`](./cli-distribution.md) § MCP server distribution and [`specs/releasing.md`](./releasing.md) § MCP publishing artifacts.

The `.vsix` (`nowline.vscode-nowline`) is a **separate product** for human authoring (grammar, LSP, live preview, export commands). It is not an MCP server and does not write `mcp.json`. Users who want both install both via their native channels.

## Open-core boundary

Per [`specs/principles.md`](./principles.md) § Open core:

- `@nowline/mcp` is **purely local** — no network code, no auth, no proprietary dependencies, no cloud endpoints.
- Push/pull to cloud is **not** implemented inside this package. A user who needs both local files and cloud storage runs **two connectors**: Nowline (this server) and Nowline Cloud (remote, OAuth). The agent `read`s locally and `create`/`update`s on the cloud connector with the returned `source` — or opens the file in the Nowline Cloud web editor. See [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md) § Push/pull.

The OSS package may carry a **docs-only** forward pointer ("upgrade to Nowline Cloud for OAuth-gated cloud roadmaps") — text only, no commercial wiring.

## Nowline Cloud (forward pointer)

Lolay also ships a hosted MCP server — **Nowline Cloud** — that exposes the same tool names over remote HTTP with OAuth, operates on cloud-stored roadmaps, and adds `search`. It requires a Nowline account; cloud capabilities depend on plan (Pro/Enterprise). Spec, cross-tier matrix, and commercial distribution ownership: [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md).

## Local development

```bash
# Canonical harness path
npx @nowline/mcp

# Power-user path (requires @nowline/cli on PATH)
nowline --mcp

# Optional local HTTP
nowline --mcp --port 6789
```

No account, no API keys, no cloud project. Operates on the developer's local `.nowline` files with their file permissions.

## Cross-references

- Milestone delivery plan: [`specs/milestones.md`](./milestones.md) § m4.8
- Monorepo placement: [`specs/architecture.md`](./architecture.md) (`packages/mcp/`, dependency graph, Surfaces)
- CLI `--mcp` mode flag: [`specs/cli.md`](./cli.md)
- Release + naming convention: [`specs/releasing.md`](./releasing.md) § MCP publishing artifacts
- Per-channel distribution: [`specs/cli-distribution.md`](./cli-distribution.md) § MCP server distribution
- Cloud counterpart + full OSS-vs-Cloud matrix: [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md)
