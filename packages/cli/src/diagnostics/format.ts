import { renderText } from './text.js';
import { renderJson } from './json.js';
import type { CliDiagnostic, DiagnosticSource } from './model.js';

export type DiagnosticFormat = 'text' | 'json';

export function isDiagnosticFormat(value: unknown): value is DiagnosticFormat {
    return value === 'text' || value === 'json';
}

export function formatDiagnostics(
    diagnostics: CliDiagnostic[],
    format: DiagnosticFormat,
    sources: Map<string, DiagnosticSource>,
    options: { color?: boolean } = {},
): string {
    if (format === 'json') return renderJson(diagnostics);
    return renderText(diagnostics, sources, { color: options.color });
}
