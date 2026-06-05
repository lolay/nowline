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
import { BUNDLED_MONO_FAMILY, BUNDLED_SANS_FAMILY } from '@nowline/export-core';
import { PREVIEW_SHELL_CSS, VSCODE_THEME_BRIDGE_CSS } from '@nowline/preview-shell';
import * as vscode from 'vscode';

/**
 * Build the HTML for the preview webview.
 *
 * The webview loads `dist/preview-webview.js` (bundled by
 * `scripts/bundle.mjs`) under a CSP-allowed `webview.cspSource`. The
 * inline style block carries the full `@nowline/preview-shell`
 * stylesheet followed by the VS Code → `--nl-preview-*` theme bridge,
 * so the viewport is fully styled and tracks the active workbench
 * colour theme. The block is served from here (rather than injected at
 * runtime by `mountPreview()`) because the webview's `style-src` is
 * nonce-only — see the CSP note below.
 */
export function getShellHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = generateNonce();
    const cspSource = webview.cspSource;

    const webviewScriptUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(extensionUri.fsPath, 'dist', 'preview-webview.js')),
    );

    // Bundled DejaVu faces, served from dist/fonts/ (copied by bundle.mjs,
    // under `localResourceRoots` via `extensionUri`). The preview renders the
    // SVG with these pinned families (see render-pipeline.ts), so `@font-face`
    // makes the webview use the *same* face the PNG/PDF raster export embeds —
    // the WYSIWYG contract. Only a Regular face ships; the browser synthesizes
    // bold/italic, matching resvg/PDFKit faux styling.
    const sansFontUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(extensionUri.fsPath, 'dist', 'fonts', 'DejaVuSans.ttf')),
    );
    const monoFontUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(extensionUri.fsPath, 'dist', 'fonts', 'DejaVuSansMono.ttf')),
    );
    const fontFaceCss =
        `@font-face{font-family:'${BUNDLED_SANS_FAMILY}';` +
        `src:url('${sansFontUri.toString()}') format('truetype');` +
        `font-weight:normal;font-style:normal;font-display:block;}` +
        `@font-face{font-family:'${BUNDLED_MONO_FAMILY}';` +
        `src:url('${monoFontUri.toString()}') format('truetype');` +
        `font-weight:normal;font-style:normal;font-display:block;}`;

    // `'unsafe-inline'` style intentionally omitted; the only inline
    // styles are the nonce'd shell-stylesheet + theme-bridge block
    // below. Because the policy is nonce-only, the shell CSS must be
    // served here with the nonce rather than injected at runtime by
    // `mountPreview()` (a non-nonced `<style>` would be refused).
    // Scripts likewise run only with the nonce or the bundled file URI.
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
        '" data-nl-preview-shell>' +
        // Bundled-font @font-face first so the pinned families the SVG names
        // resolve to the embedded DejaVu faces (WYSIWYG with raster export).
        fontFaceCss +
        // Full shell stylesheet next; the `data-nl-preview-shell`
        // marker lets `mountPreview()` detect this host-provided copy
        // and skip its own (non-nonced) runtime injection.
        PREVIEW_SHELL_CSS +
        // Bridge block follows so its `--vscode-*`-backed tokens
        // override the shell's baked-in `--nl-preview-*` defaults.
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
