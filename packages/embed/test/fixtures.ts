// Shared `.nowline` fixtures used by the embed test suite. Two
// distinct sources keep the multi-block style-isolation test honest:
// if the renderer's per-render id-prefix scoping ever broke, both
// blocks would still render but the SVGs would share `<style>` ids and
// CSS rules from one would target the other.

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
