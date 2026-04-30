# m2e Handoff — Sample platform-2026

## Scope

Bring the renderer's light-theme output into visual parity with [`specs/samples/platform-2026.svg`](../samples/platform-2026.svg) — the full-feature reference. Builds on m2d's foundation by adding the chrome that covers anchors, milestones, owners, footnotes, inline labels, link tiles, styled groups, and dependency arrowheads. Pixel positions may differ; *same family, same idioms* remains the bar.

**Milestone:** m2e
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline`

## What to Build

### 1. Example DSL — `examples/platform-2026.nowline`

New file mirroring the DSL gist embedded in [`specs/samples/platform-2026.svg`](../samples/platform-2026.svg). Includes anchors, milestones with `after:`, parallel + group, label chiclets, owners, footnotes, and a Linear-flavored `link:`. Render with `--now 2026-02-09 --theme light`.

### 2. Renderer changes in `packages/renderer/src/svg/render.ts`

#### Marker arrowheads in `<defs>`

Add three `<marker>` definitions to the `<defs>` block emitted by `renderSvg`:

- `nl-{id}-arrow` — neutral mid-weight (`#475569` light, `#94a3b8` dark) — used for normal dependency arrows.
- `nl-{id}-arrow-light` — softer (`#94a3b8` light, `#64748b` dark) — used for slack arrows / non-binding predecessors.
- `nl-{id}-arrow-dark` — strong (`#0f172a` light, `#e2e8f0` dark) — used for milestone predecessor connectors.

`renderEdge` switches from a bare `<path>` to `<path marker-end="url(#nl-{id}-arrow)">` for normal edges, and `marker-end="url(#nl-{id}-arrow-dark)"` for milestone slack connectors. Stroke colors stay theme-driven; the marker fill is baked in.

#### Anchor + milestone header row

A new `renderMarkerRow` helper draws all anchors + milestones inside the timeline panel area between the title card and the tick-label row. The layout positions each marker in one of two slots:
- **In-row** at `(x, y = panelTop + 13)` — default.
- **Above-row** at `(x, y = panelTop - 9)` — when an anchor and a milestone share the same `x` (collision detection in layout).

Anchors render as a small white diamond with a slate stroke; milestones render as filled indigo diamonds. Labels sit immediately to the right (`text-anchor: start`).

The existing `renderAnchor` / `renderMilestone` are repurposed as marker-row drawers; the cut lines below the row become a separate concern (next).

#### Anchor + milestone cut lines

Drawn after items so they overlay swimlane fills. Two passes inside `renderSvg`:
- Anchor cut lines: `stroke=#64748b stroke-width=1 stroke-dasharray="1 3"` from `(x, panelBottom)` to `(x, chartBottom)`.
- Milestone cut lines: `stroke=#1e1b4b stroke-width=2 stroke-dasharray="6 4" stroke-linecap=round` over the same vertical span.

#### Frame tab with owner + footnote indicator

`renderSwimlane`'s tab grows to carry the owner string (when present) and a superscript footnote number (when the swimlane has any). Tab width auto-sizes to fit `title + owner` text.

#### Item bar — inline label chiclets, link-icon tile

- Label chips inside the item bar: layout positions them at `(box.x + 12, box.y + box.height - 18)` (just above the progress strip), each ~58×13.
- Link icon: replace the path-only icon with a 14×14 colored tile (color picked per `i.linkIcon`: Linear `#5e6ad2`, GitHub `#0f172a`, Jira `#0052cc`, generic `#0f172a`) and a white external-link glyph. Sits at `(box.x + box.width - 22, box.y + box.height - 22)`.

#### Footnote panel

Wrap `renderFootnotes` output in a rounded white rect with subtle shadow. "Footnotes" header at the top in `font-size:12 font-weight:700 fill=#0f172a`. Each entry: red number, bold title, em-dash, muted description.

#### Styled group with chiclet label tab

`renderGroup` becomes a rounded box with the group's `style.bg` fill and `style.fg` stroke. The label sits in a small chiclet (`rx=3`) overhanging the top edge. Bracket-only groups (`style.bracket=solid|dashed` with no fill) keep the prior bracket rendering for back-compat.

### 3. Layout changes in `packages/layout/src/layout.ts`

- New `anchorRow: { y: number; height: number }` field on `PositionedTimelineScale` so the renderer knows where to place markers and cut lines without re-deriving y from the timeline box.
- `buildAnchors` + `buildMilestones` reposition the marker `center.y` into the new anchor-row band; collision detection bumps anchors above when they share an `x` with a milestone.
- `buildAnchors` records the cut-line range on each anchor (`cutTopY`, `cutBottomY`) so the renderer can draw them without recomputing.
- `buildMilestones` records the same. The existing `slackX` / `isOverrun` semantics carry over for the dotted predecessor connector.
- `sequenceItem` lays out label chips inline at the bottom-left of the item bar (above the progress strip), not to the right of it. Chip box height drops from 16 → 13 to fit inside the bar.
- `sequenceItem` records owner inside the swimlane's tab when no per-item owner is set… defer to a follow-up if it complicates the m2e iteration loop.

### 4. Tests

- `packages/renderer/test/render.test.ts`: add an arrowhead marker assertion (`<marker id="nl-...-arrow"`).
- `packages/cli/test/integration/cli.exports.m2c.test.ts`: existing PDF/PNG/HTML tests keep working — the renderer change is additive.
- Re-render `examples/platform-2026.svg` and eyeball-diff via `scripts/compare-samples.html`.

## What NOT to Build

- No DSL grammar changes.
- No edge-routing rewrite (m2g).
- No dark theme tightening (m2f).
- No isolate-region polish (m2h).
- Pixel-level sample matching — the bar is *same family*.

## Definition of Done

- [ ] `examples/platform-2026.nowline` exists and renders without errors.
- [ ] Anchors and milestones share a single header band above the tick-label row.
- [ ] Anchor cut lines (thin dashed) and milestone cut lines (indigo dashed) drop through the swimlane area.
- [ ] Frame tab carries the owner string when present.
- [ ] Inline label chiclets sit inside the item bar above the progress strip.
- [ ] Link icon renders as a colored tile when `link:` is set.
- [ ] Footnote panel is a rounded white card with shadow + a "Footnotes" header.
- [ ] Styled groups render as filled boxes with a chiclet label tab overhanging the top.
- [ ] Dependency arrows carry an arrowhead via `<marker>` definitions.
- [ ] Tests pass.
- [ ] m2e strikethrough applied to `specs/milestones.md`.

## Resolutions

1. **Anchor cut lines vs anchor predecessor arrows** — the layout still emits `predecessorPoints` on each anchor for non-binding predecessor edges; the renderer continues to ignore them in m2e. Reinstating those small arrows is a follow-up if a sample ever needs them.

2. **Marker arrowheads are theme-aware via `defs`, not via per-edge inline fills** — keeps `<path>` markup small, lets the same edge render in light or dark by swapping the `defs`.

3. **Group bracket vs filled-box** — when `style.bracket: solid|dashed` is set with no explicit `bg:`, the group keeps its m2b "left bracket" look (back-compat). When `bg:` is set, the new filled-box-with-chiclet rendering applies. Authors who want the new look set `bg:`.
