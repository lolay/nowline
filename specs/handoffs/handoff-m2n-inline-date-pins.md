# m2n handoff — Inline date pins

> **Status: feature-complete on the `feat/inline-date-pins` working set.
> Validator, layout, renderer, EN + FR i18n bundles, example,
> renderer fixture, and three vitest suites all ship in one
> changeset. Recorded here as a retrospective so the milestone chain
> reflects what landed between m2m and m3a.**
>
> Canonical entry: [`specs/milestones.md`](../milestones.md) § m2n.
> Spec context: [`specs/dsl.md`](../dsl.md) § "Inline date pins" +
> rules `24a`, `24b`, `27`, `28`; [`specs/rendering.md`](../rendering.md)
> § "Inline-date glyph".

## Why this milestone exists

The DSL has always had two ways to bind an entity to a calendar date:

1. A named `anchor` declaration with `date:YYYY-MM-DD`, referenced from
   `after:` / `before:` by id. Renders as a chart-spanning dashed cut
   line plus a diamond in the timeline header — visually loud, designed
   to *mean* something across the whole roadmap.
2. A `milestone` with `date:`, which is similar but renders as a
   header-row diamond + cut line and counts as a release gate.

There was no lightweight option for the very common case of "this one
item starts on a specific date" or "this group must finish by some
external deadline" — every such pin had to be promoted to an anchor,
which added a name, a config-section declaration line, and a loud
chart-wide visual that didn't reflect the pin's local scope.

m2n closes that gap by accepting an ISO date literal directly inside
`after:` / `before:` on `item` / `parallel` / `group`. The renderer
paints a small `calendar` glyph in the entity's top corner — quiet,
local, and unambiguous via tooltip. Authors who want the loud,
chart-spanning visual still declare a real `anchor`.

The change is small in surface area but touches every layer of the
stack — grammar terminal reuse, validator, layout sequencing,
renderer, i18n, examples, fixtures, tests — so it gets its own
milestone label rather than hiding inside m2m or one of the m2.x
polish passes.

## What landed

Themes mirror [`specs/milestones.md`](../milestones.md) § m2n. Each
sub-section maps to one layer of the stack.

### 1. DSL surface (no grammar change)

The grammar already had a `DATE_LITERAL` terminal matching
`YYYY-MM-DD` from the m2 anchor / milestone work. `after:` / `before:`
property values accept that terminal already; m2n just defines what it
means when the terminal lands inline instead of resolving to an id.

- Single date: `after:2026-03-15` / `before:2026-05-01`.
- Mixed list: `after:[upstream, 2026-03-15]` — `upstream` is an id,
  `2026-03-15` is an inline date; resolves to the latest (or
  earliest, for `before:`) of all elements.
- Spec entry: [`specs/dsl.md`](../dsl.md) § "Inline date pins" plus
  table-row updates on the per-entity property tables.

### 2. Validator (`packages/core/src/language/nowline-validator.ts`)

New `checkInlineDatePins` validator method registered alongside the
existing reference / cycle checks. Enforces four new rules with stable
error codes:

- **`NL.E0410` — `inline-date-multi-per-direction`.** A list with two
  or more ISO date literals in the same `after:` (or the same
  `before:`) is an error. Collapse to a single binding date instead.
- **`NL.E0411` — `inline-date-disallowed-entity`.** Inline dates are
  valid only on `item` / `parallel` / `group`. Using one on
  `milestone`, `swimlane`, `anchor`, `footnote`, `person`, or `team`
  is an error. Milestones already carry their own `date:`; the others
  have no calendar semantics to pin against.
- **`NL.E0412` — `inline-date-needs-roadmap-start`.** Any file with an
  inline date must declare `roadmap … start:YYYY-MM-DD`. Extends the
  existing rule 27 (which previously fired only for `anchor` and
  dated `milestone`).
- **`NL.E0413` — `inline-date-before-roadmap-start`.** Every inline
  date must be on or after the roadmap's `start:`. Extends rule 28.

Cross-cutting validator updates:

- `checkReferenceResolution` skips date-shaped values for
  `after:` / `before:` so an inline date never trips the "unresolved
  id" path.
- `checkCircularDependencies` skips date-shaped values for the same
  pair so an inline date never becomes a phantom graph node — they
  are calendar positions, not entities, and have no in-edges.
