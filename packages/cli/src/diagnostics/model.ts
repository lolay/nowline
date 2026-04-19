export type DiagnosticSeverity = 'error' | 'warning';

export interface SourcePosition {
    line: number;
    column: number;
    offset?: number;
}

export interface SourceSpan {
    start: SourcePosition;
    end: SourcePosition;
}

export interface CliDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: DiagnosticSeverity;
    code: string;
    message: string;
    suggestion?: string;
    span?: SourceSpan;
}

export interface DiagnosticSource {
    file: string;
    contents: string;
}
