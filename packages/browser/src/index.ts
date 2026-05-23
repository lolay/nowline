// Public API for `@nowline/browser`.
//
// The package's job is to give every browser-side surface (the embed
// CDN bundle, the VS Code preview, the Free SPA, and any third-party
// tool) the same parse → resolveIncludes → layout → render pipeline so
// behaviour cannot drift between them. Surface-specific concerns (DOM
// auto-scan, postMessage transport, save/copy commands) belong in the
// consumer; this package stays a pure data transform.

export {
    type DiagnosticRow,
    fromLangiumDiagnostic,
    fromLexerError,
    fromParserError,
    fromRenderWarning,
    fromResolveDiagnostic,
    type LangiumLikeDiagnostic,
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
    type ParseOptions,
    type ParseResult,
    parseSource,
    type RenderOptions,
    type RenderResult,
    renderSource,
} from './pipeline.js';
