import {
    extractSuggestion,
    inferCodeFromMessage,
    type LangiumLikeDiagnostic,
    type LexerErrorLike,
    type ParserErrorLike,
    type ResolveDiagnostic,
    resolveDiagnosticCode,
} from '@nowline/core';
import type { CliDiagnostic, DiagnosticSeverity, LocalizedMessageData } from './model.js';

export function adaptLangiumDiagnostic(diag: LangiumLikeDiagnostic, file: string): CliDiagnostic {
    const severity = mapSeverity(diag.severity);
    const line = (diag.range?.start.line ?? 0) + 1;
    const column = (diag.range?.start.character ?? 0) + 1;
    return {
        file,
        line,
        column,
        severity,
        // resolveDiagnosticCode prefers the stable validator code carried in
        // `data`, then Langium's `code`, then a message heuristic.
        code: resolveDiagnosticCode(diag),
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
        // The CLI keeps the full { code, args } so formatDiagnostics can
        // re-render the message in the operator's locale at print time.
        data: extractMessageData(diag.data),
    };
}

/**
 * Validate the shape of `diag.data`. Validator-emitted diagnostics
 * stash `{ code: MessageCode, args: MessageArgs<K> }` (where `args` is
 * the spread tuple `[]` or `[{...}]`). Anything else (vscode code
 * actions, third-party data, etc.) is ignored.
 */
function extractMessageData(data: unknown): LocalizedMessageData | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const obj = data as { code?: unknown; args?: unknown };
    if (typeof obj.code !== 'string') return undefined;
    if (!Array.isArray(obj.args)) return undefined;
    return { code: obj.code, args: obj.args };
}

export function adaptParserError(err: ParserErrorLike, file: string): CliDiagnostic {
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

export function adaptLexerError(err: LexerErrorLike, file: string): CliDiagnostic {
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

/**
 * Adapt a routed (wave-rule) include-resolver diagnostic, which carries only
 * a 0-based line. `contents` is the text of the file it points into, when
 * known: the span covers the line's text, so the code frame underlines the
 * declaration like a validator diagnostic does. A coded diagnostic keeps
 * `{ code, args }` in `data` for re-localization.
 */
export function adaptResolveDiagnostic(
    diag: ResolveDiagnostic,
    file: string,
    contents?: string,
): CliDiagnostic {
    const line = (diag.line ?? 0) + 1;
    const text = contents?.split(/\r?\n/)[line - 1]?.trimEnd() ?? '';
    const column = text.length - text.trimStart().length + 1;
    return {
        file,
        line,
        column,
        severity: diag.severity,
        span:
            text.trim() === ''
                ? undefined
                : { start: { line, column }, end: { line, column: text.length + 1 } },
        // WV8 is uncoded; label it the way the validator's copy is labelled.
        code: diag.code ?? inferCodeFromMessage(diag.message),
        message: diag.message,
        suggestion: extractSuggestion(diag.message),
        data: diag.code === undefined ? undefined : { code: diag.code, args: diag.args ?? [] },
    };
}
