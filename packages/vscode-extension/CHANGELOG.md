# Changelog

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
- In-toolbar Maximize button (runs
  `workbench.action.maximizeEditorHideSidebar`).
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
