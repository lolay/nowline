# m2j handoff — Dependency arrow attach + routing

> **Status: completed across three commits — `525f2d6` (visual-edge attach),
> `a4acd0b` (channel router), `1ce7075` (min stubs + bracket feet). Recorded
> here as a retrospective so the milestone chain reflects what shipped
> between m2i and m3.**
>
> Canonical entry: [`specs/milestones.md`](../milestones.md) § m2j.
> Spec context: [`specs/rendering.md`](../rendering.md) § Dependency Arrows
> (Attach geometry + Channel Routing).

## Why this milestone exists

m2g shipped the original cross-swimlane dependency arrows with a single-elbow
Manhattan router and arrows that attached to logical entity midpoints. After
m2.5a–m2.5d (Layout v2) and m2i (sample fidelity polish), reviews of
[`examples/dependencies.svg`](../../examples/dependencies.svg) exposed three
escalating issues that the m2g routing couldn't address on its own:

1. **Arrows pierced entity centers.** Arrowheads landed inside the painted
   bar instead of at the visual edge, and source points exited the logical
   center even when overflow text was spilling past the bar.
2. **Vertical legs crashed through item bars.** The Manhattan router happily
   dropped its single elbow inside an unrelated item bar in another
   swimlane (e.g., `api → sdk` cutting through the `audit` bar).
3. **Tight gutters lost the target stub.** Even when a clean gutter existed,
   the arrowhead lead-in could collapse to 1–2 px and the leg could clip
   the foot of a parallel `[ ]` bracket.

m2j collects the three fixes — attach, route, tighten — under one milestone
label so the m2g → … → m3 chain reflects what actually shipped.

## What landed

Themes mirror [`specs/milestones.md`](../milestones.md) § m2j. Each
sub-bullet is one of the three commits.

### 1. Visual-edge attach + flow dedupe (`525f2d6`)

Attach geometry:
- Arrows terminate at the **left visual edge** of the dependent item (not
  the logical column center). New `entityVisualLeftX` / `entityVisualRightX`
  maps on [`LayoutContext`](../../packages/layout/src/layout-context.ts)
  carry the painted-edge X; `sequenceItem` populates them when each item is
  placed.
- Source point exits the **right visual edge** at the row midline (`itemArrowSource` map).
  When the item has overflow text, the source Y drops to the **vertical
  center of the bottom progress strip** (`box.y + box.height - PROGRESS_STRIP_HEIGHT_PX / 2`)
  while X stays at the visual right edge — the arrow runs underneath the
  spilled caption rather than through it.
- Anchor / milestone predecessors attach to the marker's vertical cut line
  at the *target* item's row mid-Y. The cut line is the visible stem; the
  arrow is the short horizontal stub from the line into the target's left
  edge.
- Same-row immediate-successor chains in one swimlane skip drawing — the
  spatial flow already conveys ordering. The skip rule is restricted to
  item → item edges; marker → item stubs always draw.

Milestone slack arrow flow dedupe:
- New `itemFlowKey` map + `currentFlowKey` stack on `LayoutContext`.
  `SwimlaneNode` / `GroupNode` / `ParallelNode` push and pop their segment
  on the stack so each item's enclosing flow is captured at place-time.
- New helpers `collectMilestonePredecessors` and `lastPredecessorPerFlow`
  in [`milestone-node.ts`](../../packages/layout/src/nodes/milestone-node.ts)
  group predecessors by flow key and emit one slack arrow per flow's
  rightmost (latest) predecessor. Within one flow, file order encodes the
  chain so siblings to the left collapse silently.

### 2. Channel-based orthogonal router (`a4acd0b`)

New module [`packages/layout/src/edge-routing.ts`](../../packages/layout/src/edge-routing.ts)
replaces the inline `routeEdge` in `layout.ts`:

- **`ChannelGrid`** indexes inter-column gutters and inter-row gaps and
  carries an obstacle map. `collectRoutingObstacles` walks the positioned
  model and emits item-bar AABBs plus visible bracket-line entries
  (parallel `[ ]` brackets and bracket-style group frames). Containers
  themselves are NOT obstacles — looping arrows around container edges
  produced unsatisfying detours during planning, so the router treats
  containers as passable but their visible bracket lines as nudge sources.
