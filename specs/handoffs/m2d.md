# m2d Handoff — Sample minimal alignment

## Scope

Bring the renderer's light-theme output into visual parity with [`specs/samples/minimal.svg`](../samples/minimal.svg) — the simplest of the five hand-tuned reference SVGs (single swimlane, three sequential items, hero now-line). This is the first of five sample-fidelity milestones (m2d → m2h). The bar is *same family of artifact, same idioms, same palette*; pixel positions may differ from the reference.

**Milestone:** m2d
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline` (continue the OSS monorepo from m1 / m2a / m2b / m2b.5 / m2c)

m2 continues:

- **m2a (shipped)** — CLI scaffold + `validate` + `convert` + `init` + `version` + distribution pipeline
- **m2b (shipped)** — `@nowline/layout` + `@nowline/renderer` + `nowline render` (SVG) + `nowline serve`
- **m2b.5 (shipped)** — verbless CLI redesign
- **m2c (shipped)** — every export format beyond SVG
- **m2d (this handoff)** — light-theme palette overhaul + minimal-sample chrome (header card, timeline panel, frame tab, upper-right status dot, bottom progress strip, solid now-line, now|ine attribution wordmark)

## What to Build

### 1. Example DSL — `examples/minimal.nowline`

Rewrite to match the DSL gist embedded in [`specs/samples/minimal.svg`](../samples/minimal.svg) so the renderer's output and the reference share the same source.

```nowline
nowline v1

roadmap minimal "Starter" start:2026-01-05 scale:1w author:"Engineering roadmap"

swimlane engineering "Engineering"
  item research "Research"  duration:1w status:done
  item design   "Design"    duration:2w status:in-progress remaining:50%
  item build    "Build"     duration:3w status:planned
```

Render with `--now 2026-01-22 --theme light` (the now-line falls halfway through `Design`, matching the sample). The script `scripts/render-samples.mjs` already pins this date.

### 2. Light-theme palette in `packages/layout/src/themes/light.ts`

Replace the current Material-flavored palette with the sample's slate-on-white palette. Every existing role keeps its name; only the hex values shift.

| Theme role | Old | New |
|---|---|---|
| `surface.page` | `#ffffff` | `#f8fafc` |
| `surface.chart` | `#fafafa` | `#ffffff` |
| `surface.headerBox` | `#ffffff` | `#ffffff` |
| `entities.item.bg` | `#e3f2fd` | `#ffffff` (status palette tints the bar; see below) |
| `entities.item.fg` | `#1565c0` | `#94a3b8` (status palette overrides) |
| `entities.item.text` | `#0d47a1` | `#0f172a` |
| `entities.swimlane.fg` / `text` | `#212121` | `#334155` |
| `entities.label.bg` | `#eceff1` | `#f1f5f9` |
| `entities.label.fg` / `text` | `#37474f` | `#475569` |
| `entities.anchor.bg` | `#212121` | `#0f172a` |
| `entities.milestone.bg` | `#fdd835` | `#312e81` (indigo) |
| `entities.footnote.text` | `#424242` | `#475569` |
| `swimlane.bandEven` | `#ffffff` | `#ffffff` |
| `swimlane.bandOdd` | `#f5f5f5` | `#f8fafc` |
| `swimlane.separator` | `#e0e0e0` | `#e2e8f0` |
| `swimlane.frameTabText` | `#424242` | `#334155` |
| `swimlane.frameTabMuted` | `#9e9e9e` | `#64748b` |
| `timeline.gridLine` | `#eeeeee` | `#e2e8f0` |
| `timeline.tickMark` | `#bdbdbd` | `#cbd5e1` |
| `timeline.labelText` | `#616161` | `#64748b` |
| `nowline.stroke` | `#d32f2f` | `#e53e3e` |
| `nowline.labelBg` | `#d32f2f` | `#e53e3e` |
| `nowline.labelText` | `#ffffff` | `#ffffff` |
| `status.done` | `#43a047` | `#10b981` |
| `status.inProgress` | `#1e88e5` | `#3b82f6` |
| `status.atRisk` | `#fb8c00` | `#f59e0b` |
| `status.blocked` | `#e53935` | `#ef4444` |
| `status.planned` | `#9e9e9e` | `#94a3b8` |
| `status.neutral` | `#9e9e9e` | `#94a3b8` |
| `attribution.mark` | `#616161` | `#94a3b8` |
| `attribution.link` | `#1e88e5` | `#3b82f6` |
| `dependency.edgeStroke` | `#757575` | `#94a3b8` |
| `dependency.overflowStroke` | `#d32f2f` | `#ef4444` |
| `anchor.predecessorLine` | `#9e9e9e` | `#94a3b8` |
| `milestone.dashedInk` | `#9e9e9e` | `#94a3b8` |
| `milestone.overrun` | `#d32f2f` | `#ef4444` |
| `footnote.indicatorText` | `#d32f2f` | `#e53e3e` |
| `footnote.descriptionMuted` | `#616161` | `#64748b` |
| `includeRegion.border` | `#90a4ae` | `#94a3b8` |
| `includeRegion.label` | `#37474f` | `#334155` |
| `includeRegion.badge` | `#607d8b` | `#64748b` |

