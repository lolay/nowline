import {
    extractSuggestion,
    type LangiumLikeDiagnostic,
    type LexerErrorLike,
    type ParserErrorLike,
    type ResolveDiagnostic,
    resolveDiagnosticCode,
} from '@nowline/core';
import type { LayoutInsight } from '@nowline/layout';

/**
 * JSON-friendly diagnostic shape consumed by browser preview surfaces.
 *
 * Single source of truth shared by the VS Code preview's webview table,
 * the embed's error path, and any other browser tool that wants
 * structured Nowline diagnostics. Field semantics mirror VS Code's
 * Problems panel: `line` and `column` are 1-based (the editor displays
 * "Ln 12, Col 5"); `file` is an absolute fs path (or a synthetic
 * embed-side path) so callers can map back to a source location.
 */
export interface DiagnosticRow {
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    suggestion?: string;
    file: string;
    line: number;
    column: number;
}

function mapLangiumSeverity(severity: number | undefined): DiagnosticRow['severity'] {
    if (severity === 2) return 'warning';
    if (severity === 3) return 'info';
    return 'error';
}

export function fromLangiumDiagnostic(diag: LangiumLikeDiagnostic, file: string): DiagnosticRow {
    return {
        severity: mapLangiumSeverity(diag.severity),
        // resolveDiagnosticCode prefers the stable validator code (NL.Exxxx)
        // carried in `data` so the preview table matches the CLI / Problems
        // panel, then falls back to Langium's `code`, then a message heuristic.
        code: resolveDiagnosticCode(diag),
        message: diag.message,
        suggestion: extractSuggestion(diag.message),
        file,
        line: (diag.range?.start.line ?? 0) + 1,
        column: (diag.range?.start.character ?? 0) + 1,
    };
}

export function fromParserError(err: ParserErrorLike, file: string): DiagnosticRow {
    return {
        severity: 'error',
        code: 'parse-error',
        message: err.message,
        file,
        line: err.token?.startLine ?? 1,
        column: err.token?.startColumn ?? 1,
    };
}

export function fromLexerError(err: LexerErrorLike, file: string): DiagnosticRow {
    return {
        severity: 'error',
        code: 'lex-error',
        message: err.message,
        file,
        line: err.line ?? 1,
        column: err.column ?? 1,
    };
}

/**
 * Adapt a `ResolveDiagnostic` (cross-file include resolution). The line
 * is 0-based in the resolver (it comes from a CST range) and may be
 * undefined for whole-file diagnostics like circular include — fall
 * back to line 1 so a click-to-jump still puts the cursor near the top
 * of the offending file.
 */
export function fromResolveDiagnostic(diag: ResolveDiagnostic): DiagnosticRow {
    return {
        severity: diag.severity,
        code: 'include',
        message: diag.message,
        file: diag.sourcePath,
        line: diag.line !== undefined ? diag.line + 1 : 1,
        column: 1,
    };
}

/**
 * Adapt a render-time warning message into a diagnostic row. Renderer
 * warnings are bare strings without a source location, so callers
 * supply the source `file`; in `strict` mode the caller upgrades
 * severity to `error` before passing the result on.
 */
export function fromRenderWarning(
    message: string,
    file: string,
    severity: DiagnosticRow['severity'] = 'warning',
): DiagnosticRow {
    return {
        severity,
        code: 'render.warning',
        message,
        file,
        line: 1,
        column: 1,
    };
}

/** Adapt a layout insight from `@nowline/layout` into a preview diagnostic row. */
export function fromLayoutInsight(insight: LayoutInsight, file: string): DiagnosticRow {
    return {
        severity: insight.severity,
        code: insight.code,
        message: insight.message,
        file,
        line: 1,
        column: 1,
    };
}
