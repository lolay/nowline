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
