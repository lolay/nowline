# m2.5c handoff — Measure/Place Tree

Captures the partial state of m2.5c after the unattended overnight session
that completed prereqs, m2.5a, and m2.5b. m2.5c is intentionally split:
this handoff explains what landed in the foundation commit and what the
next session needs to deliver.

## Where we are

**Foundation in place (committed):**

- [`packages/layout/src/renderable.ts`](../../packages/layout/src/renderable.ts) — `Renderable<TPositioned>`,
  `MeasureContext`, `PlaceContext`, `IntrinsicSize`, `Point` interfaces.
  Mirrors the prototype's contract in [`layout-v2/src/renderable.ts`](../../layout-v2/src/renderable.ts) but
  takes production's `TimeScale`, `BandScale`, `ResolvedStyle` as inputs.
- [`packages/layout/src/nodes/item-node.ts`](../../packages/layout/src/nodes/item-node.ts) — first node implementation.
  `measure` returns `{ width: logicalRight - logicalLeft, height: bands.bandwidth() }`;
  `place(origin, ctx)` returns the visual box, `textX`, and `textSpills`
  flag with the same arithmetic the legacy `sequenceItem` uses (inner
  text width = `visualWidth - 24`).
- Unit tests in [`packages/layout/test/item-node.test.ts`](../../packages/layout/test/item-node.test.ts) covering
  measure, place insets, fit-inside, spill-outside, and a parity case
  matching the legacy decision.

**Production pipeline still uses the legacy code path.** `ItemNode` is
wired into the renderable interface but not yet called from `layout.ts`.
This is intentional: the spec mitigation says *"port one entity at a
time, keep the old code path live until each entity's tests pass on the
new path"*; this session ran unattended and chose to land the foundation
under test rather than risk a partial integration.

## What the next milestone needs to deliver

