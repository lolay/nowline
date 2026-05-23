# Nowline — Language Server Protocol

This file specifies the wire-protocol contract for the Nowline language server. It complements [`ide.md`](./ide.md) (which covers the editor surface — VS Code commands, settings, preview wiring) by pinning the LSP message shapes that any client — VS Code, Cursor, Neovim (m4.5), Obsidian (m4.5), JetBrains (m4.5), or browser clients via `@nowline/lsp-worker` (m4.7) — is expected to speak.

## Servers

Two packaging targets, one set of Langium services underneath:

| Package | Milestone | Runtime | Consumer |
|---|---|---|---|
| `@nowline/lsp` | m3a | Node.js, stdio or IPC | VS Code extension (`vscode-languageclient`), CLI integrations, future JetBrains plugin |
| `@nowline/lsp-worker` | m4.7 | Web Worker, `postMessage` | Browser-hosted IDE surfaces. Wraps the same `createNowlineServices()` factory from `@nowline/core` plus a `MessageReader` / `MessageWriter` pair over `postMessage` |

Both packages export the same diagnostic, completion, hover, definition, and reference behaviour. Only the transport differs.

## Capability surface

The Langium-generated server advertises (via `initialize`'s `ServerCapabilities`):

- `textDocumentSync.change = TextDocumentSyncKind.Incremental` (range deltas — see § Document sync)
- `diagnosticProvider` — `textDocument/publishDiagnostics` push notifications
- `completionProvider` — IDs and status values; `triggerCharacters: [':', ' ']`
- `hoverProvider`
- `definitionProvider`
- `referencesProvider`
- `renameProvider`
- `documentSymbolProvider`
- `foldingRangeProvider`

The `@nowline/lsp-worker` package advertises an identical shape — there is no "browser-only" subset. A browser client gets the same LSP surface VS Code does.

## Document sync

The `textDocument/didChange` notification accepts **LSP-spec range deltas** (`TextDocumentContentChangeEvent` with `range` + `text`), not whole-document replacement.

```ts
interface TextDocumentContentChangeEvent {
  range: Range;       // Required
  text: string;       // Replacement text for `range`
}
```

Whole-document `{ text: '...' }` (where `range` is omitted) is not a supported wire shape. Clients that send whole-document replacements will be rejected with an LSP error. This is **standard LSP discipline**, not a Nowline-specific restriction:

- VS Code's `vscode-languageclient` already emits range deltas by default. The package consumers in tree (`@nowline/vscode-extension`) need no client-side change.
- Range deltas are what the LSP spec calls out as the canonical `textDocument/didChange` shape when `textDocumentSync.change === Incremental`.
- For large `.nowline` documents, a whole-document send re-allocates and re-parses everything on every keystroke. Range deltas let the server (and any incremental parser layered on top) work in O(edit size) instead of O(document size).
- Pinning the protocol prevents future regressions where a new client implementation (or a future browser surface) silently downgrades to whole-document and quadruples the parse cost.

Any incidental benefit to a future CRDT layer is a side effect, not the reason this is pinned.

## Notifications and requests

The standard LSP set Langium implements is sufficient. Concretely:

| Direction | Method | Purpose |
|---|---|---|
| C → S | `initialize`, `initialized`, `shutdown`, `exit` | Lifecycle |
| C → S | `textDocument/didOpen`, `didChange`, `didSave`, `didClose` | Document sync (incremental — see above) |
| C → S | `textDocument/completion` | IDs + status values |
| C → S | `textDocument/hover` | Symbol documentation |
| C → S | `textDocument/definition` | Jump to declaration |
| C → S | `textDocument/references` | Reverse lookup |
| C → S | `textDocument/rename` | Cross-file rename |
| C → S | `textDocument/documentSymbol` | Outline view |
| C → S | `textDocument/foldingRange` | Code folding |
| S → C | `textDocument/publishDiagnostics` | Push validator results |
| S → C | `window/logMessage` | Trace + diagnostics |

The full message set is the standard LSP 3.17 surface; this table is the subset Nowline relies on.

## File scheme

Both servers accept `file://` URIs (Node) and arbitrary opaque scheme URIs (browser, e.g. `inmemory://...` or `cdoc://...`). Browser clients that don't have a file system pass synthetic URIs and an in-memory text buffer; the server doesn't read from disk in that mode.

The Node server's include resolver (used by `@nowline/core`'s `resolveIncludes()`) only activates when the host URI is `file://`. Browser clients warn-once and skip `include` directives, matching the embed bundle's m4 single-file mode.

## Versioning

The wire protocol is the LSP 3.17 standard. Nowline does not extend it with custom messages today; if we ever add `nowline/*` extension messages, those will be additive and feature-flagged via `initializeParams.initializationOptions`.

## Cross-references

- [`ide.md`](./ide.md) — Editor-surface spec (VS Code commands, settings, preview wiring).
- [`milestones.md`](./milestones.md) § m3a — Language server first-light deliverables.
- [`milestones.md`](./milestones.md) § m4.7 — Browser packaging via `@nowline/lsp-worker`.
- [`architecture.md`](./architecture.md) § Surfaces — Where `@nowline/lsp` and `@nowline/lsp-worker` sit in the package graph.
