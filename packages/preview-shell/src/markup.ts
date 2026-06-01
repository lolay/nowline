// Markup helpers for `mountPreview()`. Builds the viewport DOM tree
// inside the supplied root element. All element refs are namespaced by
// CSS class (rather than `id="..."`) so two preview shells can mount in
// the same document without clashing.

export interface ViewportElements {
    root: HTMLElement;
    viewport: HTMLElement;
    canvas: HTMLElement;
    empty: HTMLElement;
    chrome: HTMLElement;
    /** Drag grip at the leading edge of the toolbar — initiates chrome repositioning. */
    toolbarHandle: HTMLElement;
    /** » restore button — shown only when the toolbar is collapsed. */
    restoreBtn: HTMLButtonElement;
    zoomReset: HTMLButtonElement;
    zoomIn: HTMLButtonElement;
    zoomOut: HTMLButtonElement;
    /** Fit-width button (↔) — triggers fitWidth. Sits left of fitPage. */
    fitWidth: HTMLButtonElement;
    /** Fit-page button (⤢) — triggers fitPage. */
    fitPage: HTMLButtonElement;
    /** ▾ more toggle — opens the more-menu panel. */
    moreToggle: HTMLButtonElement;
    /** More-menu panel containing format, copy, export, theme, now, links rows. */
    moreMenu: HTMLElement;
    /** Format sub-dropdown toggle (SVG ▾ / PNG ▾). */
    formatToggle: HTMLButtonElement;
    /** Format sub-dropdown list. */
    formatMenu: HTMLUListElement;
    /** Copy action button — uses the selected format. */
    copyAction: HTMLButtonElement;
    /** Export / download action button — uses the selected format. */
    exportAction: HTMLButtonElement;
    /** Theme sub-dropdown toggle. */
    themeToggle: HTMLButtonElement;
    /** Theme sub-dropdown list; items built programmatically from availableThemes. */
    themeMenu: HTMLUListElement;
    /** Now sub-dropdown toggle. */
    nowToggle: HTMLButtonElement;
    /** Label span inside nowToggle — shows Today / formatted date / None. */
    nowLabel: HTMLElement;
    /** Calendar picker panel — populated by mount.ts on open. */
    nowPicker: HTMLElement;
    /** Show-links sub-dropdown toggle. */
    linksToggle: HTMLButtonElement;
    /** Show-links sub-dropdown list. */
    linksMenu: HTMLUListElement;
    /** « collapse button — shrinks the toolbar to a translucent puck. */
    collapseBtn: HTMLButtonElement;
    minimap: HTMLElement;
    minimapCanvas: HTMLElement;
    minimapRect: HTMLElement;
    minimapClose: HTMLButtonElement;
    diagnostics: HTMLElement;
    diagSummary: HTMLElement;
    diagTbody: HTMLElement;
    openProblems: HTMLAnchorElement;
}

// Inline SVG glyphs for the copy / download actions — crisp at any
// zoom and tinted by `currentColor`. Embedded via innerHTML (no script),
// so they are unaffected by the webview's nonce-only script/style CSP.
const COPY_ICON =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"></path></svg>';
const DOWNLOAD_ICON =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.5"></path><path d="M4.75 7 8 10.25 11.25 7"></path><path d="M3 13.25h10"></path></svg>';

