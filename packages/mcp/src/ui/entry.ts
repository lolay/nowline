// Browser entry bundled into the MCP Apps in-chat live preview.
//
// The MCP host loads a pre-declared ui:// HTML resource and hydrates it via the
// ext-apps ontoolresult handshake. Per-call render inputs ({ kind: 'nowline.preview',
// source, theme, … }) arrive in the tool result; the widget renders the roadmap
// in-browser via mountLivePreview. A #nl-preview-data JSON <script> fallback
// remains for the /widget-preview dev shim and non-handshake degradation.
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

/** Server-injected or ontoolresult render inputs. */
interface PreviewPayload {
    kind?: string;
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

function parsePreviewFromContent(
    content: Array<{ type: string; text?: string }> | undefined,
): PreviewPayload | undefined {
    if (!content) return undefined;
    for (const block of content) {
        if (block.type !== 'text' || !block.text) continue;
        try {
            const parsed = JSON.parse(block.text) as PreviewPayload;
            if (parsed.kind === 'nowline.preview' && typeof parsed.source === 'string') {
                return parsed;
            }
        } catch {
            /* not JSON — skip */
        }
    }
    return undefined;
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

function mountFromPayload(payload: PreviewPayload): void {
    const root = document.getElementById('nl-preview-root');
    if (!root || typeof payload.source !== 'string') {
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
    mounted = true;
}

async function bootstrap(): Promise<void> {
    const app = new App({ name: 'NowlinePreview', version: __MCP_VERSION__ }, {});

    app.ontoolresult = ({ content, isError }) => {
        if (isError) return;
        const payload = parsePreviewFromContent(content);
        if (payload) mountFromPayload(payload);
    };

    await app.connect();

    if (!mounted) {
        const fallback = readPayload();
        if (fallback) mountFromPayload(fallback);
    }
}

void bootstrap();
