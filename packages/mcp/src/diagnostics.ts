// MCP diagnostic helpers — maps Langium/core diagnostics to the MCP tool shape.

import {
    collectDocumentDiagnostics,
    createNowlineServices,
    extractSuggestion,
    type NowlineFile,
    resolveDiagnosticCode,
    resolveIncludes,
} from '@nowline/core';
import { collectLayoutInsights, type LayoutInsight, layoutRoadmap } from '@nowline/layout';
import { URI } from 'langium';

export interface McpDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    suggestion?: string;
}

export interface McpInsight {
    severity: 'info' | 'warning';
    code: string;
    message: string;
    entityId?: string;
}

export function layoutInsightToMcp(insight: LayoutInsight): McpInsight {
    return {
        severity: insight.severity,
        code: insight.code,
        message: insight.message,
        entityId: insight.entityId,
    };
}

let cachedServices: ReturnType<typeof createNowlineServices> | undefined;
let docCounter = 0;

export function getMcpServices() {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

export async function buildDocument(source: string) {
    const services = getMcpServices();
    const uri = URI.parse(`memory:///mcp-${++docCounter}.nowline`);
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        source,
        uri,
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    return doc;
}

export function collectMcpDiagnostics(
    doc: Awaited<ReturnType<typeof buildDocument>>,
    filePath: string,
): McpDiagnostic[] {
    const raw = collectDocumentDiagnostics(doc);
    const out: McpDiagnostic[] = [];
    for (const d of raw) {
        if (d.origin === 'lexer' || d.origin === 'parser') {
            out.push({
                file: filePath,
                line: 1,
                column: 1,
                severity: 'error',
                code: d.origin === 'lexer' ? 'lexing-error' : 'parsing-error',
                message: d.error.message,
            });
        } else {
            const diag = d.diagnostic;
            const range = diag.range;
            const severity =
                diag.severity === 2 ? 'warning' : diag.severity === 3 ? 'info' : 'error';
            out.push({
                file: filePath,
                line: (range?.start.line ?? 0) + 1,
                column: (range?.start.character ?? 0) + 1,
                severity,
                code: resolveDiagnosticCode(diag),
                message: diag.message,
                suggestion: extractSuggestion(diag.message),
            });
        }
    }
    return out;
}

export function diagnosticsErrorResponse(filePath: string, diagnostics: McpDiagnostic[]) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify({ ok: false, path: filePath, diagnostics }, null, 2),
            },
        ],
        isError: true as const,
    };
}

export async function diagnosticsErrorBlock(
    source: string,
    filePath: string,
): Promise<
    | { ok: true; doc: Awaited<ReturnType<typeof buildDocument>> }
    | { ok: false; response: ReturnType<typeof diagnosticsErrorResponse> }
> {
    const doc = await buildDocument(source);
    const diagnostics = collectMcpDiagnostics(doc, filePath);
    if (diagnostics.some((d) => d.severity === 'error')) {
        return { ok: false, response: diagnosticsErrorResponse(filePath, diagnostics) };
    }
    return { ok: true, doc };
}

export interface LayoutInsightInputs {
    source: string;
    filePath: string;
    today?: Date;
    theme?: 'light' | 'dark' | 'grayscale';
    width?: number;
    locale?: string;
    readFile?: (absPath: string) => Promise<string>;
    /** Pre-built document to reuse instead of re-parsing `source`. The
     *  caller is responsible for passing a doc parsed from the same
     *  `source` (e.g. the one from `diagnosticsErrorBlock`). */
    doc?: Awaited<ReturnType<typeof buildDocument>>;
}

export async function collectMcpLayoutInsights(inputs: LayoutInsightInputs): Promise<McpInsight[]> {
    const doc = inputs.doc ?? (await buildDocument(inputs.source));
    const diagnostics = collectMcpDiagnostics(doc, inputs.filePath);
    if (diagnostics.some((d) => d.severity === 'error')) {
        return [];
    }

    const services = getMcpServices();
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, inputs.filePath, {
        services: services.Nowline,
        readFile: inputs.readFile,
    });
    if (resolved.diagnostics.some((d) => d.severity === 'error')) {
        return [];
    }

    const layout = layoutRoadmap(file, resolved, {
        today: inputs.today,
        theme: inputs.theme ?? 'light',
        width: inputs.width,
        locale: inputs.locale ?? 'en-US',
    });

    return collectLayoutInsights(layout, {
        today: inputs.today,
        locale: inputs.locale ?? 'en-US',
    }).map(layoutInsightToMcp);
}

export const LAYOUT_INSIGHT_HINT =
    'These are layout consequences, not errors — the roadmap rendered. ' +
    'To see the visual result, call `render` with `review:true`.';

export const REVIEW_MAX_WIDTH = 1024;

export const DEFAULT_RENDER_WIDTH = 1280;

export const DSL_SYNTAX_POINTER =
    'Source is `.nowline` DSL (not JSON/YAML); call the `reference`/`examples` tools for full syntax.';

export const DSL_SYNTAX_EXAMPLE = `nowline v1

roadmap r "Title" start:2026-01-05 scale:2w

swimlane eng "Engineering"
  item build "Build" duration:3w`;

export function toolDescriptionWithSyntax(base: string): string {
    return `${base}\n\nExample:\n${DSL_SYNTAX_EXAMPLE}\n\n${DSL_SYNTAX_POINTER}`;
}
