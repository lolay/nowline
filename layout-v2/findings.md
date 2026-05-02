# Layout v2 prototype — findings

## TL;DR

All six validation criteria from the plan pass. The four-part architecture
(scales + measure/place tree + view presets + working calendar) holds up
on `examples/minimal.nowline` and is small enough to code-review:

| Module | Lines | Notes |
|---|---|---|
| `src/scales.ts` | 159 | TimeScale + BandScale wrappers over `d3-scale` |
| `src/working-calendar.ts` | 116 | continuousCalendar / weekendsOff / withHolidays |
| `src/view-preset.ts` | 213 | ViewPreset + multi-row HeaderRow + day/week/month presets |
| `src/renderable.ts` | 152 | Renderable interface + Item / Swimlane / Roadmap nodes |
| `src/positioned.ts` | 67 | Minimal subset of Positioned* types |
| `src/parse.ts` | 102 | Ad-hoc parser scoped to minimal.nowline |
| `src/build.ts` | 191 | Composition root |
| `src/render-stub.ts` | 245 | Byte-stable SVG emitter (mirrors prod xml.ts) |
| `bin/run.ts` | 138 | CLI entry; emits SVGs + diff.html |
| **Total** | **1383** | Five test files, 45 passing tests |

The architecture sketched in the plan is *substantially smaller* than
today's `layout.ts` (~1.6k lines) + `render.ts` (~1.3k lines) for an
equivalent slice of behavior, and it makes four future capabilities easy
that are hard or impossible today.

## Validation criteria

The six criteria from the plan are encoded as runnable tests in
[`test/build.test.ts`](test/build.test.ts).

### 1. minimal.nowline renders a recognizable model — PASS

`buildLayout(parseMinimal(...), { today })` produces a `PositionedRoadmap`
with the expected header / timeline / one swimlane / three items / now-line.

```
[invert demo] timeScale.invert(468) = 2026-02-09T00:00:00.000Z
[bandwidth] swimlane row height = 75.6px
[preset] week (resolution=week x1)
```

The rendered SVG ([`out/minimal.svg`](out/minimal.svg), 3 KB) shows:

- Header card "Starter" + author "Engineering roadmap"
- Timeline panel with year/month row above weekly row (`Feb 2026` over `Jan 11 / Jan 18 / Jan 25 / Feb 01 / Feb 08`)
- Weekly grid lines dropping through the swimlane
- "Engineering" frame tab
- Three item bars: Research (green/done, 100% fill), Design (blue/in-progress, 50% fill), Build (gray/planned)
- Red now-line + "now" pill at Jan 26

Open [`out/diff.html`](out/diff.html) for the side-by-side comparison
against [`../specs/samples/minimal.svg`](../specs/samples/minimal.svg) plus
the three architectural-knob variants.

### 2. TimeScale.invert returns a Date — PASS

`forward → invert` round-trips for continuous calendars
(`test/scales.test.ts > invert recovers a date that round-trips through forward`).
This is the abstraction the m4 editor will need for click/drag.

### 3. weekendsOff compresses the X axis — PASS

Adding `calendar: weekendsOff()` to `buildLayout()` *changes the visible
chart* without touching `ItemNode`, `SwimlaneNode`, or any layout code.

- Continuous baseline: `pixelsPerDay = 5.71` (40 px/week ÷ 7 days)
- Weekends-off: `pixelsPerDay = 8.0` (40 px/working-day ÷ 5 working-days)

Visible in [`out/minimal-weekends-off.svg`](out/minimal-weekends-off.svg):
the same items occupy the same chart, but each "duration:3w" bar is
narrower because 3 business weeks of working days now compress into a
slightly smaller range. The path to "fully drop weekend ticks" is just
extending `TimeScale.ticks()` (already done) — and the validating test
asserts `pxPerWorkingDay > pxPerDay`.

### 4. preset swap changes density — PASS

```ts
buildLayout(parsed, { preset: dayPreset })   // 9.5 KB SVG, ~1090 px wide
buildLayout(parsed, { preset: weekPreset })  // 3.0 KB SVG,  521 px wide
buildLayout(parsed, { preset: monthPreset }) // 2.2 KB SVG,  336 px wide
```

A single `preset:` config value drives:

- The smallest visible tick (resolution unit)
- Multi-row header layout (e.g. year over month vs month over week vs month over day)
- Pixels per tick → overall canvas width
- Default label thinning

No other code changes. See `dayPreset` / `weekPreset` / `monthPreset` in
[`src/view-preset.ts`](src/view-preset.ts).

### 5. ItemNode.measure derives height from text-size + padding — PASS

`ItemNode.measure()` returns `{ width, height }` where:

- `width = time.forward(end) - time.forward(start)` (time-driven, X axis)
- `height = (text-size × 1.4) + (text-size × 1.4 × 0.8) + padding × 2`