- `BUILTIN_ICON_NAMES` gains `calendar` so a user `symbol calendar`
  declaration is rejected by rule `17i` and can't shadow the
  renderer-side inline-date glyph.
- New helper `entityTypeLabel(node)` returns the lowercase entity-type
  string for embedding in messages (`"milestone"`, `"swimlane"`, …).

### 3. i18n (`packages/core/src/i18n/`)

- `codes.ts` — four new union members `NL.E0410` / `0411` / `0412` /
  `0413` plus matching entries in `ALL_CODES` for the CI key-coverage
  check.
- `messages.en.ts` — four message templates with the same arg shapes
  used at the call sites (`{ key, type, date, start }`).
- `messages.fr.ts` — neutral-French translations of all four
  templates, using `«\u00A0…\u00A0»` for guillemets and matching the
  existing `«\u00A0»` spacing convention.

The existing key-coverage CI check (every `messages.en.ts` key must
exist in `messages.fr.ts`) was the reason FR translations had to land
in the same changeset rather than a follow-up.

### 4. Layout (`packages/layout/`)

New module **`packages/layout/src/inline-date-pin-geometry.ts`** with
two pure placement helpers and one tiny picker:

- `computeItemInlineDatePins({ box, afterDate, beforeDate, hasLinkIcon, footnoteCount })`
  — places the glyph(s) inside an item bar, handling decoration-row
  interleaving:
  - **Top-LEFT (`after`)**: at `box.x + INLINE_DATE_GLYPH_INSET_LEFT_PX`
    when there's no link icon; otherwise one
    `INLINE_DATE_GLYPH_GAP_PX` past the link icon's right edge.
  - **Top-RIGHT (`before`)**: walks LEFT from the rightmost
    top-decoration slot — past the status dot when there are no
    footnotes; past the LEFTMOST footnote indicator when there are
    footnotes. Inserts at the LEFT end of the existing badge cluster
    so the badge sequence keeps its order.
  - **Narrow-bar spill**: when `bar.width < MIN_BAR_WIDTH_FOR_INLINE_DATE_PX`,
    the `before:` glyph spills RIGHT into the column the status dot
    uses; the `after:` glyph spills LEFT of the bar's leading edge
    so the side semantics stay readable.
- `computeContainerInlineDatePins({ box, afterDate, beforeDate })` —
  places the glyph(s) on a group / parallel bounding box, flush to
  the top-LEFT (`after`) / top-RIGHT (`before`) corner with the
  standard inset. Containers never spill (the bounding box always
  has room for a 12 px tile).
- `pickInlineDate(values)` — returns the first ISO-date-shaped string
  in a property's value list. The validator enforces "at most one
  inline date per direction" so this lookup is unambiguous.

New geometry constants in
**`packages/layout/src/item-bar-geometry.ts`**:

- `INLINE_DATE_GLYPH_TILE_SIZE_PX = 12` — smaller than the 14 px link
  tile so the date glyph reads as a sibling of the status dot.
- `INLINE_DATE_GLYPH_INSET_LEFT_PX = 6`, `INSET_RIGHT_PX = 6`,
  `INSET_TOP_PX = 5`.
- `INLINE_DATE_GLYPH_GAP_PX = ITEM_DECORATION_SPILL_GAP_PX` — shared
  with the existing decoration-row spacing.
- `MIN_BAR_WIDTH_FOR_INLINE_DATE_PX` ≈ 30, computed from the inset +
  tile-size + gap stack so the threshold updates if any input
  constant changes.

New type **`InlineDatePin`** in `packages/layout/src/types.ts` with
fields `side` (`'after' | 'before'`), `isoDate`, `glyphTopLeft`,
`glyphSize`, `spilled`. Three positioned shapes gain an optional
`inlineDatePins?: InlineDatePin[]`:

- `PositionedItem` — populated by `sequenceItem` in `layout.ts`.
- `PositionedGroup` — populated by `GroupNode`.
- `PositionedParallel` — populated by `ParallelNode`.

Sequencer changes in **`packages/layout/src/layout.ts`**:

