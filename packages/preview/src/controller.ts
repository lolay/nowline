// Live-preview controller — Layer 2 of the preview stack.
//
//   Layer 0: mountPreview()          — imperative viewport (preview-shell)
//   Layer 1: applyRenderResult() etc — shared convention (preview-shell)
//   Layer 2: mountLivePreview()      — this file; owns the render→apply loop
//
// Everything is injectable so any consumer can override the render engine
// (remote renderer, test stub), the apply policy (custom empty-state), or
// add a pre-render gate (e.g. LSP errors that should preempt render).
// The raw PreviewHandle is always exposed so callers can call zoom/fit/etc.
// directly without the controller modelling each command.

import {
    renderSource as defaultRenderSource,
    type RenderOptions,
    type RenderResult,
} from '@nowline/browser';
import {
    type DiagnosticRow,
    applyRenderResult as defaultApply,
    type MountPreviewOptions,
    mountPreview,
    type NowOverride,
    nowOverrideToToday,
    type PreviewHandle,
    type ThemeOverride,
    themeOverrideToDiagramTheme,
    type ViewBaseline,
    type ViewOptionsOverrides,
} from '@nowline/preview-shell';

/** Options forwarded to every `renderSource` call (view-state fields managed internally). */
export type LiveRenderOptions = Omit<RenderOptions, 'theme' | 'today' | 'showLinks'>;

/** Signature for an injectable render function. */
export type RenderFn = (source: string, opts: RenderOptions) => Promise<RenderResult>;

/** Signature for an injectable apply policy. */
export type ApplyFn = (handle: PreviewHandle, result: RenderResult) => void;

export interface MountLivePreviewOptions
    extends Omit<MountPreviewOptions, 'onViewOptions' | 'viewBaseline' | 'onModeChange'> {
    /** Source string to render on mount (may be omitted for late-set callers). */
    source?: string;
    /** Seed view-state (theme, now, showLinks). The shell toolbar reflects these. */
    initialView?: { theme?: ThemeOverride; now?: NowOverride; showLinks?: boolean };
    /** Static render options threaded into every render call. */
    renderOptions?: LiveRenderOptions;
    /**
     * Custom render function. Default: `renderSource` from `@nowline/browser`.
     * Override with a remote renderer, a worker proxy, or a test stub.
     */
    render?: RenderFn;
    /**
     * Custom apply policy. Default: `applyRenderResult` from `@nowline/preview-shell`.
     * Override to change how results map onto the shell (e.g. custom empty-state).
     */
    apply?: ApplyFn;
    /**
     * Gate called before each render. Return a `DiagnosticRow[]` to show those
     * rows directly and skip the render (e.g. LSP errors that preempt a valid
     * output). Return `null` or `undefined` to let the normal render proceed.
     */
    beforeRender?: () => DiagnosticRow[] | null | undefined;
    /**
     * Forwarded from the shell's `onViewOptions` after the controller updates
     * its internal view state and schedules a re-render.
     */
    onViewOptions?: (overrides: ViewOptionsOverrides) => void;
    /** Debounce delay applied to `setSource()` calls, in ms. Default: `0` (no debounce). */
    debounceMs?: number;
}

export interface LivePreviewHandle {
    /** The raw shell handle. Use directly for zoom, fit, mode, etc. */
    handle: PreviewHandle;
    /** Replace the rendered source and trigger a re-render. */
    setSource(source: string): void;
    /** Update static render options (locale, width, etc.) and re-render. */
    setRenderOptions(opts: LiveRenderOptions): void;
    /** Dispose the controller and the underlying shell. */
    dispose(): void;
}

/**
 * Mount a live-preview controller.
 *
 * ```ts
 * const lp = mountLivePreview(rootEl, { source, initialView: { theme: 'dark' } });
 * lp.setSource(updatedSource);         // re-render on edit
 * lp.handle.fitPage();                 // direct shell access
 * lp.dispose();
 * ```
 *
 * All entry points are injectable — see `MountLivePreviewOptions.render`,
 * `.apply`, and `.beforeRender`. This function lives in `@nowline/preview`
 * (not in `@nowline/preview-shell`) so importing `mountPreview` alone never
 * drags in `@nowline/browser` at runtime.
 */
export function mountLivePreview(
    rootEl: HTMLElement,
    opts: MountLivePreviewOptions = {},
): LivePreviewHandle {
    const {
        source: initialSource = '',
        initialView,
        renderOptions: initialRenderOpts = {},
        render: renderFn = defaultRenderSource,
        apply: applyFn = defaultApply,
        beforeRender,
        onViewOptions: callerOnViewOptions,
        debounceMs = 0,
        ...passThroughOpts
    } = opts;

    // Live view state — mutated by the toolbar's onViewOptions callback.
    const viewState = {
        theme: (initialView?.theme ?? 'auto') as ThemeOverride,
        now: (initialView?.now ?? 'today') as NowOverride,
        showLinks: initialView?.showLinks !== false,
    };

    let renderOpts: LiveRenderOptions = initialRenderOpts;
    let currentSource: string = initialSource;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let booted = false;
    let currentMode: 'light' | 'dark' = 'dark';

    const viewBaseline: ViewBaseline = {
        theme: viewState.theme,
        now: viewState.now,
        showLinks: viewState.showLinks,
    };

    const handle = mountPreview(rootEl, {
        ...passThroughOpts,
        viewBaseline,
        onModeChange(mode) {
            if (mode === currentMode) return;
            currentMode = mode;
            if (booted && viewState.theme === 'auto') scheduleRender(false);
        },
        onViewOptions(overrides: ViewOptionsOverrides) {
            if (overrides.theme !== undefined) viewState.theme = overrides.theme;
            if (overrides.now !== undefined) viewState.now = overrides.now;
            if (overrides.showLinks !== undefined) viewState.showLinks = overrides.showLinks;
            callerOnViewOptions?.(overrides);
            scheduleRender(false);
        },
    });

    function buildRenderOpts(): RenderOptions {
        const diagramTheme =
            viewState.theme === 'auto' ? currentMode : themeOverrideToDiagramTheme(viewState.theme);
        return {
            ...renderOpts,
            theme: diagramTheme,
            today: nowOverrideToToday(viewState.now),
            showLinks: viewState.showLinks,
        };
    }

    async function doRender(): Promise<void> {
        // Yield one microtask so the caller can call dispose() synchronously
        // after mount and have it take effect before the first render starts.
        await Promise.resolve();
        if (disposed) return;
        const gate = beforeRender?.();
        if (gate !== null && gate !== undefined) {
            handle.setDiagnostics(gate);
            return;
        }
        if (!currentSource) return;
        try {
            const result = await renderFn(currentSource, buildRenderOpts());
            if (!disposed) {
                applyFn(handle, result);
                booted = true;
            }
        } catch (err) {
            if (!disposed) {
                handle.setFatal(err instanceof Error ? err.message : String(err));
            }
        }
    }

    function scheduleRender(debounce: boolean): void {
        if (disposed) return;
        if (debounceMs > 0 && debounce) {
            if (debounceTimer !== null) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                void doRender();
            }, debounceMs);
        } else {
            void doRender();
        }
    }

    // Kick off initial render.
    scheduleRender(false);

    return {
        handle,
        setSource(source: string): void {
            currentSource = source;
            scheduleRender(debounceMs > 0);
        },
        setRenderOptions(newOpts: LiveRenderOptions): void {
            renderOpts = newOpts;
            scheduleRender(false);
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            if (debounceTimer !== null) clearTimeout(debounceTimer);
            handle.dispose();
        },
    };
}
