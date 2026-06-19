# Changelog

## [Unreleased]

## [0.8.3] - 2026-06-19

## [0.8.2] - 2026-06-18

## [0.8.1] - 2026-06-17

## [0.8.0] - 2026-06-17

### Added

- `nowline.export.width` setting: an optional canvas-width cap (px) for exports.
  Defaults to `0` (the layout's 1280 default, matching the `nowline` CLI). This
  is deliberately independent of `nowline.preview.width` — preview width is an
  ergonomic, pan/zoom-softened choice, whereas export width is a fidelity knob.
  For PNG resolution/DPI use `nowline.export.png.scale` instead.

### Changed

- All VS Code exports (toolbar save, file menu, code-editor command) now match
  what the preview is showing for theme, now-line, locale, and link visibility.
  Toolbar overrides (theme, pinned/hidden now-line, link toggle) and the
  `nowline.preview.*` settings flow into every export surface; when no preview
  is open the settings are resolved directly so exports stay consistent.
  Previously the now-line defaulted to today, the locale to `en-US`, and links
  were always shown regardless of the preview.
- Preview now renders with the same bundled DejaVu fonts as PNG/PDF export.
  `@font-face` rules are injected into the webview (fonts served from
  `dist/fonts/` via `asWebviewUri`) and the SVG is rendered with the pinned
  DejaVu family names — preview and raster export are now WYSIWYG.
- "Save SVG" from the preview re-exports through the kernel so the saved SVG
  uses the portable `system-ui` font stack, not the webview's pinned families.
- `.vsix` size increases by ~1.1 MB (two bundled TTFs: DejaVu Sans +
  DejaVu Sans Mono) to support font-injected preview.
- `Nowline: Export…` now runs entirely in-process — no `nowline` CLI install
  required for any format (PDF, PNG, SVG, HTML, Mermaid, XLSX, MS Project XML,
  JSON). PNG is rasterized via `@resvg/resvg-wasm` (WASM build of resvg;
  visually identical to the CLI, sub-pixel anti-aliasing can differ ≤ 2%).
- `nowline.export.cliPath` is now an optional override: when set to a
  non-default value the command shells out to that binary; the default
  `'nowline'` sentinel triggers the new in-process path.
- `.vsix` size is approximately 2.5 MB compressed (up from ~0.4 MB; the
  increase comes from bundled exporter packages and the resvg WASM binary).

### Fixed

- PDF export crashed with `ENOENT … dist/data/Helvetica.afm`. PDFKit reads its
  standard-14 Adobe Font Metrics and sRGB ICC profile from `__dirname/data/`
  via `fs.readFileSync`; esbuild rewrites that path to the bundle dir, so the
  files must ship in `dist/data/`. The bundle step now copies pdfkit's `data/`
  alongside the resvg WASM and DejaVu fonts.
- Preview showed no now-line by default. The default (`now: 'auto'`) resolved
  to `undefined`, which the browser pipeline treats as "no anchor" so the
  layout omitted the now-line — even though the rasterized export drew it. The
  now-line anchor is now resolved once (shared by the live render and export)
  and the default is today's UTC date, so the preview shows the now-line out of
  the box and matches the export. The toolbar "Today" toggle now works too.
- Preview text was rendered with `system-ui` (the browser/webview default)
  while PNG/PDF export used the bundled DejaVu pair. The preview now uses
  DejaVu, matching what the exported image looks like.

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
- Preview toolbar polish: separate **Fit width** (`↔`) and **Fit page**
  (`⤢`) buttons; a **collapse** control (`«`) that shrinks the toolbar to
  a translucent puck with a `»` restore; the toolbar defaults to the
  upper-right and shifts left (rather than squishing) when the panel
  narrows; the Now calendar and all dropdowns stay within the panel
  gutters instead of running off-screen; an Export download glyph; and a
  centred Copy / Export action row.
- Preview minimap: the `×` session-dismiss control is removed; the minimap
  still auto-hides when the diagram fits and still follows
  `nowline.preview.showMinimap`.
- **Expand / collapse preview** button in the tab title bar: `⛶` fills
  the editor area with the preview (maximizes the editor group); `⊡`
  restores the previous layout. Mirrors the fullscreen toggle on the free
  web app. Commands: `nowline.preview.expand` / `nowline.preview.collapse`.
- `nowline.preview.theme` now offers `grayscale` alongside `auto` / `light` /
  `dark`, and the toolbar *Theme ▾* `Grayscale` selection now actually renders
  the grayscale palette (previously it silently fell back to light/dark). The
  UK spelling `greyscale` is accepted as an alias. The chrome/workbench Mode is
  unaffected — it stays light/dark.
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
