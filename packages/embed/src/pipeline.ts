// Thin shim around `@nowline/browser`'s pipeline. The browser package
// owns parse / resolveIncludes / layout / render; the embed layers two
// embed-specific behaviours on top:
//
//  - Throws `EmbedRenderError` on failure instead of returning a
//    discriminated union. The Mermaid-compatible `nowline.render(source)`
//    surface promises a string; throwing matches the documented v1
//    contract and keeps the auto-scan path's per-block error handling
//    simple.
//  - Latches a once-per-page-load `console.warn` the first time an
//    `include` directive is encountered. The browser pipeline emits a
//    structured callback for each skip; the embed converts that into a
//    single, deduped user-visible message.

import {
    __resetBrowserPipelineForTests,
    type RenderOptions as BrowserRenderOptions,
    parseSource as browserParseSource,
    renderSource as browserRenderSource,
    type DiagnosticRow,
    type ParseResult,
} from '@nowline/browser';
import type { ThemeName } from '@nowline/layout';

const EMBED_SOURCE_PATH = '/embed.nowline';

export interface EmbedRenderOptions {
    theme?: ThemeName;
    /**
     * "Today" override for the now-line.
     *
     * - `Date`   — explicit UTC-midnight date; drawn as-is.
     * - `string` — raw date string (YYYY-MM-DD or ISO 8601 instant with Z/offset).
     * - `null`   — suppress the now-line (mirrors `--now -`).
     * - `undefined` — default to local today (or `timezone` if set).
     *
     * Previously accepted only `Date`; strings and null are new as of the
     * timezone-aware now-line release.
     */
    today?: Date | string | null;
    /**
     * Timezone for the clock-based "today" default. Only consulted when
     * `today` is `undefined`. Accepts `"local"` (default), `"UTC"`, ISO 8601
     * offsets (`"Z"`, `"+05:30"`), or IANA names (`"America/Los_Angeles"`).
     */
    timezone?: string;
    locale?: string;
    width?: number;
    /**
     * Override the deterministic id prefix used for in-SVG `<style>`
     * scoping. Each block on a page should use a unique prefix so two
     * roadmaps cannot bleed styles into each other; the auto-scan path
     * generates a per-block prefix and threads it here.
     */
    idPrefix?: string;
}

export interface EmbedParseResult {
    ast: ParseResult['ast'];
    /** Lexer + parser + Langium validation diagnostics, normalized to strings. */
    errors: string[];
}

let includeWarningEmitted = false;

export async function parseSource(source: string): Promise<EmbedParseResult> {
    const { ast, diagnostics } = await browserParseSource(source, {
        filePath: EMBED_SOURCE_PATH,
    });
    return {
        ast,
        errors: diagnostics
            .filter((d: DiagnosticRow) => d.severity === 'error')
            .map((d) => d.message),
    };
}

export async function renderSource(
    source: string,
    options: EmbedRenderOptions = {},
): Promise<string> {
    const browserOptions: BrowserRenderOptions = {
        filePath: EMBED_SOURCE_PATH,
        theme: options.theme,
        today: options.today,
        timezone: options.timezone,
        locale: options.locale,
        width: options.width,
        idPrefix: options.idPrefix,
        onSkippedInclude: () => {
            if (!includeWarningEmitted) {
                includeWarningEmitted = true;
                console.warn(
                    'nowline: `include` directives are skipped in the browser embed (single-file mode). ' +
                        'Render multi-file roadmaps with the CLI or the GitHub Action.',
                );
            }
        },
    };

    const result = await browserRenderSource(source, browserOptions);
    if (result.kind === 'svg') return result.svg;

    const messages = result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
    throw new EmbedRenderError(`Failed to render Nowline source: ${messages.join('; ')}`, messages);
}

export class EmbedRenderError extends Error {
    constructor(
        message: string,
        public readonly details: string[],
    ) {
        super(message);
        this.name = 'EmbedRenderError';
    }
}

// Test-only escape hatch. The console.warn is intentionally emitted at
// most once per page load; tests that exercise the warning path need to
// reset the latch between cases.
export function __resetEmbedPipelineForTests(): void {
    includeWarningEmitted = false;
    __resetBrowserPipelineForTests();
}