Named colors (`lightNamed`) are unchanged — the `bg:blue` style token still resolves to the same brand blue.

### 3. Renderer changes in `packages/renderer/src/svg/render.ts`

#### Header card — `renderHeader`

Replace the low-opacity strip with a rounded white card. Box dimensions:

- Width = `min(220, h.box.width - 12)`; height = 58 (independent of chart height — the rest of `h.box` for `beside` headers is unused vertically and the swimlanes paint over it).
- Position: `(h.box.x + 6, h.box.y + 6)` — 6px inset on top and left of the bounding box.
- `rx=6`, `fill=#ffffff`, `stroke=#e2e8f0`, `stroke-width=1`, `filter=url(#nl-{id}-shadow-subtle)`.
- Title text at `(card.x + 16, card.y + 24)`, `font-size:16 font-weight:600 fill:#0f172a` (resolved from `h.style.text`).
- Author text at `(card.x + 16, card.y + 42)`, `font-size:11 fill:#64748b` (resolved from theme).
- Drop the existing in-header attribution `<a>` — moved to the new `renderAttributionMark` (see below).

#### Timeline panel — `renderTimeline`

Wrap the tick labels in a rounded white panel and replace the current per-tick faint vertical lines with dotted vertical grid lines that drop through the swimlane area:

- Panel rect at `(t.box.x, t.box.y, t.box.width, 36)`, `rx=4 fill=#ffffff stroke=#e2e8f0`. Tick labels render inside it; remove the baseline.
- Major tick labels: `font-size:11 fill=#64748b text-anchor=middle` at `(tick.x, panelY + 22)`.
- Minor tick marks (no label): drop entirely — too noisy for the sample style.
- Vertical grid lines: one per major tick at `(tick.x, panelY + 36) → (tick.x, t.box.y + t.box.height)`, `stroke=#e2e8f0 stroke-width=1 stroke-dasharray="2 3"`. Drawn with the timeline group so they sit behind swimlane fills.

#### Swimlane frame tab + band — `renderSwimlane`

- Band rect (existing) keeps its `tint` (now `#ffffff` for even, `#f8fafc` for odd) but adds `stroke=#e2e8f0 stroke-width=1`.
- Replace the bare title text with a small chiclet at the top-left of the band:
  - Rect at `(s.box.x + 10, s.box.y + 10, 120, 22)`, `rx=4 fill=#f1f5f9 stroke=#cbd5e1`.
  - Title text inside at `(rect.x + 10, rect.y + 15)`, `font-size:12 font-weight:600 fill=#334155` (theme `swimlane.frameTabText`).
- Single-lane case naturally yields no alternating tint because every band has `bandIndex=0`.

#### Item bar — `renderItem`

- Move the status dot from the LEFT (`cx = box.x + 6`) to the upper-RIGHT inset (`cx = box.x + box.width - 12`, `cy = box.y + 12`, `r = 5`). Color = `theme.status[status]`.
- Title text moves to `(box.x + 12, box.y + 20)`, `font-size:13 font-weight:600 fill=style.text` (no longer vertically centered — the bar is now 56px tall; see below).
- Add a meta text line under the title at `(box.x + 12, box.y + 38)`, `font-size:11 fill=style.fg` showing `<duration>` and (when `progress > 0 && progress < 1`) `— <pct>% remaining`. Pull the duration text from `i.title` — the sample uses `1w` / `2w - 50% remaining` / `3w` formatting; we expose this via a new `i.metaText` field on `PositionedItem` populated by the layout.
- Item bar height grows to `56` (from current `24`) — `ITEM_ROW_HEIGHT` becomes 64 (56 + 8 padding) so the swimlane reads as a "card row" rather than a thin Gantt bar. This is a layout-shaped change — captured in the `ITEM_ROW_HEIGHT` constant in `packages/layout/src/themes/shared.ts`.
- Replace the full-height `style.fg` overlay with a 4px progress strip along the bottom: `(box.x, box.y + box.height - 4, box.width * progressFraction, 4)`, `fill=style.fg opacity=0.55`.
- Bar fill (`style.bg`) when `bg=#ffffff` (the new default) reads as a tinted card via the status palette — set `style.bg` to a status-tinted hex during layout when the resolved bg is white and a status is set: done → `#ecfdf5`, in-progress → `#eff6ff`, at-risk → `#fffbeb`, blocked → `#fee2e2`, planned/neutral → `#f8fafc`. `style.fg` (border + dot color) stays the saturated status color.

#### Now-line — `renderNowline`

