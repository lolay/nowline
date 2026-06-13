// Public API for `@nowline/browser`.
//
// The package's job is to give every browser-side surface (the embed
// CDN bundle, the VS Code preview, the Free SPA, and any third-party
// tool) the same parse → resolveIncludes → layout → render pipeline so
// behaviour cannot drift between them. Surface-specific concerns (DOM
// auto-scan, postMessage transport, save/copy commands) belong in the
// consumer; this package stays a pure data transform.

// LangiumLikeDiagnostic now lives in @nowline/core (shared with the CLI);
// re-exported here so existing @nowline/browser consumers keep importing it
// from the same place.
export type { LangiumLikeDiagnostic } from '@nowline/core';
export {
    civilDateInZone,
    type NormalizedZone,
    normalizeZone,
    type ResolveTodayOptions,
    resolveToday,
    TimezoneError,
} from '@nowline/layout';
export {
    type DiagnosticRow,
    fromLangiumDiagnostic,
    fromLayoutInsight,
    fromLexerError,
    fromParserError,
    fromRenderWarning,
    fromResolveDiagnostic,
} from './diagnostic-row.js';
// Showcase source string is generated from `examples/showcase.nowline`
// by `scripts/bundle-showcase.mjs` (m4.7 slice F) and re-exported here
// for empty-state content in browser SPAs.
export { showcaseSource } from './generated/showcase.js';
export {
    isNoOpIncludeDiagnosticMessage,
    NOWLINE_BROWSER_NOOP_INCLUDE_TAG,
    noOpIncludeReadFile,
    type SkippedInclude,
} from './no-op-include-resolver.js';
export {
    __resetBrowserPipelineForTests,
    DEFAULT_SYNTHETIC_PATH,
    type DiagnosticLevel,
    type ParseOptions,
    type ParseResult,
    parseSource,
    type RenderOptions,
    type RenderResult,
    renderSource,
    severityMeetsDiagnosticLevel,
} from './pipeline.js';
