// Browser entry bundled into the MCP Apps in-chat live preview.
//
// Unlike the VS Code webview entry — which receives pre-rendered SVG from
// the extension host over postMessage — this entry runs standalone inside
// the MCP host's sandboxed iframe. It reads the .nowline source the server
// injected as a JSON <script> (#nl-preview-data), then delegates the
// entire render → apply loop to `mountLivePreview` (@nowline/preview),
// which wires renderSource (@nowline/browser) to the shared preview
// viewport (@nowline/preview-shell) via the canonical applyRenderResult
// convention. No host transport is assumed.
//
// Mirrors packages/vscode-extension/src/preview/webview/entry.ts; the seam
// is that this entry owns the render (no host editor feeding it SVG), so
// theme / now / show-links changes re-render in-place.

// Runs in a browser-like iframe, not Node. Pull in the DOM lib only here
// (the rest of @nowline/mcp is Node) — mirrors the VS Code webview entry.
/// <reference lib="dom" />

import { mountLivePreview } from '@nowline/preview';
import type { NowOverride, ThemeOverride } from '@nowline/preview-shell';

/** Server-injected render inputs (see buildPreviewHtml in server.ts). */
interface PreviewPayload {
    source: string;
    theme?: string;
    now?: string;
    width?: number;
    locale?: string;
    showLinks?: boolean;
    showMinimap?: boolean;
    initialFit?: 'fitPage' | 'fitWidth' | 'actual';
}

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

function bootstrap(): void {
    const root = document.getElementById('nl-preview-root');
    if (!root) {
        console.error('nowline mcp preview: #nl-preview-root missing');
        return;
    }
    const payload = readPayload();
    if (!payload || typeof payload.source !== 'string') {
        return;
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
        initialFit: payload.initialFit,
        showMinimap: payload.showMinimap,
    });
}

bootstrap();
