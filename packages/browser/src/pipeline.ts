// Browser-safe render pipeline shared by every browser surface that
// needs to turn `.nowline` source into SVG. Consolidates two prior
// implementations:
//
//  - `packages/embed/src/pipeline.ts` (single-file, no Node, throws on
//    error, fires a console.warn the first time an include is skipped).
//  - `packages/vscode-extension/src/preview/render-pipeline.ts` (full
//    options matrix incl. Node-backed include resolver + asset resolver,
//    returns a discriminated union instead of throwing).
//
// The seam between them is dependency injection. Callers that have
// access to a filesystem (VS Code, future Node browsers) supply a
// `readFile` callback and an `assetResolver`; callers that don't (embed,
// Free SPA) omit both, get the noop include reader, and receive a
// `SkippedInclude` callback when an `include` directive is encountered.
//
// The package itself imports zero `node:*` modules so the embed esbuild
// bundle stays free of any Node literal even before tree-shaking.

import {
    collectDocumentDiagnostics,
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    resolveIncludes,
} from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { type AssetResolver, type FontFamilies, renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import {
    type DiagnosticRow,
    fromLangiumDiagnostic,
    fromLexerError,
    fromParserError,
    fromRenderWarning,
    fromResolveDiagnostic,
} from './diagnostic-row.js';
import {
    isNoOpIncludeDiagnosticMessage,
    noOpIncludeReadFile,
    type SkippedInclude,
} from './no-op-include-resolver.js';

/**
 * Synthetic path stamped on diagnostics that have no real source file
 * (the embed renders strings, not files). Consumers can re-key it to
 * a more user-meaningful label by setting `filePath`.
 */
export const DEFAULT_SYNTHETIC_PATH = '/browser-source.nowline';

export interface ParseOptions {
    /**
     * Absolute path (or synthetic path) used to seed include resolution
     * and tag parse/validation diagnostics. Defaults to a synthetic
     * `/browser-source.nowline` so embedded blocks have a stable label.
     */
    filePath?: string;
    /**
     * Callback that resolves an `include "..."` directive to file
     * contents. When omitted, falls back to `noOpIncludeReadFile`
     * (every include is skipped and surfaced via `onSkippedInclude`).
     * VS Code passes a Node `fs.readFile` shim; the embed passes
     * nothing.
     */
    readFile?: (absPath: string) => Promise<string>;
    /**
     * Fires once per skipped include when the noop reader rejects it.
     * Use this to surface a single page-level warning without coupling
     * the pipeline to `console.warn`.
     */
    onSkippedInclude?: (info: SkippedInclude) => void;
}

export interface ParseResult {
    ast: NowlineFile;
    diagnostics: DiagnosticRow[];
}

export interface RenderOptions extends ParseOptions {
    theme?: ThemeName;
    /**
     * "Today" override threaded into the layout engine. Pass an
     * explicit `Date` for deterministic snapshots; pass `null` to
     * suppress the now-line entirely (mirrors the CLI's `--now -`);
     * leave undefined to use `new Date()` per render.
     */
    today?: Date | null;
    /** BCP-47 locale forwarded to the layout engine for axis labels. */
    locale?: string;
    /** Total canvas width in px. Layout's default is 1280. */
    width?: number;
    /**
     * Override the deterministic id prefix used for in-SVG `<style>`
     * scoping. Multi-block surfaces (auto-scan) supply a fresh prefix
     * per block so two roadmaps cannot bleed styles into each other.
     */
    idPrefix?: string;
    /** Inverse of the CLI's `--no-links`. When false, link icons are dropped. */
    showLinks?: boolean;
    /** Promote renderer warnings to errors in the diagnostic table. */
    strict?: boolean;
    /**
     * Asset resolver invoked by the renderer for image references
     * (`icon:` declarations, etc.). When omitted, image assets are
     * silently dropped — match the embed's "no filesystem" posture.
     */
    assetResolver?: AssetResolver;
    /**
     * Override per-role `font-family` strings. Defaults to the portable
     * `FONT_STACK`. The VS Code preview passes a pinned bundled family
     * (paired with an injected `@font-face`) so preview == raster export.
     */
    fontFamilies?: FontFamilies;
}

export type RenderResult =
    | { kind: 'svg'; svg: string; warnings: DiagnosticRow[] }
    | { kind: 'diagnostics'; diagnostics: DiagnosticRow[] };

interface CachedServices {
    shared: ReturnType<typeof createNowlineServices>['shared'];
    Nowline: NowlineServices;
}

let cachedServices: CachedServices | undefined;
let docCounter = 0;

function getServices(): CachedServices {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

function freshUri(): URI {
    // Each render mints a fresh URI; reusing one would let Langium's
    // DocumentBuilder mutate the prior document under us.
    return URI.parse(`memory:///nowline-browser-${++docCounter}.nowline`);
}

/**
 * Parse + validate the source. Returns the AST plus any diagnostics
 * normalized to the shared {@link DiagnosticRow} shape. Does not run
 * include resolution, layout, or rendering — useful for editor
 * experiences that want diagnostics without paying the render cost.
 */
export async function parseSource(
    source: string,
    options: ParseOptions = {},
): Promise<ParseResult> {
    const filePath = options.filePath ?? DEFAULT_SYNTHETIC_PATH;
    const services = getServices();
    const docFactory = services.shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(source, freshUri());
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

    // collectDocumentDiagnostics owns the de-dup: Langium re-folds lexer +
    // parser errors into doc.diagnostics, so the shared collector skips those
    // copies and we map each origin to a row here.
    const diagnostics: DiagnosticRow[] = [];
    for (const raw of collectDocumentDiagnostics(doc)) {
        if (raw.origin === 'lexer') {
            diagnostics.push(fromLexerError(raw.error, filePath));
        } else if (raw.origin === 'parser') {
            diagnostics.push(fromParserError(raw.error, filePath));
        } else {
            diagnostics.push(fromLangiumDiagnostic(raw.diagnostic, filePath));
        }
    }
    return { ast: doc.parseResult.value, diagnostics };
}

/**
 * Run the full pipeline (parse + validate + resolveIncludes + layout
 * + render) and return either the SVG or a list of diagnostics. The
 * `RenderResult` discriminated union mirrors the CLI's success/failure
 * split so callers can render either path without try/catch plumbing.
 */
export async function renderSource(
    source: string,
    options: RenderOptions = {},
): Promise<RenderResult> {
    const filePath = options.filePath ?? DEFAULT_SYNTHETIC_PATH;
    const parsed = await parseSource(source, { filePath });
    if (parsed.diagnostics.some((d) => d.severity === 'error')) {
        return { kind: 'diagnostics', diagnostics: parsed.diagnostics };
    }

    const services = getServices();
    const readFile = options.readFile ?? noOpIncludeReadFile;
    const resolved = await resolveIncludes(parsed.ast, filePath, {
        services: services.Nowline,
        readFile,
    });

    const rows: DiagnosticRow[] = [...parsed.diagnostics];
    for (const diag of resolved.diagnostics) {
        if (diag.severity === 'error' && isNoOpIncludeDiagnosticMessage(diag.message)) {
            options.onSkippedInclude?.({
                sourcePath: diag.sourcePath,
                message: diag.message,
            });
            continue;
        }
        rows.push(fromResolveDiagnostic(diag));
    }
    if (rows.some((r) => r.severity === 'error')) {
        return { kind: 'diagnostics', diagnostics: rows };
    }

    const today = options.today === null ? undefined : options.today;
    const model = layoutRoadmap(parsed.ast, resolved, {
        theme: options.theme,
        today,
        locale: options.locale,
        width: options.width,
    });

    const showLinks = options.showLinks !== false;
    const strict = options.strict === true;
    const warnMessages: string[] = [];

    const svg = await renderSvg(model, {
        idPrefix: options.idPrefix,
        assetResolver: options.assetResolver,
        noLinks: !showLinks,
        strict,
        warn: (msg) => warnMessages.push(msg),
        fontFamilies: options.fontFamilies,
    });

    const warnings = warnMessages.map((m) =>
        fromRenderWarning(m, filePath, strict ? 'error' : 'warning'),
    );
    if (strict && warnings.length > 0) {
        return { kind: 'diagnostics', diagnostics: [...rows, ...warnings] };
    }

    return { kind: 'svg', svg, warnings };
}

/**
 * Test-only escape hatch. Resets cached Langium services and the
 * URI counter between cases so a `parseSource` failure in one test
 * doesn't poison the next one's document builder.
 */
export function __resetBrowserPipelineForTests(): void {
    cachedServices = undefined;
    docCounter = 0;
}
