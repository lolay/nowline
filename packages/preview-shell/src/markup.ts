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
    zoomReset: HTMLButtonElement;
    zoomIn: HTMLButtonElement;
    zoomOut: HTMLButtonElement;
    fitWidth: HTMLButtonElement;
    fitPage: HTMLButtonElement;
    viewToggle: HTMLButtonElement;
    viewMenu: HTMLUListElement;
    saveToggle: HTMLButtonElement;
    saveMenu: HTMLUListElement;
    copyToggle: HTMLButtonElement;
    copyMenu: HTMLUListElement;
    minimap: HTMLElement;
    minimapCanvas: HTMLElement;
    minimapRect: HTMLElement;
    minimapClose: HTMLButtonElement;
    diagnostics: HTMLElement;
    diagSummary: HTMLElement;
    diagTbody: HTMLElement;
    openProblems: HTMLAnchorElement;
}

const TEMPLATE = `
<div class="viewport"><div class="canvas"></div></div>
<div class="empty">Rendering preview…</div>
<div class="chrome">
    <div class="toolbar zoom-toolbar">
        <button class="btn zoom-out" title="Zoom out">−</button>
        <button class="btn zoom-label zoom-reset" title="Reset to 100%">100%</button>
        <button class="btn zoom-in" title="Zoom in">+</button>
        <span class="sep"></span>
        <button class="btn glyph fit-width" title="Fit width (3)" aria-label="Fit width">↔</button>
        <button class="btn glyph fit-page" title="Fit page (1)" aria-label="Fit page">⛶</button>
        <span class="sep"></span>
        <div class="dropdown">
            <button class="btn view-toggle" title="View options for this preview (theme, now-line, links)">View ▾</button>
            <ul class="menu view-menu" hidden>
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
            <button class="btn save-toggle" title="Save the rendered diagram">Save ▾</button>
            <ul class="menu save-menu" hidden>
                <li><button class="btn" data-action="save-svg">Save SVG…</button></li>
                <li><button class="btn" data-action="save-png">Save PNG…</button></li>
            </ul>
        </div>
        <div class="dropdown">
            <button class="btn copy-toggle" title="Copy the rendered diagram to the clipboard">Copy ▾</button>
            <ul class="menu copy-menu" hidden>
                <li><button class="btn" data-action="copy-svg">Copy SVG</button></li>
                <li><button class="btn" data-action="copy-png">Copy PNG</button></li>
            </ul>
        </div>
    </div>
</div>
<div class="minimap hidden">
    <button class="btn minimap-close" title="Hide minimap">×</button>
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
        zoomReset: q<HTMLButtonElement>(rootEl, '.zoom-reset'),
        zoomIn: q<HTMLButtonElement>(rootEl, '.zoom-in'),
        zoomOut: q<HTMLButtonElement>(rootEl, '.zoom-out'),
        fitWidth: q<HTMLButtonElement>(rootEl, '.fit-width'),
        fitPage: q<HTMLButtonElement>(rootEl, '.fit-page'),
        viewToggle: q<HTMLButtonElement>(rootEl, '.view-toggle'),
        viewMenu: q<HTMLUListElement>(rootEl, '.view-menu'),
        saveToggle: q<HTMLButtonElement>(rootEl, '.save-toggle'),
        saveMenu: q<HTMLUListElement>(rootEl, '.save-menu'),
        copyToggle: q<HTMLButtonElement>(rootEl, '.copy-toggle'),
        copyMenu: q<HTMLUListElement>(rootEl, '.copy-menu'),
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
