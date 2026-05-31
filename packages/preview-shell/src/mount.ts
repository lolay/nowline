// Framework-agnostic preview viewport mounted into a host element.
// Lifted from `packages/vscode-extension/src/preview/shell-html.ts`'s
// inline SCRIPT body and translated from a VS Code-coupled IIFE into
// a TypeScript module with an imperative API.
//
// The mount supplies its own DOM, CSS class scoping, zoom/pan logic,
// minimap, and diagnostic table. Consumers feed SVG strings + diagnostic
// rows in via the returned handle and receive user interactions (jump
// to source, save, copy, view-options changes) via callback options —
// no `acquireVsCodeApi()`, no `postMessage`, no host coupling.

import type { DiagnosticRow } from '@nowline/browser';
import { buildViewport } from './markup.js';
import { PREVIEW_SHELL_CSS } from './styles.js';

/**
 * Diagram render theme. `'auto'` resolves to the current Mode's
 * light/dark. `'greyscale'` is a fully available theme.
 */
export type ThemeOverride = 'auto' | 'light' | 'dark' | 'greyscale';

/**
 * Now-line override. `'today'` and `'hide'` are the named sentinels;
 * any `'YYYY-MM-DD'` date string is also valid.
 */
export type NowOverride = 'today' | 'hide' | (string & {});

export type InitialFit = 'fitPage' | 'fitWidth' | 'actual';

/**
 * Locator info posted when the user clicks a diagnostic row. `file`
 * carries the absolute fs path from the originating DiagnosticRow;
 * `line` and `column` are 1-based to match VS Code's Problems panel.
 */
export interface DiagnosticGoto {
    file: string;
    line: number;
    column: number;
}

/**
 * Save / copy request payload. The shell rasterizes PNG via
 * `<canvas>`; consumers receive the bytes and decide where they go.
 */
export interface ExportRequest {
    format: 'svg' | 'png';
    body: string | Uint8Array;
}

/**
 * View-options overrides emitted when the user changes Theme, Now, or
 * Show-links in the more-menu. Only explicitly chosen fields are
 * present; consumers merge with their option-resolution chain.
 */
export interface ViewOptionsOverrides {
    theme?: ThemeOverride;
    now?: NowOverride;
    showLinks?: boolean;
}

/**
 * Baseline view state pushed by the consumer (e.g. when settings
 * change). The shell uses these to pre-fill menu checkmarks without
 * claiming the option as user-overridden.
 */
export interface ViewBaseline {
    theme?: ThemeOverride;
    /** `'today'` | `'hide'` | `'YYYY-MM-DD'` | legacy `'auto'` / `'none'` values are accepted. */
    now?: NowOverride | 'auto' | 'none' | string;
    showLinks?: boolean;
}

export interface MountPreviewOptions {
    initialFit?: InitialFit;
    showMinimap?: boolean;
    /**
     * Initial view-menu baseline. Consumers can omit and push later
     * with `handle.setViewBaseline(...)`.
     */
    viewBaseline?: ViewBaseline;
    /**
     * Color scheme for the chrome (toolbar, menus, minimap).
     * `'system'` (default) auto-detects: VS Code webview via `<body>`
     * class; browser via `prefers-color-scheme`. Never affects the
     * diagram theme.
     */
    mode?: 'light' | 'dark' | 'system';
    /**
     * Whether to show the Theme row in the more-menu.
     * Defaults to `'show'`.
     */
    themeControl?: 'show' | 'hide';
    /**
     * Diagram themes available in the Theme dropdown. **Auto** is
     * always prepended. Defaults to `['light', 'dark', 'greyscale']`.
     */
    availableThemes?: string[];
    /**
     * Locale used for date formatting in the Now picker.
     * Defaults to `navigator.language`.
     */
    locale?: string;
    onGoto?: (loc: DiagnosticGoto) => void;
    onOpenProblems?: () => void;
    onSave?: (req: ExportRequest) => void;
    onCopy?: (req: ExportRequest) => void;
    /**
     * Fired when the browser's `navigator.clipboard.write` is
     * unavailable during a copy-PNG action. Consumers pass the bytes
     * to a host-side fallback.
     */
    onCopyPngFallback?: (body: Uint8Array) => void;
    onViewOptions?: (overrides: ViewOptionsOverrides) => void;
    onFatal?: (message: string) => void;
}

export interface PreviewHandle {
    /** Replace the diagram with new SVG markup. */
    setSvg(svg: string): void;
    /** Switch to the diagnostics overlay; dims any prior SVG. */
    setDiagnostics(rows: DiagnosticRow[]): void;
    /** Show a one-row diagnostics overlay with the supplied message. */
    setFatal(message: string): void;
    /** Re-skin view-menu baselines without claiming user overrides. */
    setViewBaseline(baseline: ViewBaseline, resetOverrides?: boolean): void;
    /** Update the default fit used by the next first-render. */
    setDefaultFit(fit: InitialFit): void;
    /** Toggle minimap behaviour from the host. */
    setShowMinimap(show: boolean): void;
    /**
     * Switch the chrome color scheme. `'system'` re-detects from the
     * host environment; `'light'`/`'dark'` pin explicitly.
     */
    setMode(mode: 'light' | 'dark' | 'system'): void;
    /**
     * Replace the list of selectable diagram themes. **Auto** is
     * always prepended. Rebuilds the Theme dropdown immediately.
     */
    setAvailableThemes(themes: string[]): void;
    /**
     * Update the locale used for date formatting in the Now picker.
     */
    setLocale(locale: string): void;
    fitPage(): void;
    fitWidth(): void;
    actualSize(): void;
    getZoom(): number;
    setZoom(scale: number): void;
    /** Remove all listeners + DOM and detach the shell from the root element. */
    dispose(): void;
}

