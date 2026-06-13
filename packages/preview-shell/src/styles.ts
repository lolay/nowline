// Stylesheet for `mountPreview()`. Uses neutral `--nl-preview-*` CSS
// custom properties throughout so consumers can re-skin the viewport
// without forking the package. Sensible defaults baked in so the
// viewport works out of the box on a blank page.
//
// Chrome (toolbar, menus, minimap) uses `--nl-chrome-*` tokens driven
// exclusively by the `data-nl-mode="light|dark"` attribute on the root
// element — these intentionally do NOT inherit VS Code workbench colors
// so the toolbar stays readable regardless of the active editor theme.
//
// VS Code consumers paste `VSCODE_THEME_BRIDGE_CSS` into their webview
// to map viewport/canvas `--nl-preview-*` tokens to `--vscode-*`
// variables. This bridge no longer touches chrome tokens.

/**
 * Bridge CSS for VS Code webview consumers. Maps viewport and
 * diagnostic `--nl-preview-*` tokens to `--vscode-*` variables.
 * Does NOT map chrome (toolbar/menu) tokens — those are driven by
 * `data-nl-mode` so the toolbar palette is independent of the
 * workbench color theme.
 *
 * Inject as a `<style>` block after the preview-shell stylesheet.
 */
export const VSCODE_THEME_BRIDGE_CSS = `
:root {
    --nl-preview-bg: var(--vscode-editor-background, #1e1e1e);
    --nl-preview-fg: var(--vscode-editor-foreground, #d4d4d4);
    --nl-preview-font-family: var(--vscode-font-family, system-ui, sans-serif);
    --nl-preview-font-size: var(--vscode-font-size, 13px);
    --nl-preview-widget-bg: var(--vscode-editorWidget-background, rgba(40,40,40,0.9));
    --nl-preview-widget-border: var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    --nl-preview-description: var(--vscode-descriptionForeground, #999);
    --nl-preview-error: var(--vscode-editorError-foreground, #f48771);
    --nl-preview-warning: var(--vscode-editorWarning-foreground, #cca700);
    --nl-preview-link: var(--vscode-textLink-foreground, #3794ff);
    --nl-preview-focus: var(--vscode-focusBorder, #007acc);
    --nl-preview-code-bg: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05));
    --nl-preview-mono: var(--vscode-editor-font-family, monospace);
}
`;

/**
 * Default stylesheet for the viewport. Provides reasonable defaults
 * for every `--nl-preview-*` token and both dark/light `--nl-chrome-*`
 * palettes so the viewport works on a blank page without any bridge CSS.
 */
