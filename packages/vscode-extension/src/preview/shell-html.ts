import * as vscode from 'vscode';

/**
 * Build the HTML for the preview webview.
 *
 * Inline script + style are gated by a per-call nonce so VS Code's strict
 * webview CSP accepts them. The script body contains no interpolation —
 * everything dynamic (theme, default fit, source uri) is sent later via
 * postMessage `init`.
 */
export function getShellHtml(webview: vscode.Webview): string {
    const nonce = generateNonce();
    const cspSource = webview.cspSource;

    const csp = [
        "default-src 'none'",
        `img-src ${cspSource} data: blob:`,
        `style-src ${cspSource} 'nonce-${nonce}'`,
        `script-src 'nonce-${nonce}'`,
        `font-src ${cspSource}`,
    ].join('; ');

    return (
        '<!doctype html>\n' +
        '<html lang="en">\n' +
        '<head>\n' +
        '<meta charset="utf-8" />\n' +
        '<meta http-equiv="Content-Security-Policy" content="' + csp + '" />\n' +
        '<title>Nowline preview</title>\n' +
        '<style nonce="' + nonce + '">' + STYLES + '</style>\n' +
        '</head>\n' +
        '<body>\n' +
        BODY +
        '<script nonce="' + nonce + '">' + SCRIPT + '</script>\n' +
        '</body>\n' +
        '</html>\n'
    );
}

function generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
}

// VS Code webview style variables: light, dark, and high-contrast all work
// without per-theme CSS. See
// https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content.
const STYLES = `
:root { color-scheme: light dark; }
html, body {
    margin: 0; padding: 0; height: 100%; width: 100%;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #d4d4d4);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    overflow: hidden;
}
#viewport {
    position: absolute; inset: 0;
    overflow: auto;
}
#canvas {
    transform-origin: 0 0;
    will-change: transform;
}
#canvas svg { display: block; max-width: none; height: auto; }
#canvas.dimmed { opacity: 0.25; pointer-events: none; }

/* === Toolbar (top-right) === */
#chrome {
    position: absolute; top: 8px; right: 8px;
    display: flex; gap: 4px;
    transition: opacity 200ms ease;
    z-index: 10;
}
#chrome.faded { opacity: 0.25; }
#chrome:hover { opacity: 1; }
.toolbar {
    display: flex; align-items: center; gap: 2px;
    padding: 2px;
    background: var(--vscode-editorWidget-background, rgba(40,40,40,0.9));
    border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.toolbar .sep {
    width: 1px; height: 20px;
    background: var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    margin: 0 4px;
}
.btn {
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
.btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08)); }
.btn:active { background: var(--vscode-toolbar-activeBackground, rgba(255,255,255,0.12)); }
.btn.zoom-label { min-width: 48px; font-variant-numeric: tabular-nums; }
.btn.glyph { font-size: 16px; line-height: 1; padding: 4px 6px; }
.dropdown { position: relative; }
.menu {
    position: absolute; top: 100%; right: 0; margin-top: 4px;
    list-style: none; padding: 4px; min-width: 140px;
    background: var(--vscode-editorWidget-background, rgba(40,40,40,0.95));
    border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 20;
}
.menu li { padding: 0; }
.menu .btn {
    display: block; width: 100%; text-align: left;
    padding: 6px 10px;
}
.menu li.menu-section {
    padding: 4px 10px 2px;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground, #999);
}
.menu li.menu-divider {
    height: 1px;
    margin: 4px 6px;
    background: var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
}
.menu .btn.view-opt {
    padding-left: 22px;
    position: relative;
}
.menu .btn.view-opt[data-active="true"]::before {
    content: '\\2713';
    position: absolute;
    left: 8px;
}

/* === Minimap === */
#minimap {
    position: absolute; bottom: 12px; right: 12px;
    width: 160px; max-height: 120px;
    background: var(--vscode-editorWidget-background, rgba(40,40,40,0.9));
    border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 8;
}
#minimap.hidden { display: none; }
#minimap-canvas {
    display: block;
    cursor: pointer;
    user-select: none;
}
#minimap-canvas svg {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
}
#minimap-rect {
    position: absolute;
    border: 2px solid var(--vscode-focusBorder, #007acc);
    background: var(--vscode-focusBorder, #007acc);
    background-color: color-mix(in srgb, var(--vscode-focusBorder, #007acc) 18%, transparent);
    pointer-events: none;
    box-sizing: border-box;
}
#minimap-close {
    position: absolute; top: 2px; right: 2px;
    width: 18px; height: 18px; padding: 0;
    border-radius: 4px;
    line-height: 1;
    font-size: 12px;
    z-index: 1;
}

/* === Diagnostics overlay === */
#diagnostics {
    position: absolute; left: 0; right: 0; bottom: 0;
    max-height: 60%;
    background: var(--vscode-editorWidget-background, rgba(30,30,30,0.96));
    border-top: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    overflow: auto;
    z-index: 12;
    padding: 0;
    display: none;
}
#diagnostics.show { display: block; }
#diag-header {
    position: sticky; top: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 12px;
    background: inherit;
    border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.1));
    font-weight: 600;
}
#diag-summary {
    color: var(--vscode-editorError-foreground, #f48771);
}
#diag-summary.warn-only {
    color: var(--vscode-editorWarning-foreground, #cca700);
}
#diag-summary.clean {
    color: var(--vscode-descriptionForeground, #999);
    font-weight: normal;
}
#open-problems {
    color: var(--vscode-textLink-foreground, #3794ff);
    cursor: pointer;
    text-decoration: none;
    font-weight: normal;
}
#open-problems:hover { text-decoration: underline; }
#diag-table {
    width: 100%;
    border-collapse: collapse;
}
#diag-table tr {
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.05));
}
#diag-table tr:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
}
#diag-table td {
    padding: 6px 8px;
    vertical-align: top;
}
.sev-cell {
    width: 24px; text-align: center;
    font-weight: bold;
}
.sev-error { color: var(--vscode-editorError-foreground, #f48771); }
.sev-warning { color: var(--vscode-editorWarning-foreground, #cca700); }
.loc-cell {
    white-space: nowrap;
    color: var(--vscode-descriptionForeground, #999);
    font-variant-numeric: tabular-nums;
    width: 90px;
}
.code-cell {
    white-space: nowrap;
    width: 1%;
}
.code-pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05));
    color: var(--vscode-descriptionForeground, #999);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
}
.msg-cell { word-break: break-word; }
.suggestion {
    display: block; margin-top: 2px;
    color: var(--vscode-descriptionForeground, #999);
    font-style: italic;
    font-size: 0.95em;
}

/* === Empty state === */
#empty {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--vscode-descriptionForeground, #888);
    pointer-events: none;
}
#empty.hidden { display: none; }
`;

