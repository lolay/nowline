// Browser entry bundled into the MCP Apps in-chat live preview.
//
// Unlike the VS Code webview entry — which receives pre-rendered SVG from
// the extension host over postMessage — this entry runs standalone inside
// the MCP host's sandboxed iframe. It reads the .nowline source the server
// injected as a JSON <script> (#nl-preview-data), renders it to SVG in the
// browser via `renderSource` (@nowline/browser, the same parse → layout →
// render pipeline the embed CDN ships), and mounts the shared preview
// viewport via `mountPreview` (@nowline/preview-shell). No host transport
// is assumed, so the preview works in any MCP Apps host that renders the
// embedded text/html resource.
//
// Mirrors packages/vscode-extension/src/preview/webview/entry.ts; the seam
// is that this entry owns the render (no host editor feeding it SVG), so
// theme / now / show-links changes re-render in-place via renderSource.

// Runs in a browser-like iframe, not Node. Pull in the DOM lib only here
// (the rest of @nowline/mcp is Node) — mirrors the VS Code webview entry.
/// <reference lib="dom" />

import { renderSource } from '@nowline/browser';
import {
    mountPreview,
    type NowOverride,
    type PreviewHandle,
    type ThemeOverride,
} from '@nowline/preview-shell';

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

type DiagramTheme = 'light' | 'dark' | 'grayscale';

function readPayload(): PreviewPayload | undefined {
    const el = document.getElementById('nl-preview-data');
    if (!el?.textContent) return undefined;
    try {
        return JSON.parse(el.textContent) as PreviewPayload;
    } catch {
        return undefined;
    }
}

/** Coerce a raw theme token to the shell's ThemeOverride (defaults to Auto). */
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

/** Map a shell ThemeOverride to a renderer ThemeName (Auto → renderer default). */
function toDiagramTheme(theme: ThemeOverride): DiagramTheme | undefined {
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

/** Map a shell NowOverride to the renderSource `today` input. */
function toToday(now: NowOverride): Date | string | null | undefined {
    if (now === 'today') return undefined;
    if (now === 'hide' || now === 'none') return null;
    return now;
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
    const { source, width, locale } = payload;

    // Live view state — seeded from the server payload, mutated by the
    // shell's view-options menu, and read on every re-render.
    const current = {
        theme: toThemeOverride(payload.theme),
        now: (payload.now ?? 'today') as NowOverride,
        showLinks: payload.showLinks !== false,
    };

    let handle: PreviewHandle | undefined;

    async function render(): Promise<void> {
        if (!handle) return;
        try {
            const result = await renderSource(source, {
                theme: toDiagramTheme(current.theme),
                today: toToday(current.now),
                width,
                locale,
                showLinks: current.showLinks,
            });
            if (result.kind === 'svg') {
                handle.setSvg(result.svg);
                handle.setDiagnostics(result.warnings);
            } else {
                handle.setDiagnostics(result.diagnostics);
            }
        } catch (err) {
            handle.setFatal(err instanceof Error ? err.message : String(err));
        }
    }

    handle = mountPreview(root, {
        themeControl: 'show',
        locale,
        initialFit: payload.initialFit,
        showMinimap: payload.showMinimap,
        viewBaseline: {
            theme: current.theme,
            now: current.now,
            showLinks: current.showLinks,
        },
        onViewOptions: (overrides) => {
            if (overrides.theme !== undefined) current.theme = overrides.theme;
            if (overrides.now !== undefined) current.now = overrides.now;
            if (overrides.showLinks !== undefined) current.showLinks = overrides.showLinks;
            void render();
        },
        onSave: (req) => {
            // Best-effort in-iframe download; the host's iframe sandbox may
            // block it, in which case the copy actions remain available.
            try {
                const type = req.format === 'png' ? 'image/png' : 'image/svg+xml';
                const blob = new Blob([req.body as BlobPart], { type });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `roadmap.${req.format}`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch {
                // Download blocked by the sandbox — nothing to do.
            }
        },
    });

    void render();
}

bootstrap();
