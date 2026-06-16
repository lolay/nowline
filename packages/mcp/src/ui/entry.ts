// Browser entry bundled into the MCP Apps in-chat live preview.
//
// The MCP host loads a pre-declared ui:// HTML resource and hydrates it via the
// ext-apps handshake. The widget mounts from the earliest signal available:
//   1. ontoolinput  — the LLM's tool arguments, delivered before the server runs.
//      This is the primary, fast path for the common inline-`source` case and
//      mirrors the official ext-apps examples (e.g. mermaid-mcp-app), which paint
//      from tool input rather than waiting on the result notification.
//   2. ontoolresult — the lean { kind: 'nowline.preview', source, … } payload the
//      server returns. Authoritative: it carries the resolved `source` even when
//      the caller passed `path:` instead of `source:`, so it reconciles the input
//      render and covers hosts that never deliver ontoolinput.
// A #nl-preview-data JSON <script> fallback remains for the /widget-preview dev
// shim and non-handshake degradation.
//
// Mirrors packages/vscode-extension/src/preview/webview/entry.ts; this entry
// owns the render (no host editor feeding it SVG), so theme / now / show-links
// changes re-render in-place.

// Runs in a browser-like iframe, not Node. Pull in the DOM lib only here
// (the rest of @nowline/mcp is Node) — mirrors the VS Code webview entry.
/// <reference lib="dom" />

// Injected by bundle-ui.mjs at build time from package.json; not a runtime import.
declare const __MCP_VERSION__: string;

import { App } from '@modelcontextprotocol/ext-apps';
import { mountLivePreview } from '@nowline/preview';
import type { NowOverride, ThemeOverride } from '@nowline/preview-shell';
import {
    type PreviewPayload,
    parsePreviewFromArguments,
    parsePreviewFromContent,
} from './payload.js';

function readPayload(): PreviewPayload | undefined {
    const el = document.getElementById('nl-preview-data');
    if (!el?.textContent) return undefined;
    try {
        return JSON.parse(el.textContent) as PreviewPayload;
    } catch {
        return undefined;
    }
}

/** Coerce a raw theme token from the payload to the shell's ThemeOverride. */
function toThemeOverride(theme: string | undefined): ThemeOverride {
    switch (theme) {
        case 'light':
        case 'dark':
        case 'grayscale':
        case 'greyscale':
        case 'auto':
            return theme;
        default:
            return 'auto';
    }
}

let mounted = false;
let mountedSource: string | undefined;

function mountFromPayload(payload: PreviewPayload): void {
    const root = document.getElementById('nl-preview-root');
    if (!root || typeof payload.source !== 'string') {
        return;
    }

    // Idempotent across the ontoolinput → ontoolresult sequence: the result
    // notification normally repeats the same `source` the input already mounted,
    // so skip it. A genuinely different `source` (e.g. path resolution, or a
    // re-invocation on the same iframe) tears down the prior mount first.
    if (mounted) {
        if (payload.source === mountedSource) return;
        (root as HTMLElement).replaceChildren();
    }

    mountLivePreview(root as HTMLElement, {
        source: payload.source,
        initialView: {
            theme: toThemeOverride(payload.theme),
            now: (payload.now ?? 'today') as NowOverride,
            showLinks: payload.showLinks !== false,
        },
        renderOptions: {
            width: payload.width,
            locale: payload.locale,
        },
        themeControl: 'show',
        exportControls: 'hide',
        locale: payload.locale,
        // Inline chat widget: fill the width and take the diagram's natural
        // height (reportHeight sizes the iframe to match), rather than fitPage
        // which centers a width-constrained diagram and leaves empty space.
        initialFit: payload.initialFit ?? 'fitWidth',
        showMinimap: payload.showMinimap,
    });
    mounted = true;
    mountedSource = payload.source;
}

