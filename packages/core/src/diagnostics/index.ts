// Shared diagnostic-collection primitives for every surface that turns a
// built Langium document into user-facing diagnostics (the CLI's text/JSON
// output, the browser preview table, the embed). The collection +
// classification logic lives here so the tricky Langium-folding behavior is
// defined exactly once; consumers keep their own thin mappers to their
// output shapes (CliDiagnostic, DiagnosticRow, …).

import type { LangiumDocument } from 'langium';

/**
 * Minimal LSP-style diagnostic shape. Langium re-exports
 * `vscode-languageserver-types`' `Diagnostic`; we keep a narrow local type to
 * avoid a direct coupling and to survive cross-version type relocations.
 */
export interface LangiumLikeDiagnostic {
    message: string;
    severity?: number;
    code?: string | number;
    /**
     * Langium stamps a machine-readable category here. Built-in lexer/parser
     * errors carry `{ code: 'lexing-error' | 'parsing-error' }`; validator
     * diagnostics carry the i18n stash `{ code: MessageCode, args }`.
     */
    data?: unknown;
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

/** Minimal Chevrotain lexer-error shape (avoids importing chevrotain types). */
export interface LexerErrorLike {
    message: string;
    line?: number;
    column?: number;
    offset?: number;
    length?: number;
}

/** Minimal Chevrotain parser-error shape (avoids importing chevrotain types). */
export interface ParserErrorLike {
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

export type RawDiagnosticOrigin = 'lexer' | 'parser' | 'validation';

/**
 * A diagnostic collected from a built document, tagged by where it came from.
 * Consumers switch on `origin` and run their own adapter to produce the shape
 * they need.
 */
export type RawDiagnostic =
    | { origin: 'lexer'; error: LexerErrorLike }
    | { origin: 'parser'; error: ParserErrorLike }
    | { origin: 'validation'; diagnostic: LangiumLikeDiagnostic };

// Langium's `DocumentValidator` stamps these on the lexer/parser errors it
// folds into `doc.diagnostics` (see langium/lib/validation/document-validator).
export const LANGIUM_LEXING_ERROR = 'lexing-error';
export const LANGIUM_PARSING_ERROR = 'parsing-error';

/**
 * True for the lexer/parser errors Langium re-folds into `doc.diagnostics`
 * inside `validateDocument()`. Callers that already surface those errors
 * directly from `parseResult.lexerErrors` / `parserErrors` skip these copies
 * so each syntax error is reported once.
 */
export function isBuiltinParseDiagnostic(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const code = (data as { code?: unknown }).code;
    return code === LANGIUM_LEXING_ERROR || code === LANGIUM_PARSING_ERROR;
}

/**
 * Collect every diagnostic from a built Langium document exactly once,
 * classified by origin. This is the single place that knows Langium's
 * `validateDocument()` re-folds lexer + parser errors into `doc.diagnostics`:
 * we surface those from `parseResult` and skip the re-folded copies, so no
 * consumer can re-introduce the double-count.
 *
 * Order matches insertion (lexer, then parser, then validation diagnostics);
 * consumers that display by source position sort as needed.
 */
export function collectDocumentDiagnostics(doc: LangiumDocument): RawDiagnostic[] {
    const out: RawDiagnostic[] = [];
    for (const error of doc.parseResult.lexerErrors) {
        out.push({ origin: 'lexer', error: error as LexerErrorLike });
    }
    for (const error of doc.parseResult.parserErrors) {
        out.push({ origin: 'parser', error: error as unknown as ParserErrorLike });
    }
    for (const diagnostic of doc.diagnostics ?? []) {
        const row = diagnostic as LangiumLikeDiagnostic;
        if (isBuiltinParseDiagnostic(row.data)) continue;
        out.push({ origin: 'validation', diagnostic: row });
    }
    return out;
}

const DID_YOU_MEAN_RE = /did you mean ['"]?([^'"?]+)['"]?\??/i;

/** Extract a `did you mean "X"` suggestion target from a message, if present. */
export function extractSuggestion(message: string): string | undefined {
    const match = message.match(DID_YOU_MEAN_RE);
    return match ? match[1].trim() : undefined;
}

/**
 * Heuristic fallback code for validator diagnostics that predate stable
 * codes. Prefer {@link resolveDiagnosticCode}, which checks the stable code
 * first and only falls back to this.
 */
export function inferCodeFromMessage(message: string): string {
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

/**
 * The stable validator code if present. Validator diagnostics stash
 * `{ code: MessageCode, args }` in `data`; the `args`-array guard avoids
 * mistaking other `data` payloads (VS Code code actions, Langium's built-in
 * `{ code: 'lexing-error' }`, …) for a stable code.
 */
export function stableValidatorCode(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const obj = data as { code?: unknown; args?: unknown };
    if (typeof obj.code !== 'string') return undefined;
    if (!Array.isArray(obj.args)) return undefined;
    return obj.code;
}

/**
 * Resolve the diagnostic code shown to users / machine consumers. Prefers the
 * stable validator code (`NL.Exxxx`) carried in `data`, then Langium's
 * top-level `code`, then a message-substring heuristic. Shared so the CLI,
 * preview, and embed label the same diagnostic identically.
 */
export function resolveDiagnosticCode(diag: LangiumLikeDiagnostic): string {
    const stable = stableValidatorCode(diag.data);
    if (stable) return stable;
    if (typeof diag.code === 'string' && diag.code !== '') return diag.code;
    if (typeof diag.code === 'number') return String(diag.code);
    return inferCodeFromMessage(diag.message);
}
