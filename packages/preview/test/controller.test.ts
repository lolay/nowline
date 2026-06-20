import type { RenderResult } from '@nowline/browser';
import type { DiagnosticRow } from '@nowline/preview-shell';
import { __resetPreviewShellStylesheetForTests, mountPreview } from '@nowline/preview-shell';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LiveRenderOptions, mountLivePreview } from '../src/index.js';

const SAMPLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#333"/></svg>';

const ERROR_ROW: DiagnosticRow = {
    severity: 'error',
    code: 'parse-error',
    message: 'Unexpected token',
    file: '/src/roadmap.nowline',
    line: 1,
    column: 1,
};
const WARNING_ROW: DiagnosticRow = {
    severity: 'warning',
    code: 'render-warning',
    message: 'Unused label',
    file: '/src/roadmap.nowline',
    line: 5,
    column: 1,
};

const SVG_RESULT: RenderResult = { kind: 'svg', svg: SAMPLE_SVG, warnings: [] };
const ERROR_RESULT: RenderResult = { kind: 'diagnostics', diagnostics: [ERROR_ROW] };
const WARN_SVG_RESULT: RenderResult = { kind: 'svg', svg: SAMPLE_SVG, warnings: [WARNING_ROW] };

function mountRoot(): HTMLElement {
    const root = document.createElement('div');
    root.style.width = '600px';
    root.style.height = '400px';
    document.body.appendChild(root);
    return root;
}

