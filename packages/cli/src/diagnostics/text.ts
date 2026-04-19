import { codeFrameColumns } from '@babel/code-frame';
import chalk from 'chalk';
import type { CliDiagnostic, DiagnosticSource } from './model.js';

export interface RenderTextOptions {
    color?: boolean;
}

export function renderText(
    diagnostics: CliDiagnostic[],
    sources: Map<string, DiagnosticSource>,
    options: RenderTextOptions = {},
): string {
    const useColor = options.color ?? chalk.level > 0;
    const parts = diagnostics.map((d) => renderOne(d, sources.get(d.file), useColor));
    return parts.join('\n\n');
}

function renderOne(
    diag: CliDiagnostic,
    source: DiagnosticSource | undefined,
    useColor: boolean,
): string {
    const header = renderHeader(diag, useColor);
    if (!source) return header;
    const frame = codeFrameColumns(
        source.contents,
        {
            start: { line: diag.line, column: diag.column },
            end: diag.span
                ? { line: diag.span.end.line, column: diag.span.end.column }
                : undefined,
        },
        {
            highlightCode: useColor,
            linesAbove: 2,
            linesBelow: 1,
            forceColor: useColor,
        },
    );
    return `${header}\n${frame}`;
}

function renderHeader(diag: CliDiagnostic, useColor: boolean): string {
    const loc = `${diag.file}:${diag.line}:${diag.column}`;
    const severityWord = diag.severity === 'error' ? 'error' : 'warning';
    if (!useColor) {
        const suffix = diag.suggestion ? ` — did you mean '${diag.suggestion}'?` : '';
        return `${loc} ${severityWord}: ${stripSuggestion(diag.message, diag.suggestion)}${suffix}`;
    }
    const coloredLoc = chalk.cyan(loc);
    const coloredSeverity = diag.severity === 'error'
        ? chalk.red.bold(severityWord)
        : chalk.yellow.bold(severityWord);
    const message = stripSuggestion(diag.message, diag.suggestion);
    const suggestion = diag.suggestion
        ? ` ${chalk.dim('—')} did you mean ${chalk.green(`'${diag.suggestion}'`)}?`
        : '';
    return `${coloredLoc} ${coloredSeverity}: ${message}${suggestion}`;
}

function stripSuggestion(message: string, suggestion: string | undefined): string {
    if (!suggestion) return message;
    return message.replace(/ —\s*did you mean ['"]?[^'"?]+['"]?\??/i, '').trimEnd();
}
