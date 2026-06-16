// Pure helpers shared by the MCP Apps preview entry (src/ui/entry.ts).
//
// Kept DOM-free and side-effect-free so they are unit-testable in Node: entry.ts
// runs bootstrap() on import and touches the iframe DOM, so its logic can't be
// imported directly under Vitest. The widget derives its render inputs from two
// ext-apps signals — tool arguments (ontoolinput) and the tool result
// (ontoolresult) — and both mappings live here.

/** Server-injected or per-call render inputs for the live preview. */
export interface PreviewPayload {
    kind?: string;
    source: string;
    theme?: string;
    now?: string;
    width?: number;
    locale?: string;
    showLinks?: boolean;
    showMinimap?: boolean;
    initialFit?: 'fitPage' | 'fitWidth' | 'actual';
}

/**
 * Extract the lean `{ kind: 'nowline.preview', source, … }` payload from a tool
 * result's content blocks (the `ontoolresult` notification). This is the
 * authoritative path: the server resolves `path:` → `source` before emitting it.
 */
export function parsePreviewFromContent(
    content: Array<{ type: string; text?: string }> | undefined,
): PreviewPayload | undefined {
    if (!content) return undefined;
    for (const block of content) {
        if (block.type !== 'text' || !block.text) continue;
        try {
            const parsed = JSON.parse(block.text) as PreviewPayload;
            if (parsed.kind === 'nowline.preview' && typeof parsed.source === 'string') {
                return parsed;
            }
        } catch {
            /* not JSON — skip */
        }
    }
    return undefined;
}

/**
 * Build a preview payload from the LLM's raw `render` tool arguments
 * (the `ontoolinput` notification). Only viable for the inline-`source` case —
 * when the caller passed `path:` instead, the file can't be read in the iframe,
 * so we return undefined and wait for `ontoolresult` (which carries the
 * server-resolved `source`). Locale mirrors the server default (`en-US`).
 */
export function parsePreviewFromArguments(
    args: Record<string, unknown> | undefined,
): PreviewPayload | undefined {
    if (!args || typeof args.source !== 'string') return undefined;
    return {
        source: args.source,
        theme: typeof args.theme === 'string' ? args.theme : undefined,
        now: typeof args.now === 'string' ? args.now : undefined,
        width: typeof args.width === 'number' ? args.width : undefined,
        locale: 'en-US',
    };
}