- `sequenceItem` — `beforeRaw` switched from `propValue` to
  `propValues` so multi-element `before:[a, b, 2026-04-01]` works.
  The `after:` / `before:` resolution loops now parse each element
  with `parseDate` first; date elements resolve to a chart X via
  `ctx.scale.forwardWithinDomain`, id elements through the existing
  `entityRightEdges` / `entityLeftEdges` maps. `before:` picks the
  earliest cap across both flavours; `after:` picks the latest.
- `resolveChildStart` (group-child sequencing) — same `parseDate`
  treatment for the inline date branch.
- `computeContentEndDay` — new local `resolveAfterDay(ref)` that
  treats date refs as direct day-offsets via `daysBetween(startDate, …)`
  so a `group` / `parallel` with `after:DATE` widens the canvas
  correctly even when the date is the only `after:` element.
  `parallel` and `group` walk paths both now respect a container-level
  `after:` baseline before descending into children.

Container sequencing in
**`packages/layout/src/nodes/group-node.ts`** and
**`parallel-node.ts`**: after children are placed, each node calls
`computeContainerInlineDatePins` with its own `props.{after, before}`
to populate the optional `inlineDatePins` array.

### 5. Renderer (`packages/renderer/src/svg/`)

New `calendar` glyph added to the curated icon library in
**`packages/renderer/src/svg/icons.ts`**:

- Transcribed verbatim from Lucide's `calendar` icon (ISC) — rounded
  rectangle body, two top tabs, day-row divider — drawn on the same
  `0 0 24 24` viewBox using `currentColor`.
- Lives in a new `RENDERER_BUILTIN_ICON_SVG` map alongside the
  existing `CAPACITY_ICON_SVG` map. The new `BUILTIN_ICON_SVG`
  export is the union — callers walking the curated library by name
  don't have to know which subset each glyph belongs to. The
  capacity-icon contract (`CAPACITY_ICON_SVG` exposes exactly the
  four `capacity-icon:` glyphs) stays intact.
- `CAPACITY_ICON_ASCII` deliberately omits `calendar` — it's not a
  `capacity-icon:` value, so it has no role in capacity-suffix ASCII
  fallback.

New painter `renderInlineDatePin(pin, color)` in
**`packages/renderer/src/svg/render.ts`**:

- Emits a `<g data-layer="inline-date-pin" data-side data-date>` with
  a `<title>YYYY-MM-DD</title>` child for native browser tooltips and
  an inner `<svg>` carrying the calendar path coloured with the
  entity's resolved meta colour (`style.fg`).
- `data-spilled="true"` attribute when the bar was too narrow; absent
  when the glyph sits inside the bar.
- Z-order family: painted alongside the status dot and footnote
  indicators (above the bar fill, below dependency arrowheads).
- Shared helper `renderInlineDatePins(pins, color)` — called from
  `renderItem`, `renderGroup`, and `renderParallel` so the visual is
  identical across every entity type.

### 6. Examples and fixtures

- **`examples/inline-date-pins.nowline`** — user-facing example with
  inline comments walking through single-direction pins, the
  `before:` overflow case, mixed lists, and container-level pins on
  both group and parallel. Rendered by `pnpm build` via the new
  manifest entry in `scripts/render-samples.mjs`.
- **`tests/inline-date-corners.nowline`** — renderer manual-validation
  fixture, one swimlane per scenario: bare item, item + link icon,
  item + link + dot + footnotes, item with mixed list, styled group,
  unstyled group, bracketed parallel, bare parallel. Stresses every
  attachment rule from the rendering spec on one page. Added to
  `scripts/render-tests.mjs`.

### 7. Tests

Three new suites:

- **`packages/core/test/validation/inline-date-pins.test.ts`** —
  6 happy paths (single dates on item / group / parallel; mixed list)
  + 6 error paths (`NL.E0410` × 2, `NL.E0411` × 2 for milestone +
  swimlane, `NL.E0412`, `NL.E0413`) + 2 negative checks (cycle
  detection skips dates, reference-resolution skips dates).
- **`packages/layout/test/inline-date-pins.test.ts`** — geometry
  snapshot guard. Item with `after:` + `before:` emits one pin per
  side at expected coordinates; group / parallel pins attach to the
  bounding box; item without inline dates has empty / missing pins
  array; mixed list produces exactly one after-side pin.
- **`packages/cli/test/convert/roundtrip.test.ts`** — added
  `inline-date-pins.nowline` to the round-trip allow-list so the
  printer keeps the new syntax stable through text → JSON → text and
  JSON → text → JSON.

