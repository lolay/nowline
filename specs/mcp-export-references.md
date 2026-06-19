# Nowline MCP — Export delivery: prior art & client behavior

Reference notes so we don't re-research "how do MCP tools deliver downloadable
files / session artifacts" every session. Companion to [`specs/mcp.md`](./mcp.md)
(§ Structured output → export delivery, § `.mcpb` bundle packaging, § Optional
MCP Apps UI variant).

Last verified: 2026-06-18.

## TL;DR — what Nowline does and why

- **Binary formats (png, pdf, xlsx) → write to disk, return the path.** This is
  the near-universal MCP pattern ("return a reference, not the bytes"). Local
  stdio servers share the agent's filesystem, so a saved file + path is the most
  portable deliverable across every local/agentic host.
- **Text formats (svg, html, mermaid, msproj) → return inline text.** On Claude
  hosts these get promoted to downloadable artifacts by Claude itself; elsewhere
  the inline text still appears and IDE agents can save it.
- **Inline bytes are a last-resort fallback** (no configured root), because
  Claude Desktop silently drops binary blocks and large base64 bloats context.
- **`share` link** covers hosts with no disk (ChatGPT / remote connectors).

## The core constraint (Claude Desktop)

Claude Desktop's MCP client renders only `TextContent` and inline images from a
tool result. It **silently drops `EmbeddedResource` and `resource_link`** blocks
(they still enter the model context, but produce no visible/downloadable UI).
"Artifacts" are created by **Claude the model**, not by the tool's content block:
Claude wraps content in an artifact when "the user will want to copy/paste this
outside the conversation." UI-rendering artifact types: `.html`, `.jsx` (React),
`.mermaid`, `.svg`, `.pdf`. So a tool cannot *force* an artifact; it can only
return clean text and nudge the model via `instructions` / tool description.

