// Bootstrap script bundled into the preview webview. Wires the
// framework-agnostic `@nowline/preview-shell` to VS Code's host
// transport (`acquireVsCodeApi().postMessage` + `window.message`
// events). The host's existing postMessage protocol (init / svg /
// diagnostics / configChange / fatal in; goto / openProblems / save /
// copy / fatal / viewOptions out) is preserved verbatim so
// `extension.ts` and `preview-panel.ts` keep working unchanged.

// Webview entry runs in the browser-like webview process, not Node.
// Pull in the DOM lib types only here (rest of the extension is Node).
/// <reference lib="dom" />

import {
    type DiagnosticRow,
    mountPreview,
    type PreviewHandle,
    type ThemeOverride,
} from '@nowline/preview-shell';

interface VsCodeApi {
    postMessage(msg: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface InitMessage {
    type: 'init';
    defaultFit?: 'fitPage' | 'fitWidth' | 'actual';
    showMinimap?: boolean;
    theme?: ThemeOverride;
    now?: string;
    showLinks?: boolean;
}

interface ConfigChangeMessage {
    type: 'configChange';
    defaultFit?: 'fitPage' | 'fitWidth' | 'actual';
    showMinimap?: boolean;
    theme?: ThemeOverride;
    now?: string;
    showLinks?: boolean;
}

interface SvgMessage {
    type: 'svg';
    body: string;
}

interface DiagnosticsMessage {
    type: 'diagnostics';
    rows: DiagnosticRow[];
}

interface FatalMessage {
    type: 'fatal';
    message: string;
}

type IncomingMessage =
    | InitMessage
    | ConfigChangeMessage
    | SvgMessage
    | DiagnosticsMessage
    | FatalMessage;

function bootstrap(): void {
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('nl-preview-root');
    if (!root) {
        console.error('preview-shell webview: #nl-preview-root missing');
        return;
    }

    const handle: PreviewHandle = mountPreview(root, {
        onGoto: (loc) => {
            vscode.postMessage({
                type: 'goto',
                file: loc.file,
                line: loc.line,
                column: loc.column,
            });
        },
        onOpenProblems: () => {
            vscode.postMessage({ type: 'openProblems' });
        },
        onSave: (req) => {
            vscode.postMessage({ type: 'save', format: req.format, body: req.body });
        },
        onCopy: (req) => {
            // `copy-svg` is handled in-shell via navigator.clipboard; PNG
            // copies that need a host fallback flow through
            // `onCopyPngFallback`. This callback isn't expected to fire
            // in the current shell, but is wired for completeness in
            // case future actions want host-side copy support.
            vscode.postMessage({ type: 'save', format: req.format, body: req.body });
        },
        onCopyPngFallback: (body) => {
            vscode.postMessage({ type: 'copyPngFallback', body });
        },
        onViewOptions: (overrides) => {
            vscode.postMessage({ type: 'viewOptions', overrides });
        },
        onFatal: (message) => {
            vscode.postMessage({ type: 'fatal', message });
        },
    });

    window.addEventListener('message', (e: MessageEvent) => {
        const msg = e.data as IncomingMessage | undefined;
        if (!msg || typeof msg !== 'object') return;
        switch (msg.type) {
            case 'init': {
                if (msg.defaultFit) handle.setDefaultFit(msg.defaultFit);
                if (msg.showMinimap !== undefined) handle.setShowMinimap(!!msg.showMinimap);
                handle.setViewBaseline(
                    { theme: msg.theme, now: msg.now, showLinks: msg.showLinks },
                    /* resetOverrides */ true,
                );
                break;
            }
            case 'configChange': {
                if (msg.defaultFit) handle.setDefaultFit(msg.defaultFit);
                if (msg.showMinimap !== undefined) handle.setShowMinimap(!!msg.showMinimap);
                handle.setViewBaseline(
                    { theme: msg.theme, now: msg.now, showLinks: msg.showLinks },
                    /* resetOverrides */ false,
                );
                break;
            }
            case 'svg':
                handle.setSvg(msg.body);
                break;
            case 'diagnostics':
                handle.setDiagnostics(msg.rows ?? []);
                break;
            case 'fatal':
                handle.setFatal(msg.message ?? 'Unknown error.');
                break;
        }
    });
}

bootstrap();