## Notable architectural decisions

- **Inline dates are calendar positions, not graph nodes.** The
  validator's `checkCircularDependencies` and `checkReferenceResolution`
  both skip date-shaped values explicitly. Treating a date as an
  entity would mean either inventing synthetic ids (collision risk
  with author identifiers) or special-casing date values in every
  downstream graph consumer (cycle output, reverse lookups, etc.).
  Skipping at the boundary is simpler and the day-axis math already
  knows how to handle bare dates.
- **`before:` widened to a list.** Previously `before:` was treated
  as a single value (`propValue`) even though the grammar accepted a
  list. m2n widens it to `propValues` and resolves to the earliest
  cap. This is a behaviour change for the rare existing file that
  used a list there, but the previous behaviour was "ignore everything
  after the first" which was a silent footgun — explicit semantics
  are an improvement.
- **No new entity types or grammar terminals.** The date terminal
  already existed; the property-value grammar already accepted it;
  the only new surface is meaning. Keeping the grammar untouched
  meant zero Langium-regeneration churn and no Snapshot drift in
  parser-driven tests.
- **Renderer-internal icons live next to capacity icons.** The
  `BUILTIN_ICON_SVG` union map sits in the same `icons.ts` module as
  `CAPACITY_ICON_SVG` so future built-in glyphs (whatever m2o brings)
  get one consistent home. The capacity-icon contract stayed intact
  because some callers (the meta-line painter) want exactly the
  capacity subset and would emit visual garbage if `calendar` were
  available there.
- **No caption next to the glyph.** Spec-level decision; the
  lightweight form deliberately stays quiet. Authors who want a
  visible on-canvas date label have always had the louder `anchor`
  option and now also have the implicit `<title>` tooltip on web
  targets. Adding a caption was tried in a planning sketch and
  immediately cluttered the bar's top-decoration row.
- **`calendar` reserved as a built-in icon name.** Rule `17i` was
  extended to include `calendar` so a user `symbol calendar` is
  rejected. Without this, a user-declared symbol could quietly
  shadow the inline-date glyph and break the visual.

## Where to look

- Geometry: [`packages/layout/src/inline-date-pin-geometry.ts`](../../packages/layout/src/inline-date-pin-geometry.ts)
  — `computeItemInlineDatePins`, `computeContainerInlineDatePins`,
  `pickInlineDate`.
- Constants: [`packages/layout/src/item-bar-geometry.ts`](../../packages/layout/src/item-bar-geometry.ts)
  — `INLINE_DATE_GLYPH_TILE_SIZE_PX`, `INLINE_DATE_GLYPH_INSET_*`,
  `INLINE_DATE_GLYPH_GAP_PX`, `MIN_BAR_WIDTH_FOR_INLINE_DATE_PX`.
- Item sequencer: [`packages/layout/src/layout.ts`](../../packages/layout/src/layout.ts)
  — `sequenceItem` (inline-date branches in `after:` / `before:`),
  `resolveChildStart` (group-child sequencing), `computeContentEndDay`
  (canvas-extent walk including container-level dates).
- Container sequencers: [`packages/layout/src/nodes/group-node.ts`](../../packages/layout/src/nodes/group-node.ts)
  and [`parallel-node.ts`](../../packages/layout/src/nodes/parallel-node.ts).
- Positioned shapes: [`packages/layout/src/types.ts`](../../packages/layout/src/types.ts)
  — `InlineDatePin`, `PositionedItem.inlineDatePins`,
  `PositionedGroup.inlineDatePins`, `PositionedParallel.inlineDatePins`.
- Renderer painter: [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts)
  — `renderInlineDatePin`, `renderInlineDatePins`; call sites in
  `renderItem`, `renderGroup`, `renderParallel`.
- Icon library: [`packages/renderer/src/svg/icons.ts`](../../packages/renderer/src/svg/icons.ts)
  — `RENDERER_BUILTIN_ICON_SVG`, `BUILTIN_ICON_SVG`.
- Validator: [`packages/core/src/language/nowline-validator.ts`](../../packages/core/src/language/nowline-validator.ts)
  — `checkInlineDatePins`; date-skip branches in
  `checkReferenceResolution` and `checkCircularDependencies`;
  `BUILTIN_ICON_NAMES` (rule `17i` reservation of `calendar`).