- Claude Desktop drops EmbeddedResource as artifacts — [anthropics/claude-ai-mcp#287](https://github.com/anthropics/claude-ai-mcp/issues/287)
- Claude Desktop rejects mixed `TextContent` + `ResourceLink` — [modelcontextprotocol/modelcontextprotocol#1638](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1638)
- Claude Agent SDK content handling (converts `resource_link`→text, skips binary embedded resource) — [anthropics/claude-agent-sdk-python#725](https://github.com/anthropics/claude-agent-sdk-python/pull/725)
- Claude artifacts overview — [support.claude.com/articles/9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)

## Client / host behavior matrix

| Host | Filesystem? | Inline image? | Binary block (pdf/xlsx)? | Artifacts? | MCP Apps UI? | Best Nowline path |
|------|-------------|---------------|--------------------------|-----------|--------------|-------------------|
| Claude Desktop | yes (via `.mcpb` `--root`) | yes | dropped | yes (model-made) | yes (SEP-1865) | binary→disk; text→artifact; preview UI |
| Claude Code | yes (terminal) | as base64 in context | skipped w/ warning | no | yes | binary→disk; text inline |
| Cursor | yes (agentic IDE) | yes (+ download btn) | not rendered | no | partial | binary→disk; inline image fallback |
| VS Code Copilot | yes (IDE) | yes (thumbnails) | save/download via `ui/download-file` | no | yes (host) | binary→disk; `ui/download-file` works here |
| Goose | yes (local) | yes | — | no | no (uses MCP-UI, not MCP Apps) | binary→disk |
| ChatGPT (Apps SDK) | **no** (remote) | widget-only | n/a | no | widget model | preview widget + `share` link |

Notes:
- Cursor can gate inline images off per-server (e.g. playwright-mcp's
  `imageResponses: "allow"`); Nowline does not gate, so images work.
- VS Code has **implemented `ui/download-file`** — the one cross-host mechanism
  for in-chat binary downloads via the MCP Apps preview. Claude Desktop support
  is still pending. This is the natural future spike for in-chat PDF/XLSX
  downloads.
- ChatGPT downloads happen inside the widget via
  `window.openai.getFileDownloadUrl({ fileId })` (ChatGPT-only; "not yet
  implemented" in the cross-host MCP Apps bridge).

## Example MCP servers that handle file / image / export delivery

- **evalstate/mcp-hfspace** — canonical "Claude Desktop Mode": returns images
  inline, saves other files to a `WORK_DIR` and returns the path; exposes an
  "Available Resources" prompt. — [github.com/evalstate/mcp-hfspace](https://github.com/evalstate/mcp-hfspace)
- **mapbox/mcp-server** — dual output for portability: base64 PNG for standard
  clients (Cursor) + MCP-UI `UIResource` (Goose) + MCP Apps. Excellent client
  matrix writeup. — [docs/mcp-ui.md](https://github.com/mapbox/mcp-server/blob/main/docs/mcp-ui.md)
- **cloudflare/playwright-mcp #40** — image saving, Cursor image gating, and an
  "artifact store" (R2) idea for durable URLs. — [issue #40](https://github.com/cloudflare/playwright-mcp/issues/40)
- **Rick-Thompson/MCP-File-Bridge** — base64 bridge to write binary files to the
  local filesystem from Claude's container without corruption. — [github.com/Rick-Thompson/MCP-File-Bridge](https://github.com/Rick-Thompson/MCP-File-Bridge)
- **Mintplex-Labs/anything-llm #5273** — rendering MCP images
  (`image` / `resource_link` / `resource`) inline, bypassing the LLM to save
  tokens, with a download button. — [PR #5273](https://github.com/Mintplex-Labs/anything-llm/pull/5273)
- **markdown-vault-mcp** — one-time HTTP transfer links (download/upload without
  passing bytes through context; HTTP/SSE transport only). — [transfer-links guide](https://pvliesdonk.github.io/markdown-vault-mcp/guides/transfer-links/)

## Protocol mechanisms

- **MCP tool content types** (`text`, `image`, `audio`, `resource_link`,
  `resource`/EmbeddedResource) — [spec 2025-11-25 / tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- **MCP Apps (SEP-1865)** — `ui/download-file`, `ui/open-link`, host capability
  flags (`downloadFile`, `openLinks`); sandboxed iframe blocks direct downloads,
  so `ui/download-file` is the host-mediated path. — [ext-apps spec (draft) apps.mdx](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
- **VS Code `ui/download-file` implementation** — [microsoft/vscode#298838](https://github.com/microsoft/vscode/issues/298838)
- **VS Code MCP dev guide** (resources, MCP Apps, icons, image rendering) — [vscode-docs api/.../mcp.md](https://github.com/microsoft/vscode-docs/blob/main/api/extension-guides/ai/mcp.md)
- **Cursor MCP images-as-context** — [cursor.com/docs/context/mcp](https://cursor.com/docs/context/mcp)
- **OpenAI Apps SDK reference** (`uploadFile`, `selectFiles`,
  `getFileDownloadUrl`, `structuredContent` / `_meta`) — [developers.openai.com/apps-sdk/reference](https://developers.openai.com/apps-sdk/reference)
- **Apps SDK → MCP Apps migration** (which `window.openai.*` APIs are portable) — [migrate-openai-app](https://apps.extensions.modelcontextprotocol.io/api/documents/migrate-openai-app.html)

## Best-practice writeups (return a reference, not bytes)

- "Your MCP server can't take a file as an argument — here's why, and the fix" — [dev.to/stelaspace](https://dev.to/stelaspace/your-mcp-server-cant-take-a-file-as-an-argument-heres-why-and-the-fix-13no)
- "File handling in AI agents with MCP: lessons learned" — [gelembjuk.com](https://gelembjuk.com/blog/post/file-handling-in-ai-agents-with-mcp-lessons-learned/)
- "What Are MCP Resources?" (the disk→templated-resource-URI 2-step) — [apigene.ai/blog/mcp-resources](https://apigene.ai/blog/mcp-resources)
- "MCP structuredContent: return large results without flooding context" — [futuresearch.ai](https://futuresearch.ai/blog/mcp-results-widget/)

## Internal references (our code)

- Export tool + delivery logic, `buildExportInlineContentBlocks` — [`packages/mcp/src/server.ts`](../packages/mcp/src/server.ts)
- `--root` token expansion — [`packages/mcp/src/root-path.ts`](../packages/mcp/src/root-path.ts)
- `.mcpb` manifest (`user_config.output_dir`, `--root` injection) — [`packages/mcp/manifest.json`](../packages/mcp/manifest.json)
- Spec: export delivery + packaging + preview — [`specs/mcp.md`](./mcp.md)