- Solid stroke at 2.25px (drop the dasharray).
- Pill label background `rx=8 ry=8`, `fill=theme.nowline.labelBg`. White "now" text at `font-size:10 font-weight:700 fill=#ffffff text-anchor=middle`. Rename the displayed label from "Today" to "now" (keep the field name `label` on the positioned model, but render the lowercase short form for the pill).

#### Attribution wordmark — new `renderAttributionMark`

- Drop the "Made with Nowline" `<a>` from `renderHeader`.
- New helper `renderAttributionMark` called from the top-level `renderSvg` after swimlanes / footnotes. Anchored 12px inside the bottom-right of the LAST swimlane (or the footnote panel when present).
- Wraps the wordmark in `<a href="https://nowline.io" target="_blank" rel="noopener">` so it stays clickable.
- Glyph: 40px text "now" + 5×40 red bar + 40px text "ine", scaled to 0.22 (≈ 8.8 px tall). Uses `theme.attribution.mark` for the gray text and `theme.nowline.labelBg` for the red bar.

### 4. Tests

- `packages/renderer/test/render.test.ts`:
  - Update the `Made with Nowline` assertion to look for the new wordmark group (`data-layer="attribution"` + the `now` and `ine` text fragments). Existing `https://nowline.io` link assertion stays unchanged.
- `packages/layout/test/layout.test.ts` (if any concrete pixel / color assertions exist): rebase numeric tokens to the new theme.
- `packages/cli/test/integration/cli.render.test.ts`: rebase any palette-color or fixed-pixel snapshots to match the new output.
- Re-run `node scripts/render-samples.mjs minimal` after each change and eyeball-diff via `scripts/compare-samples.html`.

## What NOT to Build

- No layout-engine changes beyond `ITEM_ROW_HEIGHT`, the `metaText` field on `PositionedItem`, and the status-tinted `bg` decision (which still happens in style resolution, not in the renderer).
- No anchor/milestone header row, no inline label chiclets, no link-icon tile, no footnote panel — those land in m2e.
- No dark-theme tightening — m2f.
- No edge routing / parallel brackets — m2g.
- No isolate-region polish — m2h.
- No DSL grammar changes.

## Definition of Done

- [ ] `examples/minimal.nowline` renders the same family of artifact as `specs/samples/minimal.svg` — same chrome, same colors, same status/progress idioms.
- [ ] Light theme palette in `packages/layout/src/themes/light.ts` matches the table above.
- [ ] `renderHeader` draws a rounded white card with title + author; no full-height strip.
- [ ] `renderTimeline` draws a rounded white panel with dotted vertical grid lines through swimlanes.
- [ ] `renderSwimlane` draws a frame-tab chiclet at the top-left of each band.
- [ ] `renderItem` puts the status dot upper-right and the progress fill as a 4px bottom strip.
- [ ] `renderNowline` is solid, 2.25px, with a pill label.
- [ ] `renderAttributionMark` puts the now|ine wordmark at the bottom-right of the last swimlane (or footnote panel) wrapped in `<a href="https://nowline.io">`.
- [ ] Existing renderer + CLI tests pass; updated snapshots reflect the new chrome.
- [ ] `scripts/compare-samples.html` shows visible parity for the `minimal` row.
- [ ] m2d strikethrough applied to `specs/milestones.md`.

## Open Questions for m2d

None at start. Any decisions that surface during implementation get appended to **Resolutions** below.

## Resolutions

1. **Header card sits inside the `beside` bounding box rather than reshaping the layout** — keeps m2d a pure-renderer change and lets m2e rework header geometry without rebasing m2d's tests. The unused vertical area of the `beside` box is painted over by the swimlane band (which is full-width and starts at `x=0`), so the header card visually reads as a small top-left card without the layout knowing.

2. **Item-bar height bumps from `ITEM_ROW_HEIGHT - 6 = 24` to `56`** so the title + meta line + status dot + progress strip have room. This shifts every existing rendered SVG; `ITEM_ROW_HEIGHT` lifts to 64 (56 + 8 row spacing). Any downstream snapshot tests that pinned bar height to 24 are rebased as part of this milestone.

3. **Status-tinted item background is decided in layout, not in the renderer** — the renderer stays palette-dumb (per the m2b contract), so the layout's style resolution writes a tinted `bg` hex onto the item's `ResolvedStyle` whenever the unresolved bg is white (`#ffffff`) and a status is set. Authors who set an explicit `bg:` keep their override.

4. **The now-line's pill label reads `now`, not `Today`** — matches the sample and the brand. The field name on the positioned model stays `label` for back-compat; the renderer just renders the lowercase short form for the pill.

5. **Attribution wordmark is an absolute-positioned overlay anchored to the last swimlane's bottom-right** — not a flow element in any layout block. Bypasses the layout engine entirely; the renderer owns its placement. Avoids reshaping any positioned-model contract for a decoration that's deliberately out-of-flow.
