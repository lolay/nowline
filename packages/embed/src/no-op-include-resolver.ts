// Browser-side `readFile` that always rejects with a stable, sniff-able
// error. The render pipeline catches matching diagnostics and converts
// them into a single `console.warn` (deduped), so authors notice when
// they ship a file with `include` directives that the embed cannot
// satisfy without a network fetch.
//
// A real HTTP-fetch resolver is intentionally out of scope for m4 (see
// `specs/handoffs/handoff-m4-embed.md`): CORS, relative-URL semantics,
// and waterfall performance each warrant their own decision and are
// best handled behind an opt-in flag in a follow-up.

export const NOWLINE_EMBED_NOOP_INCLUDE_TAG = '__nowline_embed_noop_include__';

export async function noOpIncludeReadFile(absPath: string): Promise<string> {
    throw new Error(
        `${NOWLINE_EMBED_NOOP_INCLUDE_TAG}: include "${absPath}" was skipped — the embed runs in single-file mode.`,
    );
}

export function isNoOpIncludeDiagnosticMessage(message: string): boolean {
    return message.includes(NOWLINE_EMBED_NOOP_INCLUDE_TAG);
}
