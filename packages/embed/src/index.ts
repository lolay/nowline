// Public API for `@nowline/embed`. Mirrors Mermaid's surface
// (`initialize`, `render`, `parse`, `init`/`run`) so users coming from
// Mermaid don't have to relearn anything.
//
// The IIFE bundle exposes everything below as `window.nowline.*`. ESM
// consumers import named exports from the package root.

// Build-time constants substituted by esbuild's `define` (see
// `scripts/bundle.mjs`). The `typeof` guards keep this file safe to
// import under vitest, where esbuild's define never runs and the
// identifiers are undeclared.
declare const __NOWLINE_EMBED_VERSION__: string;
declare const __NOWLINE_EMBED_SHA__: string;

import {
    __resetAutoScanForTests,
    type AutoScanInputs,
    type AutoScanResult,
    runAutoScan,
} from './auto-scan.js';
import {
    __resetEmbedPipelineForTests,
    type EmbedParseResult,
    EmbedRenderError,
    type EmbedRenderOptions,
    parseSource,
    renderSource,
} from './pipeline.js';
import type { ShareOption } from './share.js';
import { type EmbedTheme, effectiveTheme, resolveSystemTheme } from './theme.js';

export {
    type AutoScanResult,
    type EmbedParseResult,
    EmbedRenderError,
    type EmbedTheme,
    type ShareOption,
};

/**
 * Bundle provenance, mirroring the legal-comment banner that
 * `scripts/bundle.mjs` injects at the top of every artifact:
 * `@nowline/embed <version> sha=<short-sha> built=<iso-utc>`.
 *
 * Exposed on the IIFE global as `nowline.version` / `nowline.sha` so
 * pages and bug reports can identify the exact build without scraping
 * the comment banner.
 */
export const version: string =
    typeof __NOWLINE_EMBED_VERSION__ !== 'undefined' ? __NOWLINE_EMBED_VERSION__ : '0.0.0';
export const sha: string =
    typeof __NOWLINE_EMBED_SHA__ !== 'undefined' ? __NOWLINE_EMBED_SHA__ : 'unknown';

const DEFAULT_SELECTOR = 'pre code.language-nowline, code.language-nowline';

export interface InitializeOptions {
    /** `light`, `dark`, or `auto` (read once via `prefers-color-scheme`). */
    theme?: EmbedTheme;
    /**
     * Auto-run `init()` on `DOMContentLoaded`. Defaults to `true`.
     * Setting this to `false` defers rendering until the page calls
     * `nowline.init()` (or `nowline.run()`) manually.
     */
    startOnLoad?: boolean;
    /**
     * CSS selector used to locate Nowline blocks. The default matches
     * markdown-renderer output (`<pre><code class="language-nowline">…</code></pre>`)
     * plus standalone `<code class="language-nowline">` for hosts that
     * skip the `<pre>` wrapper.
     */
    selector?: string;
    /** BCP-47 locale forwarded to the layout engine for axis labels and the now-pill. */
    locale?: string;
    /** Layout canvas width in pixels. Layout's default is 1280. */
    width?: number;
    /**
     * "Today" override for the now-line. Accepts a `Date`, a YYYY-MM-DD string,
     * a full ISO 8601 instant (with Z or ±offset), or `null` to suppress the
     * now-line. Defaults to the local civil date when omitted.
     */
    today?: Date | string | null;
    /**
     * Timezone for the clock-based "today" default. Only consulted when `today`
     * is omitted. Accepts `"local"` (default), `"UTC"`, ISO 8601 offsets, or
     * IANA timezone names (e.g. `"America/Los_Angeles"`).
     */
    timezone?: string;
    /**
     * Controls the "Share on Nowline" anchor appended after each rendered SVG.
     * - `true` (default) — link to the Free app open route
     *   (`https://free.nowline.io/open`).
     * - string — a custom base URL (may include a path); the fragment is appended.
     * - `false` / `'none'` — no anchor rendered.
     * - `{ textUrl, remoteUrl }` — template with `{text}` / `{url}` substitution.
     */
    share?: ShareOption;
    /**
     * Global source URL for all blocks on the page. When set, share links
     * use `#url=<sourceUrl>` instead of `#text=` (inline encoding).
     * Per-block `data-nowline-source-url` overrides this for individual blocks.
     * Only `https:` URLs are emitted as `#url=`.
     */
    sourceUrl?: string;
}

