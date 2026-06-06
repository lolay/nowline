# Handoff — m4.8 `@nowline/mcp` surface

**Date:** 2026-06-06  
**Milestone:** m4.8  
**Package:** `packages/mcp/`  
**Spec:** [`specs/mcp.md`](../mcp.md)

## What shipped

### Architecture constraint (pre-work)

`printNowlineFile`, `parseNowlineJson`, and `TEMPLATE_NAMES` were relocated from `@nowline/cli` into `@nowline/core`. Both `@nowline/cli` and `@nowline/mcp` now import from `@nowline/core`. This broke the `cli → mcp → cli` circular dependency that blocked the full MCP surface.

### Phase 0 — Foundations

- Fixed hardcoded `'0.5.1'` version in `server.ts` and `index.ts`; server now reads from `package.json`.
- Added `annotations` (`readOnlyHint`, `idempotentHint`, `destructiveHint`) to every `registerTool` call per the MCP spec.
- Added `outputSchema` (Zod) to every tool; tools return `structuredContent` alongside the existing text block. Shared schemas in `src/schemas.ts`.

### Phase 1 — `convert`, `capabilities`, `list-*`

- `convert` (`{ source?, path?, to: 'json'|'nowline' }`): bidirectional `.nowline` ↔ JSON AST.
- `capabilities` ({}): aggregated from real registries in `src/capabilities.ts`.
- `list-themes`, `list-icons`, `list-locales`, `list-formats`, `list-templates`: thin projections of the `capabilities` payload.

### Phase 2 — `nowline://conversions` resource

- Hand-authored `packages/mcp/resources/conversions.md` covering Mermaid `gantt`, MS Project, Excel, Google Sheets, CSV, and general rules.
- Bundled as `CONVERSIONS_GUIDE` via `scripts/bundle-resources.mjs` → `src/generated/resources.ts`.
- Registered as `nowline://conversions` in `server.ts`.

### Phase 3 — Prompts

Three prompts in `src/prompts.ts`, registered via `registerPrompts(server)`:
- `create-roadmap` — composes `nowline://reference` + `nowline://examples`.
- `fix-diagnostics` — validate → fix → re-validate loop on `NL.E####` codes.
- `convert-to-nowline` — composes `nowline://conversions` + `nowline://reference`; `from` enum `mermaid-gantt|ms-project|xlsx|gsheets-timeline|csv|auto`.

### Phase 4 — Streamable HTTP transport (`--port`)

`StreamableHTTPServerTransport` bound to localhost when `--port` is supplied, wired through `index.ts` and `packages/cli/src/commands/mcp.ts` (+ `args.ts`). stdio stays the default; SSE is not offered.

### Phase 5 — Share links

`render` and `export` accept `share?: boolean`. When set, `shareUrl` is built from the `free.nowline.io/open` fragment grammar (deflate + base64url, no network call) and included in `structuredContent`.

### Phase 6 — MCP Apps in-chat preview

- `packages/mcp/src/ui/entry.ts` imports `renderSource` (`@nowline/browser`) + `mountPreview` (`@nowline/preview-shell`), bundled to a self-contained IIFE via `scripts/bundle-ui.mjs` → `src/generated/ui-bundle.ts`.
- `render` returns an embedded `text/html` resource (SEP-1865 `text/html;profile=mcp-app`) when the client advertises the MCP Apps UI capability or `preview: true` is passed. Plain stdio operation is unchanged.

### Phase 7 — Tests

`packages/mcp/test/mcp.smoke.test.ts` expanded from a 3-describe shallow smoke test to 43 in-process tool-call tests using `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk`. Coverage:
- Tool list, annotation hints, `outputSchema` presence on all tools.
- `validate` ok / error + structuredContent vs text parity.
- `create` / `update` validation gating (invalid source → `isError: true`).
- `convert` round-trip (`.nowline` → JSON → `.nowline`).
- `capabilities` + each `list-*` (cross-checked that slices equal the capabilities payload).
- Prompts list (`create-roadmap`, `fix-diagnostics`, `convert-to-nowline`) + `getPrompt` shapes.
- Resources list (`nowline://reference`, `nowline://examples`, `nowline://conversions`).
- structuredContent shape assertions for `validate`, `read`, `list`, `render`, `capabilities`.
- Share link (`shareUrl` contains `free.nowline.io/open`).
- **Determinism parity**: MCP `render` SVG bytes equal `exportDocument` direct-kernel output for the same source + fixed `now` date.

`make pre-commit` (lint + typecheck + build + all vitest suites) passes.

### Phase 8 — Docs / CHANGELOG

- `CHANGELOG.md [Unreleased]`: Added entries for all ten new MCP surface items; Changed entry for the core refactor.
- `specs/mcp.md`:
  - `capabilities` table: `light`, `dark` → `light`, `dark`, `grayscale`.
  - Share-links section: `embed.nowline.io` → `free.nowline.io/open`.

## What is NOT in m4.8 (deferred)

- `.mcpb` Claude Desktop bundle and `pack-mcp-mcpb` in `release.yml`.
- Public MCP registry / Cursor / VS Code gallery / Gemini CLI channel submissions.
- Any new release secrets or PATs.

`@nowline/mcp` already publishes to npm via the existing `make publish-npm` loop (no new pipeline work required for the OSS distribution).

## Known sharp edges

- `UI_BUNDLE` is a placeholder stub if `bundle-ui.mjs` is skipped (CI runs `prebuild` so it's always regenerated on a clean build). The bundle size depends on the `@nowline/browser` + `@nowline/preview-shell` output; monitor for regressions.
- The MCP Apps UI capability (`io.modelcontextprotocol/ui`) is probed under `experimental` because SDK 1.29 does not yet model SEP-1724 extensions as a first-class field. Update when the SDK stabilizes.
- The `StreamableHTTPServerTransport` is localhost-only and lacks session management beyond what the SDK provides. Review when multi-client HTTP use cases arise.
