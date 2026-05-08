# Changelog

## 0.3.0 — Unreleased

Preview parity, export from VS Code, and authoring commands (m3d / m3e / m3f):

- Preview now honors a project-local `.nowlinerc` (read via the new
  `@nowline/config` package, watched via a workspace `FileSystemWatcher`).
  Disable with `nowline.ignoreRcFile: true`.
- Six new preview-affecting settings: `nowline.preview.locale`, `now`,
  `strict`, `showLinks`, `width`, and `assetRoot`. Mirror their CLI
  counterparts and resolve through a single chain
  (toolbar → settings → `.nowlinerc` → DSL directive → defaults).
- Locale auto-detects from `vscode.env.language` when
  `nowline.preview.locale` is empty, so a French-installed Cursor renders
  French previews and French diagnostics with no configuration.
- Preview toolbar adds a *View ▾* dropdown with per-session overrides for
  theme, now-line, and link visibility (not persisted to settings).
- **Nowline: Export…** command (palette, editor title bar, editor /
  tab / Explorer context menus) shells out to the `nowline` CLI to produce
  PDF, pixel-strict PNG, SVG, HTML, Markdown+Mermaid, XLSX, or MS Project
  XML. Configurable via `nowline.export.*` settings; CLI path defaults to
  the bare `nowline` command on `PATH`.
- **Nowline: New Roadmap…** scaffolds a `.nowline` file from the same
  templates the CLI's `--init` writes (`minimal`, `teams`, `product`).
- One-time info notification when a `.nowlinerc` value is shadowed by an
  explicit VS Code setting (suppressed when `nowline.ignoreRcFile` is `true`).

## 0.2.0 — Unreleased

Live preview (m3c):

- **Open Preview** (`Cmd/Ctrl+Shift+V`) and **Open Preview to the Side**
  (`Cmd/Ctrl+K V`) commands. Mirrors VS Code's markdown preview UX.
- Editor title-bar button, editor body / tab right-click menus, and Explorer
  right-click menu all expose both commands.
- Host-side render pipeline (`parseSource` → `resolveIncludes` →
  `layoutRoadmap` → `renderSvg`) with the same asset-resolver behavior the CLI
  uses; the webview only displays the SVG. Updates on keystroke (debounced) or
  save, and re-renders on theme change.
- Diagnostics surface as a clickable table inside the panel (severity,
  location, code, message, optional "did you mean" suggestion) with a link
  to the Problems panel; rows jump to the offending line.
- Viewport: toolbar zoom, `Cmd/Ctrl + wheel` and trackpad pinch zoom,
  spacebar-drag pan, and Figma-style keyboard presets (`1`/`2`/`3`/`0`).
  Default fit is configurable.
- Minimap (bottom-right) with a viewport indicator, click-to-recenter, and
  drag-to-pan; auto-hides when the diagram fully fits.
- Save and Copy dropdowns: SVG goes through the SVG already in the webview;
  PNG is rasterized via the webview's `<canvas>` (~95% fidelity to
  `nowline --format png` — see README for the strict-PNG workflow).
- New settings: `nowline.preview.refreshOn`, `nowline.preview.debounceMs`,
  `nowline.preview.theme`, `nowline.preview.defaultFit`,
  `nowline.preview.showMinimap`.
- The `.vsix` grows from ~800 KB to ~2 MB because layout + renderer now ship
  alongside the language server. Marketplace headroom is 100 MB.

## 0.1.0 — Unreleased

Initial scaffold (m3b):

- TextMate grammar, language configuration, and snippets for `.nowline`.
- Bundled Nowline language server (`@nowline/lsp`):
  - Validation diagnostics
  - Go-to-definition, find-references, rename
  - Hover, document symbols, completion (IDs and status values)
- File icon for `.nowline` documents.
- LSP trace setting (`nowline.trace.server`).
