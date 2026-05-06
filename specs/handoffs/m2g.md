# m2g Handoff — Sample dependencies

## Scope

Bring the renderer's output into close visual parity with [`specs/samples/dependencies.svg`](../samples/dependencies.svg). Pairs a new [`examples/dependencies.nowline`](../../examples/dependencies.nowline) with the reference and adds the four cross-cutting features called out in the m2g milestone slot: rounded orthogonal edge routing, parallel `[ ]` brackets, `before:` overflow refinement, and the floating milestone slack arrow.

**Milestone:** m2g
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline`

## What to Build

### 1. Example DSL — `examples/dependencies.nowline`

Mirrors the DSL gist embedded in [`specs/samples/dependencies.svg`](../samples/dependencies.svg):

- Two anchors (`kickoff`, `code-freeze`).
- A `style concurrent bracket:solid` config style applied to the parallel block.
- `swimlane backend` with `api`, a parallel block of `search` + `audit` (the latter with `before:code-freeze`), then `deploy`.
- `swimlane frontend` with `sdk after:api` and `ui after:[sdk, search]`.
- `milestone beta after:[deploy, ui]` (no date — floats).

Render with `--now 2026-01-26 --theme light`.

### 2. Renderer — parallel `[ ]` brackets

`renderParallel` learns to draw a left bracket and a right bracket on the parallel's logical edges when `style.bracket === 'solid'` (or `dashed`). Bracket geometry:

- Left: `M{lx + 4} {top} H{lx} V{bottom} H{lx + 4}`.
- Right: `M{rx - 4} {top} H{rx} V{bottom} H{rx - 4}`.
- Padding: 12 px above the topmost track, 12 px below the bottommost track.

Bare parallels (`bracket: none`) keep the m2e behavior (no decoration).

### 3. Renderer — `before:` overflow refinement

`renderItem` already paints a translucent red overlay when `i.hasOverflow`. m2g promotes it to a layered fill:

- Main bar: keep the existing fill from `style.bg` up to `min(box.width, beforeX - box.x)`.
- Tail: `fill=#fee2e2 stroke=#ef4444` for the portion past the `before:` x.
- Caption: `font-size=9 font-weight=700 fill=#b91c1c text="past <anchor-id>"` centered over the tail.

The layout already records `overflowBox`. The renderer just splits the bar visual.

### 4. Renderer — rounded-corner orthogonal routing

`routeEdge` in [`packages/layout/src/layout.ts`](../../packages/layout/src/layout.ts) currently emits L-only Manhattan paths. m2g moves the routing code into a small helper that generates an SVG path string with a quarter-arc at every bend (rounded corners). The renderer's `renderEdge` consumes that string directly.

The exact arc radius is small (4 px) so paths read as "smooth corners" without obscuring the routed direction.

### 5. Renderer — floating milestone slack arrow

The layout already records `slackX` on each `PositionedMilestone`. The renderer's `renderMilestoneCutLine` already draws a dotted dark connector from `slackX` to the milestone line when `slackX` is set. m2g extends the layout to set `slackX` even for `after:`-driven milestones so non-binding predecessors get a slack arrow:

- For each predecessor, compute the visual right edge.
- The maximum becomes the milestone's center x (already happens).
- Other predecessors with strictly-smaller right edges contribute slack arrows; the renderer draws one dotted arrow per predecessor (not just one). For m2g this can be the single rightmost non-binding predecessor; the rendering code is a loop, so multiple work too.

## Layout adjustments

- `routeEdge` returns `Point[]` plus an SVG-path string with arc waypoints (or, simpler: returns `Point[]` and the renderer consumes the points but draws quarter-arcs at each bend).
- Predecessor slack info on `PositionedMilestone` becomes `slackEdges: Point[][]` instead of a single `slackX` so multiple predecessors are representable.

## What NOT to Build

- No DSL grammar changes.
- No new layout primitives (no nested `parallel inside group inside parallel` re-architecture).
- No edge bundling or label-collision avoidance.
- Pixel-level sample matching — the bar is *same family*.

## Definition of Done

- [ ] `examples/dependencies.nowline` exists and renders without errors.
- [ ] Parallel block with `bracket:solid` renders left + right square brackets framing the nested tracks.
- [ ] `before:` overflow shows a red tail with a `past <anchor>` caption.
- [ ] Cross-lane edges route with rounded corners.
- [ ] Floating milestone shows a dotted slack arrow from the earlier predecessor to the milestone line.
- [ ] Existing tests pass (any goldens that change are updated).
- [ ] m2g strikethrough applied to `specs/milestones.md`.

## Resolutions

1. **Bracket-only parallel still uses the same geometry as a styled group bracket.** The chiclet-tab branch added in m2e is reserved for groups with explicit `bg:`. A parallel never grows a chiclet — its identity is conveyed by the brackets.

2. **Edge routing stays Manhattan.** Quarter-arcs at corners give the "rounded" feel without committing to a general router. The next revisit (orthogonal-with-detour around obstacles) lives in a future milestone.

3. **Slack arrow vs anchor predecessor arrow.** Slack arrows live with the milestone (`renderMilestoneCutLine`); anchor predecessor arrows (still wired through `predecessorPoints`) remain unimplemented in the renderer per m2e Resolution 1. Both will use the same `nl-arrow-dark` marker.