Test (`test/build.test.ts > Validation #5`) confirms that bumping
`itemTextSizePx` from 11 to 18 grows the bar height. Today's production
code uses a fixed `ITEM_ROW_HEIGHT = 64` and ignores the resolved
`text-size + padding`; v2 fixes that.

### 6. BandScale.bandwidth drives row height — PASS

```ts
buildLayout(parsed, { swimlanePaddingInner: 0   }).bandScale.bandwidth() // 75.6
buildLayout(parsed, { swimlanePaddingInner: 0.4 }).bandScale.bandwidth() // 45.4
```

`paddingInner` (which corresponds to `defaults > spacing` in the DSL)
shrinks bandwidth and grows the visible gap between adjacent bands. This
is the exact `defaults > spacing` semantics today's `layout.ts` parses
into `ResolvedStyle` but doesn't actually consult.

## What this confirms

1. **D3 scales are the right primitive.** The mental shift from
   "pixelsPerDay × dayCount" to "scale.forward(date)" / "scale.invert(x)"
   is small in code (TimeScale is 80 lines including non-continuous
   support) but large in capability (free invert, free non-continuous,
   uniform vocabulary across X and Y).

2. **The Y axis maps cleanly to a measure/place tree.** Each entity
   computes its own intrinsic size given the time scale; the parent
   stacks. The only non-trivial bit is letting the swimlane decide how
   to vertically center its children inside its band; that's a 4-line
   helper inside `SwimlaneNode.place`. X stays time-driven.

3. **View presets eliminate ad-hoc tick math.** Today's
   `buildTimelineScale` + `LABEL_THINNING` table are replaced by a
   declarative `ViewPreset` with one or more `HeaderRow`s. Multi-row
   headers (year over month over day) drop out for free.

4. **Non-continuous calendars are trivial once tick semantics are
   data, not pixels.** `WorkingCalendar` is 100 lines and slots into
   `TimeScale` as one optional constructor argument; no other module
   needs to know it exists.

5. **String SVG output stays viable.** Production renderer's
   determinism rules (`attrs()` sorting + `num()` rounding) ported
   straight over; the prototype's 245-line stub produces output that
   reads like the production reference.

## Caveats / things the prototype skipped

- **Dependency arrows / edge routing.** Out of scope per the plan. ELK / dagre evaluation is a separate milestone.
- **Anchors, milestones, parallel/group, footnotes, includes.** Single swimlane with three sequential items is the slice that proves the architecture; adding the rest is mostly translating production logic into nodes. No surprises expected — the only structural unknown was "does the X-time-Y-tree split work at all," and it does.
- **AST integration via `@nowline/core`.** The prototype ships a tiny ad-hoc parser. Bridging to `@nowline/core` is straightforward (production already does it in [`packages/cli/src/core/parse.ts`](../packages/cli/src/core/parse.ts)); the layout architecture is independent of the parser.
- **Theme tokens still hardcoded in render-stub.** Today's renderer has the same problem; v2 should push the palette into the layout output (the model carries resolved colors) so the renderer drops `theme === 'dark' ? ...` branches.

## Recommendation

Promote this to a real `m5 — Layout v2` milestone in `packages/layout/`. Suggested scope:

1. Author `specs/layout-v2.md` adapting these four primitives to the
   full `Positioned*` model.
2. Replace `packages/layout/src/timeline.ts` with a `TimeScale` /
   `ViewPreset` pair (this is the biggest, easiest win).
3. Land `WorkingCalendar` alongside today's `CalendarConfig` in
   `packages/layout/src/calendar.ts`. The `business` mode becomes a
   factory that returns a `weekendsOff()`-equivalent calendar.
4. Refactor `layoutRoadmap` swimlane code to consume `BandScale` and
   the measure/place pattern; preserve external `PositionedRoadmap`
   shape so the renderer doesn't need to change in the same milestone.
5. Defer edge routing (ELK/dagre) to its own milestone.
6. Add `d3-scale` and `d3-time` to `@nowline/layout`'s deps. Total
   bundle hit: ~10 KB tree-shaken, no DOM, browser-safe.

## Reproducing

```bash
cd layout-v2
pnpm install --ignore-workspace
pnpm test           # 58 tests, all passing
pnpm run run        # writes out/*.svg + out/diff.html
open out/diff.html
```

## Fidelity pass (round 2)

After validating the architecture, a follow-up pass landed six visual /
structural fixes inside the same prototype to bring `out/minimal.svg`
substantially closer to [`../specs/samples/minimal.svg`](../specs/samples/minimal.svg).
No production-package edits.