const TEMPLATE = `
<div class="viewport"><div class="canvas"></div></div>
<div class="empty">Rendering preview\u2026</div>
<div class="chrome">
    <div class="toolbar">
        <span class="toolbar-handle" aria-hidden="true" title="Drag to reposition toolbar">\u2838</span>
        <button class="btn glyph restore-btn" title="Expand toolbar" aria-label="Expand toolbar">\u00bb</button>
        <button class="btn zoom-out" title="Zoom out" aria-label="Zoom out">\u2212</button>
        <button class="btn zoom-label zoom-reset" title="Reset to 100%">100%</button>
        <button class="btn zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        <span class="sep"></span>
        <button class="btn glyph fit-width" title="Fit width (3)" aria-label="Fit width">\u2194</button>
        <button class="btn glyph fit-page" title="Fit page (1)" aria-label="Fit page">\u2922</button>
        <span class="sep"></span>
        <div class="dropdown">
            <button class="btn more-toggle" title="More options">\u25be more</button>
            <div class="more-menu" hidden>
                <div class="more-row">
                    <span class="more-label">Format:</span>
                    <div class="dropdown">
                        <button class="btn more-sub-toggle format-toggle">SVG \u25be</button>
                        <ul class="more-sub-menu format-menu" hidden>
                            <li><button class="btn format-opt" data-value="svg"><code class="code-chip">svg</code></button></li>
                            <li><button class="btn format-opt" data-value="png"><code class="code-chip">png</code></button></li>
                        </ul>
                    </div>
                </div>
                <div class="more-row action-row">
                    <button class="btn copy-action" title="Copy to clipboard"><span>Copy</span><span class="action-ico" aria-hidden="true">${COPY_ICON}</span></button>
                    <button class="btn export-action" title="Export file"><span>Export</span><span class="action-ico" aria-hidden="true">${DOWNLOAD_ICON}</span></button>
                </div>
                <div class="more-divider"></div>
                <div class="more-row theme-control-row">
                    <span class="more-label">Theme:</span>
                    <div class="dropdown">
                        <button class="btn more-sub-toggle theme-toggle">Auto \u25be</button>
                        <ul class="more-sub-menu theme-menu" hidden></ul>
                    </div>
                </div>
                <div class="more-row">
                    <span class="more-label">Now:</span>
                    <div class="dropdown">
                        <button class="btn more-sub-toggle now-toggle"><span class="now-label">Today</span> \u25be</button>
                        <div class="now-picker" hidden></div>
                    </div>
                </div>
                <div class="more-row">
                    <span class="more-label">Show links:</span>
                    <div class="dropdown">
                        <button class="btn more-sub-toggle links-toggle">Yes \u25be</button>
                        <ul class="more-sub-menu links-menu" hidden>
                            <li><button class="btn links-opt" data-value="true">Yes</button></li>
                            <li><button class="btn links-opt" data-value="false">No</button></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <button class="btn glyph collapse-btn" title="Collapse toolbar" aria-label="Collapse toolbar">\u00ab</button>
    </div>
</div>
<div class="minimap hidden">
    <button class="btn minimap-close" title="Hide minimap">\u00d7</button>
    <div class="minimap-canvas"></div>
    <div class="minimap-rect"></div>
</div>
<div class="diagnostics">
    <div class="diag-header">
        <span class="diag-summary"></span>
        <a class="open-problems" href="#">Open Problems panel</a>
    </div>
    <table class="diag-table"><tbody></tbody></table>
</div>
`;

function q<T extends Element>(root: HTMLElement, selector: string): T {
    const el = root.querySelector(selector);
    if (!el) {
        throw new Error(`preview-shell: required element "${selector}" missing from template`);
    }
    return el as T;
}

export function buildViewport(rootEl: HTMLElement): ViewportElements {
    rootEl.classList.add('nl-preview-root');
    rootEl.innerHTML = TEMPLATE;

    return {
        root: rootEl,
        viewport: q<HTMLElement>(rootEl, '.viewport'),
        canvas: q<HTMLElement>(rootEl, '.canvas'),
        empty: q<HTMLElement>(rootEl, '.empty'),
        chrome: q<HTMLElement>(rootEl, '.chrome'),
        toolbarHandle: q<HTMLElement>(rootEl, '.toolbar-handle'),
        restoreBtn: q<HTMLButtonElement>(rootEl, '.restore-btn'),
        zoomReset: q<HTMLButtonElement>(rootEl, '.zoom-reset'),
        zoomIn: q<HTMLButtonElement>(rootEl, '.zoom-in'),
        zoomOut: q<HTMLButtonElement>(rootEl, '.zoom-out'),
        fitWidth: q<HTMLButtonElement>(rootEl, '.fit-width'),
        fitPage: q<HTMLButtonElement>(rootEl, '.fit-page'),
        moreToggle: q<HTMLButtonElement>(rootEl, '.more-toggle'),
        moreMenu: q<HTMLElement>(rootEl, '.more-menu'),
        formatToggle: q<HTMLButtonElement>(rootEl, '.format-toggle'),
        formatMenu: q<HTMLUListElement>(rootEl, '.format-menu'),
        copyAction: q<HTMLButtonElement>(rootEl, '.copy-action'),
        exportAction: q<HTMLButtonElement>(rootEl, '.export-action'),
        themeToggle: q<HTMLButtonElement>(rootEl, '.theme-toggle'),
        themeMenu: q<HTMLUListElement>(rootEl, '.theme-menu'),
        nowToggle: q<HTMLButtonElement>(rootEl, '.now-toggle'),
        nowLabel: q<HTMLElement>(rootEl, '.now-label'),
        nowPicker: q<HTMLElement>(rootEl, '.now-picker'),
        linksToggle: q<HTMLButtonElement>(rootEl, '.links-toggle'),
        linksMenu: q<HTMLUListElement>(rootEl, '.links-menu'),
        collapseBtn: q<HTMLButtonElement>(rootEl, '.collapse-btn'),
        minimap: q<HTMLElement>(rootEl, '.minimap'),
        minimapCanvas: q<HTMLElement>(rootEl, '.minimap-canvas'),
        minimapRect: q<HTMLElement>(rootEl, '.minimap-rect'),
        minimapClose: q<HTMLButtonElement>(rootEl, '.minimap-close'),
        diagnostics: q<HTMLElement>(rootEl, '.diagnostics'),
        diagSummary: q<HTMLElement>(rootEl, '.diag-summary'),
        diagTbody: q<HTMLElement>(rootEl, '.diag-table tbody'),
        openProblems: q<HTMLAnchorElement>(rootEl, '.open-problems'),
    };
}
