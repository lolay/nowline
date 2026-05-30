// Stylesheet for `mountPreview()`. Uses neutral `--nl-preview-*` CSS
// custom properties throughout so consumers can re-skin the viewport
// without forking the package. Sensible defaults baked in so the
// viewport works out of the box on a blank page.
//
// VS Code consumers paste `VSCODE_THEME_BRIDGE_CSS` (below) into their
// webview to map `--nl-preview-*` to the matching `--vscode-*` tokens
// — that keeps the viewport in lock-step with the user's workbench
// theme without having to keep two sets of variables in sync.

/**
 * Bridge CSS for VS Code webview consumers. Maps every `--nl-preview-*`
 * token to the matching `--vscode-*` variable so the viewport renders
 * in the active workbench colour theme automatically.
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
    --nl-preview-toolbar-hover: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
    --nl-preview-toolbar-active: var(--vscode-toolbar-activeBackground, rgba(255,255,255,0.12));
    --nl-preview-list-hover: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
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
 * for every `--nl-preview-*` token so the viewport works on a blank
 * page; consumers override by re-declaring the variables on a
 * higher-specificity selector.
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
    --nl-preview-toolbar-hover: rgba(255,255,255,0.08);
    --nl-preview-toolbar-active: rgba(255,255,255,0.12);
    --nl-preview-list-hover: rgba(255,255,255,0.04);
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

/* === Toolbar (top-right) === */
.nl-preview-root .chrome {
    position: absolute; top: 8px; right: 8px;
    display: flex; gap: 4px;
    transition: opacity 200ms ease;
    z-index: 10;
}
.nl-preview-root .chrome.faded { opacity: 0.25; }
.nl-preview-root .chrome:hover { opacity: 1; }
.nl-preview-root .toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: 2px;
    background: var(--nl-preview-widget-bg);
    border: 1px solid var(--nl-preview-widget-border);
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.nl-preview-root .toolbar .sep {
    width: 1px; height: 20px;
    background: var(--nl-preview-widget-border);
    margin: 0 4px;
}
.nl-preview-root .btn {
    appearance: none;
    background: transparent;
    color: inherit;
    border: 0;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    line-height: 1;
    min-width: 28px;
}
.nl-preview-root .btn:hover { background: var(--nl-preview-toolbar-hover); }
.nl-preview-root .btn:active { background: var(--nl-preview-toolbar-active); }
.nl-preview-root .btn.zoom-label { min-width: 48px; font-variant-numeric: tabular-nums; }
.nl-preview-root .btn.glyph { font-size: 16px; line-height: 1; padding: 4px 6px; }
.nl-preview-root .dropdown { position: relative; }
.nl-preview-root .menu {
    position: absolute; top: 100%; right: 0; margin-top: 4px;
    list-style: none; padding: 4px; min-width: 140px;
    background: var(--nl-preview-widget-bg);
    border: 1px solid var(--nl-preview-widget-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 20;
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
    color: var(--nl-preview-description);
}
.nl-preview-root .menu li.menu-divider {
    height: 1px;
    margin: 4px 6px;
    background: var(--nl-preview-widget-border);
}
.nl-preview-root .menu .btn.view-opt {
    padding-left: 22px;
    position: relative;
}
.nl-preview-root .menu .btn.view-opt[data-active="true"]::before {
    content: '\\2713';
    position: absolute;
    left: 8px;
}

/* === Minimap === */
.nl-preview-root .minimap {
    position: absolute; bottom: 12px; right: 12px;
    width: 160px; max-height: 120px;
    background: var(--nl-preview-widget-bg);
    border: 1px solid var(--nl-preview-widget-border);
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 8;
}
.nl-preview-root .minimap.hidden { display: none; }
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
.nl-preview-root .minimap-close {
    position: absolute; top: 2px; right: 2px;
    width: 18px; height: 18px; padding: 0;
    border-radius: 4px;
    line-height: 1;
    font-size: 12px;
    z-index: 1;
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
    background: var(--nl-preview-list-hover);
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
