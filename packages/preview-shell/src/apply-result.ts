// Pure convention helpers — the one-definition home for the shared rule that
// every surface driving @nowline/preview-shell with @nowline/browser follows:
//
//   "A successful render shows the diagram. Warnings do not veil it.
//    Only errors trigger the diagnostics overlay."
//
// These functions have **no runtime dependency on @nowline/browser**. They
// import only its types so preview-shell's bundle stays free of the
// parse/layout/render engine — VS Code's webview can still use mountPreview
// directly without pulling in Langium.
//
// Convention reference: specs/architecture.md § Surfaces / @nowline/preview-shell.

import type { DiagnosticRow, RenderResult } from '@nowline/browser';
import type { NowOverride, PreviewHandle, ThemeOverride } from './mount.js';

/**
 * Maps the browser pipeline's `RenderResult` to the VS Code extension
 * host's `RenderOutcome` shape. Warnings on the svg branch are silently
 * dropped — a successful render shows the diagram, not an overlay. Use
 * this in host-side rendering (e.g. `render-pipeline.ts`) so the
 * svg-vs-diagnostics decision has one source of truth.
 *
 * This is the type-level twin of `applyRenderResult` for surfaces that
 * split the "decide" step from the "apply to shell" step (e.g. VS Code,
 * where the extension host decides and the webview applies separately).
 */
export function classifyRenderResult(
    result: RenderResult,
): { kind: 'svg'; svg: string } | { kind: 'diagnostics'; rows: DiagnosticRow[] } {
    return result.kind === 'svg'
        ? { kind: 'svg', svg: result.svg }
        : { kind: 'diagnostics', rows: result.diagnostics };
}

/**
 * Apply a `RenderResult` to a `PreviewHandle` using the shared convention:
 * svg shows the diagram; error diagnostics trigger the overlay; warnings
 * on a successful render are discarded.
 *
 * Call this (or override it in `mountLivePreview`) instead of calling
 * `setSvg` / `setDiagnostics` by hand in every surface.
 */
export function applyRenderResult(handle: PreviewHandle, result: RenderResult): void {
    if (result.kind === 'svg') {
        handle.setSvg(result.svg);
    } else {
        handle.setDiagnostics(result.diagnostics);
    }
}

/**
 * Coerce a shell `ThemeOverride` to the renderer's `ThemeName`.
 * `'auto'` and `undefined` both return `undefined` so the renderer uses
 * its own default — matches the embed's `theme: 'auto'` posture and lets
 * the renderer respond to `prefers-color-scheme` when it supports it.
 */
export function themeOverrideToDiagramTheme(
    theme: ThemeOverride | undefined,
): 'light' | 'dark' | 'grayscale' | undefined {
    switch (theme) {
        case 'light':
            return 'light';
        case 'dark':
            return 'dark';
        case 'grayscale':
        case 'greyscale':
            return 'grayscale';
        default:
            return undefined;
    }
}

/**
 * Coerce a shell `NowOverride` to the `today` input accepted by
 * `renderSource`.
 *
 * - `'today'` / `undefined` → `undefined` (pipeline uses local civil date).
 * - `'hide'`                → `null` (suppresses the now-line).
 * - `'YYYY-MM-DD'`          → passes through so the pipeline parses it.
 */
export function nowOverrideToToday(now: NowOverride | undefined): Date | string | null | undefined {
    if (now === undefined || now === 'today') return undefined;
    if (now === 'hide') return null;
    return now;
}
