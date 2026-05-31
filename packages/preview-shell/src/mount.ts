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

export type ThemeOverride = 'auto' | 'light' | 'dark';
export type NowOverride = 'today' | 'hide';
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
 * View-options overrides emitted when the user clicks the View ▾ menu.
 * Only fields the user explicitly chose are present; consumers merge
 * with their own option-resolution chain (settings, .nowlinerc, etc.).
 */
export interface ViewOptionsOverrides {
    theme?: ThemeOverride;
    now?: NowOverride;
    showLinks?: boolean;
}

/**
 * Baseline view state pushed by the consumer (e.g. when settings
 * change). The shell uses these to pre-fill the View menu's
 * checkmarks without claiming the option as user-overridden.
 */
export interface ViewBaseline {
    theme?: ThemeOverride;
    /** Maps to one of `today` | `hide` for the checkmark — host values like 'auto' / 'YYYY-MM-DD' collapse to 'today'. */
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
    onGoto?: (loc: DiagnosticGoto) => void;
    onOpenProblems?: () => void;
    onSave?: (req: ExportRequest) => void;
    onCopy?: (req: ExportRequest) => void;
    /**
     * Fired when the user toggles save-png / copy-png and the browser's
     * `navigator.clipboard.write` is unavailable. Consumers usually
     * pass the bytes off to a host-side fallback (write to a temp file
     * + notify) and pop a message describing what happened.
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
    /** Re-skin the view-menu baselines without claiming user overrides. */
    setViewBaseline(baseline: ViewBaseline, resetOverrides?: boolean): void;
    /** Update the "default fit" used by the next first-render. */
    setDefaultFit(fit: InitialFit): void;
    /** Toggle the minimap behaviour from the host. */
    setShowMinimap(show: boolean): void;
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
     * True once the user has manually zoomed, panned, or used zoom buttons —
     * i.e. the view is no longer governed by a fit preset. Drives the resize
     * focal-point strategy: when dirty the pre-resize viewport-centre content
     * point is preserved instead of refitting.
     */
    isDirty: boolean;
    /** Viewport dimensions as of the last handled resize, used for focal-point math. */
    lastViewportWidth: number;
    lastViewportHeight: number;
    showMinimap: boolean;
    minimapDismissedThisSession: boolean;
    firstRender: boolean;
    toolbarCollapsed: boolean;
    view: {
        theme: ThemeOverride;
        now: NowOverride;
        showLinks: boolean;
        overridden: { theme: boolean; now: boolean; showLinks: boolean };
    };
}

let stylesheetMounted = false;

/**
 * Last chrome position saved after a drag, shared across all shells in this
 * JS session. Persists for the lifetime of the page (no localStorage so it
 * doesn't leak across tabs or reloads).
 */
let savedChromePosition: { left: number; top: number } | null = null;

