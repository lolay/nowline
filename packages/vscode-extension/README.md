# Nowline for VS Code

[Nowline](https://github.com/lolay/nowline) is a small, text-first DSL for **roadmaps and timelines**. This extension adds first-class authoring support to VS Code (and Cursor) for `.nowline` files:

- **Syntax highlighting** via TextMate grammar
- **Language server** with go-to-definition, find-references, rename, hover, completion, and document outline
- **Snippets** for common patterns (swimlane, item, parallel, group, milestone, anchor, footnote)
- **File icon** for `.nowline` documents

> Live preview (open a roadmap as SVG side-by-side) lands in the next release (`m3c`). PNG/PDF render commands are deferred to a follow-up — install [`@nowline/cli`](https://github.com/lolay/nowline) for raster export until then.

## Quick start

1. Install the extension from the marketplace (or `code --install-extension dist/nowline-vscode.vsix` for a local build).
2. Open any `.nowline` file. The language server starts automatically.
3. Try `Ctrl/Cmd + Click` on an ID inside `after:`, `before:`, `requires:`, `owner:`, `team:`, `on:`, or `at:` to jump to its declaration.
4. Press `Ctrl/Cmd + Space` after `status:` to see built-in and custom status options.
5. Right-click an ID and choose **Rename Symbol** to rename a declaration and every reference at once.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `nowline.trace.server` | `off` | Trace LSP traffic (`off` / `messages` / `verbose`) — useful when filing issues. |

## Bundled packages

The extension is fully self-contained. The `.vsix` ships:

- `@nowline/lsp` — the language server
- `@nowline/core` — grammar, parser, validator
- `@nowline/layout` — layout engine (used by the upcoming preview)
- `@nowline/renderer` — SVG renderer (used by the upcoming preview)

No external Node runtime, native modules, or fonts are required. PDF and PNG rendering depend on native bindings and ship in [`@nowline/cli`](https://github.com/lolay/nowline) instead.

## Reporting issues

File bugs and feature requests at [github.com/lolay/nowline/issues](https://github.com/lolay/nowline/issues).
