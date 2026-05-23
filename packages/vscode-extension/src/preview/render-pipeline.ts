// Thin shim around `@nowline/browser`'s pipeline. The browser package
// owns parse / resolveIncludes / layout / render; this file supplies
// the Node-only bits that make sense in a VS Code extension host:
//
//  - A `node:fs`-backed `readFile` callback so cross-file `include`
//    directives resolve from the user's workspace.
//  - An `AssetResolver` that loads image bytes from disk relative to a
//    configurable `assetRoot` (default: source-file directory), with a
//    path-escape check that matches the CLI's behaviour.
//
// The shim returns the same `RenderOutcome` discriminated union the
// preview shell expects so swapping the implementation underneath the
// host is invisible to `preview-panel.ts`.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
    renderSource as browserRenderSource,
    type DiagnosticRow,
    type RenderResult,
} from '@nowline/browser';
import type { ThemeName } from '@nowline/layout';
import type { AssetResolver } from '@nowline/renderer';

export type { DiagnosticRow };

export interface RenderInputs {
    /** Document text in its current (possibly unsaved) state. */
    text: string;
    /** Absolute fs path to the document. Used for include resolution and asset roots. */
    fsPath: string;
    /** Theme. Falls back to light when undefined. */
    theme?: ThemeName;
    /**
     * "Today" override. The CLI uses today by default; we mirror that for
     * the live preview so the now-line stays anchored without surprising
     * the user with stale dates. Pass an explicit date for deterministic
     * snapshots; pass `null` to suppress the now-line entirely (mirrors
     * the CLI's `--now -`).
     */
    today?: Date | null;
    /**
     * BCP-47 tag for the operator chain (axis labels / now-pill / quarter
     * prefix when there's no `nowline v1 locale:` directive). Caller is
     * responsible for resolving setting → `.nowlinerc` → `vscode.env.language`
     * before passing it in.
     */
    locale?: string;
    /** Total canvas width in px. Layout's default is 1280. */
    width?: number;
    /** Inverse of the CLI's `--no-links`. When false, link icons are dropped. */
    showLinks?: boolean;
    /** Promote asset / sanitizer warnings to errors in the diagnostic table. */
    strict?: boolean;
    /**
     * Override the asset-resolver root. When omitted, defaults to the
     * directory containing the source file — matches the CLI's behavior.
     */
    assetRoot?: string;
}

export type RenderOutcome =
    | { kind: 'svg'; svg: string }
    | { kind: 'diagnostics'; rows: DiagnosticRow[] };

/**
 * Run the full pipeline on the document's current text and return
 * either the SVG string or a list of diagnostics for the webview to
 * render as a table.
 *
 * Mirrors the in-process pipeline used by the `nowline` CLI, but:
 *  - Text comes from the live `vscode.TextDocument`, not from
 *    `fs.readFile`, so unsaved edits are reflected.
 *  - Includes resolve via a Node `readFile` callback so cross-file
 *    docs work out of the box.
 *  - Asset references resolve relative to `assetRoot` (or the source
 *    file's directory) with a path-escape check.
 *  - Errors return as structured `DiagnosticRow[]` instead of
 *    pre-formatted text so the webview can present a clickable table.
 *  - Renderer warnings flow into the same table when `strict` is on
 *    (matches the CLI's `--strict` flag).
 */
export async function renderDocument(inputs: RenderInputs): Promise<RenderOutcome> {
    const { text, fsPath } = inputs;
    const assetRoot = inputs.assetRoot ?? path.dirname(fsPath);

    const result: RenderResult = await browserRenderSource(text, {
        filePath: fsPath,
        theme: inputs.theme ?? 'light',
        today: inputs.today,
        locale: inputs.locale,
        width: inputs.width,
        showLinks: inputs.showLinks,
        strict: inputs.strict,
        readFile: async (absPath: string) => {
            const bytes = await fs.readFile(absPath);
            return new TextDecoder('utf-8').decode(bytes);
        },
        assetResolver: createAssetResolver(assetRoot),
    });

    if (result.kind === 'svg') {
        // Non-strict renderer warnings are silently dropped here to
        // preserve the m3c preview UX: a successful render shows the
        // diagram, not a diagnostics overlay. Strict mode flips the
        // browser pipeline into the `diagnostics` branch upstream so
        // this `kind: 'svg'` path is only reached when there is nothing
        // for the diagnostics table to report.
        return { kind: 'svg', svg: result.svg };
    }
    return { kind: 'diagnostics', rows: result.diagnostics };
}

/**
 * Asset-resolver factory copied from `packages/cli/src/commands/render.ts`'s
 * `createAssetResolver`. Embeds raster icons referenced by the DSL as base64
 * data URLs in the rendered SVG; reads bytes from disk relative to the
 * source file's directory and refuses paths that escape it.
 */
function createAssetResolver(assetRoot: string): AssetResolver {
    const root = path.resolve(assetRoot);
    return async (ref: string) => {
        const absPath = path.resolve(root, ref);
        if (!absPath.startsWith(root + path.sep) && absPath !== root) {
            throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
        }
        const bytes = await fs.readFile(absPath);
        const mime = guessMime(absPath);
        return {
            bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            mime,
        };
    };
}

function guessMime(p: string): string {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}
