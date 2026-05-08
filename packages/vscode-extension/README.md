# Nowline for VS Code

[Nowline](https://github.com/lolay/nowline) is a small, text-first DSL for **roadmaps and timelines**. This extension adds first-class authoring support to VS Code (and Cursor) for `.nowline` files:

- **Syntax highlighting** via TextMate grammar
- **Language server** with go-to-definition, find-references, rename, hover, completion, and document outline
- **Live preview** of the rendered SVG, side-by-side or in the same tab
- **Snippets** for common patterns (swimlane, item, parallel, group, milestone, anchor, footnote)
- **File icon** for `.nowline` documents
- **Export…** to PDF, PNG, SVG, HTML, Mermaid, XLSX, or MS Project XML by shelling out to the bundled `nowline` CLI
- **New Roadmap…** scaffolds a `.nowline` file from the same templates the CLI's `--init` writes
- **`.nowlinerc` baseline** — the preview honors a project-local `.nowlinerc` discovered up the directory tree; VS Code settings take precedence

For pixel-strict PNG / PDF / XLSX output you still need the `nowline` CLI installed; the in-webview *Save / Copy PNG* buttons use the browser canvas (~95% font fidelity). The Export… command bridges the gap without bundling native dependencies into the `.vsix`.

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

### View toolbar overrides (per-panel, not persisted)

The preview's *View ▾* dropdown adds three per-session toggles that override the resolved settings without writing them back:

- **Theme** — `Auto` / `Light` / `Dark` (overrides `nowline.preview.theme` for screenshots).
- **Now-line** — `Today` / `Hide` (mirrors `--now` / `--now -`).
- **Show links** — toggles the link icon tile (mirrors `--no-links`).

Locale, strict, width, and asset-root stay settings-only — they aren't things you flip while skimming a roadmap.

## Export…

`Nowline: Export…` (palette, editor title bar, editor right-click, tab right-click, Explorer right-click) shells out to the bundled `nowline` CLI to produce PDF, pixel-strict PNG, SVG, HTML, Markdown+Mermaid, XLSX, or MS Project XML. The flow:

1. Pick the format from a quickPick.
2. Choose a destination via the standard save dialog.
3. The extension spawns `nowline <source> -f <fmt> -o <path>` with the format-specific flags from `nowline.export.*` settings, streaming stderr to the *Nowline Export* output channel.

If the `nowline` binary isn't on `PATH`, set `nowline.export.cliPath` (supports `${workspaceFolder}` substitution).

## New Roadmap…

`Nowline: New Roadmap…` prompts for a name, target folder, and template (`minimal`, `teams`, or `product`), then asks the CLI to write the same starter file that `nowline --init` produces.

## Configuration & precedence

Render-affecting and export-affecting options are resolved through one chain (highest wins):

1. **Toolbar / session override** (active preview only).
2. **VS Code settings** (`nowline.preview.*`, `nowline.export.*`, `nowline.ignoreRcFile`).
3. **`.nowlinerc`** — discovered by walking up from the source file. Skip with `nowline.ignoreRcFile: true`.
4. **DSL directive** in the source file (e.g. `nowline v1 locale:fr-CA`).
5. **Built-in defaults** — match the CLI defaults.

The preview byte-matches `nowline render` for the same source under the same chain.

### Locale

Locale uses two chains, mirroring the CLI:

- **Operator chain** (validator-table messages): `nowline.preview.locale` > `.nowlinerc` `locale` > `vscode.env.language` > `en-US`.
- **Content chain** (rendered axis labels, now-pill, footnote sort): the file's `nowline v1 locale:` directive wins outright.

`vscode.env.language` plays the role the CLI's `LC_*` / `LANG` env vars play. Leaving `nowline.preview.locale` empty makes a French-installed Cursor render French previews and French diagnostics with no configuration; setting it to `en-US` overrides that.

## Settings

### Preview

| Setting | Default | CLI flag | Description |
| --- | --- | --- | --- |
| `nowline.trace.server` | `off` | — | Trace LSP traffic (`off` / `messages` / `verbose`) — useful when filing issues. |
| `nowline.ignoreRcFile` | `false` | — | Skip the `.nowlinerc` baseline lookup entirely. |
| `nowline.preview.refreshOn` | `keystroke` | — | When to re-render. `keystroke` = render on every change (debounced); `save` = render only on `Cmd/Ctrl+S`. |
| `nowline.preview.debounceMs` | `200` | — | Debounce window for keystroke renders, in milliseconds. |
| `nowline.preview.theme` | `auto` | `--theme` | Render theme: `auto` follows the active VS Code color theme; force `light` or `dark` to override. |
| `nowline.preview.defaultFit` | `fitPage` | — | Initial fit mode: `fitPage`, `fitWidth`, or `actual` (1:1). |
| `nowline.preview.showMinimap` | `true` | — | Show the bottom-right minimap with a viewport indicator. |
| `nowline.preview.locale` | `""` | `--locale` | BCP-47 locale; empty falls through to `.nowlinerc` → `vscode.env.language` → `en-US`. |
| `nowline.preview.now` | `auto` | `--now` | `auto` (today) / `none` (hide) / `YYYY-MM-DD` (snapshot). |
| `nowline.preview.strict` | `false` | `--strict` | Promote asset / sanitizer warnings to errors in the diagnostic table. |
| `nowline.preview.showLinks` | `true` | inverse of `--no-links` | Show link icons inside item bars. |
| `nowline.preview.width` | `0` | `--width` | Canvas width in px. `0` leaves it unset (preview has zoom anyway). |
| `nowline.preview.assetRoot` | `""` | `--asset-root` | Asset-resolver root. Empty uses the source file's directory. |

### Export

| Setting | Default | CLI flag | Description |
| --- | --- | --- | --- |
| `nowline.export.cliPath` | `nowline` | — | Path to the `nowline` binary. `${workspaceFolder}` substitution supported. |
| `nowline.export.pdf.pageSize` | `letter` | `--page-size` | Preset (`letter`, `a4`, `tabloid`, …), `content`, or `WxHunit`. |
| `nowline.export.pdf.orientation` | `auto` | `--orientation` | `auto` / `portrait` / `landscape`. |
| `nowline.export.pdf.margin` | `36pt` | `--margin` | PDF page margin (e.g. `36pt`, `0.5in`, `12mm`). |
| `nowline.export.fonts.sans` | `""` | `--font-sans` | Sans font for PDF/PNG (path or alias). |
| `nowline.export.fonts.mono` | `""` | `--font-mono` | Mono font for PDF/PNG. |
| `nowline.export.fonts.headless` | `false` | `--headless` | Force the bundled DejaVu fonts for byte-stable output. |
| `nowline.export.png.scale` | `1` | `--scale` | Raster scale factor for PNG export. |
| `nowline.export.msproj.start` | `""` | `--start` | MS Project export anchor date for relative roadmaps. |

## Bundled packages

The extension is fully self-contained for live preview and authoring. The `.vsix` ships:

- `@nowline/lsp` — the language server
- `@nowline/core` — grammar, parser, validator
- `@nowline/layout` — layout engine (used by the live preview)
- `@nowline/renderer` — SVG renderer (used by the live preview)
- `@nowline/config` — `.nowlinerc` reader (shared with the CLI)

No external Node runtime, native modules, or fonts are required for the preview. PDF / pixel-strict PNG / XLSX export rely on native bindings; the **Export…** command shells out to the `nowline` CLI for those formats so the extension stays small.

## Reporting issues

File bugs and feature requests at [github.com/lolay/nowline/issues](https://github.com/lolay/nowline/issues).
