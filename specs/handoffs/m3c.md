# m3c handoff — Live preview

> **Status: completed.** Recorded here so the m3a → m3b → m3c chain reflects
> what shipped.
>
> Canonical entry: [`specs/milestones.md`](../milestones.md) § m3c.
> Spec context: [`specs/ide.md`](../ide.md) § Live Preview.

## Why this milestone exists

m3a shipped the Langium LSP server (`@nowline/lsp`); m3b shipped the
VS Code / Cursor extension scaffold (TextMate grammar, language config,
snippets, file icon, LSP client). The preview panel — the headline feature
of the IDE work — was deferred from m3b so it could be designed end-to-end
once. m3c lands that preview.

## Architectural decision: render in the extension host

The earlier draft of `specs/ide.md` called for parsing and rendering inside
the webview itself, mirroring the embed (m4). m3c **inverts that decision**:
the preview runs the CLI's full pipeline (`parseSource` → `resolveIncludes` →
`layoutRoadmap` → `renderSvg`) on the extension host and posts the rendered
SVG into a "dumb" webview that owns viewport chrome, the diagnostic table,
save / copy, and the minimap.

Why:

- **Asset & include resolution stay simple.** `resolveIncludes` and the asset
  resolver both want `readFile` callbacks; the host has Node `fs`, the
  webview doesn't. Round-tripping every `include:` and every embedded raster
  icon across `postMessage` would have doubled the rendering codepath.
- **One bundle, one parse pipeline.** The extension already bundles the LSP
  server (~1.3 MB). Adding `@nowline/layout` + `@nowline/renderer` pushes the
  `.vsix` from ~800 KB to ~2 MB total, well under the marketplace's 100 MB
  ceiling. We avoid shipping a separate webview bundle.
- **Same code as the CLI.** The render pipeline in
  [`packages/vscode-extension/src/preview/render-pipeline.ts`](../../packages/vscode-extension/src/preview/render-pipeline.ts)
  is the same shape as the CLI's `serve` command — bug fixes flow to both.

The future embed (m4) still owns the client-side bundle for browser
environments without an extension host.

## What landed

### Open commands and entry points

- `nowline.openPreview` (`Cmd/Ctrl+Shift+V`) — same tab.
- `nowline.openPreviewToSide` (`Cmd/Ctrl+K V`) — beside.
- Editor title-bar button (preview icon, `editor/title` menu).
- Editor body right-click (`editor/context`).
- Editor tab right-click (`editor/title/context`).
- Explorer right-click (`explorer/context`).

The manager keeps one preview per source URI; re-opening reveals the
existing panel. Opening from the Explorer first ensures the source document
is loaded so the panel sees unsaved edits.

### Render pipeline

[`render-pipeline.ts`](../../packages/vscode-extension/src/preview/render-pipeline.ts)
caches a single `createNowlineServices()` container, mints a fresh URI per
parse (Langium mutates documents that share URIs), runs validation, then
calls `resolveIncludes`, `layoutRoadmap`, and `renderSvg`. The asset
resolver is the same 12-line pattern from
[`packages/cli/src/commands/render.ts`](../../packages/cli/src/commands/render.ts)
— rooted at `path.dirname(sourceFsPath)`, refuses paths that escape it.

The result is either `{ kind: 'svg', svg }` or `{ kind: 'diagnostics', rows }`
where each row is the
[`DiagnosticRow`](../../packages/vscode-extension/src/preview/diagnostic-row.ts)
shape — the JSON-friendly diagnostic the webview consumes.

### Webview shell

[`shell-html.ts`](../../packages/vscode-extension/src/preview/shell-html.ts)
returns a single HTML string with a per-call CSP nonce. Highlights:

- **Toolbar**: `−` / zoom % / `+`, *Fit Width* / *Fit Page*, *Save ▾* /
  *Copy ▾* dropdowns, *Maximize*. Fades after 2 s of inactivity, returns on
  mouse move.
- **Zoom & pan**: `Cmd/Ctrl + scroll wheel` zoom centered on the cursor
  (trackpad pinch fires the same path on macOS via `ctrlKey: true`),
  spacebar-drag pan, Figma keyboard presets `1`/`2`/`3`/`0`. Default fit
  comes from `nowline.preview.defaultFit`.
- **Minimap**: bottom-right overlay, ~160×120 max, viewport rectangle that
  tracks `scrollLeft`/`scrollTop`/`scale`, click-to-recenter, drag-to-pan,
  auto-hides when the diagram fits, `×` corner button dismisses for the
  session.
- **Diagnostics table**: severity icon (`!` / `⚠`), `Ln/Col` location, code
  pill, message + optional "did you mean" suggestion. Row click posts
  `{type:'goto'}`; the header link posts `{type:'openProblems'}`.