export const PREVIEW_SHELL_CSS = `
:root {
    color-scheme: light dark;
    --nl-preview-bg: #1e1e1e;
    --nl-preview-fg: #d4d4d4;
    --nl-preview-font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --nl-preview-font-size: 13px;
    --nl-preview-widget-bg: rgba(40,40,40,0.9);
    --nl-preview-widget-border: rgba(255,255,255,0.1);
    --nl-preview-description: #999;
    --nl-preview-error: #f48771;
    --nl-preview-warning: #cca700;
    --nl-preview-link: #3794ff;
    --nl-preview-focus: #007acc;
    --nl-preview-code-bg: rgba(255,255,255,0.05);
    --nl-preview-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.nl-preview-root {
    position: relative;
    width: 100%; height: 100%;
    background: var(--nl-preview-bg);
    color: var(--nl-preview-fg);
    font-family: var(--nl-preview-font-family);
    font-size: var(--nl-preview-font-size);
    overflow: hidden;
    /* Shared positioning gutter for all floating elements */
    --nl-preview-gutter: 8px;
    /* Chrome palette — dark default */
    --nl-chrome-bg: rgba(30, 30, 30, 0.93);
    --nl-chrome-border: rgba(255, 255, 255, 0.11);
    --nl-chrome-fg: #d4d4d4;
    --nl-chrome-hover: rgba(255, 255, 255, 0.08);
    --nl-chrome-active: rgba(255, 255, 255, 0.13);
    --nl-chrome-muted: #888;
    --nl-chrome-chip-bg: rgba(255, 255, 255, 0.07);
    --nl-chrome-shadow: rgba(0, 0, 0, 0.32);
}
/* Chrome + viewport palette — light mode override (driven by data-nl-mode, never by workbench) */
.nl-preview-root[data-nl-mode="light"] {
    /* Viewport background: white matches the embed's default canvas. */
    --nl-preview-bg: #ffffff;
    --nl-preview-fg: #1e1e1e;
    --nl-chrome-bg: rgba(248, 248, 248, 0.96);
    --nl-chrome-border: rgba(0, 0, 0, 0.13);
    --nl-chrome-fg: #3c3c3c;
    --nl-chrome-hover: rgba(0, 0, 0, 0.06);
    --nl-chrome-active: rgba(0, 0, 0, 0.10);
    --nl-chrome-muted: #717171;
    --nl-chrome-chip-bg: rgba(0, 0, 0, 0.06);
    --nl-chrome-shadow: rgba(0, 0, 0, 0.14);
}
.nl-preview-root .viewport {
    position: absolute; inset: 0;
    overflow: auto;
    display: flex;
}
.nl-preview-root .canvas {
    /* flex-shrink:0 + margin:auto: centers the diagram when it fits,
       allows overflow scroll when it's larger than the viewport */
    flex-shrink: 0;
    margin: auto;
    transform-origin: 0 0;
    will-change: transform;
}
.nl-preview-root .canvas svg { display: block; max-width: none; height: auto; }
.nl-preview-root .canvas.dimmed { opacity: 0.25; pointer-events: none; }

/* === Toolbar (floating, repositionable) === */
.nl-preview-root .chrome {
    position: absolute;
    top: var(--nl-preview-gutter);
    right: var(--nl-preview-gutter);
    display: flex; gap: 4px;
    /* Keep the toolbar at its natural width so a narrowing viewport
       shifts it left (handled in JS) instead of squishing the row. */
    width: max-content;
    transition: opacity 200ms ease;
    z-index: 10;
}
.nl-preview-root .chrome.faded { opacity: 0.2; pointer-events: none; }
.nl-preview-root .chrome:hover { opacity: 1; pointer-events: auto; }
.nl-preview-root .toolbar {
    display: flex; align-items: center; gap: 2px;
    flex-wrap: nowrap;
    white-space: nowrap;
    padding: 2px;
    background: var(--nl-chrome-bg);
    border: 1px solid var(--nl-chrome-border);
    border-radius: 6px;
    box-shadow: 0 2px 8px var(--nl-chrome-shadow);
    color: var(--nl-chrome-fg);
    user-select: none;
}

/* Collapsed puck: hide everything but the drag grip + restore arrow,
   and dim it so it stays out of the way until hovered. */
.nl-preview-root .restore-btn { display: none; }
.nl-preview-root .chrome.collapsed .toolbar > :not(.toolbar-handle):not(.restore-btn) {
    display: none;
}
.nl-preview-root .chrome.collapsed .restore-btn { display: inline-flex; }
.nl-preview-root .chrome.collapsed .toolbar { opacity: 0.55; }
.nl-preview-root .chrome.collapsed:hover .toolbar { opacity: 1; }
.nl-preview-root .toolbar .sep {
    width: 1px; height: 18px;
    background: var(--nl-chrome-border);
    margin: 0 3px;
    flex-shrink: 0;
}
.nl-preview-root .toolbar-handle {
    display: flex; align-items: center; justify-content: center;
    padding: 4px 5px;
    cursor: grab;
    color: var(--nl-chrome-muted);
    font-size: 13px;
    line-height: 1;
    opacity: 0.7;
    flex-shrink: 0;
    touch-action: none;
}
.nl-preview-root .toolbar-handle:hover { opacity: 1; }
.nl-preview-root .chrome.dragging .toolbar-handle { cursor: grabbing; }
.nl-preview-root .btn {
    appearance: none;
    background: transparent;
    color: inherit;
    border: 0;
    padding: 3px 7px;
    border-radius: 4px;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    line-height: 1;
    min-width: 20px;
    flex-shrink: 0;
    /* Suppress the sticky focus ring left behind after a mouse click;
       keyboard focus is restored via :focus-visible below. */
    outline: none;
}
.nl-preview-root .btn:hover { background: var(--nl-chrome-hover); }
.nl-preview-root .btn:active { background: var(--nl-chrome-active); }
.nl-preview-root .btn:focus-visible {
    outline: 1px solid var(--nl-preview-focus);
    outline-offset: -1px;
}
.nl-preview-root .btn.zoom-label {
    min-width: 44px;
    font-variant-numeric: tabular-nums;
}
.nl-preview-root .btn.glyph { font-size: 15px; line-height: 1; padding: 3px 5px; }
.nl-preview-root .dropdown { position: relative; }

/* === More-menu panel === */
.nl-preview-root .more-menu {
    position: absolute; top: calc(100% + 4px); right: 0;
    padding: 5px;
    min-width: 210px;
    background: var(--nl-chrome-bg);
    border: 1px solid var(--nl-chrome-border);
    border-radius: 6px;
    box-shadow: 0 4px 14px var(--nl-chrome-shadow);
    z-index: 20;
    color: var(--nl-chrome-fg);
}
/* Opens right-aligned by default; flipped to left-aligned in JS when the
   toolbar sits near the left edge and the menu would clip the gutter. */
.nl-preview-root .more-menu.flip { right: auto; left: 0; }
.nl-preview-root .more-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 2px 4px;
    gap: 8px;
}
.nl-preview-root .more-row.action-row {
    gap: 6px;
    justify-content: stretch;
    padding-top: 6px;
    padding-bottom: 2px;
}
/* Copy / Export each take half the row and center their label+icon. */
.nl-preview-root .action-row .btn {
    flex: 1 1 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
}
.nl-preview-root .action-ico { display: inline-flex; line-height: 0; }
.nl-preview-root .action-ico svg { display: block; }
.nl-preview-root .more-label {
    font-size: 0.88em;
    color: var(--nl-chrome-muted);
    white-space: nowrap;
    flex-shrink: 0;
}
.nl-preview-root .more-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--nl-chrome-border);
}

/* === Sub-menus inside more-menu === */
.nl-preview-root .more-sub-toggle {
    font-size: 0.88em;
    padding: 3px 6px;
}
.nl-preview-root .more-sub-menu {
    position: absolute; top: calc(100% + 2px); left: 0;
    list-style: none; padding: 4px;
    /* Size to the widest option (plus the checkmark gutter) rather than
       a fixed min-width, so there's no dead whitespace to the right. */
    width: max-content; min-width: 0; max-width: 280px;
    background: var(--nl-chrome-bg);
    border: 1px solid var(--nl-chrome-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px var(--nl-chrome-shadow);
    z-index: 25;
    color: var(--nl-chrome-fg);
}
/* Flyout flipped to open toward the left (set in JS when the default
   right-ward opening would overflow the viewport gutter). */
.nl-preview-root .more-sub-menu.flip { left: auto; right: 0; }
.nl-preview-root .more-sub-menu li { padding: 0; }
.nl-preview-root .more-sub-menu .btn {
    display: block; width: 100%; text-align: left;
    /* Generous left gutter keeps the checkmark off the label text. */
    padding: 5px 12px 5px 26px;
    position: relative;
    font-size: 0.88em;
}
.nl-preview-root .more-sub-menu .btn[data-active="true"]::before {
    content: '\\2713';
    position: absolute;
    left: 9px;
}

/* === Code-style chip for real theme/format tokens === */
.nl-preview-root .code-chip {
    font-family: var(--nl-preview-mono);
    font-size: 0.9em;
    background: var(--nl-chrome-chip-bg);
    border-radius: 3px;
    padding: 1px 4px;
    font-style: normal;
}

/* === Diagnostic overlay menu (for old .menu usage in diagnostics) === */
.nl-preview-root .menu {
    position: absolute; top: 100%; right: 0; margin-top: 4px;
    list-style: none; padding: 4px; min-width: 140px;
    background: var(--nl-chrome-bg);
    border: 1px solid var(--nl-chrome-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px var(--nl-chrome-shadow);
    z-index: 20;
    color: var(--nl-chrome-fg);
}
.nl-preview-root .menu li { padding: 0; }
.nl-preview-root .menu .btn {
    display: block; width: 100%; text-align: left;
    padding: 6px 10px;
}
.nl-preview-root .menu li.menu-section {
    padding: 4px 10px 2px;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--nl-chrome-muted);
}
.nl-preview-root .menu li.menu-divider {
    height: 1px;
    margin: 4px 6px;
    background: var(--nl-chrome-border);
}

/* === Minimap (subordinate floating widget) === */
.nl-preview-root .minimap {
    position: absolute;
    bottom: var(--nl-preview-gutter);
    right: var(--nl-preview-gutter);
    width: 120px; max-height: 90px;
    background: var(--nl-chrome-bg);
    border: 1px solid var(--nl-chrome-border);
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 2px 6px var(--nl-chrome-shadow);
    z-index: 8;
    transition: opacity 200ms ease;
}
.nl-preview-root .minimap.hidden { display: none; }
.nl-preview-root .minimap.faded { opacity: 0.2; pointer-events: none; }
.nl-preview-root .minimap-canvas {
    display: block;
    cursor: pointer;
    user-select: none;
}
.nl-preview-root .minimap-canvas svg {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
}
.nl-preview-root .minimap-rect {
    position: absolute;
    border: 2px solid var(--nl-preview-focus);
    background-color: color-mix(in srgb, var(--nl-preview-focus) 18%, transparent);
    pointer-events: none;
    box-sizing: border-box;
}

/* === Calendar picker === */
.nl-preview-root .now-picker {
    position: absolute; top: calc(100% + 2px); left: 0;
    padding: 8px;
    min-width: 200px;
    background: var(--nl-chrome-bg);
    border: 1px solid var(--nl-chrome-border);
    border-radius: 6px;
    box-shadow: 0 4px 14px var(--nl-chrome-shadow);
    z-index: 26;
    color: var(--nl-chrome-fg);
}
/* Calendar flips to open toward the left when opening rightward would
   push it past the viewport's right gutter (see placeFlyout). */
.nl-preview-root .now-picker.flip { left: auto; right: 0; }
.nl-preview-root .cal-nav {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
}
.nl-preview-root .cal-heading {
    font-size: 0.85em;
    font-weight: 600;
}
.nl-preview-root .cal-nav-btn {
    padding: 2px 6px;
    min-width: unset;
    font-size: 14px;
}
.nl-preview-root .cal-grid {
    display: grid; grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    margin-bottom: 6px;
}
.nl-preview-root .cal-dow {
    text-align: center;
    font-size: 0.75em;
    color: var(--nl-chrome-muted);
    padding: 2px 0;
}
.nl-preview-root .cal-empty {
    /* placeholder for days before the 1st of the month */
}
.nl-preview-root .cal-day {
    padding: 3px 2px;
    min-width: unset;
    font-size: 0.8em;
    text-align: center;
    border-radius: 3px;
}
.nl-preview-root .cal-day.is-today { font-weight: 700; }
.nl-preview-root .cal-day.is-selected {
    background: var(--nl-chrome-hover);
    outline: 1px solid var(--nl-chrome-border);
}
.nl-preview-root .cal-footer {
    display: flex; gap: 4px;
    border-top: 1px solid var(--nl-chrome-border);
    padding-top: 6px;
    margin-top: 2px;
}
.nl-preview-root .cal-footer-btn {
    flex: 1;
    text-align: center;
    font-size: 0.82em;
    padding: 4px 6px;
    min-width: unset;
}

/* === Diagnostics overlay === */
.nl-preview-root .diagnostics {
    position: absolute; left: 0; right: 0; bottom: 0;
    max-height: 60%;
    background: var(--nl-preview-widget-bg);
    border-top: 1px solid var(--nl-preview-widget-border);
    overflow: auto;
    z-index: 12;
    padding: 0;
    display: none;
}
.nl-preview-root .diagnostics.show { display: block; }
.nl-preview-root .diag-header {
    position: sticky; top: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 12px;
    background: inherit;
    border-bottom: 1px solid var(--nl-preview-widget-border);
    font-weight: 600;
}
.nl-preview-root .diag-summary {
    color: var(--nl-preview-error);
}
.nl-preview-root .diag-summary.warn-only {
    color: var(--nl-preview-warning);
}
.nl-preview-root .diag-summary.clean {
    color: var(--nl-preview-description);
    font-weight: normal;
}
.nl-preview-root .open-problems {
    color: var(--nl-preview-link);
    cursor: pointer;
    text-decoration: none;
    font-weight: normal;
}
.nl-preview-root .open-problems:hover { text-decoration: underline; }
.nl-preview-root .diag-table {
    width: 100%;
    border-collapse: collapse;
}
.nl-preview-root .diag-table tr {
    cursor: pointer;
    border-bottom: 1px solid var(--nl-preview-widget-border);
}
.nl-preview-root .diag-table tr:hover {
    background: rgba(255,255,255,0.04);
}
.nl-preview-root .diag-table td {
    padding: 6px 8px;
    vertical-align: top;
}
.nl-preview-root .sev-cell {
    width: 24px; text-align: center;
    font-weight: bold;
}
.nl-preview-root .sev-error { color: var(--nl-preview-error); }
.nl-preview-root .sev-warning { color: var(--nl-preview-warning); }
.nl-preview-root .loc-cell {
    white-space: nowrap;
    color: var(--nl-preview-description);
    font-variant-numeric: tabular-nums;
    width: 90px;
}
.nl-preview-root .code-cell {
    white-space: nowrap;
    width: 1%;
}
.nl-preview-root .code-pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--nl-preview-code-bg);
    color: var(--nl-preview-description);
    font-family: var(--nl-preview-mono);
    font-size: 0.9em;
}
.nl-preview-root .msg-cell { word-break: break-word; }
.nl-preview-root .suggestion {
    display: block; margin-top: 2px;
    color: var(--nl-preview-description);
    font-style: italic;
    font-size: 0.95em;
}

/* === Empty state === */
.nl-preview-root .empty {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--nl-preview-description);
    pointer-events: none;
}
.nl-preview-root .empty.hidden { display: none; }
`;