interface InternalState {
    svgString: string | null;
    scale: number;
    naturalWidth: number;
    naturalHeight: number;
    defaultFit: InitialFit;
    activeFit: 'fitPage' | 'fitWidth' | 'manual';
    /**
     * True once the user has manually zoomed, panned, or used zoom buttons.
     * Drives the resize focal-point strategy.
     */
    isDirty: boolean;
    lastViewportWidth: number;
    lastViewportHeight: number;
    showMinimap: boolean;
    minimapDismissedThisSession: boolean;
    firstRender: boolean;
    /** Resolved chrome color scheme — set by mode resolution, never by diagram theme. */
    mode: 'light' | 'dark';
    locale: string;
    export: { format: 'svg' | 'png' };
    view: {
        theme: ThemeOverride;
        now: NowOverride;
        showLinks: boolean;
        overridden: { theme: boolean; now: boolean; showLinks: boolean };
    };
}

let stylesheetMounted = false;

/**
 * Last chrome position saved after a drag, shared across all shells in
 * this JS session. Persists for the lifetime of the page.
 */
let savedChromePosition: { left: number; top: number } | null = null;

function ensureStylesheet(doc: Document): void {
    if (stylesheetMounted) return;
    const style = doc.createElement('style');
    style.setAttribute('data-nl-preview-shell', '');
    style.textContent = PREVIEW_SHELL_CSS;
    doc.head?.appendChild(style);
    stylesheetMounted = true;
}

