import type { DiagnosticRow, RenderResult } from '@nowline/browser';
import { describe, expect, it, vi } from 'vitest';
import type { PreviewHandle } from '../src/index.js';
import {
    applyRenderResult,
    classifyRenderResult,
    nowOverrideToToday,
    themeOverrideToDiagramTheme,
} from '../src/index.js';

const WARNING_ROW: DiagnosticRow = {
    severity: 'warning',
    code: 'render-warning',
    message: 'Unused label',
    file: '/src/roadmap.nowline',
    line: 5,
    column: 1,
};
const ERROR_ROW: DiagnosticRow = {
    severity: 'error',
    code: 'parse-error',
    message: 'Unexpected token',
    file: '/src/roadmap.nowline',
    line: 1,
    column: 1,
};

function makeHandle(): {
    handle: PreviewHandle;
    setSvg: ReturnType<typeof vi.fn>;
    setDiagnostics: ReturnType<typeof vi.fn>;
} {
    const setSvg = vi.fn();
    const setDiagnostics = vi.fn();
    return {
        setSvg,
        setDiagnostics,
        handle: {
            setSvg,
            setDiagnostics,
            setFatal: vi.fn(),
            setViewBaseline: vi.fn(),
            setInitialFit: vi.fn(),
            setMode: vi.fn(),
            fitPage: vi.fn(),
            fitWidth: vi.fn(),
            setActual: vi.fn(),
            dispose: vi.fn(),
        } as unknown as PreviewHandle,
    };
}

// ===== classifyRenderResult =====

describe('classifyRenderResult', () => {
    it('returns { kind: svg, svg } for a successful render', () => {
        const result: RenderResult = { kind: 'svg', svg: '<svg/>', warnings: [] };
        expect(classifyRenderResult(result)).toEqual({ kind: 'svg', svg: '<svg/>' });
    });

    it('silently drops warnings on the svg branch', () => {
        const result: RenderResult = { kind: 'svg', svg: '<svg/>', warnings: [WARNING_ROW] };
        const classified = classifyRenderResult(result);
        expect(classified.kind).toBe('svg');
        expect('rows' in classified).toBe(false);
    });

    it('returns { kind: diagnostics, rows } for a failed render', () => {
        const result: RenderResult = { kind: 'diagnostics', diagnostics: [ERROR_ROW] };
        expect(classifyRenderResult(result)).toEqual({ kind: 'diagnostics', rows: [ERROR_ROW] });
    });
});

// ===== applyRenderResult =====

describe('applyRenderResult', () => {
    it('calls setSvg on a successful render', () => {
        const { handle, setSvg, setDiagnostics } = makeHandle();
        const result: RenderResult = { kind: 'svg', svg: '<svg/>', warnings: [] };
        applyRenderResult(handle, result);
        expect(setSvg).toHaveBeenCalledOnce();
        expect(setSvg).toHaveBeenCalledWith('<svg/>');
        expect(setDiagnostics).not.toHaveBeenCalled();
    });

    it('calls setDiagnostics on a failed render', () => {
        const { handle, setSvg, setDiagnostics } = makeHandle();
        const result: RenderResult = { kind: 'diagnostics', diagnostics: [ERROR_ROW] };
        applyRenderResult(handle, result);
        expect(setDiagnostics).toHaveBeenCalledOnce();
        expect(setDiagnostics).toHaveBeenCalledWith([ERROR_ROW]);
        expect(setSvg).not.toHaveBeenCalled();
    });

    it('calls setDiagnostics with non-error warnings on a successful render', () => {
        const { handle, setSvg, setDiagnostics } = makeHandle();
        const result: RenderResult = { kind: 'svg', svg: '<svg/>', warnings: [WARNING_ROW] };
        applyRenderResult(handle, result);
        expect(setSvg).toHaveBeenCalledOnce();
        expect(setDiagnostics).toHaveBeenCalledOnce();
        expect(setDiagnostics).toHaveBeenCalledWith([WARNING_ROW]);
    });
});

// ===== themeOverrideToDiagramTheme =====

describe('themeOverrideToDiagramTheme', () => {
    it.each(['light', 'dark', 'grayscale'] as const)('%s → %s', (t) => {
        expect(themeOverrideToDiagramTheme(t)).toBe(t);
    });

    it('greyscale → grayscale', () => {
        expect(themeOverrideToDiagramTheme('greyscale')).toBe('grayscale');
    });

    it('auto → undefined', () => {
        expect(themeOverrideToDiagramTheme('auto')).toBeUndefined();
    });

    it('undefined → undefined', () => {
        expect(themeOverrideToDiagramTheme(undefined)).toBeUndefined();
    });
});

// ===== nowOverrideToToday =====

describe('nowOverrideToToday', () => {
    it("'today' → undefined", () => {
        expect(nowOverrideToToday('today')).toBeUndefined();
    });

    it('undefined → undefined', () => {
        expect(nowOverrideToToday(undefined)).toBeUndefined();
    });

    it("'hide' → null", () => {
        expect(nowOverrideToToday('hide')).toBeNull();
    });

    it('YYYY-MM-DD string passes through', () => {
        expect(nowOverrideToToday('2026-01-15')).toBe('2026-01-15');
    });

    it('arbitrary string (e.g. ISO instant) passes through', () => {
        expect(nowOverrideToToday('2026-06-01T00:00:00Z')).toBe('2026-06-01T00:00:00Z');
    });
});
