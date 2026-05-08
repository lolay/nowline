import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { URI } from 'langium';
import {
    createNowlineServices,
    resolveIncludes,
    type NowlineFile,
    type NowlineServices,
} from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg, type AssetResolver } from '@nowline/renderer';
import {
    fromLangiumDiagnostic,
    fromLexerError,
    fromParserError,
    fromResolveDiagnostic,
    type DiagnosticRow,
    type LangiumLikeDiagnostic,
} from './diagnostic-row.js';

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

interface CachedServices {
    shared: ReturnType<typeof createNowlineServices>['shared'];
    Nowline: NowlineServices;
}

let cachedServices: CachedServices | undefined;
let docCounter = 0;

/**
 * Reuse a single Langium services container across renders. Each parse mints
 * a fresh URI (see `parse.ts` in the CLI for the reason — Langium's
 * DocumentBuilder mutates the prior document if the URI is reused).
 */
function getServices(): CachedServices {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

function freshUri(): URI {
    return URI.parse(`memory:///nowline-preview-${++docCounter}.nowline`);
}

/**
 * Run the full pipeline (parse + validate + resolveIncludes + layout + render)
 * on the document's current text and return either the SVG string or a list
 * of diagnostics for the webview to render as a table.
 *
 * Mirrors the in-process pipeline used by the `serve` CLI command, but:
 *  - The text comes from the live `vscode.TextDocument`, not from `fs.readFile`,
 *    so unsaved edits are reflected.
 *  - Errors return as structured `DiagnosticRow[]` instead of pre-formatted
 *    text, so the webview can present them as a clickable table.
 *  - Warnings emitted by the renderer go into the same table when `strict`
 *    is on (matches the CLI's `--strict` flag).
 */
export async function renderDocument(inputs: RenderInputs): Promise<RenderOutcome> {
    const { text, fsPath } = inputs;
    const theme: ThemeName = inputs.theme ?? 'light';

    const services = getServices();
    const docFactory = services.shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(text, freshUri());
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

    const rows: DiagnosticRow[] = [];
    for (const err of doc.parseResult.lexerErrors) {
        rows.push(fromLexerError(err, fsPath));
    }
    for (const err of doc.parseResult.parserErrors) {
        rows.push(fromParserError(err, fsPath));
    }
    for (const diag of doc.diagnostics ?? []) {
        rows.push(fromLangiumDiagnostic(diag as LangiumLikeDiagnostic, fsPath));
    }
    if (rows.some((r) => r.severity === 'error')) {
        return { kind: 'diagnostics', rows };
    }

    const ast = doc.parseResult.value;
    const resolved = await resolveIncludes(ast, fsPath, {
        services: services.Nowline,
    });
    for (const diag of resolved.diagnostics) {
        rows.push(fromResolveDiagnostic(diag));
    }
    if (rows.some((r) => r.severity === 'error')) {
        return { kind: 'diagnostics', rows };
    }

    const today = inputs.today === null ? undefined : inputs.today;
    const model = layoutRoadmap(ast, resolved, {
        theme,
        today,
        width: inputs.width,
        locale: inputs.locale,
    });

    const assetRoot = inputs.assetRoot ?? path.dirname(fsPath);
    const showLinks = inputs.showLinks !== false;
    const strict = inputs.strict === true;
    const warnings: string[] = [];

    const svg = await renderSvg(model, {
        assetResolver: createAssetResolver(assetRoot),
        noLinks: !showLinks,
        strict,
        warn: (msg) => warnings.push(msg),
    });

    if (warnings.length > 0) {
        const severity: DiagnosticRow['severity'] = strict ? 'error' : 'warning';
        for (const warning of warnings) {
            rows.push({
                file: fsPath,
                line: 1,
                column: 1,
                severity,
                code: 'render.warning',
                message: warning,
            });
        }
        if (strict) {
            return { kind: 'diagnostics', rows };
        }
    }

    if (rows.some((r) => r.severity === 'error')) {
        return { kind: 'diagnostics', rows };
    }

    return { kind: 'svg', svg };
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