export function mountPreview(
    rootEl: HTMLElement,
    options: MountPreviewOptions = {},
): PreviewHandle {
    ensureStylesheet(rootEl.ownerDocument);

    const els = buildViewport(rootEl);
    const doc = rootEl.ownerDocument;
    const win = doc.defaultView ?? globalThis;

    const state: InternalState = {
        svgString: null,
        scale: 1,
        naturalWidth: 0,
        naturalHeight: 0,
        defaultFit: options.initialFit ?? 'fitPage',
        activeFit: options.initialFit === 'fitWidth' ? 'fitWidth' : 'fitPage',
        isDirty: false,
        lastViewportWidth: 0,
        lastViewportHeight: 0,
        showMinimap: options.showMinimap !== false,
        minimapDismissedThisSession: false,
        firstRender: true,
        mode: 'dark',
        locale:
            options.locale ??
            (typeof navigator !== 'undefined' ? navigator.language : 'en'),
        export: { format: 'svg' },
        view: {
            theme: 'auto',
            now: 'today',
            showLinks: true,
            overridden: { theme: false, now: false, showLinks: false },
        },
    };

    const cleanups: Array<() => void> = [];
    function on<T extends Event>(
        target: EventTarget,
        type: string,
        handler: (e: T) => void,
        opts?: AddEventListenerOptions | boolean,
    ): void {
        target.addEventListener(type, handler as EventListener, opts);
        cleanups.push(() => target.removeEventListener(type, handler as EventListener, opts));
    }

    // ===== Mode resolution =====
    function resolveSystemMode(): 'light' | 'dark' {
        const body = doc.body;
        if (body) {
            if (
                body.classList.contains('vscode-dark') ||
                body.classList.contains('vscode-high-contrast-dark')
            )
                return 'dark';
            if (
                body.classList.contains('vscode-light') ||
                body.classList.contains('vscode-high-contrast-light') ||
                body.classList.contains('vscode-high-contrast')
            )
                return 'light';
        }
        if (typeof win.matchMedia === 'function') {
            return win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'dark';
    }

    function applyMode(resolved: 'light' | 'dark'): void {
        state.mode = resolved;
        rootEl.setAttribute('data-nl-mode', resolved);
    }

    const rawMode = options.mode ?? 'system';
    applyMode(rawMode === 'system' ? resolveSystemMode() : rawMode);

    if (rawMode === 'system') {
        if (typeof MutationObserver !== 'undefined' && doc.body) {
            const bodyObs = new MutationObserver(() => applyMode(resolveSystemMode()));
            bodyObs.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
            cleanups.push(() => bodyObs.disconnect());
        }
        const mq =
            typeof win.matchMedia === 'function'
                ? win.matchMedia('(prefers-color-scheme: dark)')
                : null;
        if (mq) {
            const onMqChange = (): void => {
                const body = doc.body;
                const hasVsCode =
                    body &&
                    (body.classList.contains('vscode-dark') ||
                        body.classList.contains('vscode-light') ||
                        body.classList.contains('vscode-high-contrast') ||
                        body.classList.contains('vscode-high-contrast-dark') ||
                        body.classList.contains('vscode-high-contrast-light'));
                if (!hasVsCode) applyMode(mq.matches ? 'dark' : 'light');
            };
            mq.addEventListener('change', onMqChange);
            cleanups.push(() => mq.removeEventListener('change', onMqChange));
        }
    }

    // ===== Floating UI fade =====
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;

    function showFloatingUI(): void {
        els.chrome.classList.remove('faded');
        els.minimap.classList.remove('faded');
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
            els.chrome.classList.add('faded');
            els.minimap.classList.add('faded');
        }, 2000);
    }

    on(doc, 'mousemove', showFloatingUI);
    showFloatingUI();

    // × hide button arms a 2-second fade from now
    on(els.hideBtn, 'click', () => {
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
            els.chrome.classList.add('faded');
            els.minimap.classList.add('faded');
        }, 2000);
    });

    // ===== Toolbar drag (repositions chrome, clamped to root bounds + gutter) =====
    if (savedChromePosition) {
        els.chrome.style.right = 'auto';
        els.chrome.style.left = `${savedChromePosition.left}px`;
        els.chrome.style.top = `${savedChromePosition.top}px`;
    }

    let chromeDragStart: {
        pointerX: number;
        pointerY: number;
        chromeLeft: number;
        chromeTop: number;
    } | null = null;

    function getGutter(): number {
        const val = getComputedStyle(rootEl).getPropertyValue('--nl-preview-gutter').trim();
        return parseInt(val) || 8;
    }

    function clampChromeIntoView(): void {
        if (els.chrome.style.left === '') return;
        const g = getGutter();
        const rawLeft = parseInt(els.chrome.style.left, 10) || 0;
        const rawTop = parseInt(els.chrome.style.top, 10) || 0;
        const maxLeft = Math.max(g, rootEl.clientWidth - els.chrome.offsetWidth - g);
        const maxTop = Math.max(g, rootEl.clientHeight - els.chrome.offsetHeight - g);
        els.chrome.style.left = `${Math.max(g, Math.min(rawLeft, maxLeft))}px`;
        els.chrome.style.top = `${Math.max(g, Math.min(rawTop, maxTop))}px`;
    }

    function ensureChromeLeftTopAnchoring(): void {
        if (els.chrome.style.left !== '') return;
        els.chrome.style.right = 'auto';
        els.chrome.style.left = `${els.chrome.offsetLeft}px`;
        els.chrome.style.top = `${els.chrome.offsetTop}px`;
    }

    on<PointerEvent>(els.toolbarHandle, 'pointerdown', (e) => {
        e.preventDefault();
        ensureChromeLeftTopAnchoring();
        chromeDragStart = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            chromeLeft: parseInt(els.chrome.style.left, 10) || 0,
            chromeTop: parseInt(els.chrome.style.top, 10) || 0,
        };
        els.chrome.classList.add('dragging');
        els.toolbarHandle.setPointerCapture(e.pointerId);
    });

    on<PointerEvent>(els.toolbarHandle, 'pointermove', (e) => {
        if (!chromeDragStart) return;
        const dx = e.clientX - chromeDragStart.pointerX;
        const dy = e.clientY - chromeDragStart.pointerY;
        const rawLeft = chromeDragStart.chromeLeft + dx;
        const rawTop = chromeDragStart.chromeTop + dy;
        const g = getGutter();
        const maxLeft = Math.max(g, rootEl.clientWidth - els.chrome.offsetWidth - g);
        const maxTop = Math.max(g, rootEl.clientHeight - els.chrome.offsetHeight - g);
        els.chrome.style.left = `${Math.max(g, Math.min(rawLeft, maxLeft))}px`;
        els.chrome.style.top = `${Math.max(g, Math.min(rawTop, maxTop))}px`;
    });

    function endChromeDrag(): void {
        if (!chromeDragStart) return;
        chromeDragStart = null;
        els.chrome.classList.remove('dragging');
        savedChromePosition = {
            left: parseInt(els.chrome.style.left, 10) || 0,
            top: parseInt(els.chrome.style.top, 10) || 0,
        };
    }

    on<PointerEvent>(els.toolbarHandle, 'pointerup', endChromeDrag);
    on<PointerEvent>(els.toolbarHandle, 'pointercancel', () => {
        chromeDragStart = null;
        els.chrome.classList.remove('dragging');
    });

    // ===== Transform =====
    function applyTransform(): void {
        const w = Math.max(1, Math.round(state.naturalWidth * state.scale));
        const h = Math.max(1, Math.round(state.naturalHeight * state.scale));
        els.canvas.style.width = `${w}px`;
        els.canvas.style.height = `${h}px`;
        els.zoomReset.textContent = `${Math.round(state.scale * 100)}%`;
        updateMinimapRect();
        updateMinimapVisibility();
    }

    function clampScale(s: number): number {
        if (s < 0.05) return 0.05;
        if (s > 20) return 20;
        return s;
    }

    function setScale(newScale: number, anchorX?: number, anchorY?: number): void {
        const clamped = clampScale(newScale);
        if (anchorX === undefined || anchorY === undefined || state.scale === 0) {
            state.scale = clamped;
            applyTransform();
            return;
        }
        const ratio = clamped / state.scale;
        const newScrollX = (els.viewport.scrollLeft + anchorX) * ratio - anchorX;
        const newScrollY = (els.viewport.scrollTop + anchorY) * ratio - anchorY;
        state.scale = clamped;
        applyTransform();
        els.viewport.scrollLeft = newScrollX;
        els.viewport.scrollTop = newScrollY;
    }

    function fitPage(): void {
        if (!state.naturalWidth || !state.naturalHeight) return;
        state.activeFit = 'fitPage';
        state.isDirty = false;
        const sx = els.viewport.clientWidth / state.naturalWidth;
        const sy = els.viewport.clientHeight / state.naturalHeight;
        setScale(Math.min(sx, sy));
        els.viewport.scrollLeft = 0;
        els.viewport.scrollTop = 0;
    }

    function fitWidth(): void {
        if (!state.naturalWidth) return;
        state.activeFit = 'fitWidth';
        state.isDirty = false;
        setScale(els.viewport.clientWidth / state.naturalWidth);
        els.viewport.scrollLeft = 0;
        els.viewport.scrollTop = 0;
    }

    function actualSize(): void {
        state.activeFit = 'manual';
        state.isDirty = true;
        setScale(1);
    }

    function applyDefaultFit(): void {
        if (state.defaultFit === 'fitWidth') fitWidth();
        else if (state.defaultFit === 'actual') actualSize();
        else fitPage();
    }

    function reapplyActiveFit(): void {
        const newW = els.viewport.clientWidth;
        const newH = els.viewport.clientHeight;

        if (state.isDirty) {
            const oldW = state.lastViewportWidth || newW;
            const oldH = state.lastViewportHeight || newH;
            if (state.scale > 0 && (oldW !== newW || oldH !== newH)) {
                const cx = (els.viewport.scrollLeft + oldW / 2) / state.scale;
                const cy = (els.viewport.scrollTop + oldH / 2) / state.scale;
                els.viewport.scrollLeft = Math.max(0, cx * state.scale - newW / 2);
                els.viewport.scrollTop = Math.max(0, cy * state.scale - newH / 2);
            }
        } else if (state.activeFit === 'fitPage') {
            fitPage();
        } else if (state.activeFit === 'fitWidth') {
            fitWidth();
        }

        state.lastViewportWidth = newW;
        state.lastViewportHeight = newH;
    }

    // ===== Render handling =====
    function extractNaturalSize(svgEl: SVGSVGElement): void {
        let w = 0;
        let h = 0;
        if (svgEl.viewBox?.baseVal?.width) {
            w = svgEl.viewBox.baseVal.width;
            h = svgEl.viewBox.baseVal.height;
        }
        if (!w && svgEl.width?.baseVal?.value) {
            w = svgEl.width.baseVal.value;
        }
        if (!h && svgEl.height?.baseVal?.value) {
            h = svgEl.height.baseVal.value;
        }
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
        if (!svgEl.getAttribute('viewBox') && w && h) {
            svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        state.naturalWidth = w || 800;
        state.naturalHeight = h || 600;
    }

    function setSvg(svgString: string): void {
        state.svgString = svgString;
        els.canvas.innerHTML = svgString;
        const svgEl = els.canvas.querySelector('svg') as SVGSVGElement | null;
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

    function showSvgMode(): void {
        els.empty.classList.add('hidden');
        els.canvas.classList.remove('dimmed');
        els.diagnostics.classList.remove('show');
    }

    function showDiagnosticsMode(rows: DiagnosticRow[]): void {
        els.empty.classList.add('hidden');
        if (state.svgString) {
            els.canvas.classList.add('dimmed');
        }
        populateDiagnostics(rows);
        els.diagnostics.classList.add('show');
    }

    function showFatal(message: string): void {
        const fakeRow: DiagnosticRow = {
            severity: 'error',
            code: 'preview-error',
            message,
            file: '',
            line: 1,
            column: 1,
        };
        showDiagnosticsMode([fakeRow]);
    }

    // ===== Diagnostics table =====
    function populateDiagnostics(rows: DiagnosticRow[]): void {
        let errors = 0;
        let warnings = 0;
        for (const r of rows) {
            if (r.severity === 'warning') warnings++;
            else errors++;
        }
        let summary = '';
        if (errors) summary += `${errors}${errors === 1 ? ' error' : ' errors'}`;
        if (errors && warnings) summary += ', ';
        if (warnings) summary += `${warnings}${warnings === 1 ? ' warning' : ' warnings'}`;
        if (!summary) summary = 'No problems';
        els.diagSummary.textContent = summary;
        els.diagSummary.className = 'diag-summary';
        if (!errors && warnings) els.diagSummary.classList.add('warn-only');
        if (!errors && !warnings) els.diagSummary.classList.add('clean');

        // Hide Open Problems link when there are no issues
        els.openProblems.hidden = errors + warnings === 0;

        const tbody = els.diagTbody;
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        for (const r of rows) {
            const tr = doc.createElement('tr');
            tr.dataset.file = r.file || '';
            tr.dataset.line = String(r.line);
            tr.dataset.column = String(r.column);

            const sevTd = doc.createElement('td');
            sevTd.className = `sev-cell ${r.severity === 'warning' ? 'sev-warning' : 'sev-error'}`;
            sevTd.textContent = r.severity === 'warning' ? '\u26A0' : '!';
            tr.appendChild(sevTd);

            const locTd = doc.createElement('td');
            locTd.className = 'loc-cell';
            locTd.textContent = `Ln ${r.line}, ${r.column}`;
            tr.appendChild(locTd);

            const codeTd = doc.createElement('td');
            codeTd.className = 'code-cell';
            const pill = doc.createElement('span');
            pill.className = 'code-pill';
            pill.textContent = r.code;
            codeTd.appendChild(pill);
            tr.appendChild(codeTd);

            const msgTd = doc.createElement('td');
            msgTd.className = 'msg-cell';
            msgTd.textContent = r.message;
            if (r.suggestion) {
                const sg = doc.createElement('span');
                sg.className = 'suggestion';
                sg.textContent = `Did you mean '${r.suggestion}'?`;
                msgTd.appendChild(sg);
            }
            tr.appendChild(msgTd);
            tbody.appendChild(tr);
        }
    }

    on(els.diagTbody, 'click', (e: Event) => {
        const target = e.target as HTMLElement | null;
        const tr = target?.closest('tr') as HTMLTableRowElement | null;
        if (!tr) return;
        options.onGoto?.({
            file: tr.dataset.file ?? '',
            line: Number.parseInt(tr.dataset.line ?? '1', 10) || 1,
            column: Number.parseInt(tr.dataset.column ?? '1', 10) || 1,
        });
    });

    on(els.openProblems, 'click', (e: Event) => {
        e.preventDefault();
        options.onOpenProblems?.();
    });

    // ===== Minimap =====
    function rebuildMinimap(svgString: string): void {
        if (!els.minimapCanvas) return;
        els.minimapCanvas.innerHTML = svgString;
        const svgEl = els.minimapCanvas.querySelector('svg');
        if (svgEl) {
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            if (state.naturalWidth && state.naturalHeight && !svgEl.getAttribute('viewBox')) {
                svgEl.setAttribute('viewBox', `0 0 ${state.naturalWidth} ${state.naturalHeight}`);
            }
            svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
        const maxW = 120;
        const maxH = 90;
        if (state.naturalWidth && state.naturalHeight) {
            const ratio = state.naturalWidth / state.naturalHeight;
            let w = maxW;
            let h = maxW / ratio;
            if (h > maxH) {
                h = maxH;
                w = maxH * ratio;
            }
            els.minimap.style.width = `${Math.round(w)}px`;
            (els.minimapCanvas as HTMLElement).style.height = `${Math.round(h)}px`;
        }
    }

    function updateMinimapRect(): void {
        if (els.minimap.classList.contains('hidden')) return;
        const totalW = state.naturalWidth * state.scale;
        const totalH = state.naturalHeight * state.scale;
        if (!totalW || !totalH) return;
        const miniW = els.minimapCanvas.clientWidth;
        const miniH = els.minimapCanvas.clientHeight;
        const rectW = Math.min(1, els.viewport.clientWidth / totalW) * miniW;
        const rectH = Math.min(1, els.viewport.clientHeight / totalH) * miniH;
        const rectX = (els.viewport.scrollLeft / totalW) * miniW;
        const rectY = (els.viewport.scrollTop / totalH) * miniH;
        els.minimapRect.style.left = `${els.minimapCanvas.offsetLeft + rectX}px`;
        els.minimapRect.style.top = `${els.minimapCanvas.offsetTop + rectY}px`;
        els.minimapRect.style.width = `${rectW}px`;
        els.minimapRect.style.height = `${rectH}px`;
    }

    function updateMinimapVisibility(): void {
        if (!state.showMinimap || state.minimapDismissedThisSession) {
            els.minimap.classList.add('hidden');
            return;
        }
        const totalW = state.naturalWidth * state.scale;
        const totalH = state.naturalHeight * state.scale;
        const fits =
            totalW <= els.viewport.clientWidth + 1 && totalH <= els.viewport.clientHeight + 1;
        if (fits) {
            els.minimap.classList.add('hidden');
        } else {
            els.minimap.classList.remove('hidden');
        }
    }

    on(els.minimapClose, 'click', (e: Event) => {
        e.stopPropagation();
        state.minimapDismissedThisSession = true;
        els.minimap.classList.add('hidden');
    });

    function panToMinimapPoint(clientX: number, clientY: number): void {
        const rect = els.minimapCanvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const totalW = state.naturalWidth * state.scale;
        const totalH = state.naturalHeight * state.scale;
        els.viewport.scrollLeft = Math.max(0, x * totalW - els.viewport.clientWidth / 2);
        els.viewport.scrollTop = Math.max(0, y * totalH - els.viewport.clientHeight / 2);
    }

    let miniDragging = false;
    on(els.minimapCanvas, 'mousedown', (e: MouseEvent) => {
        miniDragging = true;
        panToMinimapPoint(e.clientX, e.clientY);
        e.preventDefault();
    });
    on(doc, 'mousemove', (e: MouseEvent) => {
        if (miniDragging) panToMinimapPoint(e.clientX, e.clientY);
    });
    on(doc, 'mouseup', () => {
        miniDragging = false;
    });

    on(els.viewport, 'scroll', updateMinimapRect);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    function handleResize(): void {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            reapplyActiveFit();
            updateMinimapRect();
            updateMinimapVisibility();
            clampChromeIntoView();
        }, 50);
    }

    on(win, 'resize', handleResize);

    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(handleResize);
        ro.observe(els.viewport);
        cleanups.push(() => ro.disconnect());
    }

    // ===== Wheel zoom =====
    on(
        els.viewport,
        'wheel',
        (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            state.activeFit = 'manual';
            state.isDirty = true;
            const rect = els.viewport.getBoundingClientRect();
            const anchorX = e.clientX - rect.left;
            const anchorY = e.clientY - rect.top;
            const factor = Math.exp(-e.deltaY * 0.01);
            setScale(state.scale * factor, anchorX, anchorY);
        },
        { passive: false },
    );

    // ===== Spacebar pan + keyboard fit presets =====
    let spaceDown = false;
    let dragOrigin: { x: number; y: number; sx: number; sy: number } | null = null;
    function isInputFocus(target: EventTarget | null): boolean {
        if (!target) return false;
        const el = target as HTMLElement;
        if (!el.tagName) return false;
        const t = el.tagName.toUpperCase();
        return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable;
    }
    on(doc, 'keydown', (e: KeyboardEvent) => {
        if (isInputFocus(e.target)) return;
        if (e.key === ' ' && !spaceDown) {
            spaceDown = true;
            els.viewport.style.cursor = 'grab';
            e.preventDefault();
        } else if (e.key === '1') {
            fitPage();
        } else if (e.key === '2') {
            actualSize();
        } else if (e.key === '3') {
            fitWidth();
        } else if (e.key === '0') {
            fitPage();
        }
    });
    on(doc, 'keyup', (e: KeyboardEvent) => {
        if (e.key === ' ') {
            spaceDown = false;
            els.viewport.style.cursor = '';
        }
    });
    on(els.viewport, 'mousedown', (e: MouseEvent) => {
        if (!spaceDown) return;
        state.isDirty = true;
        dragOrigin = {
            x: e.clientX,
            y: e.clientY,
            sx: els.viewport.scrollLeft,
            sy: els.viewport.scrollTop,
        };
        els.viewport.style.cursor = 'grabbing';
        e.preventDefault();
    });
    on(doc, 'mousemove', (e: MouseEvent) => {
        if (!dragOrigin) return;
        els.viewport.scrollLeft = dragOrigin.sx - (e.clientX - dragOrigin.x);
        els.viewport.scrollTop = dragOrigin.sy - (e.clientY - dragOrigin.y);
    });
    on(doc, 'mouseup', () => {
        if (dragOrigin) {
            dragOrigin = null;
            els.viewport.style.cursor = spaceDown ? 'grab' : '';
        }
    });

    // ===== Toolbar buttons =====
    on(els.zoomOut, 'click', () => {
        state.activeFit = 'manual';
        state.isDirty = true;
        setScale(state.scale / 1.1);
    });
    on(els.zoomIn, 'click', () => {
        state.activeFit = 'manual';
        state.isDirty = true;
        setScale(state.scale * 1.1);
    });
    on(els.zoomReset, 'click', actualSize);
    on(els.fitPage, 'click', fitPage);

    // ===== Menu state helpers =====
    function closeSubMenus(): void {
        els.formatMenu.hidden = true;
        els.themeMenu.hidden = true;
        els.nowPicker.hidden = true;
        els.linksMenu.hidden = true;
    }

    function closeAllMenus(): void {
        els.moreMenu.hidden = true;
        closeSubMenus();
    }

    on(doc, 'click', closeAllMenus);
    on(els.moreMenu, 'click', (e: Event) => e.stopPropagation());

    // ===== More-menu toggle =====
    on(els.moreToggle, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        const opening = els.moreMenu.hidden;
        closeAllMenus();
        if (opening) els.moreMenu.hidden = false;
    });

    // ===== Format dropdown =====
    on(els.formatToggle, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        const opening = els.formatMenu.hidden;
        closeSubMenus();
        if (opening) els.formatMenu.hidden = false;
    });

    on(els.formatMenu, 'click', (e: Event) => {
        e.stopPropagation();
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.format-opt');
        if (!btn) return;
        const value = btn.getAttribute('data-value') as 'svg' | 'png' | null;
        if (!value) return;
        state.export.format = value;
        refreshFormatToggle();
        els.formatMenu.hidden = true;
    });

    function refreshFormatToggle(): void {
        els.formatToggle.textContent = `${state.export.format.toUpperCase()} \u25be`;
        for (const btn of Array.from(
            els.formatMenu.querySelectorAll<HTMLButtonElement>('.format-opt'),
        )) {
            btn.setAttribute(
                'data-active',
                (btn.getAttribute('data-value') === state.export.format).toString(),
            );
        }
    }

    // ===== Copy / export actions =====
    on(els.copyAction, 'click', () => {
        closeAllMenus();
        void handleExportAction(`copy-${state.export.format}`);
    });

    on(els.exportAction, 'click', () => {
        closeAllMenus();
        void handleExportAction(`save-${state.export.format}`);
    });

    async function handleExportAction(action: string): Promise<void> {
        if (!state.svgString) return;
        try {
            if (action === 'save-svg') {
                options.onSave?.({ format: 'svg', body: state.svgString });
            } else if (action === 'copy-svg') {
                try {
                    await win.navigator.clipboard.writeText(state.svgString);
                } catch (err) {
                    options.onFatal?.(`Copy SVG failed: ${(err as Error).message}`);
                }
            } else if (action === 'save-png') {
                const blob = await rasterizePng();
                const buf = await blob.arrayBuffer();
                options.onSave?.({ format: 'png', body: new Uint8Array(buf) });
            } else if (action === 'copy-png') {
                const blob = await rasterizePng();
                const ClipboardItemCtor = (win as typeof window).ClipboardItem as
                    | typeof ClipboardItem
                    | undefined;
                if (typeof ClipboardItemCtor === 'undefined' || !win.navigator.clipboard?.write) {
                    const buf = await blob.arrayBuffer();
                    options.onCopyPngFallback?.(new Uint8Array(buf));
                    return;
                }
                try {
                    await win.navigator.clipboard.write([
                        new ClipboardItemCtor({ 'image/png': blob }),
                    ]);
                } catch {
                    const buf = await blob.arrayBuffer();
                    options.onCopyPngFallback?.(new Uint8Array(buf));
                }
            }
        } catch (err) {
            options.onFatal?.(`PNG render failed: ${(err as Error).message}`);
        }
    }

    function rasterizePng(): Promise<Blob> {
        return new Promise<Blob>((resolve, reject) => {
            if (!state.svgString) {
                reject(new Error('No diagram to rasterize.'));
                return;
            }
            const blob = new Blob([state.svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = (win as typeof window).URL.createObjectURL(blob);
            const img = new (win as typeof window).Image();
            img.onload = () => {
                try {
                    const dpr = (win as typeof window).devicePixelRatio || 1;
                    const w = state.naturalWidth || img.naturalWidth || 800;
                    const h = state.naturalHeight || img.naturalHeight || 600;
                    const canvas = doc.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(w * dpr));
                    canvas.height = Math.max(1, Math.round(h * dpr));
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('2D canvas context unavailable.');
                    ctx.scale(dpr, dpr);
                    ctx.drawImage(img, 0, 0, w, h);
                    (win as typeof window).URL.revokeObjectURL(url);
                    canvas.toBlob((out) => {
                        if (out) resolve(out);
                        else reject(new Error('canvas.toBlob returned null.'));
                    }, 'image/png');
                } catch (err) {
                    (win as typeof window).URL.revokeObjectURL(url);
                    reject(err);
                }
            };
            img.onerror = () => {
                (win as typeof window).URL.revokeObjectURL(url);
                reject(new Error('Failed to load SVG into <img> for rasterization.'));
            };
            img.src = url;
        });
    }

    // ===== Theme dropdown =====
    function buildThemeMenu(themes: string[]): void {
        els.themeMenu.innerHTML = '';

        const autoLi = doc.createElement('li');
        const autoBtn = doc.createElement('button');
        autoBtn.className = 'btn theme-opt';
        autoBtn.setAttribute('data-value', 'auto');
        autoBtn.textContent = 'Auto';
        autoLi.appendChild(autoBtn);
        els.themeMenu.appendChild(autoLi);

        for (const theme of themes) {
            const li = doc.createElement('li');
            const btn = doc.createElement('button');
            btn.className = 'btn theme-opt';
            btn.setAttribute('data-value', theme);
            const chip = doc.createElement('code');
            chip.className = 'code-chip';
            chip.textContent = theme;
            btn.appendChild(chip);
            li.appendChild(btn);
            els.themeMenu.appendChild(li);
        }

        refreshThemeToggle();
    }

    on(els.themeToggle, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        const opening = els.themeMenu.hidden;
        closeSubMenus();
        if (opening) els.themeMenu.hidden = false;
    });

    on(els.themeMenu, 'click', (e: Event) => {
        e.stopPropagation();
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.theme-opt');
        if (!btn) return;
        const value = btn.getAttribute('data-value');
        if (!value) return;
        state.view.theme = value as ThemeOverride;
        state.view.overridden.theme = true;
        refreshThemeToggle();
        els.themeMenu.hidden = true;
        postViewOverrides();
    });

    function refreshThemeToggle(): void {
        if (state.view.theme === 'auto') {
            els.themeToggle.textContent = `Auto \u25be`;
        } else {
            els.themeToggle.innerHTML = '';
            const chip = doc.createElement('code');
            chip.className = 'code-chip';
            chip.textContent = state.view.theme;
            els.themeToggle.appendChild(chip);
            els.themeToggle.appendChild(doc.createTextNode(` \u25be`));
        }
        for (const btn of Array.from(
            els.themeMenu.querySelectorAll<HTMLButtonElement>('.theme-opt'),
        )) {
            btn.setAttribute(
                'data-active',
                (btn.getAttribute('data-value') === state.view.theme).toString(),
            );
        }
    }

    // ===== Now picker (calendar) =====
    let calendarYear = new Date().getFullYear();
    let calendarMonth = new Date().getMonth();

    function buildCalendar(): void {
        const picker = els.nowPicker;
        picker.innerHTML = '';
        const year = calendarYear;
        const month = calendarMonth;

        const nav = doc.createElement('div');
        nav.className = 'cal-nav';

        const prevBtn = doc.createElement('button');
        prevBtn.className = 'btn cal-nav-btn';
        prevBtn.textContent = '\u2039';
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            calendarMonth--;
            if (calendarMonth < 0) {
                calendarMonth = 11;
                calendarYear--;
            }
            buildCalendar();
        });

        const heading = doc.createElement('span');
        heading.className = 'cal-heading';
        heading.textContent = new Intl.DateTimeFormat(state.locale, {
            month: 'long',
            year: 'numeric',
        }).format(new Date(year, month, 1));

        const nextBtn = doc.createElement('button');
        nextBtn.className = 'btn cal-nav-btn';
        nextBtn.textContent = '\u203a';
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            calendarMonth++;
            if (calendarMonth > 11) {
                calendarMonth = 0;
                calendarYear++;
            }
            buildCalendar();
        });

        nav.appendChild(prevBtn);
        nav.appendChild(heading);
        nav.appendChild(nextBtn);
        picker.appendChild(nav);

        const grid = doc.createElement('div');
        grid.className = 'cal-grid';

        for (const d of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']) {
            const cell = doc.createElement('span');
            cell.className = 'cal-dow';
            cell.textContent = d;
            grid.appendChild(cell);
        }

        const firstDow = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDow; i++) {
            const empty = doc.createElement('span');
            empty.className = 'cal-empty';
            grid.appendChild(empty);
        }

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const btn = doc.createElement('button');
            btn.className = 'btn cal-day';
            btn.textContent = String(d);
            if (dateStr === todayStr) btn.classList.add('is-today');
            if (state.view.now === dateStr) btn.classList.add('is-selected');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                applyNow(dateStr);
            });
            grid.appendChild(btn);
        }

        picker.appendChild(grid);

        const footer = doc.createElement('div');
        footer.className = 'cal-footer';

        const todayBtnEl = doc.createElement('button');
        todayBtnEl.className = 'btn cal-footer-btn';
        todayBtnEl.textContent = 'Today';
        todayBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            applyNow('today');
        });

        const noneBtnEl = doc.createElement('button');
        noneBtnEl.className = 'btn cal-footer-btn';
        noneBtnEl.textContent = 'None';
        noneBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            applyNow('hide');
        });

        footer.appendChild(todayBtnEl);
        footer.appendChild(noneBtnEl);
        picker.appendChild(footer);
    }

    function applyNow(value: NowOverride): void {
        state.view.now = value;
        state.view.overridden.now = true;
        refreshNowToggle();
        els.nowPicker.hidden = true;
        postViewOverrides();
    }

    on(els.nowToggle, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        const opening = els.nowPicker.hidden;
        closeSubMenus();
        if (opening) {
            buildCalendar();
            els.nowPicker.hidden = false;
        }
    });

    function refreshNowToggle(): void {
        let label: string;
        if (state.view.now === 'today') {
            label = 'Today';
        } else if (state.view.now === 'hide') {
            label = 'None';
        } else {
            try {
                label = new Intl.DateTimeFormat(state.locale, { dateStyle: 'medium' }).format(
                    new Date(`${state.view.now}T00:00:00`),
                );
            } catch {
                label = state.view.now;
            }
        }
        els.nowLabel.textContent = label;
    }

    // ===== Show-links dropdown =====
    on(els.linksToggle, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        const opening = els.linksMenu.hidden;
        closeSubMenus();
        if (opening) els.linksMenu.hidden = false;
    });

    on(els.linksMenu, 'click', (e: Event) => {
        e.stopPropagation();
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.links-opt');
        if (!btn) return;
        const value = btn.getAttribute('data-value');
        if (value === null) return;
        state.view.showLinks = value === 'true';
        state.view.overridden.showLinks = true;
        refreshLinksToggle();
        els.linksMenu.hidden = true;
        postViewOverrides();
    });

    function refreshLinksToggle(): void {
        els.linksToggle.textContent = `${state.view.showLinks ? 'Yes' : 'No'} \u25be`;
        for (const btn of Array.from(
            els.linksMenu.querySelectorAll<HTMLButtonElement>('.links-opt'),
        )) {
            btn.setAttribute(
                'data-active',
                (btn.getAttribute('data-value') === (state.view.showLinks ? 'true' : 'false')).toString(),
            );
        }
    }

    // ===== View-options helpers =====
    function postViewOverrides(): void {
        const overrides: ViewOptionsOverrides = {};
        if (state.view.overridden.theme) overrides.theme = state.view.theme;
        if (state.view.overridden.now) overrides.now = state.view.now;
        if (state.view.overridden.showLinks) overrides.showLinks = state.view.showLinks;
        options.onViewOptions?.(overrides);
    }

    function refreshAll(): void {
        refreshThemeToggle();
        refreshNowToggle();
        refreshLinksToggle();
        refreshFormatToggle();
    }

    // ===== Theme control visibility =====
    if (options.themeControl === 'hide') {
        const themeRow = els.themeMenu.closest<HTMLElement>('.theme-control-row');
        if (themeRow) themeRow.style.display = 'none';
    }

    // ===== Apply initial theme menu + baselines =====
    buildThemeMenu(options.availableThemes ?? ['light', 'dark', 'greyscale']);

    if (options.viewBaseline) {
        applyBaseline(state, options.viewBaseline, true);
    }
    refreshAll();
    updateMinimapVisibility();

    // ===== Imperative API =====
    return {
        setSvg,
        setDiagnostics: showDiagnosticsMode,
        setFatal: showFatal,
        setViewBaseline(baseline, resetOverrides = false) {
            applyBaseline(state, baseline, resetOverrides);
            refreshAll();
        },
        setDefaultFit(fit) {
            state.defaultFit = fit;
        },
        setShowMinimap(show) {
            state.showMinimap = show;
            state.minimapDismissedThisSession = false;
            updateMinimapVisibility();
        },
        setMode(mode) {
            const resolved = mode === 'system' ? resolveSystemMode() : mode;
            applyMode(resolved);
        },
        setAvailableThemes(themes) {
            buildThemeMenu(themes);
        },
        setLocale(locale) {
            state.locale = locale;
            refreshNowToggle();
        },
        fitPage,
        fitWidth,
        actualSize,
        getZoom() {
            return state.scale;
        },
        setZoom(scale) {
            state.activeFit = 'manual';
            state.isDirty = true;
            setScale(scale);
        },
        dispose() {
            if (fadeTimer) clearTimeout(fadeTimer);
            if (resizeTimer) clearTimeout(resizeTimer);
            for (const c of cleanups) c();
            cleanups.length = 0;
            rootEl.classList.remove('nl-preview-root');
            rootEl.removeAttribute('data-nl-mode');
            rootEl.innerHTML = '';
        },
    };
}

function applyBaseline(
    state: InternalState,
    baseline: ViewBaseline,
    resetOverrides: boolean,
): void {
    if (baseline.theme && !state.view.overridden.theme) {
        state.view.theme = baseline.theme;
    }
    if (baseline.now !== undefined && !state.view.overridden.now) {
        if (baseline.now === 'none' || baseline.now === 'hide') {
            state.view.now = 'hide';
        } else if (
            typeof baseline.now === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(baseline.now)
        ) {
            state.view.now = baseline.now;
        } else {
            state.view.now = 'today';
        }
    }
    if (baseline.showLinks !== undefined && !state.view.overridden.showLinks) {
        state.view.showLinks = baseline.showLinks !== false;
    }
    if (resetOverrides) {
        state.view.overridden = { theme: false, now: false, showLinks: false };
    }
}

/**
 * Test-only helper. Clears the module-level latch that prevents the
 * stylesheet from being mounted twice. Vitest reuses module instances
 * across tests, so without this every test after the first one would
 * skip writing the stylesheet into the test document.
 */
export function __resetPreviewShellStylesheetForTests(): void {
    stylesheetMounted = false;
}
