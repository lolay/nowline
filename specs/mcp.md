# Nowline — MCP Server (OSS)

## Overview

The Nowline MCP server exposes the CLI's capabilities to AI agent harnesses through a typed, discoverable **Model Context Protocol** tool surface. Agents get structured inputs and outputs, schema discovery, and an optional in-chat rendered preview — instead of shelling out to `nowline` and parsing unstructured text.

**Package:** `@nowline/mcp`, in this monorepo at `packages/mcp/`.
**License:** Apache 2.0.
**Milestone:** m4.8. Depends on m1 (core), m2a/m2b (CLI/layout/renderer), m3a (LSP — optional for richer navigation tools), m4.7 (`@nowline/browser` + `@nowline/preview-shell` + `@nowline/preview` — required only for the optional MCP Apps UI variant). See [`specs/milestones.md`](./milestones.md) § m4.8.

> **Naming.** Display name **Nowline** today (local OSS, no account). Relabels to **Nowline OSS** once the hosted **Nowline Cloud** MCP ships. Publishing id `nowline` (bare — never `-oss`); registry id `io.nowline/nowline`; `.mcpb` manifest `name: nowline`. **Pro** and **Enterprise** are account tiers that gate Nowline Cloud — never connector names. Full convention: [`specs/releasing.md`](./releasing.md) § MCP publishing artifacts and [`specs/cli-distribution.md`](./cli-distribution.md) § MCP server distribution.

## Why MCP (not "just call the CLI")

Shelling out to `nowline` works, but agent harnesses lose:

- **Discoverability** — no typed tool list; the model must already know every flag, and no way to enumerate valid themes, icons, locales, or formats.
- **Structured I/O** — diagnostics, render output, and file paths come back as unstructured text the model re-parses.
- **Resources** — no way to prime the model with the DSL grammar, canonical examples, or conversion guidance before it writes `.nowline`.
- **Prompts** — no reusable, server-authored workflow templates (create-a-roadmap, fix-these-diagnostics, convert-this-Gantt) the harness can surface as slash-commands.

