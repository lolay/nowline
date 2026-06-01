import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPreviewShellStylesheetForTests,
    type DiagnosticRow,
    mountPreview,
} from '../src/index.js';

const SAMPLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#333"/></svg>';

const SAMPLE_DIAGNOSTIC: DiagnosticRow = {
    severity: 'error',
    code: 'parse-error',
    message: 'Unexpected token',
    file: '/workspace/sample.nowline',
    line: 12,
    column: 4,
};

function mountRoot(): HTMLElement {
    const root = document.createElement('div');
    root.style.width = '600px';
    root.style.height = '400px';
    document.body.appendChild(root);
    return root;
}

/**
 * happy-dom doesn't compute layout, so `clientWidth` / `clientHeight`
 * default to 0 on the synthetic viewport — fitPage / fitWidth then
 * collapse to the minimum scale clamp. Tests that exercise fit logic
 * stub the dimensions after mount so the math behaves as if the
 * viewport were laid out.
 */
function stubViewportDims(root: HTMLElement, width: number, height: number): void {
    const viewport = root.querySelector('.viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: height });
}

describe('mountPreview', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        __resetPreviewShellStylesheetForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('mounts the preview shell stylesheet exactly once across multiple mounts', () => {
        const a = mountRoot();
        const b = mountRoot();
        mountPreview(a);
        mountPreview(b);
        const styles = document.head.querySelectorAll('style[data-nl-preview-shell]');
        expect(styles.length).toBe(1);
    });

    it('defers to a host-injected stylesheet instead of adding a second (CSP-safe path)', () => {
        // A CSP-restricted consumer (the VS Code webview, whose
        // `style-src` is nonce-only) serves the shell CSS from its host
        // HTML with a nonce under the `data-nl-preview-shell` marker.
        // mountPreview must not append its own non-nonced copy, which
        // the CSP would refuse — leaving the toolbar unstyled.
        const hostStyle = document.createElement('style');
        hostStyle.setAttribute('data-nl-preview-shell', '');
        hostStyle.setAttribute('nonce', 'host-nonce');
        document.head.appendChild(hostStyle);

        mountPreview(mountRoot());

        const styles = document.head.querySelectorAll('style[data-nl-preview-shell]');
        expect(styles.length).toBe(1);
        expect(styles[0]).toBe(hostStyle);
    });

    it('renders the viewport scaffolding (toolbar, viewport, diagnostics) into the root', () => {
        const root = mountRoot();
        mountPreview(root);
        expect(root.classList.contains('nl-preview-root')).toBe(true);
        expect(root.querySelector('.viewport')).not.toBeNull();
        expect(root.querySelector('.canvas')).not.toBeNull();
        expect(root.querySelector('.chrome')).not.toBeNull();
        expect(root.querySelector('.diagnostics')).not.toBeNull();
        expect(root.querySelector('.minimap')).not.toBeNull();
    });

    it('setSvg injects markup into the canvas and switches to svg mode', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        const canvas = root.querySelector('.canvas');
        expect(canvas?.querySelector('svg')).not.toBeNull();
        const empty = root.querySelector('.empty');
        expect(empty?.classList.contains('hidden')).toBe(true);
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(false);
    });

    it('setDiagnostics switches to the diagnostics overlay and populates the table', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setDiagnostics([SAMPLE_DIAGNOSTIC]);
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(true);
        const rows = root.querySelectorAll('.diag-table tbody tr');
        expect(rows.length).toBe(1);
        const summary = root.querySelector('.diag-summary');
        expect(summary?.textContent).toContain('1 error');
    });

    it('clicking a diagnostic row fires onGoto with parsed line/column', () => {
        const root = mountRoot();
        const onGoto = vi.fn();
        const handle = mountPreview(root, { onGoto });
        handle.setDiagnostics([SAMPLE_DIAGNOSTIC]);
        const row = root.querySelector<HTMLTableRowElement>('.diag-table tbody tr');
        expect(row).not.toBeNull();
        row?.click();
        expect(onGoto).toHaveBeenCalledWith({
            file: '/workspace/sample.nowline',
            line: 12,
            column: 4,
        });
    });

    it('clicking the open-problems link fires onOpenProblems', () => {
        const root = mountRoot();
        const onOpenProblems = vi.fn();
        const handle = mountPreview(root, { onOpenProblems });
        handle.setDiagnostics([SAMPLE_DIAGNOSTIC]);
        const link = root.querySelector<HTMLAnchorElement>('.open-problems');
        link?.click();
        expect(onOpenProblems).toHaveBeenCalledTimes(1);
    });

    it('setZoom + getZoom round-trip the requested scale', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        handle.setZoom(1.5);
        expect(handle.getZoom()).toBeCloseTo(1.5, 5);
    });

    it('fitPage and fitWidth produce different zoom levels for a non-square SVG', () => {
        // 800x600 SVG into 600x400 viewport: fitPage min(0.75, 0.667) = 0.667,
        // fitWidth = 0.75.
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        stubViewportDims(root, 600, 400);
        handle.fitPage();
        const pageZoom = handle.getZoom();
        handle.fitWidth();
        const widthZoom = handle.getZoom();
        expect(widthZoom).toBeGreaterThan(pageZoom);
    });

    it('clamps zoom to the minimum scale floor', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        handle.setZoom(0.001);
        expect(handle.getZoom()).toBeGreaterThanOrEqual(0.05);
    });

    it('dispose removes the shell DOM and detaches listeners', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        expect(root.querySelector('.viewport')).not.toBeNull();
        handle.dispose();
        expect(root.classList.contains('nl-preview-root')).toBe(false);
        expect(root.innerHTML).toBe('');
    });

    it('Export SVG action fires onSave with the current SVG body', () => {
        const root = mountRoot();
        const onSave = vi.fn();
        const handle = mountPreview(root, { onSave });
        handle.setSvg(SAMPLE_SVG);
        // Default format is svg; clicking export-action fires save-svg
        const btn = root.querySelector<HTMLButtonElement>('.export-action');
        btn?.click();
        expect(onSave).toHaveBeenCalledTimes(1);
        const call = onSave.mock.calls[0][0];
        expect(call.format).toBe('svg');
        expect(call.body).toBe(SAMPLE_SVG);
    });

    it('view-options dropdown selection fires onViewOptions with only the overridden field', () => {
        const root = mountRoot();
        const onViewOptions = vi.fn();
        const handle = mountPreview(root, { onViewOptions });
        handle.setSvg(SAMPLE_SVG);
        // Open the more-menu, open the theme sub-menu, click light.
        const moreToggle = root.querySelector<HTMLButtonElement>('.more-toggle');
        moreToggle?.click();
        const themeToggle = root.querySelector<HTMLButtonElement>('.theme-toggle');
        themeToggle?.click();
        const lightBtn = root.querySelector<HTMLButtonElement>('.theme-opt[data-value="light"]');
        lightBtn?.click();
        expect(onViewOptions).toHaveBeenCalledTimes(1);
        expect(onViewOptions.mock.calls[0][0]).toEqual({ theme: 'light' });
    });

    it('keyboard preset 1 triggers fitPage', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        stubViewportDims(root, 600, 400);
        handle.setZoom(2);
        const event = new KeyboardEvent('keydown', { key: '1', bubbles: true });
        document.dispatchEvent(event);
        // fitPage on 800x600 in 600x400 viewport → min(0.75, 0.667) ≈ 0.667
        expect(handle.getZoom()).toBeLessThan(2);
    });

    it('keyboard preset 3 triggers fitWidth', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        stubViewportDims(root, 600, 400);
        handle.setZoom(0.1);
        const event = new KeyboardEvent('keydown', { key: '3', bubbles: true });
        document.dispatchEvent(event);
        expect(handle.getZoom()).toBeGreaterThan(0.1);
    });

    it('setFatal renders a single error row even without prior SVG', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setFatal('Boom — pipeline crashed');
        const rows = root.querySelectorAll('.diag-table tbody tr');
        expect(rows.length).toBe(1);
        const cell = rows[0].querySelector('.msg-cell');
        expect(cell?.textContent).toContain('Boom — pipeline crashed');
    });

    it('setViewBaseline updates the menu checkmarks without claiming user override', () => {
        const root = mountRoot();
        const onViewOptions = vi.fn();
        const handle = mountPreview(root, { onViewOptions });
        handle.setViewBaseline({ theme: 'dark' });
        const activeTheme = root.querySelector('.theme-opt[data-active="true"]');
        expect(activeTheme?.getAttribute('data-value')).toBe('dark');
        // Baseline propagation must NOT fire the override callback —
        // that would create a feedback loop with the consumer's option
        // resolver.
        expect(onViewOptions).not.toHaveBeenCalled();
    });

    // ===== Conditional open-problems visibility =====

    it('open-problems link is hidden when setDiagnostics receives zero rows', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setDiagnostics([]);
        const openProblems = root.querySelector<HTMLAnchorElement>('.open-problems')!;
        expect(openProblems.hidden).toBe(true);
        handle.dispose();
    });

    it('open-problems link is visible when diagnostics contain at least one error', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setDiagnostics([SAMPLE_DIAGNOSTIC]);
        const openProblems = root.querySelector<HTMLAnchorElement>('.open-problems')!;
        expect(openProblems.hidden).toBe(false);
        handle.dispose();
    });

    it('open-problems link is visible when diagnostics contain only warnings', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        const warnRow: DiagnosticRow = { ...SAMPLE_DIAGNOSTIC, severity: 'warning' };
        handle.setDiagnostics([warnRow]);
        const openProblems = root.querySelector<HTMLAnchorElement>('.open-problems')!;
        expect(openProblems.hidden).toBe(false);
        handle.dispose();
    });

    // ===== Now-override date passthrough =====

    function openNowPicker(root: HTMLElement): void {
        root.querySelector<HTMLButtonElement>('.more-toggle')?.click();
        root.querySelector<HTMLButtonElement>('.now-toggle')?.click();
    }

    it('calendar Today button fires onViewOptions with now: "today"', () => {
        const root = mountRoot();
        const onViewOptions = vi.fn();
        const handle = mountPreview(root, { onViewOptions });
        openNowPicker(root);
        const todayBtn = Array.from(
            root.querySelectorAll<HTMLButtonElement>('.cal-footer-btn'),
        ).find((b) => b.textContent === 'Today');
        expect(todayBtn).not.toBeNull();
        todayBtn?.click();
        expect(onViewOptions).toHaveBeenCalledTimes(1);
        expect(onViewOptions.mock.calls[0][0]).toEqual({ now: 'today' });
        handle.dispose();
    });

    it('calendar None button fires onViewOptions with now: "hide"', () => {
        const root = mountRoot();
        const onViewOptions = vi.fn();
        const handle = mountPreview(root, { onViewOptions });
        openNowPicker(root);
        const noneBtn = Array.from(
            root.querySelectorAll<HTMLButtonElement>('.cal-footer-btn'),
        ).find((b) => b.textContent === 'None');
        expect(noneBtn).not.toBeNull();
        noneBtn?.click();
        expect(onViewOptions).toHaveBeenCalledTimes(1);
        expect(onViewOptions.mock.calls[0][0]).toEqual({ now: 'hide' });
        handle.dispose();
    });

    it('calendar day click fires onViewOptions with a YYYY-MM-DD date string', () => {
        const root = mountRoot();
        const onViewOptions = vi.fn();
        const handle = mountPreview(root, { onViewOptions });
        openNowPicker(root);
        const dayBtn = root.querySelector<HTMLButtonElement>('.cal-day');
        expect(dayBtn).not.toBeNull();
        dayBtn?.click();
        expect(onViewOptions).toHaveBeenCalledTimes(1);
        const { now } = onViewOptions.mock.calls[0][0] as { now: string };
        expect(now).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        handle.dispose();
    });

    // ===== Clamp-on-resize math =====

    it('repositionChrome keeps the toolbar within the gutter-inset bounds after resize', () => {
        vi.useFakeTimers();
        const root = mountRoot();
        const handle = mountPreview(root);

        const chrome = root.querySelector<HTMLElement>('.chrome')!;

        // Stub layout dimensions that happy-dom cannot compute
        Object.defineProperty(root, 'clientWidth', { configurable: true, value: 400 });
        Object.defineProperty(root, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(chrome, 'offsetWidth', { configurable: true, value: 80 });
        Object.defineProperty(chrome, 'offsetHeight', { configurable: true, value: 40 });

        // Position chrome far outside the container
        chrome.style.left = '9999px';
        chrome.style.top = '9999px';

        // handleResize is debounced at 50 ms; advance past it
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(100);

        const gutter = 8; // parseInt('') || 8 when CSS var is unset
        const left = parseInt(chrome.style.left, 10);
        const top = parseInt(chrome.style.top, 10);
        const maxLeft = 400 - 80 - gutter; // 312
        const maxTop = 300 - 40 - gutter; // 252

        expect(left).toBeGreaterThanOrEqual(gutter);
        expect(left).toBeLessThanOrEqual(maxLeft);
        expect(top).toBeGreaterThanOrEqual(gutter);
        expect(top).toBeLessThanOrEqual(maxTop);

        handle.dispose();
    });

    it('shifts the right-pinned toolbar left as the viewport narrows (no squish)', () => {
        vi.useFakeTimers();
        const root = mountRoot();
        const handle = mountPreview(root);
        const chrome = root.querySelector<HTMLElement>('.chrome')!;

        Object.defineProperty(chrome, 'offsetWidth', { configurable: true, value: 200 });
        Object.defineProperty(chrome, 'offsetHeight', { configurable: true, value: 40 });

        Object.defineProperty(root, 'clientWidth', { configurable: true, value: 1000 });
        Object.defineProperty(root, 'clientHeight', { configurable: true, value: 600 });
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(100);
        const wideLeft = parseInt(chrome.style.left, 10);

        // Narrow the viewport: the toolbar must move left, not shrink.
        Object.defineProperty(root, 'clientWidth', { configurable: true, value: 500 });
        window.dispatchEvent(new Event('resize'));
        vi.advanceTimersByTime(100);
        const narrowLeft = parseInt(chrome.style.left, 10);

        expect(narrowLeft).toBeLessThan(wideLeft);
        expect(narrowLeft).toBeGreaterThanOrEqual(8);

        handle.dispose();
    });

    // ===== Fit-width button =====

    it('clicking the fit-width button widens an under-fit diagram (distinct from fit-page)', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        handle.setSvg(SAMPLE_SVG);
        stubViewportDims(root, 600, 400);

        root.querySelector<HTMLButtonElement>('.fit-page')?.click();
        const pageZoom = handle.getZoom();
        root.querySelector<HTMLButtonElement>('.fit-width')?.click();
        const widthZoom = handle.getZoom();

        // 800x600 into 600x400: fitWidth (0.75) > fitPage (0.667).
        expect(widthZoom).toBeGreaterThan(pageZoom);
        handle.dispose();
    });

    // ===== Collapse / restore =====

    it('collapse button adds the collapsed class; restore removes it', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        const chrome = root.querySelector<HTMLElement>('.chrome')!;

        expect(chrome.classList.contains('collapsed')).toBe(false);
        root.querySelector<HTMLButtonElement>('.collapse-btn')?.click();
        expect(chrome.classList.contains('collapsed')).toBe(true);
        root.querySelector<HTMLButtonElement>('.restore-btn')?.click();
        expect(chrome.classList.contains('collapsed')).toBe(false);

        handle.dispose();
    });
});
