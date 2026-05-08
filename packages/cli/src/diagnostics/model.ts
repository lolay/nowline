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

/**
 * Carries the validator's stable message code plus the named-argument
 * record it was formatted from, so the CLI can re-format the human
 * message in the operator's locale at print time. See
 * `specs/localization.md` for the two-chain precedence model.
 */
export interface LocalizedMessageData {
    code: string;
    args: ReadonlyArray<unknown>;
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
    /**
     * Stable code + args as captured by the validator. Present on
     * messages that flow through the `tr()` registry; absent for
     * literal-English validator strings, parser/lexer errors, and
     * include-resolution diagnostics. The CLI re-formats `message`
     * from this when an operator locale is supplied to
     * `formatDiagnostics`.
     */
    data?: LocalizedMessageData;
}

export interface DiagnosticSource {
    file: string;
    contents: string;
}