- **Save / Copy**: SVG passes through the SVG already in the webview's DOM.
  PNG rasterizes through a `<canvas>` at `devicePixelRatio` scale; if
  `ClipboardItem` rejects PNG, the host writes a temp file and surfaces a
  "Reveal in Finder" notification.
- **Maximize**: posts `{type:'toggleMaximize'}`; the host runs
  `workbench.action.maximizeEditorHideSidebar` (same toggle as
  `Cmd+K Cmd+M`).

### Lifecycle wiring

[`extension.ts`](../../packages/vscode-extension/src/extension.ts) subscribes
to:

- `onDidChangeTextDocument` → debounced `refreshDebounced()` on matching
  panels.
- `onDidSaveTextDocument` → immediate `refreshNow()` on matching panels.
- `onDidChangeActiveColorTheme` → push new settings with
  `themeChanged: true`, which forces every panel to re-render.
- `onDidChangeConfiguration` (filtered to `nowline.preview`) → push new
  settings without forcing a re-render unless theme effectively changed.

The webview message dispatcher lives in `extension.ts` so command execution
(`vscode.commands.executeCommand`, `showSaveDialog`, `revealFileInOS`) sits
in one place. The panel just transports messages.

### Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `nowline.preview.refreshOn` | `keystroke` | `keystroke` (debounced) or `save` |
| `nowline.preview.debounceMs` | `200` | Debounce window for keystroke renders |
| `nowline.preview.theme` | `auto` | Forces `light` / `dark`, or follows VS Code |
| `nowline.preview.defaultFit` | `fitPage` | `fitPage` / `fitWidth` / `actual` on first paint |
| `nowline.preview.showMinimap` | `true` | Default minimap visibility |

### Bundle impact

`@nowline/layout` + `@nowline/renderer` join the existing LSP server inside
the `.vsix`. Bundle size moves from ~800 KB to ~2 MB. We accepted this in
exchange for skipping `@resvg/resvg-js` as a runtime dep (~3 MB) — PNG
rasterization happens in the webview's `<canvas>`. The trade-off is
documented in the README and CHANGELOG: pixel-strict PNG users should run
`nowline --format png` from the CLI.

### `langium` direct dependency

The render pipeline imports `URI` from `langium` to mint per-parse document
URIs. Langium was already in the bundle transitively via `@nowline/core` /
`@nowline/lsp`; m3c declares it as a direct dep so the type checker sees
the import.

## Trade-offs accepted (also documented in the plan)

- **Double parse on keystroke.** The LSP server parses for diagnostics and
  the extension host parses for preview. Practically <10 ms per parse on
  the existing samples; revisit if it becomes a bottleneck.
- **PNG via browser canvas, not resvg.** ~95% font / asset fidelity vs. the
  CLI; documented loudly in the README.
- **No cursor-sync.** Click-on-item-in-preview-jumps-to-source needs
  renderer-side `data-id` attributes. Deferred; same prerequisite enables
  preview-to-source jumps.
- **No "Render to PDF" command.** PDF stays in the CLI for now; the
  toolbar's *Save SVG* covers the SVG case.

## Verification

- `pnpm --filter @nowline/lsp test` — passes (no LSP changes; double-checks
  the bundled server still starts).
- `pnpm --filter vscode test` — runs the smoke harness that boots the
  bundled LSP server.
- `pnpm --filter vscode lint` — `tsc --noEmit` against the new
  `preview/*.ts` files.
- Manual: `pnpm --filter vscode package` builds the `.vsix`; install with
  `code --install-extension dist/nowline-vscode.vsix`; open
  `examples/minimal.nowline`; fire both preview commands and confirm
  same-tab vs side-by-side placement, live updates on keystroke + save,
  theme switch, error overlay on intentional syntax break, save / copy
  SVG and PNG, minimap drag, maximize button.

## Files

New:

- `packages/vscode-extension/src/preview/render-pipeline.ts`
- `packages/vscode-extension/src/preview/shell-html.ts`
- `packages/vscode-extension/src/preview/preview-panel.ts`
- `packages/vscode-extension/src/preview/preview-manager.ts`
- `packages/vscode-extension/src/preview/diagnostic-row.ts`
- `specs/handoffs/m3c.md` (this file)

Modified:

- `packages/vscode-extension/src/extension.ts` — preview commands, message
  dispatch, lifecycle subscriptions.
- `packages/vscode-extension/package.json` — commands, keybindings, four
  menu contributions, five `nowline.preview.*` settings, `langium` dep.
- `packages/vscode-extension/CHANGELOG.md` — 0.2.0 entry.
- `packages/vscode-extension/README.md` — feature description, settings
  table, PNG fidelity caveat.
- `specs/ide.md` — host-render rationale, file layout.
- `specs/milestones.md` — split m3 into m3a / m3b / m3c rows + chain.
