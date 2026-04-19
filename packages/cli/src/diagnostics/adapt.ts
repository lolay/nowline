import type { CliDiagnostic, DiagnosticSeverity } from './model.js';

// Minimal LSP-style diagnostic shape. Langium re-exports vscode-languageserver-types'
// Diagnostic internally; we keep a narrow local type to avoid a direct coupling and
// to survive cross-version type relocations.
export interface LangiumLikeDiagnostic {
    message: string;
    severity?: number;
    code?: string | number;
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

// Minimal shapes for chevrotain parser/lexer errors to avoid pulling chevrotain types.
interface ChevrotainParserError {
    message: string;
    token?: {
        startLine?: number;
        startColumn?: number;
        startOffset?: number;
        endLine?: number;
        endColumn?: number;
        endOffset?: number;
    };
}

interface ChevrotainLexerError {
    message: string;
    line?: number;
    column?: number;
    offset?: number;
    length?: number;
}

export function adaptLangiumDiagnostic(diag: LangiumLikeDiagnostic, file: string): CliDiagnostic {
    const severity = mapSeverity(diag.severity);
    const line = (diag.range?.start.line ?? 0) + 1;
    const column = (diag.range?.start.character ?? 0) + 1;
    return {
        file,
        line,
        column,
        severity,
        code: diagnosticCode(diag),
        message: diag.message,
        span: diag.range
            ? {
                  start: { line, column },
                  end: {
                      line: (diag.range.end.line ?? 0) + 1,
                      column: (diag.range.end.character ?? 0) + 1,
                  },
              }
            : undefined,
        suggestion: extractSuggestion(diag.message),
    };
}

export function adaptParserError(err: ChevrotainParserError, file: string): CliDiagnostic {
    const line = err.token?.startLine ?? 1;
    const column = err.token?.startColumn ?? 1;
    const endLine = err.token?.endLine ?? line;
    const endColumn = (err.token?.endColumn ?? column) + 1;
    return {
        file,
        line,
        column,
        severity: 'error',
        code: 'parse-error',
        message: err.message,
        span: { start: { line, column }, end: { line: endLine, column: endColumn } },
    };
}

export function adaptLexerError(err: ChevrotainLexerError, file: string): CliDiagnostic {
    const line = err.line ?? 1;
    const column = err.column ?? 1;
    const length = err.length ?? 1;
    return {
        file,
        line,
        column,
        severity: 'error',
        code: 'lex-error',
        message: err.message,
        span: {
            start: { line, column },
            end: { line, column: column + Math.max(length, 1) },
        },
    };
}

function mapSeverity(severity: number | undefined): DiagnosticSeverity {
    return severity === 2 ? 'warning' : 'error';
}

function diagnosticCode(diag: LangiumLikeDiagnostic): string {
    if (typeof diag.code === 'string' && diag.code !== '') return diag.code;
    if (typeof diag.code === 'number') return String(diag.code);
    return inferCodeFromMessage(diag.message);
}

function inferCodeFromMessage(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('duplicate identifier')) return 'duplicate-identifier';
    if (lower.includes('unknown reference') || lower.includes('did you mean')) return 'unknown-reference';
    if (lower.includes('circular')) return 'circular-dependency';
    if (lower.includes('requires') && lower.includes('date:')) return 'missing-date';
    if (lower.includes('duration')) return 'duration';
    if (lower.includes('include')) return 'include';
    if (lower.includes('indent')) return 'indentation';
    return 'validation';
}

const DID_YOU_MEAN_RE = /did you mean ['"]?([^'"?]+)['"]?\??/i;

function extractSuggestion(message: string): string | undefined {
    const match = message.match(DID_YOU_MEAN_RE);
    return match ? match[1].trim() : undefined;
}