- **`pickChannelX`** picks the gutter X for the vertical leg, preferring
  the midpoint between source and target columns and walking outward to
  find a clear gutter.
- **`nudgeAwayFromBrackets`** shifts the elbow X by at least
  `BRACKET_NUDGE_PX` (4 px) away from any visible bracket whose Y span
  overlaps the leg.
- **`assignSlots`** uses greedy interval coloring on the Y spans of edges
  that share a channel. `slotOffset` maps slot indices to ±3 px / ±6 px
  offsets around the channel centerline so parallel arrows fan out
  instead of stacking.
- **Marker → item stubs** bypass the channel router and route directly
  (the cut line is the visible stem).
- **Under-bar fallback**: when no clean channel fits within the bar
  obstacles, the edge is tagged `kind: 'underBar'`. New `'underBar'` arm
  on [`PositionedDependencyEdge.kind`](../../packages/layout/src/types.ts).
  [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts)
  paints under-bar edges BEFORE swimlane / item fills (after grid lines)
  with a thinner `0.8` px stroke, vs the standard `1.1` px for normal /
  overflow edges painted on top.

`buildDependencies` was rewritten to collect every `EdgeRouteRequest`
first, build obstacles once via `collectRoutingObstacles`, then call
`routeChannelEdges` to batch-route the whole set so slot assignment can
see all edges sharing a channel.

### 3. Min-stub constraints + bracket-foot clearance (`1ce7075`)

New constants in `edge-routing.ts`:

- `MIN_SOURCE_STUB_PX = 6` — guaranteed horizontal lead-out from the
  source.
- `MIN_TARGET_STUB_PX = 6` — guaranteed horizontal lead-in to the
  target's arrowhead.

Refinements:

- `pickChannelX` computes a **satisfiable range** `[from.x + MIN_SOURCE_STUB_PX, to.x - MIN_TARGET_STUB_PX]`
  and confines the elbow X to it. Returns the range alongside the chosen X.
  When the gutter is narrower than the combined stubs, the router pins the
  elbow at `to.x - MIN_TARGET_STUB_PX` and forces under-bar so the leg
  paints behind the bars while the visible arrowhead lead-in is preserved.
- `nudgeAwayFromBrackets` accepts the satisfiable range, clamps candidates
  to it, and signals `forceUnderBar` when neither side of the bracket fits
  inside the range. The `bracketsNear` re-check uses a slightly tighter
  `recheckRadius = BRACKET_NUDGE_PX - 0.01` so a candidate exactly
  `BRACKET_NUDGE_PX` away from the just-cleared bracket isn't rejected.
- `collectRoutingObstacles` emits **additional `BracketLine` entries for
  the inward foot tips** of parallel `[ ]` brackets (e.g.,
  `{ x: lx + stub, yTop: yTop - 1, yBottom: yTop + 1 }`). The horizontal
  stub of the bracket glyph is now treated like a tiny vertical bracket
  line so the nudge calculation can clear it.

## Notable architectural decisions

- **Containers are not obstacles.** Treating `parallel` and bracket-style
  `group` interiors as obstacles produced long, looping detours that
  obscured the dependency more than they revealed it. The router treats
  the visible bracket *lines* as nudge sources (so the leg gives them a
  small clearance) but the interior is freely routable. Under-bar fallback
  picks up the rare cases where this isn't visually clean.
- **Under-bar over long detour.** Given the choice between a long,
  loop-around detour and a short orthogonal path that passes behind the
  occluding bar, m2j picks the latter. The `kind: 'underBar'` z-order +
  thinner stroke makes the fact that the arrow is "behind" something read
  visually without breaking comprehension.
- **Batch routing over per-edge.** All requests are collected before any
  routing happens so `assignSlots` can see the full set of edges sharing
  a channel and color them as an interval graph. Per-edge routing would
  pick locally optimal X values and then stack on top of each other.
- **Bracket feet modelled explicitly.** The first cut of `bracketsNear`
  only checked the vertical bar of `[ ]` brackets; the foot tips were
  detected as item-bar obstacles in earlier samples but not in
  `dependencies.svg`. Modelling them as additional `BracketLine` entries
  is the smallest change that lets the existing nudge logic clear them
  with no per-shape special-casing.