describe('mountLivePreview', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        __resetPreviewShellStylesheetForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    // ===== Default render path =====

    it('calls the injected render fn with the initial source', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, { source: 'roadmap v1 ...', render });
        // flush the microtask queue
        await vi.waitUntil(() => render.mock.calls.length > 0);
        expect(render).toHaveBeenCalledOnce();
        expect(render.mock.calls[0][0]).toBe('roadmap v1 ...');
    });

    it('does not call render when source is empty', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, { source: '', render });
        await new Promise((r) => setTimeout(r, 10));
        expect(render).not.toHaveBeenCalled();
    });

    it('applies SVG to the handle for a successful render', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, { source: 'roadmap v1 ...', render });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        // slight settling time for the async apply
        await new Promise((r) => setTimeout(r, 10));
        const canvas = root.querySelector('.canvas');
        expect(canvas).not.toBeNull();
        // An SVG result means the canvas should show content, not diagnostics
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(false);
    });

    it('applies a diagnostics result via the default apply path', async () => {
        const render = vi.fn().mockResolvedValue(ERROR_RESULT);
        const root = mountRoot();
        mountLivePreview(root, { source: 'roadmap v1 ...', render });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        await new Promise((r) => setTimeout(r, 10));
        // A diagnostics-kind result routes through setDiagnostics, not setSvg
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(true);
    });

    // ===== Injected render fn =====

    it('uses the injected render fn instead of the default', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, { source: 'roadmap v1 title: Stub', render });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        expect(render).toHaveBeenCalledOnce();
        // The default renderSource should NOT have been imported/called — verified
        // by the fact that the injected fn was used (integration guard)
        const [_src, opts] = render.mock.calls[0] as [string, LiveRenderOptions];
        expect(typeof opts).toBe('object');
    });

    it('forwards renderOptions to the render fn', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            renderOptions: { width: 1920, locale: 'de-DE' },
        });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        const [_src, opts] = render.mock.calls[0] as [string, LiveRenderOptions];
        expect(opts.width).toBe(1920);
        expect(opts.locale).toBe('de-DE');
    });

    it('passes view state (theme, now, showLinks) through to the render fn', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            initialView: { theme: 'dark', now: 'hide', showLinks: false },
        });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        const [_src, opts] = render.mock.calls[0] as [string, LiveRenderOptions];
        expect((opts as { theme?: unknown }).theme).toBe('dark');
        expect((opts as { today?: unknown }).today).toBeNull();
        expect((opts as { showLinks?: unknown }).showLinks).toBe(false);
    });

    // ===== Custom apply policy =====

    it('uses the injected apply fn instead of the default', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const apply = vi.fn();
        const root = mountRoot();
        const lp = mountLivePreview(root, { source: 'roadmap v1 ...', render, apply });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        await new Promise((r) => setTimeout(r, 10));
        expect(apply).toHaveBeenCalledOnce();
        expect(apply.mock.calls[0][0]).toBe(lp.handle);
        expect(apply.mock.calls[0][1]).toEqual(SVG_RESULT);
    });

    it('custom apply receives warnings-alongside-svg result unchanged', async () => {
        const render = vi.fn().mockResolvedValue(WARN_SVG_RESULT);
        const apply = vi.fn();
        const root = mountRoot();
        mountLivePreview(root, { source: 'roadmap v1 ...', render, apply });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        await new Promise((r) => setTimeout(r, 10));
        // custom apply receives the raw RenderResult — it decides what to do
        expect(apply.mock.calls[0][1]).toEqual(WARN_SVG_RESULT);
    });

    // ===== beforeRender gate =====

    it('beforeRender returning rows short-circuits render', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            beforeRender: () => [ERROR_ROW],
        });
        // Give microtasks time to settle
        await new Promise((r) => setTimeout(r, 20));
        expect(render).not.toHaveBeenCalled();
        // The gate rows should have been shown in the diagnostics table
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(true);
    });

    it('beforeRender returning null lets the render proceed', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            beforeRender: () => null,
        });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        expect(render).toHaveBeenCalledOnce();
    });

    // ===== setSource =====

    it('setSource triggers a re-render with the new source', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        const lp = mountLivePreview(root, { render });
        await new Promise((r) => setTimeout(r, 5));
        lp.setSource('roadmap v1 new source');
        await vi.waitUntil(() => render.mock.calls.length > 0);
        expect(render).toHaveBeenCalledOnce();
        expect(render.mock.calls[0][0]).toBe('roadmap v1 new source');
    });

    it('setRenderOptions triggers a re-render with merged options', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        const lp = mountLivePreview(root, { source: 'roadmap v1 ...', render });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        lp.setRenderOptions({ width: 2560 });
        await vi.waitUntil(() => render.mock.calls.length > 1);
        const [_src, opts] = render.mock.calls[1] as [string, LiveRenderOptions];
        expect((opts as { width?: unknown }).width).toBe(2560);
    });

    // ===== dispose =====

    it('dispose prevents further render calls', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        const lp = mountLivePreview(root, { source: 'roadmap v1 ...', render });
        lp.dispose();
        lp.setSource('roadmap v1 different source');
        await new Promise((r) => setTimeout(r, 20));
        expect(render).not.toHaveBeenCalled();
    });

    // ===== Error handling =====

    it('render errors are surfaced via setFatal', async () => {
        const render = vi.fn().mockRejectedValue(new Error('render crashed'));
        const root = mountRoot();
        mountLivePreview(root, { source: 'roadmap v1 ...', render });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        await new Promise((r) => setTimeout(r, 10));
        // setFatal surfaces the error as a diagnostics row, hiding the empty state
        const empty = root.querySelector('.empty');
        expect(empty?.classList.contains('hidden')).toBe(true);
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(true);
    });

    // ===== Escape-hatch guard: mountPreview usable standalone =====

    it('forwards exportControls to mountPreview', () => {
        const root = mountRoot();
        mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render: vi.fn().mockResolvedValue(SVG_RESULT),
            exportControls: 'hide',
        });
        const formatRow = root.querySelector<HTMLElement>('.format-control-row');
        const actionRow = root.querySelector<HTMLElement>('.action-row');
        expect(formatRow?.style.display).toBe('none');
        expect(actionRow?.style.display).toBe('none');
    });

    it('mountPreview primitive works without mountLivePreview or renderSource', () => {
        const root = mountRoot();
        const handle = mountPreview(root);
        // Set SVG directly — no render engine needed
        handle.setSvg(SAMPLE_SVG);
        const canvas = root.querySelector('.canvas');
        expect(canvas).not.toBeNull();
        // Set diagnostics directly
        handle.setDiagnostics([ERROR_ROW]);
        const diagnostics = root.querySelector('.diagnostics');
        expect(diagnostics?.classList.contains('show')).toBe(true);
        handle.dispose();
    });

    // ===== Auto theme follows shell mode =====

    it('auto theme resolves to the shell mode on first render', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            mode: 'dark',
            initialView: { theme: 'auto' },
        });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        const [_src, opts] = render.mock.calls[0] as [string, LiveRenderOptions];
        expect((opts as { theme?: unknown }).theme).toBe('dark');
    });

    it('auto theme re-renders when shell mode changes', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        const lp = mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            mode: 'dark',
            initialView: { theme: 'auto' },
        });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        await new Promise((r) => setTimeout(r, 10));
        lp.handle.setMode('light');
        await vi.waitUntil(() => render.mock.calls.length > 1);
        const [_src, opts] = render.mock.calls[1] as [string, LiveRenderOptions];
        expect((opts as { theme?: unknown }).theme).toBe('light');
    });

    it('explicit theme ignores shell mode changes', async () => {
        const render = vi.fn().mockResolvedValue(SVG_RESULT);
        const root = mountRoot();
        const lp = mountLivePreview(root, {
            source: 'roadmap v1 ...',
            render,
            mode: 'dark',
            initialView: { theme: 'light' },
        });
        await vi.waitUntil(() => render.mock.calls.length > 0);
        await new Promise((r) => setTimeout(r, 10));
        lp.handle.setMode('light');
        await new Promise((r) => setTimeout(r, 20));
        expect(render.mock.calls.length).toBe(1);
        expect((render.mock.calls[0][1] as { theme?: unknown }).theme).toBe('light');
    });
});
