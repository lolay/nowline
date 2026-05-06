# m2i handoff — Sample fidelity polish

> **Status: completed across many commits between `03c47de` (item-bar
> restructure) and `2d96759` (chart-body grid lines). The milestone was
> recorded after-the-fact in commit `e69afe8`; this handoff is a
> retrospective record kept in the handoffs folder for completeness.**
>
> Canonical entry: [`specs/milestones.md`](../milestones.md) § m2i.
> Spec context: [`specs/rendering.md`](../rendering.md).

## Why this milestone exists

m2i was never planned up front. After Layout v2 (m2.5a–m2.5d) collapsed
the monolithic `layout.ts` onto a measure/place tree, sample reviews of
[`examples/long.nowline`](../../examples/long.nowline),
[`examples/nested.nowline`](../../examples/nested.nowline), and
[`examples/platform-2026.nowline`](../../examples/platform-2026.nowline)
exposed seams the old code had hidden — narrow bars dropping decoration,
status dots disappearing on tinted backgrounds, the now-pill blowing the
canvas out at chart edges, anchor/milestone markers colliding, the
timeline becoming unreadable on tall canvases, etc.

Rather than let ~25 polish commits drift between m2.5d and m3 with no
milestone home, m2i collects them under a single label so the
dependency chain (m1 → … → m2.5d → m2i → m3) reflects what actually
shipped before the IDE work begins.

## What landed

Themes mirror [`specs/milestones.md`](../milestones.md) § m2i. Each
bullet is one or more commits; the canonical record carries the
authoritative list and links.

### Item-bar geometry
- Restructured item-bar layout: groups, label chiclets, link icons in
  upper-left, footnote indicator
- Stack spilled label chips and grow the bar vertically to enclose them
- Stack in-bar chips below the meta baseline and grow the bar to fit
- Spill the status dot, link icon, and footnote past narrow item bars
  (with `MIN_BAR_WIDTH_FOR_*` thresholds + a reading-order spill column)
- Wrap bracket-style group titles inside the bracket glyph
  (`GROUP_BRACKET_LABEL_OVERHANG_PX`)

### Group / parallel layout
- Reserve inter-row gap below a styled group inside parallel layouts
- Pack markers + chart rows so anchor / milestone / item collisions bump
  out of the way (with `topmost-fit` row packer)
- Repack markers tick-first

### Color & contrast
- Pick status-dot tone per-bar from a luminance-aware dual palette
  (`onLight` / `onDark`)
- Deepen the status-dot palette so dots read on label-tinted bars
- Use chart-tuned color for spilled captions and bar text for footnote
  indicators
- Theme dark header card

### Now-pill & canvas
- Reserve canvas room for the now-pill via a single growth helper
- Flag-mode the now-pill at chart edges instead of growing the canvas;
  align the flag-mode pill edge with the now-line's outer stroke edge
- Fit canvas and lanes to spilled captions
- Centralize layout geometry constants and reposition slack arrows
- Standardize roadmap dates and default missing `start:` to today
- Halo include-region source-path text to clear the dashed border
- Refine output: gutter token, tighter trailing tick, attribution mark
- Resolve `after:<anchor>` and reverse-side footnotes on items

### Timeline visibility on tall canvases
- Add `timeline-position` style (`top` (default), `bottom`, `both`).
  `both` mirrors the date strip at the chart bottom so dates stay
  readable without scrolling back to the top. The mirrored strip shares
  fill, border, label color, and tick positions with the top strip; it
  has no now-pill and no marker row. Commit `14f781a`.
- Add `minor-grid` style (boolean, opt-in) — draws faint solid grid
  lines at every tick boundary in addition to the major-tick lines.
  Commit `2d96759`.
- Promote chart-body grid lines to a dedicated `grid` layer drawn after
  swimlane backgrounds so they actually appear in the chart body
  (previously occluded by the opaque swimlane fills, only visible inside
  the timeline header). Commit `2d96759`.
- Tune palette so the major grid line is darker than the minor line,
  both solid — visual hierarchy by color rather than texture
  (`theme.timeline.gridLine` + `theme.timeline.minorGridLine`).
- Major grid lines thread the entire timeline strip (top date panel
  through bottom date panel when one is mirrored); minor grid lines
  stay inside the chart body, starting at the topmost swimlane top edge
  (`model.chartBox.y`) and stopping above the bottom date panel so they
  don't streak through the marker row or compete with date labels.
- Introduce `swimlaneBottomY` on the layout context, distinct from
  `chartBottomY`. Milestone and anchor cut-lines now stop at the last
  swimlane (no longer invading the bottom date strip when one is
  mirrored). The now-line stops at the bottom date panel when present,
  otherwise at the last swimlane; it no longer extends through the
  footnote area.

### Test harness
- Add `tests/` harness for renderer manual validation; add
  `item-bumps-up` and `isolate-include-multi` fixtures
- Strip dead `layout-v2/` links from spec + code; remove the layout-v2
  prototype

## Notable architectural decisions

- **Polish stayed inside Layout v2 nodes.** The measure/place tree
  exposed the seams; fixes went into the per-entity nodes
  (`item-node.ts`, `swimlane-node.ts`, `roadmap-node.ts`, etc.) rather
  than reaching back into `layout.ts`. Where layout state needed to
  cross node boundaries, it was added to `LayoutContext` (e.g.
  `markerRowPlacements`, `slackCorridors`, `swimlaneBottomY`).
- **Renderer z-order is now explicit.** The chart-body grid lines bug
  surfaced a class of issues where painted-on-top elements occluded
  earlier ones. The renderer's main `render()` orchestrator was
  refactored so each visual layer (`timeline`, `swimlane-bg`, `grid`,
  `swimlane`, `edges`, cut-lines, markers, `nowline`) is emitted in a
  single explicit pass — see [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts).
- **`chartBottomY` ≠ swimlane bottom anymore.** With
  `timeline-position:both`, `chartBottomY` extends through the mirrored
  bottom tick panel, while `swimlaneBottomY` snapshots the last
  swimlane's bottom edge. Anchor / milestone cut-lines, the now-line's
  bottom, and minor grid lines all consult `swimlaneBottomY` (or the
  bottom-panel bottom for the now-line) rather than `chartBottomY`.

## Where to look

- Style props: [`specs/dsl.md`](../dsl.md) — `timeline-position`,
  `minor-grid`, plus the `default <entity>` style cascade.
- Public output contract: [`specs/rendering.md`](../rendering.md) —
  Timeline Scale, The Now-Line, Anchors, Milestones sections describe
  the cut-line / now-line / grid behavior shipped here.
- Layout context: [`packages/layout/src/layout-context.ts`](../../packages/layout/src/layout-context.ts) — the
  shared mutable state per layout pass, including the m2i additions.
- Renderer orchestrator: [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts) `render()` —
  the explicit z-order pass.

## Definition of Done

- [x] All commits in the m2i window land on `main` / current rendering
      branch.
- [x] Snapshot tests refreshed for each visual change
      (`UPDATE_LAYOUT_SNAPSHOTS=1 pnpm --filter @nowline/layout test`).
- [x] m2i strikethrough applied in [`specs/milestones.md`](../milestones.md).
- [x] Dependency chain in [`specs/milestones.md`](../milestones.md)
      reflects the actual ordering through to m3.
- [x] Sample renders in
      [`examples/`](../../examples/) match the polished output (no
      lingering narrow-bar collisions, marker overlaps, missing grid
      lines, etc.).