- **Min-stubs are floors, not targets.** The router still prefers the
  midpoint gutter; min-stubs only kick in when the geometry would otherwise
  produce a visually cramped arrowhead. They are the primary trigger for
  under-bar fallback in narrow gutters.

## Where to look

- Channel router: [`packages/layout/src/edge-routing.ts`](../../packages/layout/src/edge-routing.ts) —
  `ChannelGrid`, `collectRoutingObstacles`, `pickChannelX`,
  `nudgeAwayFromBrackets`, `assignSlots`, `routeChannelEdges`,
  `buildOrthogonalPath`. Constants: `BRACKET_NUDGE_PX`, `MIN_SOURCE_STUB_PX`,
  `MIN_TARGET_STUB_PX`, `SLOT_SPACING_PX`, `STUB_OUT_PX`.
- Edge construction: [`packages/layout/src/layout.ts`](../../packages/layout/src/layout.ts) —
  `buildDependencies` (collect → route → emit) and `sequenceItem` (visual
  edge + arrow source maps).
- Layout context: [`packages/layout/src/layout-context.ts`](../../packages/layout/src/layout-context.ts) —
  m2j additions: `entityVisualLeftX`, `entityVisualRightX`,
  `itemArrowSource`, `itemFlowKey`, `currentFlowKey`.
- Slack arrow flow dedupe: [`packages/layout/src/nodes/milestone-node.ts`](../../packages/layout/src/nodes/milestone-node.ts) —
  exported helpers `collectMilestonePredecessors` and
  `lastPredecessorPerFlow`.
- Flow key stack: [`packages/layout/src/nodes/swimlane-node.ts`](../../packages/layout/src/nodes/swimlane-node.ts),
  [`group-node.ts`](../../packages/layout/src/nodes/group-node.ts),
  [`parallel-node.ts`](../../packages/layout/src/nodes/parallel-node.ts).
- Renderer z-order + stroke widths: [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts) —
  two-pass dependency edge rendering (under-bar before swimlanes, normal /
  overflow after).
- Edge kind: [`packages/layout/src/types.ts`](../../packages/layout/src/types.ts) —
  `'normal' | 'overflow' | 'underBar'`.
- Tests: [`packages/layout/test/edge-routing.test.ts`](../../packages/layout/test/edge-routing.test.ts) —
  unit + integration suite (channel selection, bracket nudge, slot
  assignment, marker stubs, min-stub respect, bracket-foot clearance,
  `search → ui` and `api → sdk` integration cases).
- Public output contract: [`specs/rendering.md`](../rendering.md) §
  Dependency Arrows — "Attach geometry" + "Channel Routing" subsections.

## Definition of Done

- [x] All three commits (`525f2d6`, `a4acd0b`, `1ce7075`) on the
      `feat/rendering` branch.
- [x] `specs/rendering.md` § Dependency Arrows updated with attach
      geometry, flow dedupe, channel routing, min-stub, and bracket-foot
      rules.
- [x] Snapshot tests refreshed (`UPDATE_LAYOUT_SNAPSHOTS=1 npx vitest run --root packages/layout`):
      `dependencies.svg`, `isolate-include.svg`, `minimal.svg`,
      `nested-both-headers.svg`, `platform-2026.svg`,
      `platform-2026-dark.svg`.
- [x] `examples/dependencies.svg` regenerated via
      `node scripts/render-samples.mjs`. `api → sdk` and `search → ui`
      both render with the under-bar style; other arrows clear their
      bracket nudges.
- [x] All 365 package tests pass; no lint or type errors.
- [x] m2j strikethrough applied in [`specs/milestones.md`](../milestones.md).
- [x] Dependency chain in [`specs/milestones.md`](../milestones.md)
      reflects `m2i → m2j → m3`.

## Known follow-ups (not blocking m3)

- `search → ui` and `sdk → ui` arrows do not visually merge into a single
  shared trunk; each draws its own elbow into `ui`'s left edge. The user
  noted this as an aesthetic issue (issue #3 in the m2j review) but
  prioritized the cramped-stub and bracket-collision fixes for this
  milestone. A future revisit could group same-target edges into a shared
  arrowhead lead-in.
- Container-aware routing was explicitly considered and dropped during
  m2j planning — long detours obscured the dependency. Revisit only if
  under-bar fallback becomes visually noisy in larger samples.