| # | Fix | Files |
|---|---|---|
| 1 | `font-family` stack on the `<svg>` root | `src/render-stub.ts` |
| 2 | Swimlane band spans `[canvasPadding, width-canvasPadding]`; frame tab uses production palette `#f1f5f9 / #cbd5e1 / #334155` | `src/build.ts`, `src/render-stub.ts`, `src/renderable.ts` |
| 3 | Item meta line ("`1w`", "`2w - 50% remaining`") rendered in the per-status `fg` color under the title | `src/parse.ts`, `src/positioned.ts`, `src/renderable.ts`, `src/render-stub.ts` |
| 4 | `ITEM_INSET_PX = 6` symmetric inset; visible bar is `column - 12px`, leaving a 12-px gutter between adjacent items | `src/renderable.ts` |
| 5 | Shelf-pack overflow into rows. `ItemNode.measure` returns `intrinsicTextWidth`; `SwimlaneNode.place` walks rows and pushes an item to a new row when its predecessor's text spills past its `barLeft`. `PositionedItem` gains `row: number`; band height grows automatically. | `src/renderable.ts`, `src/positioned.ts` |
| 6 | Single-row `weekPreset` (drop the month row); `monthPreset` keeps two rows; week format carries year on Jan tick | `src/view-preset.ts` |

### Architecture deltas

Two model fields and one constraint:

```ts
// src/positioned.ts
interface PositionedItem {
  // ...existing fields...
  row: number;        // shelf-pack row assigned by SwimlaneNode.place
  metaText: string;   // pre-formatted second line (no DSL semantics in renderer)
}

// src/renderable.ts
export const ITEM_INSET_PX = 6;

interface Constraints {
  time: TimeScale;
  bandTop: number;
  bandHeight: number;
  bandX?: number;     // band background bounds (defaults to time.range())
  bandWidth?: number;
}
```

`ItemNode.measure` now returns `ItemIntrinsicSize` with `barWidth` (visible) and
`intrinsicTextWidth` (for the shelf-packer's collision check). `SwimlaneNode.place`
walks items in start-time order and drops each one into the lowest row whose
previous-item right edge is past the new item's `barLeft`.

### Tests

58 tests passing (was 45). New assertions:

- `metaText` formats: `"1w"` / `"2w - 50% remaining"` / fallback to `duration` only
- Full-width band: `band.x === canvasPadding`, `band.x + band.width === width - canvasPadding`
- `weekPreset.headers.length === 1`; timeline rows reflect this
- `monthPreset.headers.length === 2` (multi-row capability still validated)
- Shelf-pack scenarios:
  - Three sequential 1w items → all on row 0
  - 60-char title in a 1w bar → `next` item bumped to row 1
  - Long-title lane has greater intrinsic height than the same lane with short titles

Existing tests updated: `ItemNode.place` now asserts `box.x === time.forward(start) + ITEM_INSET_PX` and `box.width === width - 2*ITEM_INSET_PX`; `SwimlaneNode.place` no longer centers items vertically (rows stack from `band.y + paddingPx`).

### Visual diff

Open [`out/diff.html`](out/diff.html) to confirm:

- Font stack renders as `-apple-system / SF Pro Display / Segoe UI / Helvetica`
- Single full-width band with the production-palette frame tab anchored at `(band.x + 10, band.y + 10)`
- Each item bar shows title + meta line ("`1w`", "`3w`", "`2w - 50% remaining`") in the right per-status accent
- Visible 12-px gutter between adjacent item bars (e.g. between Research's right edge and Design's left edge)
- Single-row time header (`Jan 11 2026 / Jan 18 / Jan 25 / Feb 01 / Feb 08`) — year carried by the first label only
- The dedicated [`out/shelf-pack-demo.svg`](out/shelf-pack-demo.svg) variant shows the long-title fixture pushing the next two items into rows 1 and 2; the band stretches to fit

### Known caveats from the pass

- **Density is conservative.** `weekPreset.pixelsPerTick = 40` keeps weekly bars ~40 px wide so the chart remains readable on an 800-px viewport; production's reference uses ~120 px/week. As a side-effect, the meta line on `Design` ("2w - 50% remaining" ≈ 109 px) overflows the 45-px Design bar in the minimal sample, which legitimately triggers the shelf-packer for `Build` (row 1). Left intentional — shows the architecture flowing end-to-end. Bumping `pixelsPerTick` to 120 would put both items on row 0; that's a tuning decision for the m5 promotion, not architecture.
- **No drop-shadow filter.** Production uses `<feDropShadow>`; cheap to add later, not architecture-relevant.
- **Status-keyed bar fill colors not adopted.** Production tints the bar background by status (e.g. `#ecfdf5` for done); the prototype keeps a white panel + colored progress strip + per-status meta-line color. Easy to add via `STATUS_PALETTE` if desired.
- **No "now" pill repositioning at the top of a multi-row timeline header.** Already correct for single-row; revisit when multi-row presets are the default.
- **Attribution wordmark / caption omitted.** Pure chrome; outside the architectural validation.
