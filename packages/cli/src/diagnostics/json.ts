import type { CliDiagnostic } from './model.js';

export const DIAGNOSTICS_SCHEMA_VERSION = '1';

export interface DiagnosticsDocument {
    $nowlineDiagnostics: string;
    diagnostics: CliDiagnostic[];
}

export function renderJson(diagnostics: CliDiagnostic[]): string {
    const doc: DiagnosticsDocument = {
        $nowlineDiagnostics: DIAGNOSTICS_SCHEMA_VERSION,
        diagnostics: diagnostics.map(normalize),
    };
    return JSON.stringify(doc, null, 2);
}

function normalize(d: CliDiagnostic): CliDiagnostic {
    const out: CliDiagnostic = {
        file: d.file,
        line: d.line,
        column: d.column,
        severity: d.severity,
        code: d.code,
        message: d.message,
    };
    if (d.suggestion) out.suggestion = d.suggestion;
    if (d.span) out.span = d.span;
    return out;
}