- i18n: [`packages/core/src/i18n/codes.ts`](../../packages/core/src/i18n/codes.ts),
  [`messages.en.ts`](../../packages/core/src/i18n/messages.en.ts),
  [`messages.fr.ts`](../../packages/core/src/i18n/messages.fr.ts).
- Example: [`examples/inline-date-pins.nowline`](../../examples/inline-date-pins.nowline).
- Renderer fixture: [`tests/inline-date-corners.nowline`](../../tests/inline-date-corners.nowline).
- Tests: [`packages/core/test/validation/inline-date-pins.test.ts`](../../packages/core/test/validation/inline-date-pins.test.ts),
  [`packages/layout/test/inline-date-pins.test.ts`](../../packages/layout/test/inline-date-pins.test.ts),
  [`packages/cli/test/convert/roundtrip.test.ts`](../../packages/cli/test/convert/roundtrip.test.ts).
- Render manifests: [`scripts/render-samples.mjs`](../../scripts/render-samples.mjs)
  (example), [`scripts/render-tests.mjs`](../../scripts/render-tests.mjs)
  (renderer fixture).
- Public contract: [`specs/dsl.md`](../dsl.md) § "Inline date pins"
  + rules `24a`, `24b`, `27`, `28`;
  [`specs/rendering.md`](../rendering.md) § "Inline-date glyph".

## Definition of Done

- [x] DSL spec entry in [`specs/dsl.md`](../dsl.md) — "Inline date
      pins" section, per-entity property-table updates, validation
      rules `24a` / `24b` / extended `27` / `28`.
- [x] Rendering spec entry in [`specs/rendering.md`](../rendering.md)
      — "Inline-date glyph" subsection with per-entity attach rules,
      decoration-row interleaving, narrow-bar spill, and tooltip
      contract; cross-references from the styles table and curated
      icon library section; `calendar` listed alongside `shield` /
      `warning` / `lock` in the built-in `icon:` vocabulary.
- [x] Validator implements all four codes (`NL.E0410`–`NL.E0413`),
      reference-resolution and cycle-detection both skip date values.
- [x] EN + FR i18n bundles cover all four new codes; key-coverage CI
      check stays green.
- [x] Layout helpers + container sequencers populate
      `inlineDatePins` on item / group / parallel; new geometry
      constants live next to the existing item-bar constants.
- [x] Renderer paints the `calendar` glyph from the curated icon
      library with `<title>` tooltip and `data-*` attributes for web
      surfaces; shared painter used by item / group / parallel paths.
- [x] `examples/inline-date-pins.nowline` renders cleanly via
      `pnpm build`; round-trips through the printer test allow-list.
- [x] `tests/inline-date-corners.nowline` exercises every documented
      attachment scenario.
- [x] Vitest suites green (`packages/core` validation suite,
      `packages/layout` geometry snapshot suite, `packages/cli`
      roundtrip allow-list extension).
- [x] m2n strikethrough applied in
      [`specs/milestones.md`](../milestones.md); dependency chain
      reflects `m2l → m2m → m2n → m3a`.

## Known follow-ups (not blocking m3a or later)

- **No on-canvas date caption.** Spec-level decision (see "Notable
  architectural decisions"). If user feedback shows the tooltip-only
  surface confuses non-web exports, a `--show-inline-dates` CLI flag
  or a `style.inline-date-caption:` style property could opt in to a
  small caption beside the glyph. Out of scope for m2n.
- **Container-level dates don't widen the canvas if all children
  fit.** `computeContentEndDay` now respects container `after:` /
  `before:` for the start-side widen, but a container-only date pin
  on an empty container is a degenerate case that isn't covered.
  Validate at write-time if users start hitting it.
- **No localized date format in the tooltip.** The `<title>` carries
  the raw ISO `YYYY-MM-DD`. The locale-aware tick-label formatter
  could be reused here once the `m2m` localization machinery is
  threaded into the renderer's tooltip path — currently the formatter
  lives in the layout / axis-tick code only.
- **`@nowline/lsp` hover doesn't yet surface the date.** The LSP
  server (m3a) could expand its hover on inline-date pins to show
  "pinned to 2026-03-15" alongside the existing entity-context hover.
  Trivial change; deferred to the next LSP-touching milestone.
