import { type MessageCode, tr } from '@nowline/core';
import { renderJson } from './json.js';
import type { CliDiagnostic, DiagnosticSource } from './model.js';
import { renderText } from './text.js';

export type DiagnosticFormat = 'text' | 'json';

export interface FormatDiagnosticsOptions {
    color?: boolean;
    /**
     * Operator locale (BCP-47) used to re-format validator messages
     * that carry `data: { code, args }`. Validator messages without
     * `data` and parser/lexer errors pass through unchanged.
     *
     * Defaults to en-US: an unset operator locale produces the same
     * canonical English text the validator stashed at parse time.
     * See `specs/localization.md` for the two-chain model.
     */
    operatorLocale?: string;
}

export function isDiagnosticFormat(value: unknown): value is DiagnosticFormat {
    return value === 'text' || value === 'json';
}

export function formatDiagnostics(
    diagnostics: CliDiagnostic[],
    format: DiagnosticFormat,
    sources: Map<string, DiagnosticSource>,
    options: FormatDiagnosticsOptions = {},
): string {
    const localized = relocalizeDiagnostics(diagnostics, options.operatorLocale);
    if (format === 'json') return renderJson(localized);
    return renderText(localized, sources, { color: options.color });
}

/**
 * Re-format any diagnostic carrying `data.{code,args}` in the operator
 * locale. Diagnostics without `data` (literal-English validator
 * strings, parser/lexer errors, include-resolution errors) pass
 * through verbatim.
 *
 * No-op when `operatorLocale` is undefined or `'en-US'`: the messages
 * stashed by the validator are already en-US, so we avoid the work
 * and the allocation in the common case.
 */
function relocalizeDiagnostics(
    diagnostics: CliDiagnostic[],
    operatorLocale: string | undefined,
): CliDiagnostic[] {
    if (!operatorLocale || operatorLocale === 'en-US') return diagnostics;
    return diagnostics.map((d) => {
        if (!d.data) return d;
        // The validator stashes args as the verbatim spread tuple it received,
        // typed strongly per-code in `@nowline/core/i18n`. By the time it
        // reaches us through `unknown` it has lost that tagged shape; we cast
        // back here because the only producer is the validator and the
        // `code` half of the pair pins the expected arity.
        const args = d.data.args as Parameters<typeof tr<MessageCode>> extends [
            string,
            MessageCode,
            ...infer R,
        ]
            ? R
            : never;
        const message = tr(operatorLocale, d.data.code as MessageCode, ...args);
        if (message === d.message) return d;
        return { ...d, message };
    });
}
