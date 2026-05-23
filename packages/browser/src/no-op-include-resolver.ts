/**
 * Browser-side `readFile` that always rejects with a stable, sniff-able
 * error tag. The pipeline catches matching include diagnostics and
 * surfaces them through the `onSkippedInclude` callback so callers can
 * implement their own warn-once-per-page behaviour without inheriting
 * a `console.warn` side effect from this package.
 *
 * A real HTTP-fetch resolver is intentionally out of scope here (see
 * `specs/handoffs/handoff-m4-embed.md`): CORS, relative-URL semantics,
 * and waterfall performance each warrant their own decision and are
 * best handled behind an opt-in flag in a follow-up.
 */
export const NOWLINE_BROWSER_NOOP_INCLUDE_TAG = '__nowline_browser_noop_include__';

export async function noOpIncludeReadFile(absPath: string): Promise<string> {
    throw new Error(
        `${NOWLINE_BROWSER_NOOP_INCLUDE_TAG}: include "${absPath}" was skipped — running in single-file mode.`,
    );
}

export function isNoOpIncludeDiagnosticMessage(message: string): boolean {
    return message.includes(NOWLINE_BROWSER_NOOP_INCLUDE_TAG);
}

export interface SkippedInclude {
    /** Absolute path of the include that was skipped. */
    sourcePath: string;
    /** The diagnostic message verbatim, including the sniff tag. */
    message: string;
}
