# @nowline/layout

AST → positioned model for the [Nowline](../../) roadmap DSL.

`@nowline/layout` consumes the typed AST from [`@nowline/core`](../core) plus its
`resolveIncludes()` output and produces a deterministic *positioned model*: a tree
of entities with absolute coordinates, resolved styles (concrete hex colors),
and all the derived data a renderer needs. The renderer is palette-dumb;
every color decision lives here.

## Install

```bash
pnpm add @nowline/layout @nowline/core
```

## Usage

```ts
import { createNowlineServices, resolveIncludes } from '@nowline/core';
import { layoutRoadmap } from '@nowline/layout';

const { Nowline } = createNowlineServices();
// ... parse the source into `file: NowlineFile` via Langium ...
const resolved = await resolveIncludes(file, '/abs/path/to/roadmap.nowline', {
  services: Nowline,
});

const model = layoutRoadmap(file, resolved, {
  theme: 'light',    // 'light' | 'dark'
  width: 1200,       // canvas content width (header + timeline)
  today: new Date(), // or a pinned date for deterministic snapshots
});

model.width;      // full canvas width
model.height;     // full canvas height
model.header;     // PositionedHeader (with resolved box + logo placement)
model.timeline;   // PositionedTimelineScale
model.nowline;    // PositionedNowline | null (null if `today` outside range)
model.swimlanes;  // PositionedSwimlane[] (recursive)
model.milestones; // PositionedMilestone[]
model.edges;      // PositionedDependencyEdge[]
model.footnotes;  // PositionedFootnoteArea
model.includes;   // PositionedIncludeRegion[] — one per ResolveResult.isolatedRegions
```

## What lives here

- **Positioned model types** (`src/types.ts`) — one type per entity in the
  `specs/rendering.md` § The Positioned Model list.
- **Theme store** (`src/themes/`) — per-theme files (`light.ts`, `dark.ts`) both
  typed by a single `Theme` interface in `shape.ts`. See § Theme store below.
- **Style resolution** (`src/style-resolution.ts`) — the five-level precedence
  chain (inline > entity style > label style > config defaults > system default)
  baked into concrete hex colors from the selected theme.
- **Calendar + timeline** (`src/calendar.ts`, `src/timeline.ts`) — duration
  literal resolution, timeline scale, tick placement, and header-position
  branching (`beside` vs `above`).
- **Sequencing** (`src/sequencing.ts`) — within a swimlane, item start =
  `max(preceding end, latest after: end, 0)`; anchors fix start.
- **Parallel + group** (`src/parallel.ts`) — parallel children share x-start,
  stack vertically, region width = max child width.
- **Swimlanes** (`src/swimlanes.ts`) — recursive bands, alternating tint.
- **Anchors + milestones** (`src/anchors.ts`, `src/milestones.ts`) — diamond
  positions, fixed vs floating, slack arrows, overrun detection.
- **Dependencies** (`src/dependencies.ts`) — naïve orthogonal Manhattan routing
  with rounded corners; waypoint lists only (renderer draws the polyline).
- **Footnotes** (`src/footnotes.ts`) — superscripts on items + footnote-area
  below the chart.
- **Includes** (`src/include-regions.ts`) — one `PositionedIncludeRegion` per
  `ResolveResult.isolatedRegions[]`, rendered as a dashed-bordered region.
- **Nowline** (`src/nowline.ts`) — today's x on the scale, or `null` if outside
  range.

## Theme store

Themes live in `src/themes/` with one file per theme:

- `shape.ts` — the `Theme` interface that enumerates every role (DSL entity +
  DSL property + non-DSL roles like `nowline.stroke` and `status.done`).
- `shared.ts` — values identical across themes today (spacing, radii, shadow
  parameters, text-size scales). Boundary is allowed to move over time.
- `light.ts`, `dark.ts` — each is `const <name>Theme: Theme = { ... }`. `tsc`
  refuses to compile if either theme omits a role, which is our parity guard.
- `index.ts` — exports `Theme`, `lightTheme`, `darkTheme`, and
  `themes: { light, dark }`.

Adding a new theme = one new file + one line in `index.ts`.

## Determinism

Coordinate generation is fully deterministic. Given the same `(file, resolved,
options)`, `layoutRoadmap()` always returns identical numbers. This is how the
renderer's snapshot tests stay stable.

## Include resolution

Layout accepts a `ResolveResult` from `@nowline/core.resolveIncludes()` rather
than a merged AST. The `isolatedRegions[]` on the result surface per-file
isolated rendering data; layout walks them directly, so no AST changes are
required downstream. Merged includes (`roadmap:merge`, the default) flatten
into the main positioned model; isolates get their own `PositionedIncludeRegion`
bounding box with a label, rendered as a dashed region.