const BODY = `
<div id="viewport"><div id="canvas"></div></div>
<div id="empty">Rendering preview…</div>
<div id="chrome">
    <div class="toolbar" id="zoom-toolbar">
        <button class="btn" id="zoom-out" title="Zoom out">−</button>
        <button class="btn zoom-label" id="zoom-reset" title="Reset to 100%">100%</button>
        <button class="btn" id="zoom-in" title="Zoom in">+</button>
        <span class="sep"></span>
        <button class="btn glyph" id="fit-width" title="Fit width (3)" aria-label="Fit width">↔</button>
        <button class="btn glyph" id="fit-page" title="Fit page (1)" aria-label="Fit page">⛶</button>
        <span class="sep"></span>
        <div class="dropdown">
            <button class="btn" id="view-toggle" title="View options for this preview (theme, now-line, links)">View ▾</button>
            <ul class="menu" id="view-menu" hidden>
                <li class="menu-section">Theme</li>
                <li><button class="btn view-opt" data-opt="theme" data-value="auto">Auto</button></li>
                <li><button class="btn view-opt" data-opt="theme" data-value="light">Light</button></li>
                <li><button class="btn view-opt" data-opt="theme" data-value="dark">Dark</button></li>
                <li class="menu-divider"></li>
                <li class="menu-section">Now-line</li>
                <li><button class="btn view-opt" data-opt="now" data-value="today">Today</button></li>
                <li><button class="btn view-opt" data-opt="now" data-value="hide">Hide</button></li>
                <li class="menu-divider"></li>
                <li><button class="btn view-opt" data-opt="showLinks" data-value="toggle">Show links</button></li>
            </ul>
        </div>
        <span class="sep"></span>
        <div class="dropdown">
            <button class="btn" id="save-toggle" title="Save the rendered diagram">Save ▾</button>
            <ul class="menu" id="save-menu" hidden>
                <li><button class="btn" data-action="save-svg">Save SVG…</button></li>
                <li><button class="btn" data-action="save-png">Save PNG…</button></li>
            </ul>
        </div>
        <div class="dropdown">
            <button class="btn" id="copy-toggle" title="Copy the rendered diagram to the clipboard">Copy ▾</button>
            <ul class="menu" id="copy-menu" hidden>
                <li><button class="btn" data-action="copy-svg">Copy SVG</button></li>
                <li><button class="btn" data-action="copy-png">Copy PNG</button></li>
            </ul>
        </div>
    </div>
</div>
<div id="minimap" class="hidden">
    <button class="btn" id="minimap-close" title="Hide minimap">×</button>
    <div id="minimap-canvas"></div>
    <div id="minimap-rect"></div>
</div>
<div id="diagnostics">
    <div id="diag-header">
        <span id="diag-summary"></span>
        <a id="open-problems" href="#">Open Problems panel</a>
    </div>
    <table id="diag-table"><tbody></tbody></table>
</div>
`;

