// Shared `.nowline` fixtures for the browser pipeline test suite.

export const ROADMAP_ALPHA = `nowline v1

roadmap alpha "Alpha" start:2026-01-05 scale:2w
swimlane eng "Engineering"
  item research "Research" duration:3w status:done
  item build "Build" duration:2w status:in-progress
`;

export const ROADMAP_BETA = `nowline v1

roadmap beta "Beta" start:2026-03-01 scale:2w
swimlane design "Design"
  item discover "Discover" duration:2w status:planned
  item ship "Ship" duration:4w status:planned after:discover
`;

export const ROADMAP_WITH_INCLUDE = `nowline v1

include "./other.nowline"

roadmap withInclude "With Include" start:2026-01-05 scale:2w
swimlane eng "Engineering"
  item solo "Solo" duration:1w status:done
`;

export const ROADMAP_PARSE_ERROR = `nowline v1
this is not a valid roadmap line
`;

// `duration:3-w` trips three diagnostics on one line: an invalid-duration
// validation, a lexer "unexpected character" on the stray `-`, and a parser
// DEDENT error on the trailing `w`. Langium folds the lexer + parser errors
// into doc.diagnostics, so a naive collector double-counts them. Mirrors the
// real-world report that surfaced this bug.
export const ROADMAP_LEXER_ERROR = `nowline v1

roadmap eng-q1 "Engineering Q1" start:2026-01-05 length:8w
swimlane engineering "Engineering" capacity:4
  item support "On-call support" duration:8w capacity:1
  item auth-refactor "Auth refactor" duration:3-w capacity:2
  item search-v2 "Search v2" duration:2w capacity:2
`;
