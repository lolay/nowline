# Nowline for VS Code

[Nowline](https://github.com/lolay/nowline) is a small, text-first DSL for **roadmaps and timelines**. This extension adds first-class authoring support to VS Code (and Cursor) for `.nowline` files:

- **Syntax highlighting** via TextMate grammar
- **Language server** with go-to-definition, find-references, rename, hover, completion, and document outline
- **Live preview** of the rendered SVG, side-by-side or in the same tab
- **Snippets** for common patterns (swimlane, item, parallel, group, milestone, anchor, footnote)
- **File icon** for `.nowline` documents

PDF rendering and pixel-strict PNG export still live in [`@nowline/cli`](https://github.com/lolay/nowline) — see the PNG fidelity note below.

## Quick start

1. Install the extension from the marketplace (or `code --install-extension dist/nowline-vscode.vsix` for a local build).
2. Open any `.nowline` file. The language server starts automatically.
3. Open the preview (any of the four entry points listed below).
4. Try `Ctrl/Cmd + Click` on an ID inside `after:`, `before:`, `requires:`, `owner:`, `team:`, `on:`, or `at:` to jump to its declaration.
5. Press `Ctrl/Cmd + Space` after `status:` to see built-in and custom status options.
6. Right-click an ID and choose **Rename Symbol** to rename a declaration and every reference at once.

## Live preview

Four ways to open it on a `.nowline` file:

- **Editor title bar** — the preview icon (top-right of the editor) opens a preview to the side.
- **Editor right-click** — *Open Preview* / *Open Preview to the Side*.
- **Editor tab right-click** — same two entries; lets you open the preview without giving the editor focus.
- **Explorer right-click** — same two entries; opens both the source and a side preview from the file tree.

Keybindings (mirroring VS Code's markdown preview):

| Action | Mac | Windows / Linux |
| --- | --- | --- |
| Open preview (same tab) | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| Open preview to the side | `Cmd+K V` | `Ctrl+K V` |

### Zoom & pan

- **Toolbar** (top-right of the preview) — zoom −/+, zoom %, *Fit Width* (`↔`), *Fit Page* (`⛶`), *Save ▾*, *Copy ▾*. Fades after 2 s of inactivity; reappears on mouse move.
- **`Cmd/Ctrl + scroll wheel`** zooms centered on the cursor. Trackpad pinch fires the same path on macOS.
- **Spacebar + drag** pans (useful for trackpad-only setups).
- **Keyboard presets** (when the preview has focus): `1` Fit Page, `2` 100%, `3` Fit Width, `0` Fit Page (alias). Matches Figma.
- The current zoom and scroll position survive a re-render so live editing doesn't snap back to the top-left.

### Save & Copy

- **Save SVG…** writes the SVG already in the webview — no re-render. Defaults to `<sourceBasename>.svg` next to the source file.
- **Save PNG…** rasterizes the SVG via the webview's `<canvas>` at devicePixelRatio scale, then writes the PNG.
- **Copy SVG** copies the SVG markup to the clipboard (text).
- **Copy PNG** writes a PNG to the clipboard via `ClipboardItem`. If the clipboard API rejects PNGs in your environment, the extension writes the bytes to a temporary file and surfaces a notification with a *Reveal* action.

> **PNG fidelity caveat.** The preview's PNG export goes through Chromium's
> canvas rasterizer rather than `@resvg/resvg-js`, so fonts and embedded raster
> icons can differ slightly from `nowline --format png`. Acceptable for
> WYSIWYG editor use; for pixel-strict output run the CLI.

### Minimap

The minimap (bottom-right corner) clones the rendered SVG at small scale and tracks the main viewport with a draggable rectangle. Click anywhere in the minimap to recenter the main view, or drag the viewport rect to pan continuously. The minimap **auto-hides** when the entire diagram fits inside the panel — there's no signal value when nothing is off-screen — and the `×` corner button dismisses it for the rest of the session. The default visibility comes from `nowline.preview.showMinimap`.

### Maximize / fullscreen

Use the built-in VS Code shortcuts when you want more space:

- **Maximize the preview pane** — `Cmd+K Cmd+M` (`workbench.action.maximizeEditorHideSidebar`).
- **Zen Mode** — `Cmd+K Z`.
- **OS-level fullscreen** — `Ctrl+Cmd+F` (macOS) or `F11` (Windows / Linux).

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `nowline.trace.server` | `off` | Trace LSP traffic (`off` / `messages` / `verbose`) — useful when filing issues. |
| `nowline.preview.refreshOn` | `keystroke` | When to re-render. `keystroke` = render on every change (debounced); `save` = render only on `Cmd/Ctrl+S`. |
| `nowline.preview.debounceMs` | `200` | Debounce window for keystroke renders, in milliseconds. |
| `nowline.preview.theme` | `auto` | Render theme: `auto` follows the active VS Code color theme; force `light` or `dark` to override. |
| `nowline.preview.defaultFit` | `fitPage` | Initial fit mode: `fitPage`, `fitWidth`, or `actual` (1:1). |
| `nowline.preview.showMinimap` | `true` | Show the bottom-right minimap with a viewport indicator. |

## Bundled packages

The extension is fully self-contained. The `.vsix` ships:

- `@nowline/lsp` — the language server
- `@nowline/core` — grammar, parser, validator
- `@nowline/layout` — layout engine (used by the live preview)
- `@nowline/renderer` — SVG renderer (used by the live preview)

No external Node runtime, native modules, or fonts are required. PDF and pixel-strict PNG rendering depend on native bindings and ship in [`@nowline/cli`](https://github.com/lolay/nowline) instead.

## Reporting issues

File bugs and feature requests at [github.com/lolay/nowline/issues](https://github.com/lolay/nowline/issues).