Per [specs/rendering-v2.md §m2.5c](../rendering-v2.md#m25c--layout-v2-measureplace-tree):

1. **Wire `ItemNode` into `sequenceItem`.** Replace the inline box +
   `textSpills` arithmetic in [`layout.ts`](../../packages/layout/src/layout.ts) (~lines
   261–267 and 405–407) with `new ItemNode(...).place(...)`. Snapshots
   stay byte-stable.
2. **Port the remaining entities into sibling node files:**
   - `swimlane-node.ts` — band height + tab geometry + row stacking.
     The shelf-pack pattern is in [`layout-v2/src/renderable.ts`](../../layout-v2/src/renderable.ts) for
     reference; production needs to handle parallels and groups too.
   - `group-node.ts` — bracket + child stacking.
   - `parallel-node.ts` — parallel block geometry.
   - `anchor-node.ts`, `milestone-node.ts` — marker geometry.
   - `footnote-node.ts` — footnote area.
   - `include-node.ts` — isolated include region.
   - `roadmap-node.ts` — composition root that stacks swimlanes via
     `BandScale.forRows({ count, range, paddingInner })`.
3. **Collapse `layout.ts` to ~300 LOC.** After every entity ports the
   per-entity logic moves to its node file; `layoutRoadmap` becomes a
   small composition root that builds the `RoadmapNode` and calls
   `place` once.

## Key decisions already made

- **Renderable interface lives in [`renderable.ts`](../../packages/layout/src/renderable.ts) at the
  layout package root**, not under `nodes/`. Nodes import from it.
  Mirrors how `time-scale.ts` and `band-scale.ts` are package-root
  primitives the nodes depend on.
- **`ItemNode` consumes `logicalLeftX`/`logicalRightX`, not raw start /
  end dates.** Dependency resolution (`after:`, `before:`, cursor.x,
  explicit `date:`) stays in `sequenceItem` for now — those references
  read other entities' positioned forms (`ctx.entityRightEdges`) which
  the node tree doesn't model yet. When `roadmap-node.ts` lands the
  cross-entity references can move into the place pass via a
  two-pass `measure → place` over the whole tree.
- **`PlaceContext.bandX`/`bandWidth`** are optional and default to
  `time.range`. The swimlane node uses them to draw a full-width
  band background; items don't care.
- **Byte-stable is the gate.** All five samples
  ([`packages/layout/test/__snapshots__/`](../../packages/layout/test/__snapshots__/))
  must compare clean against the v1-rendered baseline. Use
  `UPDATE_LAYOUT_SNAPSHOTS=1` only after a deliberate visual change is
  approved in review.

## Suggested plan for the next session

1. **`item-node` integration.** ~50 LOC change in `layout.ts`:
   construct an `ItemNode` after `metaText` is computed, call `.place`,
   replace the inline `itemBox` and `textSpills` literals. Run
   snapshots; expect green.
2. **`swimlane-node` port.** Move `buildSwimlane` body to `swimlane-node.ts`,
   leaving a thin shim in `layout.ts`. The shelf-pack logic in the
   prototype is the canonical reference but needs to handle:
   - groups + parallels (own-row blocks)
   - title-tab top-pad collapse (compact when row 0 doesn't overlap
     the tab horizontally — already implemented in production lines
     618–624 of the current `buildSwimlane`)
   - first-row top alignment with the tab when none of row-0's items
     overlap.
3. **Group + parallel nodes.** These are just stacking primitives; the
   ports should be ~50 LOC each.
4. **Anchor + milestone nodes.** Mostly geometry with collision-bump
   logic against existing milestone xs. Match the existing
   `buildAnchors` / `buildMilestones` byte-for-byte.
5. **Footnote node + include node + roadmap composition root.** Once
   these land, `layout.ts` collapses.

## Gotchas

- **`PositionedItem.textX` does not exist in the production type.**
  `ItemNode.place` returns `textX` for forward-compat with the prototype,
  but the production renderer does not consume it. When wiring `ItemNode`
  into `sequenceItem`, drop `textX` from the result and keep only
  `box` + `textSpills`. Add `textX` to `PositionedItem` (and renderer
  consumption) only when the renderer migration is intentional.
- **`PositionedTimelineScale` shape is renderer-facing.** Anything the
  renderer reads (`box`, `ticks`, `pixelsPerDay`, `originX`,
  `startDate`, `endDate`, `labelStyle`, `pillRowHeight`,
  `tickPanelY`/`tickPanelHeight`, `markerRow`) MUST keep the same shape
  m2.5a left it in. RoadmapNode should populate this struct identically.
- **`xForDate` is gone** — call `ctx.scale.forwardWithinDomain(date)`.
  Five existing call sites already do this; new node code should follow.
- **`ITEM_ROW_HEIGHT` is gone** — call `ctx.bands.bandwidth()` for bar
  height and `ctx.bands.step()` for row pitch. Default values (56/64)
  match the legacy constants.
- **`defaults > spacing`** for swimlanes is now wired to inter-band
  gap via `SPACING_PX`; default `'none'` keeps samples byte-stable.

## Files to reference

- [`packages/layout/src/layout.ts`](../../packages/layout/src/layout.ts) — current monolith;
  `sequenceItem`, `sequenceParallel`, `sequenceGroup`, `buildSwimlane`,
  and `buildAnchors`/`buildMilestones`/`buildIncludeRegions` are the
  bodies that move into nodes.
- [`packages/layout/src/types.ts`](../../packages/layout/src/types.ts) — public output shape;
  must not change in m2.5c (m2.5d's job).
- [`packages/layout/src/renderable.ts`](../../packages/layout/src/renderable.ts) — the contract.
- [`packages/layout/src/nodes/item-node.ts`](../../packages/layout/src/nodes/item-node.ts) — the
  template for how to size a node file.
- [`layout-v2/src/renderable.ts`](../../layout-v2/src/renderable.ts) — prototype's full
  ItemNode + SwimlaneNode + RoadmapNode wired end-to-end. Use as a
  pattern reference for shelf-packing and tab geometry.
- [`packages/layout/test/snapshot.test.ts`](../../packages/layout/test/snapshot.test.ts) — the byte-stable gate;
  re-run after every node port.