// Inline JS — no template literals, plain string concatenation only, so the
// outer template literal in getShellHtml() doesn't accidentally interpolate
// `${...}` patterns that occur inside the script body.
const SCRIPT = `
(function () {
    var vscode = acquireVsCodeApi();

    var els = {
        viewport: document.getElementById('viewport'),
        canvas: document.getElementById('canvas'),
        empty: document.getElementById('empty'),
        chrome: document.getElementById('chrome'),
        zoomReset: document.getElementById('zoom-reset'),
        minimap: document.getElementById('minimap'),
        minimapCanvas: document.getElementById('minimap-canvas'),
        minimapRect: document.getElementById('minimap-rect'),
        minimapClose: document.getElementById('minimap-close'),
        diagnostics: document.getElementById('diagnostics'),
        diagSummary: document.getElementById('diag-summary'),
        diagTbody: document.querySelector('#diag-table tbody'),
        openProblems: document.getElementById('open-problems'),
        saveMenu: document.getElementById('save-menu'),
        copyMenu: document.getElementById('copy-menu'),
        viewMenu: document.getElementById('view-menu'),
    };

    var state = {
        svgString: null,
        scale: 1,
        naturalWidth: 0,
        naturalHeight: 0,
        defaultFit: 'fitPage',
        // 'fitPage' | 'fitWidth' | 'manual' — what the user most recently
        // asked for. Resize re-applies the last fit mode unless the user
        // moved to manual via Cmd-wheel, +/- buttons, 100% reset, or
        // keyboard preset 2.
        activeFit: 'fitPage',
        showMinimap: true,
        minimapDismissedThisSession: false,
        firstRender: true,
        // === View toolbar overrides (per-panel; not persisted) ===
        // theme: 'auto' | 'light' | 'dark' — UI representation; resolves
        // against the workbench color theme when 'auto'.
        // now: 'today' | 'hide' — mirrors --now and --now -.
        // showLinks: boolean — inverse of --no-links.
        // baseline* fields capture the host-side setting so the menu
        // can show "the user hasn't overridden this yet" states.
        view: {
            theme: 'auto',
            now: 'today',
            showLinks: true,
            // Track whether each option has been explicitly clicked.
            overridden: { theme: false, now: false, showLinks: false },
        },
    };

    // ===== Toolbar fade =====
    var fadeTimer = null;
    function showToolbar() {
        els.chrome.classList.remove('faded');
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function () { els.chrome.classList.add('faded'); }, 2000);
    }
    document.addEventListener('mousemove', showToolbar);
    showToolbar();

    // ===== Transform =====
    // Resize the canvas to the visually-scaled dimensions instead of relying
    // on CSS transform. CSS transform doesn't change the layout box, so the
    // viewport's overflow:auto would show scrollbars at scales <= 1 even when
    // nothing is off-screen. The inner <svg> uses width/height = 100% of the
    // canvas, so vector rendering scales for free.
    function applyTransform() {
        var w = Math.max(1, Math.round(state.naturalWidth * state.scale));
        var h = Math.max(1, Math.round(state.naturalHeight * state.scale));
        els.canvas.style.width = w + 'px';
        els.canvas.style.height = h + 'px';
        els.zoomReset.textContent = Math.round(state.scale * 100) + '%';
        updateMinimapRect();
        updateMinimapVisibility();
    }

    function clampScale(s) {
        if (s < 0.05) return 0.05;
        if (s > 20) return 20;
        return s;
    }

    function setScale(newScale, anchorX, anchorY) {
        var clamped = clampScale(newScale);
        if (anchorX === undefined || state.scale === 0) {
            state.scale = clamped;
            applyTransform();
            return;
        }
        var ratio = clamped / state.scale;
        var newScrollX = (els.viewport.scrollLeft + anchorX) * ratio - anchorX;
        var newScrollY = (els.viewport.scrollTop + anchorY) * ratio - anchorY;
        state.scale = clamped;
        applyTransform();
        els.viewport.scrollLeft = newScrollX;
        els.viewport.scrollTop = newScrollY;
    }

    function fitPage() {
        if (!state.naturalWidth || !state.naturalHeight) return;
        state.activeFit = 'fitPage';
        var sx = els.viewport.clientWidth / state.naturalWidth;
        var sy = els.viewport.clientHeight / state.naturalHeight;
        setScale(Math.min(sx, sy));
        els.viewport.scrollLeft = 0;
        els.viewport.scrollTop = 0;
    }

    function fitWidth() {
        if (!state.naturalWidth) return;
        state.activeFit = 'fitWidth';
        setScale(els.viewport.clientWidth / state.naturalWidth);
        els.viewport.scrollLeft = 0;
        els.viewport.scrollTop = 0;
    }

    function actualSize() {
        state.activeFit = 'manual';
        setScale(1);
    }

    function applyDefaultFit() {
        if (state.defaultFit === 'fitWidth') fitWidth();
        else if (state.defaultFit === 'actual') actualSize();
        else fitPage();
    }

    function reapplyActiveFit() {
        if (state.activeFit === 'fitPage') fitPage();
        else if (state.activeFit === 'fitWidth') fitWidth();
    }

    // ===== Render handling =====
    function extractNaturalSize(svgEl) {
        var w = 0, h = 0;
        if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) {
            w = svgEl.viewBox.baseVal.width;
            h = svgEl.viewBox.baseVal.height;
        }
        if (!w && svgEl.width && svgEl.width.baseVal && svgEl.width.baseVal.value) {
            w = svgEl.width.baseVal.value;
        }
        if (!h && svgEl.height && svgEl.height.baseVal && svgEl.height.baseVal.value) {
            h = svgEl.height.baseVal.value;
        }
        // Strip the SVG's own width/height so it inherits the canvas dimensions
        // we set, allowing CSS scale() to do all the sizing work.
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        if (!svgEl.getAttribute('viewBox') && w && h) {
            svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        }
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        state.naturalWidth = w || 800;
        state.naturalHeight = h || 600;
    }

    function setSvg(svgString) {
        state.svgString = svgString;
        els.canvas.innerHTML = svgString;
        var svgEl = els.canvas.querySelector('svg');
        if (!svgEl) return;
        extractNaturalSize(svgEl);
        rebuildMinimap(svgString);
        if (state.firstRender) {
            applyDefaultFit();
            state.firstRender = false;
        } else {
            applyTransform();
        }
        showSvgMode();
    }

    function showSvgMode() {
        els.empty.classList.add('hidden');
        els.canvas.classList.remove('dimmed');
        els.diagnostics.classList.remove('show');
    }

    function showDiagnosticsMode(rows) {
        els.empty.classList.add('hidden');
        if (state.svgString) {
            els.canvas.classList.add('dimmed');
        }
        populateDiagnostics(rows);
        els.diagnostics.classList.add('show');
    }

    function showFatal(message) {
        var fakeRow = {
            severity: 'error',
            code: 'preview-error',
            message: message,
            file: '',
            line: 1,
            column: 1,
        };
        showDiagnosticsMode([fakeRow]);
    }

    function showCleanMode() {
        // No-op for now; the diagnostics overlay self-hides when SVG renders.
    }

    // ===== Diagnostics table =====
    function populateDiagnostics(rows) {
        var errors = 0, warnings = 0;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].severity === 'warning') warnings++;
            else errors++;
        }
        var summary = '';
        if (errors) summary += errors + (errors === 1 ? ' error' : ' errors');
        if (errors && warnings) summary += ', ';
        if (warnings) summary += warnings + (warnings === 1 ? ' warning' : ' warnings');
        if (!summary) summary = 'No problems';
        els.diagSummary.textContent = summary;
        els.diagSummary.className = '';
        if (!errors && warnings) els.diagSummary.classList.add('warn-only');
        if (!errors && !warnings) els.diagSummary.classList.add('clean');

        var tbody = els.diagTbody;
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            var tr = document.createElement('tr');
            tr.dataset.file = r.file || '';
            tr.dataset.line = String(r.line);
            tr.dataset.column = String(r.column);

            var sevTd = document.createElement('td');
            sevTd.className = 'sev-cell ' + (r.severity === 'warning' ? 'sev-warning' : 'sev-error');
            sevTd.textContent = r.severity === 'warning' ? '\u26A0' : '!';
            tr.appendChild(sevTd);

            var locTd = document.createElement('td');
            locTd.className = 'loc-cell';
            locTd.textContent = 'Ln ' + r.line + ', ' + r.column;
            tr.appendChild(locTd);

            var codeTd = document.createElement('td');
            codeTd.className = 'code-cell';
            var pill = document.createElement('span');
            pill.className = 'code-pill';
            pill.textContent = r.code;
            codeTd.appendChild(pill);
            tr.appendChild(codeTd);

            var msgTd = document.createElement('td');
            msgTd.className = 'msg-cell';
            msgTd.textContent = r.message;
            if (r.suggestion) {
                var sg = document.createElement('span');
                sg.className = 'suggestion';
                sg.textContent = "Did you mean '" + r.suggestion + "'?";
                msgTd.appendChild(sg);
            }
            tr.appendChild(msgTd);
            tbody.appendChild(tr);
        }
    }

    els.diagTbody.addEventListener('click', function (e) {
        var tr = e.target.closest ? e.target.closest('tr') : null;
        if (!tr) return;
        vscode.postMessage({
            type: 'goto',
            file: tr.dataset.file,
            line: parseInt(tr.dataset.line, 10) || 1,
            column: parseInt(tr.dataset.column, 10) || 1,
        });
    });

    els.openProblems.addEventListener('click', function (e) {
        e.preventDefault();
        vscode.postMessage({ type: 'openProblems' });
    });

    // ===== Minimap =====
    function rebuildMinimap(svgString) {
        if (!els.minimapCanvas) return;
        // Clone the SVG markup into the minimap canvas. The browser parses it
        // again because innerHTML is the simplest path; the SVG is small
        // relative to the layout work the host already did.
        els.minimapCanvas.innerHTML = svgString;
        var svgEl = els.minimapCanvas.querySelector('svg');
        if (svgEl) {
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            if (state.naturalWidth && state.naturalHeight && !svgEl.getAttribute('viewBox')) {
                svgEl.setAttribute('viewBox', '0 0 ' + state.naturalWidth + ' ' + state.naturalHeight);
            }
            svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
        // Resize the minimap container to match the diagram aspect ratio,
        // capped at 160x120.
        var maxW = 160, maxH = 120;
        if (state.naturalWidth && state.naturalHeight) {
            var ratio = state.naturalWidth / state.naturalHeight;
            var w = maxW, h = maxW / ratio;
            if (h > maxH) { h = maxH; w = maxH * ratio; }
            els.minimap.style.width = Math.round(w) + 'px';
            els.minimapCanvas.style.height = Math.round(h) + 'px';
        }
    }

    function updateMinimapRect() {
        if (els.minimap.classList.contains('hidden')) return;
        var totalW = state.naturalWidth * state.scale;
        var totalH = state.naturalHeight * state.scale;
        if (!totalW || !totalH) return;
        var miniW = els.minimapCanvas.clientWidth;
        var miniH = els.minimapCanvas.clientHeight;
        var rectW = Math.min(1, els.viewport.clientWidth / totalW) * miniW;
        var rectH = Math.min(1, els.viewport.clientHeight / totalH) * miniH;
        var rectX = (els.viewport.scrollLeft / totalW) * miniW;
        var rectY = (els.viewport.scrollTop / totalH) * miniH;
        // Position relative to the close button row, plus 1px padding to land
        // inside the minimap border.
        els.minimapRect.style.left = (els.minimapCanvas.offsetLeft + rectX) + 'px';
        els.minimapRect.style.top = (els.minimapCanvas.offsetTop + rectY) + 'px';
        els.minimapRect.style.width = rectW + 'px';
        els.minimapRect.style.height = rectH + 'px';
    }

    function updateMinimapVisibility() {
        if (!state.showMinimap || state.minimapDismissedThisSession) {
            els.minimap.classList.add('hidden');
            return;
        }
        var totalW = state.naturalWidth * state.scale;
        var totalH = state.naturalHeight * state.scale;
        var fits = totalW <= els.viewport.clientWidth + 1 && totalH <= els.viewport.clientHeight + 1;
        if (fits) {
            els.minimap.classList.add('hidden');
        } else {
            els.minimap.classList.remove('hidden');
        }
    }

    els.minimapClose.addEventListener('click', function (e) {
        e.stopPropagation();
        state.minimapDismissedThisSession = true;
        els.minimap.classList.add('hidden');
    });

    function panToMinimapPoint(clientX, clientY) {
        var rect = els.minimapCanvas.getBoundingClientRect();
        var x = (clientX - rect.left) / rect.width;
        var y = (clientY - rect.top) / rect.height;
        var totalW = state.naturalWidth * state.scale;
        var totalH = state.naturalHeight * state.scale;
        // Center the viewport on the click point.
        els.viewport.scrollLeft = Math.max(0, x * totalW - els.viewport.clientWidth / 2);
        els.viewport.scrollTop = Math.max(0, y * totalH - els.viewport.clientHeight / 2);
    }

    var miniDragging = false;
    els.minimapCanvas.addEventListener('mousedown', function (e) {
        miniDragging = true;
        panToMinimapPoint(e.clientX, e.clientY);
        e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
        if (miniDragging) panToMinimapPoint(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', function () { miniDragging = false; });

    els.viewport.addEventListener('scroll', updateMinimapRect);
    window.addEventListener('resize', function () {
        // Re-apply the user's last fit choice so the diagram tracks the new
        // panel size. Manual zoom (Cmd-wheel, +/-, 100%) opts out so the
        // user's chosen zoom isn't undone by a window resize.
        reapplyActiveFit();
        updateMinimapRect();
        updateMinimapVisibility();
    });

    // ===== Wheel zoom (Cmd/Ctrl + wheel; trackpad pinch fires same path) =====
    els.viewport.addEventListener('wheel', function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        state.activeFit = 'manual';
        var rect = els.viewport.getBoundingClientRect();
        var anchorX = e.clientX - rect.left;
        var anchorY = e.clientY - rect.top;
        var factor = Math.exp(-e.deltaY * 0.01);
        setScale(state.scale * factor, anchorX, anchorY);
    }, { passive: false });

    // ===== Spacebar pan =====
    var spaceDown = false, dragOrigin = null;
    function isInputFocus(target) {
        if (!target || !target.tagName) return false;
        var t = target.tagName;
        return t === 'INPUT' || t === 'TEXTAREA' || target.isContentEditable;
    }
    document.addEventListener('keydown', function (e) {
        if (isInputFocus(e.target)) return;
        if (e.key === ' ' && !spaceDown) {
            spaceDown = true;
            els.viewport.style.cursor = 'grab';
            e.preventDefault();
        } else if (e.key === '1') { fitPage(); }
        else if (e.key === '2') { actualSize(); }
        else if (e.key === '3') { fitWidth(); }
        else if (e.key === '0') { fitPage(); }
    });
    document.addEventListener('keyup', function (e) {
        if (e.key === ' ') {
            spaceDown = false;
            els.viewport.style.cursor = '';
        }
    });
    els.viewport.addEventListener('mousedown', function (e) {
        if (!spaceDown) return;
        dragOrigin = {
            x: e.clientX, y: e.clientY,
            sx: els.viewport.scrollLeft, sy: els.viewport.scrollTop,
        };
        els.viewport.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
        if (!dragOrigin) return;
        els.viewport.scrollLeft = dragOrigin.sx - (e.clientX - dragOrigin.x);
        els.viewport.scrollTop = dragOrigin.sy - (e.clientY - dragOrigin.y);
    });
    document.addEventListener('mouseup', function () {
        if (dragOrigin) {
            dragOrigin = null;
            els.viewport.style.cursor = spaceDown ? 'grab' : '';
        }
    });

    // ===== Toolbar buttons =====
    document.getElementById('zoom-out').addEventListener('click', function () {
        state.activeFit = 'manual';
        setScale(state.scale / 1.1);
    });
    document.getElementById('zoom-in').addEventListener('click', function () {
        state.activeFit = 'manual';
        setScale(state.scale * 1.1);
    });
    document.getElementById('zoom-reset').addEventListener('click', actualSize);
    document.getElementById('fit-width').addEventListener('click', fitWidth);
    document.getElementById('fit-page').addEventListener('click', fitPage);

    // ===== View / Save / Copy dropdowns =====
    function setupDropdown(toggleId, menu) {
        var toggle = document.getElementById(toggleId);
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            // Close the other menus first so only one is open at a time.
            els.saveMenu.hidden = true;
            els.copyMenu.hidden = true;
            els.viewMenu.hidden = true;
            menu.hidden = !menu.hidden;
        });
    }
    setupDropdown('view-toggle', els.viewMenu);
    setupDropdown('save-toggle', els.saveMenu);
    setupDropdown('copy-toggle', els.copyMenu);
    document.addEventListener('click', function () {
        els.saveMenu.hidden = true;
        els.copyMenu.hidden = true;
        els.viewMenu.hidden = true;
    });
    [els.saveMenu, els.copyMenu, els.viewMenu].forEach(function (m) {
        m.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    // ===== View options =====
    function refreshViewMenu() {
        var items = els.viewMenu.querySelectorAll('.view-opt');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var opt = item.getAttribute('data-opt');
            var value = item.getAttribute('data-value');
            var active = false;
            if (opt === 'theme') active = state.view.theme === value;
            else if (opt === 'now') active = state.view.now === value;
            else if (opt === 'showLinks') active = state.view.showLinks;
            item.setAttribute('data-active', active ? 'true' : 'false');
        }
    }

    function postViewOverrides() {
        // Only send overridden fields. The host merges them on top of
        // the resolution chain (settings → .nowlinerc → defaults), so
        // omitted fields fall back to whatever the chain produced.
        var overrides = {};
        if (state.view.overridden.theme) overrides.theme = state.view.theme;
        if (state.view.overridden.now) overrides.now = state.view.now;
        if (state.view.overridden.showLinks) overrides.showLinks = state.view.showLinks;
        vscode.postMessage({ type: 'viewOptions', overrides: overrides });
    }

    els.viewMenu.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.view-opt') : null;
        if (!btn) return;
        var opt = btn.getAttribute('data-opt');
        var value = btn.getAttribute('data-value');
        if (opt === 'theme') {
            state.view.theme = value;
            state.view.overridden.theme = true;
        } else if (opt === 'now') {
            state.view.now = value;
            state.view.overridden.now = true;
        } else if (opt === 'showLinks') {
            state.view.showLinks = !state.view.showLinks;
            state.view.overridden.showLinks = true;
        }
        refreshViewMenu();
        els.viewMenu.hidden = true;
        postViewOverrides();
    });

    document.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var action = btn.getAttribute('data-action');
            els.saveMenu.hidden = true;
            els.copyMenu.hidden = true;
            handleExportAction(action);
        });
    });

    function handleExportAction(action) {
        if (!state.svgString) return;
        if (action === 'save-svg') {
            vscode.postMessage({ type: 'save', format: 'svg', body: state.svgString });
        } else if (action === 'copy-svg') {
            navigator.clipboard.writeText(state.svgString).catch(function (err) {
                vscode.postMessage({ type: 'fatal', message: 'Copy SVG failed: ' + err.message });
            });
        } else if (action === 'save-png') {
            rasterizePng().then(function (blob) {
                blob.arrayBuffer().then(function (buf) {
                    vscode.postMessage({ type: 'save', format: 'png', body: new Uint8Array(buf) });
                });
            }).catch(function (err) {
                vscode.postMessage({ type: 'fatal', message: 'PNG render failed: ' + err.message });
            });
        } else if (action === 'copy-png') {
            rasterizePng().then(function (blob) {
                if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) {
                    return blob.arrayBuffer().then(function (buf) {
                        vscode.postMessage({ type: 'copyPngFallback', body: new Uint8Array(buf) });
                    });
                }
                return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(function () {
                    return blob.arrayBuffer().then(function (buf) {
                        vscode.postMessage({ type: 'copyPngFallback', body: new Uint8Array(buf) });
                    });
                });
            }).catch(function (err) {
                vscode.postMessage({ type: 'fatal', message: 'PNG render failed: ' + err.message });
            });
        }
    }

    function rasterizePng() {
        return new Promise(function (resolve, reject) {
            if (!state.svgString) return reject(new Error('No diagram to rasterize.'));
            var blob = new Blob([state.svgString], { type: 'image/svg+xml;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
                try {
                    var dpr = window.devicePixelRatio || 1;
                    var w = state.naturalWidth || img.naturalWidth || 800;
                    var h = state.naturalHeight || img.naturalHeight || 600;
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(w * dpr));
                    canvas.height = Math.max(1, Math.round(h * dpr));
                    var ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('2D canvas context unavailable.');
                    ctx.scale(dpr, dpr);
                    ctx.drawImage(img, 0, 0, w, h);
                    URL.revokeObjectURL(url);
                    canvas.toBlob(function (out) {
                        if (out) resolve(out);
                        else reject(new Error('canvas.toBlob returned null.'));
                    }, 'image/png');
                } catch (err) {
                    URL.revokeObjectURL(url);
                    reject(err);
                }
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load SVG into <img> for rasterization.'));
            };
            img.src = url;
        });
    }

    // ===== Message dispatch =====
    window.addEventListener('message', function (e) {
        var msg = e.data;
        if (!msg || !msg.type) return;
        if (msg.type === 'init') {
            if (msg.defaultFit) state.defaultFit = msg.defaultFit;
            if (msg.showMinimap !== undefined) state.showMinimap = !!msg.showMinimap;
            applyHostViewState(msg, /*resetOverrides*/ true);
            updateMinimapVisibility();
            refreshViewMenu();
        } else if (msg.type === 'svg') {
            setSvg(msg.body);
        } else if (msg.type === 'diagnostics') {
            showDiagnosticsMode(msg.rows || []);
        } else if (msg.type === 'fatal') {
            showFatal(msg.message || 'Unknown error.');
        } else if (msg.type === 'configChange') {
            if (msg.showMinimap !== undefined) {
                state.showMinimap = !!msg.showMinimap;
                state.minimapDismissedThisSession = false;
                updateMinimapVisibility();
            }
            if (msg.defaultFit) state.defaultFit = msg.defaultFit;
            // Settings changed in the workbench. Refresh non-overridden
            // baselines so the menu's checkmarks reflect the new setting,
            // but don't clobber explicit toolbar overrides.
            applyHostViewState(msg, /*resetOverrides*/ false);
            refreshViewMenu();
        }
    });

    function applyHostViewState(msg, resetOverrides) {
        if (msg.theme && !state.view.overridden.theme) {
            state.view.theme = msg.theme;
        }
        if (msg.now !== undefined && !state.view.overridden.now) {
            // Setting is 'auto'/'none'/YYYY-MM-DD; the toolbar only
            // exposes today/hide, so collapse anything that isn't 'none'
            // to 'today' for the displayed checkmark. Custom dates still
            // render via the setting; the toolbar just doesn't claim
            // ownership of them.
            state.view.now = msg.now === 'none' ? 'hide' : 'today';
        }
        if (msg.showLinks !== undefined && !state.view.overridden.showLinks) {
            state.view.showLinks = !!msg.showLinks;
        }
        if (resetOverrides) {
            state.view.overridden = { theme: false, now: false, showLinks: false };
        }
    }
})();
`;
