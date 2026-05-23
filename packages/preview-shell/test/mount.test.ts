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
    });

    it('mounts the preview shell stylesheet exactly once across multiple mounts', () => {
        const a = mountRoot();
        const b = mountRoot();
        mountPreview(a);
        mountPreview(b);
        const styles = document.head.querySelectorAll('style[data-nl-preview-shell]');
        expect(styles.length).toBe(1);
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

    it('Save SVG action fires onSave with the current SVG body', () => {
        const root = mountRoot();
        const onSave = vi.fn();
        const handle = mountPreview(root, { onSave });
        handle.setSvg(SAMPLE_SVG);
        const btn = root.querySelector<HTMLButtonElement>('[data-action="save-svg"]');
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
        // Open the view menu, click Light theme.
        const toggle = root.querySelector<HTMLButtonElement>('.view-toggle');
        toggle?.click();
        const lightBtn = root.querySelector<HTMLButtonElement>(
            '.view-opt[data-opt="theme"][data-value="light"]',
        );
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
        const activeTheme = root.querySelector('.view-opt[data-opt="theme"][data-active="true"]');
        expect(activeTheme?.getAttribute('data-value')).toBe('dark');
        // Baseline propagation must NOT fire the override callback —
        // that would create a feedback loop with the consumer's option
        // resolver.
        expect(onViewOptions).not.toHaveBeenCalled();
    });
});