interface ResolvedConfig {
    theme: EmbedTheme;
    startOnLoad: boolean;
    selector: string;
    locale?: string;
    width?: number;
    today?: Date | string | null;
    timezone?: string;
    /** System theme captured at init; not reactive to OS theme flips mid-session. */
    systemTheme: 'light' | 'dark';
    /** Controls the "Share on Nowline" anchor. Defaults to `true`. */
    share: ShareOption;
    /** Global canonical source URL; per-block `data-nowline-source-url` takes priority. */
    sourceUrl?: string;
}

const initialConfig: ResolvedConfig = {
    theme: 'auto',
    startOnLoad: true,
    selector: DEFAULT_SELECTOR,
    systemTheme: resolveSystemTheme(),
    share: true,
};

let config: ResolvedConfig = { ...initialConfig };
let autoStartScheduled = false;

export function initialize(options: InitializeOptions = {}): void {
    config = {
        theme: options.theme ?? config.theme,
        startOnLoad: options.startOnLoad ?? config.startOnLoad,
        selector: options.selector ?? config.selector,
        locale: options.locale ?? config.locale,
        width: options.width ?? config.width,
        today: options.today !== undefined ? options.today : config.today,
        timezone: options.timezone ?? config.timezone,
        share: options.share ?? config.share,
        sourceUrl: options.sourceUrl ?? config.sourceUrl,
        // Re-read `prefers-color-scheme` on every initialize() so callers
        // who explicitly want the latest system theme can ask for it by
        // calling initialize() again. Auto-scan paths still use the value
        // captured at initialize time.
        systemTheme: resolveSystemTheme(),
    };
}

/** Build the EmbedRenderOptions used by `render` and the auto-scan path. */
function renderOptionsFromConfig(): EmbedRenderOptions {
    return {
        theme: effectiveTheme(config.theme, config.systemTheme),
        locale: config.locale,
        width: config.width,
        today: config.today,
        timezone: config.timezone,
    };
}

/**
 * Render a single Nowline source string to an SVG. Useful for
 * applications that want to control exactly when and where the SVG
 * lands (custom `<div>` containers, dynamically loaded blocks, etc.).
 */
export async function render(source: string, options: EmbedRenderOptions = {}): Promise<string> {
    const merged: EmbedRenderOptions = {
        ...renderOptionsFromConfig(),
        ...options,
    };
    return renderSource(source, merged);
}

/**
 * Parse a Nowline source string. Returns the AST and any lexer /
 * parser / validator errors. Does not run layout or render — useful for
 * editor experiences that want diagnostics without paying the render
 * cost.
 */
export async function parse(source: string): Promise<EmbedParseResult> {
    return parseSource(source);
}

/**
 * Scan the DOM for Nowline blocks and replace each with its rendered
 * SVG. Aliased as `run` for parity with Mermaid's recent API.
 */
export async function init(overrides?: Partial<AutoScanInputs>): Promise<AutoScanResult> {
    const inputs: AutoScanInputs = {
        selector: overrides?.selector ?? config.selector,
        theme: overrides?.theme ?? renderOptionsFromConfig().theme,
        locale: overrides?.locale ?? config.locale,
        width: overrides?.width ?? config.width,
        today: overrides?.today !== undefined ? overrides.today : config.today,
        timezone: overrides?.timezone ?? config.timezone,
        share: overrides?.share ?? config.share,
        sourceUrl: overrides?.sourceUrl ?? config.sourceUrl,
        document: overrides?.document,
    };
    return runAutoScan(inputs);
}

/** Alias for `init`, matching Mermaid's `mermaid.run()`. */
export const run = init;

// IIFE-bundle bootstrap. When the bundled script tag loads on a page,
// the bundler invokes the module body; we schedule auto-scan to fire on
// DOMContentLoaded unless the page disables it with
// `nowline.initialize({ startOnLoad: false })` synchronously after the
// script tag.
//
// Guarded by `typeof document !== 'undefined'` so ESM consumers
// (Node tests, build pipelines, server-side rendering) don't trigger
// the auto-scan branch.
if (typeof document !== 'undefined' && !autoStartScheduled) {
    autoStartScheduled = true;

    const start = (): void => {
        if (!config.startOnLoad) return;
        // Fire-and-forget; render errors are surfaced via `console.error`
        // inside `runAutoScan`.
        void init();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        // Document is already parsed; defer to next microtask so any
        // synchronous `initialize({ startOnLoad: false })` after the
        // script tag still wins the race.
        queueMicrotask(start);
    }
}

// Test-only escape hatch. Exposed as a named export so tests can reset
// the module's hidden state (config, system-theme cache, the once-only
// console.warn latch) between cases.
export function __resetForTests(): void {
    config = { ...initialConfig, systemTheme: resolveSystemTheme() };
    autoStartScheduled = false;
    __resetEmbedPipelineForTests();
    __resetAutoScanForTests();
}