// Sizing for a size-to-content host (Claude Desktop), which sizes the iframe
// from our ui/notifications/size-changed. The shell is a fill-the-container
// layout (html / body / #nl-preview-root are height:100%) with no intrinsic
// height, so the ext-apps SDK's default autoResize — which measures
// documentElement at `max-content` — collapses to 0 and the host shrinks the
// iframe to nothing (blank, no console error). We disable autoResize and report
// the *diagram's* height instead: the rendered SVG shown at fit-width, clamped
// to the host's available height. A short roadmap stays compact (no empty band
// pushing it below the fold); a tall one is capped and scrolls internally. User
// zoom does not resize the iframe (the report is viewBox-based, scale-free).
// VS Code / embed own their panel height and never mount this entry.
const MIN_HEIGHT_PX = 160;
const DEFAULT_MAX_HEIGHT_PX = 640;
const PREPAINT_HEIGHT_PX = 360;

function hostMaxHeight(app: App): number {
    const dims = app.getHostContext()?.containerDimensions as
        | { height?: number; maxHeight?: number }
        | undefined;
    return Math.round(dims?.maxHeight ?? dims?.height ?? DEFAULT_MAX_HEIGHT_PX);
}

/** viewBox aspect of the rendered diagram, or null before the first paint. */
function diagramNaturalSize(): { w: number; h: number } | null {
    const svg = document.querySelector('#nl-preview-root svg') as SVGSVGElement | null;
    const vb = svg?.viewBox?.baseVal;
    return vb && vb.width > 0 && vb.height > 0 ? { w: vb.width, h: vb.height } : null;
}

let lastReportedHeight = -1;

function desiredHeight(app: App): number {
    const cap = Math.max(hostMaxHeight(app), MIN_HEIGHT_PX);
    const nat = diagramNaturalSize();
    const width = document.documentElement.clientWidth || 0;
    if (!nat || width <= 0) {
        // Pre-paint, or a diagnostics-only state: a modest non-zero height.
        return Math.min(Math.max(PREPAINT_HEIGHT_PX, MIN_HEIGHT_PX), cap);
    }
    // Fit-width display height = naturalHeight × (width / naturalWidth).
    const fitHeight = Math.ceil(nat.h * (width / nat.w));
    return Math.min(Math.max(fitHeight, MIN_HEIGHT_PX), cap);
}

function reportHeight(app: App): void {
    const height = desiredHeight(app);
    if (height === lastReportedHeight) return;
    lastReportedHeight = height;
    // Concrete base for the height:100% chain (so the fill layout paints) and the
    // height the host should give the iframe.
    document.documentElement.style.height = `${height}px`;
    void app.sendSizeChanged({ height });
}

function watchSize(app: App): void {
    const root = document.getElementById('nl-preview-root');
    if (!root) return;
    let scheduled = false;
    const trigger = (): void => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            reportHeight(app);
        });
    };
    // Re-measure when the diagram (re)renders into the canvas…
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(trigger).observe(root, { childList: true, subtree: true });
    }
    // …and when the host changes our width.
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(trigger).observe(root);
    }
}

async function bootstrap(): Promise<void> {
    // autoResize:false — see the sizing block above.
    const app = new App(
        { name: 'NowlinePreview', version: __MCP_VERSION__ },
        {},
        { autoResize: false },
    );

    // Primary path: paint from the LLM's tool arguments the moment they arrive,
    // before the server finishes rendering. Mirrors the official ext-apps examples.
    app.ontoolinput = ({ arguments: args }) => {
        const payload = parsePreviewFromArguments(args as Record<string, unknown> | undefined);
        if (payload) mountFromPayload(payload);
    };

    // Authoritative path: the server-resolved lean preview payload. Reconciles the
    // input render and covers the `path:`-only case and hosts without ontoolinput.
    app.ontoolresult = ({ content, isError }) => {
        if (isError) return;
        const payload = parsePreviewFromContent(content);
        if (payload) mountFromPayload(payload);
    };

    // Re-report when the host changes our width / available height.
    app.onhostcontextchanged = () => reportHeight(app);

    await app.connect();
    watchSize(app);
    reportHeight(app);

    if (!mounted) {
        const fallback = readPayload();
        if (fallback) mountFromPayload(fallback);
    }
}

void bootstrap();
