import type { ResolveDiagnostic } from '@nowline/core';

/**
 * JSON-friendly diagnostic shape posted across the host -> webview boundary.
 *
 * Single source of truth for the protocol so the table renderer in
 * shell-html.ts and the host-side adapters in render-pipeline.ts can't drift.
 *
 * Field semantics mirror VS Code's Problems panel: `line` and `column` are
 * 1-based (the editor displays "Ln 12, Col 5"); `file` is an absolute fs path
 * so the `goto` handler can construct a `vscode.Uri` directly.
 */
export interface DiagnosticRow {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    suggestion?: string;
    file: string;
    line: number;
    column: number;
}

/** Minimal LSP-style diagnostic shape. Mirrors `LangiumLikeDiagnostic` in the CLI. */
export interface LangiumLikeDiagnostic {
    message: string;
    severity?: number;
    code?: string | number;
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

interface ChevrotainParserError {
    message: string;
    token?: {
        startLine?: number;
        startColumn?: number;
    };
}

interface ChevrotainLexerError {
    message: string;
    line?: number;
    column?: number;
}

const DID_YOU_MEAN_RE = /did you mean ['"]?([^'"?]+)['"]?\??/i;

export function fromLangiumDiagnostic(diag: LangiumLikeDiagnostic, file: string): DiagnosticRow {
    return {
        severity: diag.severity === 2 ? 'warning' : 'error',
        code: diagnosticCode(diag),
        message: diag.message,
        suggestion: extractSuggestion(diag.message),
        file,
        line: (diag.range?.start.line ?? 0) + 1,
        column: (diag.range?.start.character ?? 0) + 1,
    };
}

export function fromParserError(err: ChevrotainParserError, file: string): DiagnosticRow {
    return {
        severity: 'error',
        code: 'parse-error',
        message: err.message,
        file,
        line: err.token?.startLine ?? 1,
        column: err.token?.startColumn ?? 1,
    };
}

export function fromLexerError(err: ChevrotainLexerError, file: string): DiagnosticRow {
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
 * Adapt a `ResolveDiagnostic` (cross-file include resolution). The line is
 * 0-based in the resolver (it comes from a CST range) and may be undefined
 * for whole-file diagnostics like circular include — fall back to line 1 so
 * the click-to-jump still puts the cursor near the top of the offending file.
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

function diagnosticCode(diag: LangiumLikeDiagnostic): string {
    if (typeof diag.code === 'string' && diag.code !== '') return diag.code;
    if (typeof diag.code === 'number') return String(diag.code);
    return inferCodeFromMessage(diag.message);
}

function inferCodeFromMessage(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('duplicate identifier')) return 'duplicate-identifier';
    if (lower.includes('unknown reference') || lower.includes('did you mean'))
        return 'unknown-reference';
    if (lower.includes('circular')) return 'circular-dependency';
    if (lower.includes('requires') && lower.includes('date:')) return 'missing-date';
    if (lower.includes('duration')) return 'duration';
    if (lower.includes('include')) return 'include';
    if (lower.includes('indent')) return 'indentation';
    return 'validation';
}

function extractSuggestion(message: string): string | undefined {
    const match = message.match(DID_YOU_MEAN_RE);
    return match ? match[1].trim() : undefined;
}
