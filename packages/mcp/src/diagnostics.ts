// MCP diagnostic helpers — maps Langium/core diagnostics to the MCP tool shape.

import {
    collectDocumentDiagnostics,
    createNowlineServices,
    inferCodeFromMessage,
    isRoutedResolveDiagnostic,
    type NowlineFile,
    type ResolveDiagnostic,
    resolveDiagnosticCode,
    resolveDiagnosticSuggestion,
} from '@nowline/core';
import {
    type HostEnv,
    type RenderInputs,
    type StagedRoadmap,
    type StageResult,
    stageForExport,
} from '@nowline/export';
import { collectLayoutInsights, type LayoutInsight } from '@nowline/layout';
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
                suggestion: resolveDiagnosticSuggestion(diag.message, diag.data),
            });
        }
    }
    return out;
}

/**
 * A routed include-resolver diagnostic (a wave rule, specs/waves.md §6.1, or
 * an included file's NL.E0302) as an MCP diagnostic: its stable code, the
 * file it points into and a 1-based line and column, the validator's for the
 * same finding when the diagnostic carries a range (column 1 otherwise).
 * WV8, the one uncoded wave rule, is labelled like the validator's copy. An
 * included file's syntax error takes its position from the lexer or parser.
 */
export function resolveDiagnosticToMcp(diag: ResolveDiagnostic): McpDiagnostic {
    // An included file's syntax error, labelled like the root file's own.
    if (diag.syntax) {
        const column =
            diag.syntax.origin === 'lexer'
                ? diag.syntax.error.column
                : diag.syntax.error.token?.startColumn;
        return {
            file: diag.sourcePath,
            line: (diag.line ?? 0) + 1,
            // An error at end of input has no position (NaN).
            column: column !== undefined && Number.isFinite(column) ? column : 1,
            severity: 'error',
            code: diag.syntax.origin === 'lexer' ? 'lexing-error' : 'parsing-error',
            message: diag.message,
        };
    }
    const suggestion = resolveDiagnosticSuggestion(
        diag.message,
        diag.code === undefined ? undefined : { code: diag.code, args: diag.args ?? [] },
    );
    return {
        file: diag.sourcePath,
        line: (diag.range?.start.line ?? diag.line ?? 0) + 1,
        column: (diag.range?.start.character ?? 0) + 1,
        severity: diag.severity,
        code: diag.code ?? inferCodeFromMessage(diag.message),
        message: diag.message,
        ...(suggestion === undefined ? {} : { suggestion }),
    };
}

/** The routed diagnostics among `diagnostics`, as MCP diagnostics. */
export function routedResolveDiagnosticsToMcp(
    diagnostics: readonly ResolveDiagnostic[],
): McpDiagnostic[] {
    return diagnostics.filter(isRoutedResolveDiagnostic).map(resolveDiagnosticToMcp);
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

/**
 * The error response when include resolution reports a routed (wave-rule)
 * error: the validator's diagnostics (warnings only, since `doc` validated)
 * followed by `routed`.
 */
export function includeDiagnosticsResponse(
    doc: Awaited<ReturnType<typeof buildDocument>>,
    filePath: string,
    routed: McpDiagnostic[],
) {
    return diagnosticsErrorResponse(filePath, [...collectMcpDiagnostics(doc, filePath), ...routed]);
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

/**
 * Stage a validated document once for a tool call: the render, the export,
 * the insights and the routed include diagnostics all read this one result.
 * `doc` is the document `diagnosticsErrorBlock` (or `validate`) already built
 * from `source`, so nothing is parsed again.
 */
export function stageMcpRoadmap(
    doc: Awaited<ReturnType<typeof buildDocument>>,
    source: string,
    inputs: RenderInputs,
    host: HostEnv,
): Promise<StageResult> {
    return stageForExport(source, inputs, host, { document: doc, services: getMcpServices() });
}

/**
 * The routed (wave-rule) include diagnostics a stage reports, as MCP
 * diagnostics, errors included. An uncoded include error takes precedence and
 * hides them, as does a validator error (specs/waves.md §6.1).
 */
export function stageRoutedDiagnostics(stage: StageResult): McpDiagnostic[] {
    if (stage.kind === 'staged' || (stage.kind === 'include-error' && !stage.legacy)) {
        return stage.routed.map(resolveDiagnosticToMcp);
    }
    return [];
}

/**
 * Layout insights read from a staged roadmap's model: the layout the render
 * draws, logo included, so the insights describe the same header and chart.
 */
export function layoutInsightsFromStage(stage: StagedRoadmap): McpInsight[] {
    return collectLayoutInsights(stage.model, {
        today: stage.layout.today,
        locale: stage.layout.locale ?? 'en-US',
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

// ---- Structured tool errors (Anthropic Software Directory Policy § 5.A) ----

export class PathOutsideRootError extends Error {
    constructor(
        public readonly filePath: string,
        public readonly allowedRoot: string,
    ) {
        super(`Path ${filePath} is outside the allowed root ${allowedRoot}`);
        this.name = 'PathOutsideRootError';
    }
}

export class InputRequiredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InputRequiredError';
    }
}

export function toolError(code: string, message: string) {
    const payload = { ok: false as const, error: { code, message } };
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        isError: true as const,
    };
}

export function mapFsError(err: unknown, filePath: string): { code: string; message: string } {
    const errno = (err as NodeJS.ErrnoException | undefined)?.code;
    switch (errno) {
        case 'ENOENT':
            return { code: 'NL.MCP.NOT_FOUND', message: `File not found: ${filePath}` };
        case 'EACCES':
        case 'EPERM':
            return { code: 'NL.MCP.DENIED', message: `Permission denied: ${filePath}` };
        case 'EISDIR':
        case 'ENOTDIR':
            return { code: 'NL.MCP.NOT_A_FILE', message: `Not a file: ${filePath}` };
        default:
            return {
                code: 'NL.MCP.IO',
                message: err instanceof Error ? err.message : String(err),
            };
    }
}

export function handleToolError(err: unknown, filePath?: string) {
    if (err instanceof PathOutsideRootError) {
        return toolError(
            'NL.MCP.OUT_OF_ROOT',
            `Path ${err.filePath} is outside the allowed root ${err.allowedRoot}`,
        );
    }
    if (err instanceof InputRequiredError) {
        return toolError('NL.MCP.INPUT', err.message);
    }
    if (filePath !== undefined) {
        const mapped = mapFsError(err, filePath);
        return toolError(mapped.code, mapped.message);
    }
    return toolError('NL.MCP.IO', err instanceof Error ? err.message : String(err));
}