`@nowline/mcp` wraps `@nowline/core` and the same export capabilities the human-facing `nowline` binary exposes, behind the stable tool names shared with the Nowline Cloud MCP contract (see [Shared tool contract](#shared-tool-contract)), with [tool annotations](#tool-annotations) and [structured outputs](#structured-output) so harnesses can reason about each tool's risk and parse results without guessing. It also ships MCP [resources](#resources) (to prime the model) and [prompts](#prompts) (to script the common create / fix / convert workflows). Cloud adds `search` and push/pull over remote storage; the OSS server stays purely local per [Open core](#open-core-boundary).

**In-process, not a CLI shell-out.** `@nowline/mcp` runs as a Node process (`npx @nowline/mcp`), the same runtime as the CLI and the VS Code extension host, so it imports the shared `@nowline/export` kernel and `@nowline/core` directly and produces every artifact in-process — there is no `nowline` binary dependency on the canonical path. This is what lets `render`/`export` honor the byte-for-byte [export-determinism](./export-determinism.md) precedent: the MCP server, the CLI, and the extension all run the *same* kernel, so identical source + inputs yield identical bytes. The `nowline --mcp` power-user path is the one exception — it *is* the CLI hosting the same server code (see [MCP CLI vs MCP Desktop](#mcp-cli-vs-mcp-desktop)).

## MCP CLI vs MCP Desktop

One codebase, two install wrappers — not two servers.

| Form | What it is | How it installs | Transport |
|------|------------|-----------------|-----------|
| **MCP CLI** | `@nowline/mcp` spawned by the harness | `npx @nowline/mcp` in Cursor `mcp.json`, VS Code MCP settings, Claude Code `.mcp.json`, Codex `config.toml`, Gemini CLI extension | stdio (primary) |
| **MCP Desktop** | The same package as a one-click bundle | `.mcpb` in Claude's Desktop Extensions directory | stdio (Claude Desktop spawns it locally) |

Which form a harness uses depends on whether it is a terminal/IDE harness (MCP CLI) or a GUI desktop app (MCP Desktop). The server code, tool surface, and resources are identical.

**Power-user path:** `nowline --mcp` starts the same server in stdio mode using an already-installed CLI binary. `npx @nowline/mcp` is the canonical path in harness configs because it decouples the MCP server's install lifecycle from the CLI binary. See [`specs/cli.md`](./cli.md) § `--mcp`.

## Branding and icons

The Nowline mark appears on every MCP surface that supports icons (MCP spec `2025-11-25`, SEP-973):

| Surface | Where | Format | Notes |
|---------|-------|--------|-------|
| **Runtime server** | `serverInfo.icons` in the `initialize` response | Inline `data:` URIs (128×128 PNG + SVG) | No network dependency for stdio/local clients. Source: `packages/mcp/src/branding.ts`, generated from `branding/marketplace-publisher-icon.png` and `branding/favicon.svg`. |
| **Claude Desktop `.mcpb`** | `manifest.json` `"icon": "icon.png"` | Local PNG in the bundle (`packages/mcp/icon.png`) | Rendered by Claude Desktop today. Copied into the bundle by `make pack-mcpb`. |
| **MCP registry** | `packages/mcp/server.json` `icons` | HTTPS `https://nowline.io/branding/icon-128.png` | Registry schema requires HTTPS URLs (no data URIs). Hosted by [`lolay/nowline-site`](https://github.com/lolay/nowline-site). |
| **Claude.ai web custom connector** | Connector URL registrable domain | Root favicon at `https://nowline.io/favicon.ico` | Claude.ai currently ignores `serverInfo.icons` for custom connectors and derives the icon from the root-domain favicon. |
| **Connectors Directory / ChatGPT App** | Submission metadata | Uploaded PNG at publish time | Same brand asset; not wired through the protocol. |

**Per-tool / per-prompt icons** are deferred: `@modelcontextprotocol/sdk@1.29.0` `registerTool` / `registerPrompt` config types do not yet expose an `icons` field (TypeScript build error if added). When the SDK adds support, add `icons: [...NOWLINE_MCP_ICONS]` to each tool/prompt descriptor in `packages/mcp/src/server.ts` and `prompts.ts`.

## Shared tool contract

Tool names are **identical** to the Nowline Cloud MCP server so agents and users graduate from local files to cloud storage with zero relearning. The OSS server addresses **local file paths**; cloud addresses **diagram ids** and adds `search`.

| Tool | Args (OSS) | Returns | Notes |
|------|------------|---------|-------|
| `validate` | `{ source?: string, path?: string }` | `{ ok: boolean, diagnostics: Diagnostic[], insights?: Insight[] }` | Parse + validate via `@nowline/core`. On success, returns layout `insights` (informational reflow consequences) by default. At least one of `source` or `path` required. Diagnostics carry stable `NL.E####` codes and optional `suggestion`. |
| `render` | `{ source?: string, path?: string, format?: 'svg' \| 'png' = svg, theme?, now?, width?, review?, ... }` | image resource + `{ path?: string, insights?: Insight[] }` metadata | Validates first; on error returns `{ ok: false, diagnostics }` (same shape as `validate`). On success renders in-process via `@nowline/export` and returns layout `insights`. Optional `review: true` attaches a downscaled inspection PNG for multimodal self-review. |
| `read` | `{ path: string }` | `{ path, source }` | Reads a local `.nowline` file. Rejects paths outside allowed roots (project directory + `--asset-root` semantics aligned with the CLI). |
| `create` | `{ path: string, source: string }` | `{ path }` | Writes a new `.nowline` file after validation. Overwrites if the path already exists (same silent-overwrite posture as the CLI). |
| `update` | `{ path: string, source: string }` | `{ path }` | Replaces an existing file after validation. |
| `delete` | `{ path: string }` | `{ path }` | Deletes a local `.nowline` file. |
| `list` | `{ directory?: string, recursive?: boolean = false }` | `{ paths: string[] }` | Lists `.nowline` files under `directory` (default: cwd). |
| `export` | `{ source?: string, path?: string, format: 'pdf' \| 'html' \| 'mermaid' \| 'xlsx' \| 'msproj' \| 'png', ... }` | file resource + metadata | Same `@nowline/export` kernel and format adapters as `nowline <input> -f <format>`, run in-process. Byte-identical to the CLI for the same source + inputs ([export-determinism](./export-determinism.md)). Returns an MCP resource for the rendered artifact. |

Cloud-only additions (`search`, cloud `read`/`create`/`update`/`delete` by `id`) live in [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md). This doc covers the OSS local surface only.

### Additional OSS tools

Tools beyond the shared contract. They lean on capabilities the CLI already has (`convert` is m2a; the option vocabularies are the same enums the renderer and exporters consume), so none widens OSS scope. The Cloud server may mirror them, but they are not part of the shared-name guarantee.

| Tool | Args | Returns | Notes |
|------|------|---------|-------|
| `convert` | `{ source?: string, path?: string, to: 'json' \| 'nowline' }` | `{ result: string }` (+ structured AST when `to: 'json'`) | Bidirectional text ↔ JSON AST, the same round-trip-stable `convert` the CLI exposes (`nowline … -f json` / JSON → text). Lets an agent fetch the typed AST, manipulate structure programmatically, and re-emit canonical `.nowline`. |
| `capabilities` | `{}` | `{ themes, icons, locales, formats, templates }` | The whole option vocabulary in one call — the cheap way to prime a model before it writes `.nowline`: theme names (`light`, `dark`, `grayscale`), the `capacity-icon` vocabulary + reserved built-in icon names, available locales (`en`, `fr`), export formats, and `--init` template names (`minimal`, `teams`, `product`, `showcase`). |
| `list-themes` / `list-icons` / `list-locales` / `list-formats` / `list-templates` | `{}` | the matching slice of the `capabilities` payload | Granular discovery tools — thin projections of `capabilities`, one vocabulary each. For harnesses that surface options individually (a `list-themes` slash-command) or agents that want just one slice without the full payload. Mirrors Mermaid's `listSupportedTypes` and D2's `list_themes` / `list_icons` shape. Same underlying data as `capabilities`; pick whichever fits the call. |
| `reference` | `{ format?: 'condensed' \| 'full' = condensed }` | `{ format, text }` | Callable DSL reference (condensed cheatsheet or full man page). Mirrors Mermaid's `getMermaidSyntaxGuide`. **Tools mirror** the `nowline://reference` resource because agents call tools but often skip resources. |
| `examples` | `{ name?: string }` | `{ names?, name?, source? }` | Example catalog (no `name`) or one example's source by name. Mirrors Mermaid's `get_examples`. Mirrors `nowline://examples`. |
| `schema` | `{}` | `{ directiveKeys, entityTypes, itemPropertyKeys }` | Structured key vocabulary for the DSL. Mirrors Mermaid's frontmatter-schema discovery pattern. |

**Why both forms.** `capabilities` is one round-trip for the full picture (ideal for priming and for token-frugal agents); the `list-*` family is granular for harnesses that expose each vocabulary as its own affordance and for agents that need a single slice. They never disagree — the `list-*` tools are projections of the same source enums `capabilities` returns.

### Tool annotations

Every tool declares the standard MCP behavior hints ([spec](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) § annotations) so harnesses can reason about risk and idempotency. These are advisory hints, never a security boundary — the path-root sandbox in [Open core](#open-core-boundary) is the real guard.

Every tool also sets a human-readable `annotations.title` (Title Case, base-verb label — e.g. "Validate Roadmap", "View Roadmap Reference") and `openWorldHint: false` (the OSS server is a closed local world). See [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) § 5.E.

| Tool | `title` | `readOnlyHint` | `idempotentHint` | `destructiveHint` | `openWorldHint` |
|------|---------|:--:|:--:|:--:|:--:|
| `validate`, `read`, `list`, `render`, `export`, `convert`, `capabilities`, `list-*`, `reference`, `examples`, `schema` | ✓ | ✓ | ✓ | — | ✗ |
| `create` | ✓ | — | ✓ | ✓¹ | ✗ |
| `update` | ✓ | — | ✓ | ✓ | ✗ |
| `delete` | ✓ | — | — | ✓ | ✗ |

¹ `create` is marked `destructiveHint` because it silently overwrites an existing file at the same path (same posture as the CLI). Whole-document writes are idempotent (same args → same end state), so `idempotentHint` is also true.

### Structured output

Every tool declares an `outputSchema` and returns [structured content](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) (the typed object in the table above) alongside a human-readable text block. This is the point of the server: harnesses get a machine-checkable shape (e.g. `validate` → `{ ok, diagnostics }` with stable `NL.E####` codes, optional `suggestion`, and optional layout `insights`) instead of re-parsing prose. `render`/`export` validate first and return the same `{ ok: false, diagnostics }` shape on error-severity input (never a raw kernel error string). On success, `render`/`validate` also return layout `insights` (informational reflow consequences, not errors). `render`/`export` additionally return the image/document as an MCP resource (and, optionally, a [share link](#share-links)).

`read`, `delete`, `list`, and path/IO guard failures return `{ ok: false, error: { code, message } }` with `isError: true` and stable `NL.MCP.*` codes (e.g. `NL.MCP.NOT_FOUND`, `NL.MCP.OUT_OF_ROOT`, `NL.MCP.INPUT`) rather than raw JSON-RPC error strings — per [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) § 5.A.

### Share links

`render` and `export` accept an optional `share?: boolean` arg. When set, the result includes a `shareUrl` built from the OSS share-link grammar (`#text=` / `#url=`, see [`specs/embed.md`](./embed.md) § Share on Nowline) pointing at the public `free.nowline.io/open` viewer. This is the Mermaid-Chart playground-link UX done with infrastructure Nowline already ships from m4 — the agent can hand the user a viewable URL, not just bytes on disk. Purely a convenience: the link is a client-side-decoded fragment, so generating it makes no network call and stays inside the [Open core](#open-core-boundary) (the viewer is OSS; no account or cloud storage is involved).

## Resources

Three MCP resources prime models to emit valid `.nowline` without out-of-band documentation — the DSL is the product.

| URI | Content | Source |
|-----|---------|--------|
| `nowline://reference` | Full DSL reference (section-5 man page) | [`packages/cli/man/nowline.5`](../packages/cli/man/nowline.5) |
| `nowline://examples` | Canonical example roadmaps | [`examples/`](../examples/) — including `showcase.nowline` from m4.7 |
| `nowline://conversions` | Mapping guide from common Gantt / timeline formats into `.nowline` | hand-authored, co-located with the spec (see [Conversion guidance](#conversion-guidance)) |

Harnesses that support MCP resources should expose all three by default. The reference resource is the grammar/man-page vocabulary; the examples resource is concrete syntax patterns to sample from; the conversions resource is the source-format → DSL mapping that powers the [`convert-to-nowline`](#prompts) prompt.

### Conversion guidance

Nowline already exports *to* Mermaid, XLSX, and MS Project XML; the inverse — importing *from* those and other planning tools — is deliberately **not** a set of native parsers (see [Non-goals](#non-goals)). Instead, `nowline://conversions` is a documented mapping cheatsheet that, paired with `nowline://reference`, gives an LLM everything it needs to do the conversion itself and then validate the result. The guide covers:

- **Mermaid `gantt`** — `section` → swimlane; task lines → `item` (`:id, after dep, 5d` → `after:dep` + derived duration); `done` / `active` / `crit` → status; the date axis → `roadmap start:`.
- **MS Project** (XML export, or a tasks CSV) — tasks → items; summary tasks → groups / swimlanes; finish-to-start predecessor links → `after:`; assigned resources → `person` / `team` + owner; zero-duration tasks → `milestone`.
- **Excel / XLSX Gantt tables** — column mapping (`Task`, `Start`, `End` or `Duration`, `Dependencies`, `Owner`, `% Complete`) → item fields; a grouping column → swimlane / group; `% Complete` → progress / status.
- **Google Sheets timeline view** — the Timeline view's Card title / Start / Duration / Dependencies / Resource columns map directly to the same item fields as the Excel path.
- **Generic CSV exports** (Asana, Jira, Smartsheet, Monday timelines) — the same task-table mapping, with a documented fallback for unknown columns.
- **General rules** — always emit `roadmap start:`; prefer `size` + `effort` when durations are derived rather than explicit; preserve dependency ids verbatim; map assignees to `person` / `team`; and surface anything ambiguous as a `#` comment in the output rather than guessing silently.

## Prompts

MCP prompts are reusable, server-authored workflow templates a harness can surface as slash-commands (the PlantUML and UML-MCP precedent). All three compose the [resources](#resources) and [tools](#shared-tool-contract) above; none require the network.

| Prompt | Args | What it does |
|--------|------|--------------|
| `create-roadmap` | `{ description: string }` | Turns a natural-language description into a valid `.nowline` file. Primes the model with `nowline://reference` + `nowline://examples`, then expects a `validate` call to confirm before writing. |
| `fix-diagnostics` | `{ source: string, diagnostics?: Diagnostic[] }` | The validate → fix → re-validate loop. Feeds the model the source plus the `NL.E####`-coded diagnostics (and their suggestions) and asks for a corrected document. Mirrors PlantUML's `plantuml_error_handling` auto-fix prompt. |
| `convert-to-nowline` | `{ source: string, from?: 'mermaid-gantt' \| 'ms-project' \| 'xlsx' \| 'gsheets-timeline' \| 'csv' \| 'auto' = auto }` | Converts another Gantt / timeline format into `.nowline`. Primes the model with `nowline://conversions` (the mapping for the given `from`) + `nowline://reference`, emits the `.nowline`, then expects a `validate` pass. `auto` lets the model detect the source shape. This is the LLM-mediated importer — no native parser ships. |

The point of `convert-to-nowline` is leverage: rather than maintaining brittle importers for every planning tool's export format, the server hands the model a precise mapping and a validator, and the model does the transcription. New source formats are added by extending `nowline://conversions`, not by writing code.

## Transport

- **stdio (primary)** — the harness spawns `npx @nowline/mcp` (or `nowline --mcp`) and communicates over stdin/stdout. This is the default for every MCP CLI harness.
- **Streamable HTTP (optional, local)** — `nowline --mcp --port <n>` or `@nowline/mcp --port <n>` binds a localhost listener speaking the current MCP **Streamable HTTP** transport for harnesses that prefer HTTP over stdio. Not the default; no TLS; localhost only. The deprecated standalone SSE transport is **not** offered — Streamable HTTP supersedes it.

No remote transport, no OAuth, no network calls to Lolay infrastructure. The server runs as the user with the user's file permissions.

## Optional MCP Apps UI variant

When the harness supports the MCP Apps interactive-UI protocol (SEP-1865), `render` auto-renders an in-chat preview on hosts that advertise the `io.modelcontextprotocol/ui` extension. The wiring follows the official four-piece model:

1. **`_meta.ui.resourceUri`** on the `render` tool (plus the legacy `openai/outputTemplate` alias for older ChatGPT surfaces) points at a pre-declared UI resource.
2. **`ui://nowline/preview-v1`** — a versioned `ui://` resource registered at server startup, served with MIME type `text/html;profile=mcp-app`. The HTML is static (bundle only); bump the URI suffix when the bundle changes so hosts invalidate their aggressive UI-resource cache.
3. **`ontoolinput` + `ontoolresult` handshake** — per-call data (`source`, `theme`, `now`, `width`, `locale`) reaches the widget two ways. `App.ontoolinput` paints immediately from the LLM's `render` arguments (fast path, before the server finishes rendering); `App.ontoolresult` reconciles from the authoritative lean `{ kind: 'nowline.preview', … }` JSON block in the tool result (also covers `path:`-only calls and hosts that never deliver tool-input). Both feed one idempotent `mountLivePreview` mount.
4. **Lean result on apps hosts** — when a UI-capable client is detected, `render` omits the inline SVG/PNG artifact from the result content (keeping results under the host's ~150K inline cap). Non-apps hosts still receive the full SVG/PNG inline; degradation is automatic.

The widget stack:

- [`@nowline/preview`](./architecture.md#surfaces) — `mountLivePreview(rootEl, opts)` Layer 2 controller (owns the `renderSource → applyRenderResult` loop)
  - Which in turn uses [`@nowline/browser`](./architecture.md#surfaces) — `renderSource(source, options)` and [`@nowline/preview-shell`](./architecture.md#surfaces) — `mountPreview(rootEl, options)` viewport chrome

This path requires these packages and is **optional** — basic stdio operation does not depend on `@nowline/browser`, `@nowline/preview-shell`, or `@nowline/preview`.

The convention used by the in-chat preview is encoded in `@nowline/preview-shell`'s `applyRenderResult` helper: **a successful render shows the diagram; warnings do not trigger the diagnostics overlay; only errors dim the canvas**. This is intrinsic to `mountLivePreview`'s default apply policy and is also hardened in `mountPreview`'s `setDiagnostics` implementation, so the veil cannot reappear from stale hand-rolled call sequences.

The in-chat preview mounts with `exportControls: 'hide'` — the toolbar is view-only (zoom, pan, fit, theme, now-line, show-links). Clipboard and in-iframe download are unreliable in the MCP Apps sandbox; artifacts come from the `render` and `export` tools instead.

### Sizing in size-to-content hosts

Web hosts (Claude Desktop) load the widget into an **opaque-origin** `sandbox="allow-scripts"` iframe and size that iframe from the widget's `ui/notifications/size-changed` notification. The shell is a fill-the-container layout (`html` / `body` / `#nl-preview-root` are all `height:100%`), so it has **no intrinsic content height**. The `@modelcontextprotocol/ext-apps` SDK's **default `autoResize` measures `documentElement` at `max-content`**, where that `height:100%` chain collapses to **0** — the host then shrinks the iframe to nothing: a **blank preview with no console error**.

The MCP App entry (`packages/mcp/src/ui/entry.ts`) therefore constructs `App` with **`autoResize: false`** and reports the **diagram's** height instead. It mounts at `fitWidth` and measures the rendered SVG's `viewBox`, so the reported height is `naturalHeight × (width / naturalWidth)` — the diagram shown at full width — clamped to the host's available height (`containerDimensions.maxHeight`, default 640px, min 160px). A `ResizeObserver` + `MutationObserver` re-report on width changes and re-renders; because the measurement is `viewBox`-based (not the live zoom scale), **user zoom never resizes the iframe**. This keeps a short roadmap compact (no empty band that pushes the diagram below the fold) and caps a tall one, which then scrolls internally. VS Code and embed are unaffected: they own the panel height and never mount this entry.

### Debugging the in-chat preview (Claude Desktop)

Claude Desktop's logs do **not** capture anything inside the widget iframe — iframe `console.*`, uncaught errors, and CSP violations are invisible there. The server log (`~/Library/Logs/Claude/mcp-server-nowline.log`) confirms the tool call and the lean result; the renderer log (`~/Library/Logs/Claude/claude.ai-web.log`) shows host-side approval/CSP noise but **not** the iframe's own errors. A blank widget is therefore almost always a **silent** sandbox failure — sizing (above), CSP, or an opaque-origin API throw — not something you can grep a log for.

Two ways to get ground truth without Claude:

- **MCP Inspector** — `npx @modelcontextprotocol/inspector npx @nowline/mcp`. Its **Apps** tab loads `ui://nowline/preview-v1` in a sandboxed iframe and exposes that iframe's console + CSP violations directly. Use it to eyeball rendering and read the real error behind a blank widget.
- **`make mcp-app-e2e`** — the automated equivalent. A headless-Chromium Playwright leg (`packages/integration-tests/test/mcp-app-preview.e2e.test.ts`) reproduces the opaque-origin `sandbox="allow-scripts"` iframe **under a strict CSP** and plays the AppBridge handshake (`ui/initialize → initialized → tool-input → tool-result`) with a mock host that sizes the iframe from `size-changed` exactly like Claude. It asserts the widget reports a **non-zero** height and actually paints. This leg caught the `autoResize` height-0 collapse and guards against its return; it is **not** in `make ci` (needs a browser), so run it on any change to the widget entry, the UI bundle, or the sizing model.

## Harness coverage (OSS tier only)

The OSS local server ships wherever a harness can run a **local** stdio server with filesystem access. Web-only harnesses (ChatGPT web, Gemini app/Spark, MS Copilot) have no local runtime and are out of scope here — they use Nowline Cloud instead.

| Harness | OSS install form | Config / marketplace | CI (m4.9) |
|---------|------------------|----------------------|-----------|
| Cursor | MCP CLI (stdio) | Cursor Marketplace → `io.nowline/nowline` (registry-sourced) or manual `mcp.json` | Registry automated |
| VS Code | MCP CLI (stdio) | VS Code MCP gallery → `io.nowline/nowline` (registry-sourced) or manual MCP config | Registry automated |
| Claude Code | MCP CLI (stdio) | `claude mcp add` / `.mcp.json` — no marketplace | npm only |
| Claude Desktop | MCP Desktop (`.mcpb`) | Claude Desktop Extensions directory (one-click) | `.mcpb` built in CI; directory submission manual |
| Gemini CLI | MCP CLI (stdio) + extension bundle | Gemini CLI extension channel (`name: nowline`) | Manual submission |
| Codex CLI | MCP CLI (manual) | `~/.codex/config.toml` entry | npm only |
| ChatGPT / Gemini app / MS Copilot | — | not supported (no local stdio) | — |

Marketplace distribution status and the release pipeline: [`specs/milestones.md`](./milestones.md) § m4.9, [`specs/releasing.md`](./releasing.md) § MCP publishing artifacts, [`ops/mcp-marketplace.md`](../ops/mcp-marketplace.md).

Marketplace-first: where a harness has an official marketplace, publish there and **only** there — no community directories (`cursor.directory`) or self-hosted deep-link buttons (`Add to Cursor`, `vscode:mcp/install`). Manual config is the fallback where no marketplace exists.

Distribution detail (release pipeline, naming ids, `.mcpb` build): [`specs/cli-distribution.md`](./cli-distribution.md) § MCP server distribution and [`specs/releasing.md`](./releasing.md) § MCP publishing artifacts.

### `.mcpb` bundle packaging

Claude Desktop installs the OSS server as a one-click `.mcpb` bundle (`make pack-mcpb` → `dist-mcpb/nowline.mcpb`). The bundle is **not** a deployed pnpm workspace tree — that approach (`pnpm deploy --prod --legacy`) produced ~608 MiB / 55k files because every `@nowline/*` package nested its own full `node_modules`, including devDependencies such as `typescript` duplicated dozens of times.

**Decision: hybrid esbuild bundle.** `packages/mcp/scripts/bundle-server.mjs` bundles the compiled server into a single `dist/index.js` (~7 MiB) via esbuild (`platform: node`, `format: esm`). Everything reachable from the server entry is inlined and tree-shaken: all `@nowline/*` workspace code, Langium, ExcelJS, the MCP SDK, Zod, and the in-chat preview UI bundle. This matches how the rest of the estate ships runtime code (embed → single esbuild bundle; CLI → `bun compile` binary; npm → `dist/` only, no `node_modules`).

**External allowlist** — the only packages kept in `staging/node_modules` (installed via a minimal `package.json` + `npm install --omit=dev`):

| Package | Why external |
|---------|--------------|
| `@resvg/resvg-wasm` | Ships `index_bg.wasm` on disk; loaded via `createRequire(import.meta.url).resolve(...)` in `packages/export-png` and `packages/mcp/src/server.ts`. |
| `pdfkit` | Reads AFM font-metric files from `js/data/` at runtime; bundling breaks path resolution. |
| `langium` (+ vscode-jsonrpc / chevrotain transitives) | Langium's Node entry uses dynamic `require()` that esbuild cannot fold into an ESM bundle; kept external so the bundled server still starts. `@nowline/core` remains inlined — only the langium runtime is external. |

**Not external:** DejaVu fallback fonts — embedded as base64 in `@nowline/export-core/generated/bundled-fonts.js` at build time; no on-disk TTF read at runtime.

**Size guard:** `make pack-mcpb` fails if `nowline.mcpb` exceeds 30 MiB (regression guard against the deploy-based layout returning). Staging is smoke-verified by `packages/mcp/scripts/verify-mcpb-staging.mjs` (PNG via resvg WASM, PDF via pdfkit AFM, bundled DejaVu fonts) before packing.

The `.vsix` (`nowline.vscode-nowline`) is a **separate product** for human authoring (grammar, LSP, live preview, export commands). It is not an MCP server and does not write `mcp.json`. Users who want both install both via their native channels.

## Non-goals

Capabilities other diagram MCP servers ship that Nowline's OSS server deliberately omits, recorded so they read as decisions rather than oversights:

- **Native format importers.** No built-in parser for Mermaid `gantt`, MS Project XML, XLSX, Google Sheets, or CSV. Import is **LLM-mediated** through the [`convert-to-nowline`](#prompts) prompt + [`nowline://conversions`](#conversion-guidance) resource. Maintaining a mapping cheatsheet scales to new source formats far better than maintaining brittle parsers, and it keeps the OSS surface small.
- **Stateful incremental editing.** No equivalent of D2's Oracle API (`create` / `set` / `move` / `rename` shape-level mutations on a live in-memory diagram). The `.nowline` file is the unit of state; agents read the whole document, edit text (or the AST via [`convert`](#additional-oss-tools)), and write it back. This matches the repo's file-is-the-product principle.
- **Batch render.** One source per `render` / `export` call (no `generate_batch`). An agent loops; the determinism guarantee makes the loop predictable.
- **Title / summary helper tools.** No `get_diagram_title` / `get_diagram_summary` (Mermaid Chart ships these). The host model already does this well from the source; a dedicated tool adds surface without adding capability.

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

# Optional local Streamable HTTP
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