/**
 * Ensure the shared `<style>` block is in the document `<head>`. Safe
 * to call repeatedly — only the first call writes. The stylesheet
 * scopes every selector under `.nl-preview-root` so multiple shells
 * can coexist with workbench / app styles.
 */
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
        toolbarCollapsed: false,
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

    // ===== Toolbar fade =====
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    function showToolbar(): void {
        els.chrome.classList.remove('faded');
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => els.chrome.classList.add('faded'), 2000);
    }
    on(doc, 'mousemove', showToolbar);
    showToolbar();

    // ===== Toolbar collapse =====
    function applyToolbarCollapsed(collapsed: boolean): void {
        state.toolbarCollapsed = collapsed;
        els.toolbarBody.classList.toggle('collapsed', collapsed);
        els.toolbarCollapse.textContent = collapsed ? '»' : '«';
        els.toolbarCollapse.title = collapsed ? 'Expand toolbar' : 'Collapse toolbar';
        els.toolbarCollapse.setAttribute('aria-expanded', String(!collapsed));
    }
    on(els.toolbarCollapse, 'click', () => applyToolbarCollapsed(!state.toolbarCollapsed));

    // ===== Toolbar drag (repositions chrome, clamped to root bounds) =====
    // Restore last drag position from session if available.
    if (savedChromePosition) {
        els.chrome.style.right = 'auto';
        els.chrome.style.left = `${savedChromePosition.left}px`;
        els.chrome.style.top = `${savedChromePosition.top}px`;
    }

    let chromeDragStart: { pointerX: number; pointerY: number; chromeLeft: number; chromeTop: number } | null = null;

    function ensureChromeLeftTopAnchoring(): void {
        if (els.chrome.style.left !== '') return;
        // Switch from CSS right/top to explicit left/top so we can do pointer math.
        // offsetLeft/Top give the position relative to the offset parent
        // (nl-preview-root, which is position:relative).
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
        const maxLeft = Math.max(0, rootEl.clientWidth - els.chrome.offsetWidth);
        const maxTop = Math.max(0, rootEl.clientHeight - els.chrome.offsetHeight);
        els.chrome.style.left = `${Math.max(0, Math.min(rawLeft, maxLeft))}px`;
        els.chrome.style.top = `${Math.max(0, Math.min(rawTop, maxTop))}px`;
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
            // Preserve the content point that was at the centre of the viewport
            // before the resize instead of snapping scroll to origin.
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
        const maxW = 160;
        const maxH = 120;
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

    // Debounced resize handler — batches rapid resize events (e.g. splitter
    // drag) so reapplyActiveFit / minimap update only runs once the viewport
    // has settled, preventing thrash and unnecessary focal-point jumps.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    function handleResize(): void {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            reapplyActiveFit();
            updateMinimapRect();
            updateMinimapVisibility();
        }, 50);
    }

    on(win, 'resize', handleResize);

    // ResizeObserver picks up pane-level resizes (splitter drag, tab reveal)
    // that window 'resize' misses. Guarded for happy-dom / test environments.
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
    on(els.fitWidth, 'click', fitWidth);
    on(els.fitPage, 'click', fitPage);

    // ===== Dropdowns =====
    function setupDropdown(toggle: HTMLButtonElement, menu: HTMLUListElement): void {
        on(toggle, 'click', (e: MouseEvent) => {
            e.stopPropagation();
            els.saveMenu.hidden = true;
            els.copyMenu.hidden = true;
            els.viewMenu.hidden = true;
            menu.hidden = !menu.hidden;
        });
    }
    setupDropdown(els.viewToggle, els.viewMenu);
    setupDropdown(els.saveToggle, els.saveMenu);
    setupDropdown(els.copyToggle, els.copyMenu);
    on(doc, 'click', () => {
        els.saveMenu.hidden = true;
        els.copyMenu.hidden = true;
        els.viewMenu.hidden = true;
    });
    for (const m of [els.saveMenu, els.copyMenu, els.viewMenu]) {
        on(m, 'click', (e: Event) => e.stopPropagation());
    }

    // ===== View options =====
    function refreshViewMenu(): void {
        const items = els.viewMenu.querySelectorAll<HTMLButtonElement>('.view-opt');
        for (const item of Array.from(items)) {
            const opt = item.getAttribute('data-opt');
            const value = item.getAttribute('data-value');
            let active = false;
            if (opt === 'theme') active = state.view.theme === value;
            else if (opt === 'now') active = state.view.now === value;
            else if (opt === 'showLinks') active = state.view.showLinks;
            item.setAttribute('data-active', active ? 'true' : 'false');
        }
    }

    function postViewOverrides(): void {
        const overrides: ViewOptionsOverrides = {};
        if (state.view.overridden.theme) overrides.theme = state.view.theme;
        if (state.view.overridden.now) overrides.now = state.view.now;
        if (state.view.overridden.showLinks) overrides.showLinks = state.view.showLinks;
        options.onViewOptions?.(overrides);
    }

    on(els.viewMenu, 'click', (e: Event) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest('.view-opt') as HTMLButtonElement | null;
        if (!btn) return;
        const opt = btn.getAttribute('data-opt');
        const value = btn.getAttribute('data-value');
        if (opt === 'theme') {
            state.view.theme = value as ThemeOverride;
            state.view.overridden.theme = true;
        } else if (opt === 'now') {
            state.view.now = value as NowOverride;
            state.view.overridden.now = true;
        } else if (opt === 'showLinks') {
            state.view.showLinks = !state.view.showLinks;
            state.view.overridden.showLinks = true;
        }
        refreshViewMenu();
        els.viewMenu.hidden = true;
        postViewOverrides();
    });

    // ===== Save / copy actions =====
    const actionButtons = els.root.querySelectorAll<HTMLButtonElement>('[data-action]');
    for (const btn of Array.from(actionButtons)) {
        on(btn, 'click', () => {
            const action = btn.getAttribute('data-action');
            els.saveMenu.hidden = true;
            els.copyMenu.hidden = true;
            if (action) void handleExportAction(action);
        });
    }

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

    // ===== Apply initial baselines =====
    if (options.viewBaseline) {
        applyBaseline(state, options.viewBaseline, true);
        refreshViewMenu();
    } else {
        refreshViewMenu();
    }
    updateMinimapVisibility();

    // ===== Imperative API =====
    return {
        setSvg,
        setDiagnostics: showDiagnosticsMode,
        setFatal: showFatal,
        setViewBaseline(baseline, resetOverrides = false) {
            applyBaseline(state, baseline, resetOverrides);
            refreshViewMenu();
        },
        setDefaultFit(fit) {
            state.defaultFit = fit;
        },
        setShowMinimap(show) {
            state.showMinimap = show;
            state.minimapDismissedThisSession = false;
            updateMinimapVisibility();
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
        // Setting is 'auto'/'none'/YYYY-MM-DD; the toolbar only exposes
        // today/hide, so collapse anything that isn't 'none' to 'today'
        // for the displayed checkmark.
        state.view.now = baseline.now === 'none' ? 'hide' : 'today';
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
