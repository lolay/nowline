// CSP-aware HTML wrapper around the bundled `@nowline/preview-shell`
// webview entry. The actual viewport DOM, zoom/pan, minimap, and
// diagnostic table all live in `dist/preview-webview.js` — this file
// only produces the host HTML document that loads it.
//
// The bundled entry script imports `mountPreview` from
// `@nowline/preview-shell` and wires its callbacks to
// `acquireVsCodeApi().postMessage`. The host's existing webview
// protocol (init / svg / diagnostics / configChange / fatal in;
// goto / openProblems / save / copy / fatal / viewOptions out) is
// preserved verbatim so `preview-panel.ts` and `extension.ts` are
// untouched.

import * as path from 'node:path';
import { VSCODE_THEME_BRIDGE_CSS } from '@nowline/preview-shell';
import * as vscode from 'vscode';

/**
 * Build the HTML for the preview webview.
 *
 * The webview loads `dist/preview-webview.js` (bundled by
 * `scripts/bundle.mjs`) under a CSP-allowed `webview.cspSource`. The
 * inline style block carries the VS Code → `--nl-preview-*` theme
 * bridge so the viewport tracks the active workbench colour theme.
 */
export function getShellHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = generateNonce();
    const cspSource = webview.cspSource;

    const webviewScriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(extensionUri.fsPath, 'dist', 'preview-webview.js')),
    );

    // `'unsafe-inline'` style intentionally omitted; the only inline
    // styles are the theme-bridge nonce'd block below. Scripts likewise
    // run only with the nonce or the bundled file URI.
    const csp = [
        "default-src 'none'",
        `img-src ${cspSource} data: blob:`,
        `style-src ${cspSource} 'nonce-${nonce}'`,
        `script-src ${cspSource} 'nonce-${nonce}'`,
        `font-src ${cspSource}`,
    ].join('; ');

    return (
        '<!doctype html>\n' +
        '<html lang="en">\n' +
        '<head>\n' +
        '<meta charset="utf-8" />\n' +
        '<meta http-equiv="Content-Security-Policy" content="' +
        csp +
        '" />\n' +
        '<title>Nowline preview</title>\n' +
        '<style nonce="' +
        nonce +
        '">' +
        VSCODE_THEME_BRIDGE_CSS +
        // Ensure the root element fills the webview viewport so the
        // preview-shell's absolute-positioned children have a sized
        // parent to anchor to.
        'html, body, #nl-preview-root { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }' +
        '</style>\n' +
        '</head>\n' +
        '<body>\n' +
        '<div id="nl-preview-root"></div>\n' +
        '<script nonce="' +
        nonce +
        '" src="' +
        webviewScriptUri.toString() +
        '"></script>\n' +
        '</body>\n' +
        '</html>\n'
    );
}

function generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
}
