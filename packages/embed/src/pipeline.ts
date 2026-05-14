// Render pipeline shared by `nowline.render(source)` and the auto-scan
// path. Mirrors the shape of `packages/vscode-extension/src/preview/
// render-pipeline.ts` but stripped of every Node-only dependency: no
// `fs`, no `path`, no asset resolver. Includes are resolved against a
// no-op `readFile` so a file containing `include "./other.nowline"`
// renders the parts that survive without a network fetch.

import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    resolveIncludes,
} from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import { isNoOpIncludeDiagnosticMessage, noOpIncludeReadFile } from './no-op-include-resolver.js';

export interface EmbedRenderOptions {
    theme?: ThemeName;
    today?: Date;
    locale?: string;
    width?: number;
    /**
     * Override the deterministic id prefix used for in-SVG `<style>`
     * scoping. Each block on a page should use a unique prefix so two
     * roadmaps cannot bleed styles into each other; the auto-scan path
     * generates a per-block prefix and threads it here.
     */
    idPrefix?: string;
}

export interface EmbedParseResult {
    ast: NowlineFile;
    /** Lexer + parser + Langium validation diagnostics, normalized to strings. */
    errors: string[];
}

interface CachedServices {
    shared: ReturnType<typeof createNowlineServices>['shared'];
    Nowline: NowlineServices;
}

let cachedServices: CachedServices | undefined;
let docCounter = 0;
let includeWarningEmitted = false;

function getServices(): CachedServices {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

function freshUri(): URI {
    return URI.parse(`memory:///nowline-embed-${++docCounter}.nowline`);
}

export async function parseSource(source: string): Promise<EmbedParseResult> {
    const services = getServices();
    const docFactory = services.shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(source, freshUri());
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

    const errors: string[] = [];
    for (const e of doc.parseResult.lexerErrors) errors.push(e.message);
    for (const e of doc.parseResult.parserErrors) errors.push(e.message);
    for (const d of doc.diagnostics ?? []) {
        if (d.severity === 1) errors.push(d.message);
    }
    return { ast: doc.parseResult.value, errors };
}

export async function renderSource(
    source: string,
    options: EmbedRenderOptions = {},
): Promise<string> {
    const parsed = await parseSource(source);
    if (parsed.errors.length > 0) {
        throw new EmbedRenderError(
            `Failed to parse Nowline source: ${parsed.errors.join('; ')}`,
            parsed.errors,
        );
    }

    const services = getServices();
    const resolved = await resolveIncludes(parsed.ast, '/embed.nowline', {
        services: services.Nowline,
        readFile: noOpIncludeReadFile,
    });

    let sawIncludeWarning = false;
    const blockingErrors: string[] = [];
    for (const diag of resolved.diagnostics) {
        if (diag.severity !== 'error') continue;
        if (isNoOpIncludeDiagnosticMessage(diag.message)) {
            sawIncludeWarning = true;
            continue;
        }
        blockingErrors.push(diag.message);
    }
    if (blockingErrors.length > 0) {
        throw new EmbedRenderError(
            `Failed to resolve Nowline source: ${blockingErrors.join('; ')}`,
            blockingErrors,
        );
    }
    if (sawIncludeWarning && !includeWarningEmitted) {
        includeWarningEmitted = true;
        console.warn(
            'nowline: `include` directives are skipped in the browser embed (single-file mode). ' +
                'Render multi-file roadmaps with the CLI or the GitHub Action.',
        );
    }

    const model = layoutRoadmap(parsed.ast, resolved, {
        theme: options.theme,
        today: options.today,
        locale: options.locale,
        width: options.width,
    });

    return renderSvg(model, {
        idPrefix: options.idPrefix,
    });
}

export class EmbedRenderError extends Error {
    constructor(
        message: string,
        public readonly details: string[],
    ) {
        super(message);
        this.name = 'EmbedRenderError';
    }
}

// Test-only escape hatch. The console.warn is intentionally emitted at
// most once per page load; tests that exercise the warning path need to
// reset the latch between cases.
export function __resetEmbedPipelineForTests(): void {
    includeWarningEmitted = false;
    cachedServices = undefined;
    docCounter = 0;
}
