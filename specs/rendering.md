# Nowline — Rendering Specification

## Overview

Nowline's OSS rendering path produces **static SVG** from a parsed roadmap. It is used by the CLI (m2b) and the browser embed script (m4). Both consume the same positioned model from `@nowline/layout`.

Downstream interactive renderers (e.g. a hosted editor with drag-and-drop and two-way sync) reuse the layout engine but ship in separate, proprietary projects and are out of scope here.

Reference renderings the implementation should match live in [`samples/`](./samples) — open [`samples/index.html`](./samples/index.html) for the annotated gallery.

This document describes the public **output contract**. The internal layout-engine architecture (currently in flight under the m2.5a–m2.5d milestone chain) is specified separately in [`rendering-v2.md`](./rendering-v2.md).

## Architecture

```
.nowline text
    │
    ▼
@nowline/core        Parse → typed AST
    │
    ▼
@nowline/layout      AST → positioned model (coordinates, dimensions, edges)
    │
    ▼
@nowline/renderer    Positioned model → SVG string (CLI, embed)
```

## The Positioned Model

`@nowline/layout` produces a data structure describing every visual element with absolute coordinates. This is the contract between layout and rendering:

- **Roadmap header** — title, author (optional), company logo (optional), Nowline attribution mark, positioned above and to the left of the timeline
- **Item bars** — x and width (exactly the scheduled start and end), y, height (auto-computed from `text-size` + `padding` + content), title, metadata (status, owner, remaining), link, label chiclets, footnote indicators, inline-date glyphs (`after:DATE` / `before:DATE`)
- **Swimlane bands** — x, y, width, height, frame label, separator lines, nested swimlane children
- **Timeline scale** — header row with scale units (days/weeks/months/etc.), tick marks, grid lines, derived from `config`
- **Now-line** — x position (today's date), label ("now"), full-height red vertical line
- **Anchors** — x, y, date, label, diamond marker, predecessor edges to referencing items
- **Milestones** — x position (from `date` or computed from `after`), label, diamond marker in header, solid vertical cut line
- **Dependency edges** — source point, target point, orthogonal segments with rounded corners (`after` relationships)
- **Footnote indicators** — superscript numbers in upper-right of referenced entities
- **Footnote area** — ordered list of footnote text, positioned below the roadmap boundary
- **Resolved styles** — each entity carries a resolved style (all 15 style properties) computed from style precedence
- **Parallel and group regions** — `box` spans exactly the container's dates horizontally and runs from the top of its header band to the bottom of its body; `headerHeight` is the header band's height (0 when it has none). See [Parallel and Group Rendering](#parallel-and-group-rendering).
- **Include regions** — bounding rectangle for `roadmap:isolate` includes, with label and indicator metadata, and the region's own `anchors` and `milestones` (positioned like the host's, in the region's marker row) and `edges` (its dependency arrows, routed among its own lanes); each key is omitted when the region has none to draw
- **Waves** (only when the roadmap declares waves; every field below is omitted, never `undefined` or `[]`, when it does not):
  - `PositionedRoadmap.waves` — one `PositionedWave` per declared wave: id, title, 0-based `index` and `visibleOrdinal`, logical `startX`/`endX` and `startDate`/`endDate` (end exclusive), `memberCount`, `empty`, `heldBy` (the member that set the wave's end), `floorRef` (the `after:` value that held the start back), `columnBox`, the strip cell (box, label and label kind, tooltip), resolved style, and footnote indicators.
  - `PositionedRoadmap.waveBoundaries` (vertical boundary lines), `waveCrossings` (dashed marks over background bars), `waveLegend` (box and entries), and `waveSolve` (`{ passes, capped }`, the barrier solver's result, which drives `NL.W1002`).
  - `PositionedTimelineScale.waveStrip` — `{ y, height, placeholder? }` for the strip row.
  - `PositionedItem.waveRole` (`'member'` or `'background'`, set on every item) and `waveTooltip` (the localized `Background (no wave)` hover line, on background items only). `wavePinOverride` (a `date:`/`start:` pin a barrier moved) is removed with item pins ([`dsl.md` § Pinning is not supported](./dsl.md#pinning-is-not-supported)).
  - `PositionedGroup.waveOnly` (an untitled, unstyled group with `wave:` and no `labels:`; it draws nothing and reserves no header or padding).
  - `PositionedMilestone.onWaveBoundary` (suppresses the cut line) and `overrunByWave` (the wave that overruns a dated milestone).
  - `PositionedIncludeRegion.waveCrossings` — crossings re-emitted inside an isolated region.
- **Non-working days** (`calendar:business`, whose weekend is hidden or shaded depending on the display; every field below is omitted when it does not apply, so `calendar:full` and `calendar:custom` models carry none of them; see [`working-calendar.md` § 7.5](./working-calendar.md)):
  - `PositionedTimelineScale.nonWorkingDisplay` (`'hide'` or `'show'`) and `nonWorking` — one `PositionedNonWorkingRun` per run of non-working days in or straddling the window: `x`, `width` (0 under `hide`; the clamped band width under `show`), `from`, `through` (inclusive, always the run's real dates), `titles?`, `seam?` (days scale under `hide` only; the renderer draws a seam line there), `band?` (under `show` only, at the days and weeks scales or when the run has titles; the renderer shades it) and, on a run with titles only, `label` (`Thanksgiving · 2d`), `labelBox` and `labelSide` (its place in the marker row, like a milestone's) and `cut` (`true` under `hide`: the renderer draws the named cut line). A run without titles carries none of the four keys.
  - `ResolvedStyle.nonWorking` (`'hide'` or `'show'`, default `'hide'`) — the roadmap's resolved display setting, from `default roadmap non-working:`. Like `minorGrid` and `timelinePosition` it is a roadmap-level style setting that every resolved style object carries, in every calendar. The render-time option replaces it when the layout is built (`LayoutOptions.nonWorking`, precedence under "Non-working days: shown" in [Timeline Scale](#timeline-scale)), so the positioned `nonWorkingDisplay` is the value that was drawn.
  - `PositionedAnchor.hiddenDate` and `PositionedMilestone.hiddenDate` — the real ISO date of a marker dated on a hidden day (it sits at the seam; the renderer adds it as an SVG `<title>`). Set under `hide` only: under `show` the marker sits on its own date.
  - `PositionedMilestone.overrunDate` — the date NL.I1007 reports, so insights never read a date back off x.
  - `PositionedItem.nonWorkingPin` — the date in `after:` that fell on a hidden day, behind NL.I1008.

The layout engine is pure computation — no DOM, no SVG, no side effects. It runs identically in Node.js and the browser.

## Layout and Spacing

All spacing and sizing values are **style properties** — no separate `config > layout` block needed. They follow the standard style precedence chain (inline > `style:` ref > label > defaults > system defaults).

### Canvas width

The canvas fits its content: header card (beside mode), a `GUTTER_PX` inset, the timeline at the scale's natural pixels-per-day (`pixelsPerUnit / daysPerUnit`), another `GUTTER_PX`, then whatever caption spills and non-working run labels add on the right. A caption spilled past the axis end adds at most one column, labelled under the same `label-every`, thinning and narrow-column rules as any other column (see [Caption cap at the chart's end](#caption-cap)).

`LayoutOptions.width` (CLI `-w/--width`, `.nowlinerc` `width`, `nowline.preview.width` / `nowline.export.width`, and the `width` option of `@nowline/embed`, `@nowline/browser`, `@nowline/export` and the MCP `render` / `export` tools) is a **best-effort maximum**. Unset, the default, means content-fit. When header card plus gutters plus timeline would exceed it, layout shrinks pixels-per-day to `(width − chrome) / days` (`cappedPixelsPerDay` in [`canvas-width.ts`](../packages/layout/src/canvas-width.ts)). Every x position, item width, tick and band goes through that one density, so the date window and schedule are unchanged and only the pixels move.

- **Shrink only.** A cap wider than the content leaves the layout byte-identical to an unset one; the cap never stretches a chart.
- **Floor.** Pixels-per-day never drops below `MIN_PIXELS_PER_DAY` (1). A density already below the floor (a very coarse custom scale) is left alone, not raised. At the floor the canvas exceeds the cap.
- **Best-effort.** Text does not scale. Captions that no longer fit a narrower bar spill right, non-working run labels and the beside-mode header card keep their size, and any of them can grow the canvas past the cap after the timeline is placed. Tick labels can crowd at heavy compression. Layout does not re-run to chase the cap.

History: m2b treated `width` as a floor that stretched the chart. m2d–m2h moved to content-fit and documented `width` as a maximum, but a trailing `max()` restored the natural width, so from then until this fix the option had no effect.

### Spacing Style Properties

These join the style system alongside `bg`, `fg`, etc.:

- `padding` — inset padding within the entity. On `roadmap`, this is the outer canvas margin. On items, swimlanes, groups, footnotes — content inset. Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`. Default varies by entity type.
- `spacing` — space between children within a container entity. Applies to swimlanes (vertical space between items/child swimlanes), groups (space between sequential items), and parallel blocks (vertical space between tracks). Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`. Default: `none` for swimlanes (adjacent bands separated by lines, no vertical gap).
- `header-height` — height of the timeline scale header row (the date strip). Roadmap-only — ignored on all other entities (the validator warns `NL.W0703` on another entity's `default` line). Values: `none` (0), `xs` (16 px), `sm` (20 px), `md` (24 px), `lg` (32 px), `xl` (40 px). Default: `md`. Applies to the top strip and the mirrored bottom strip alike; tick labels stay at 10 px and are re-centered in the taller or shorter strip. `none` removes every date strip, including the ones `timeline-position:bottom|both` asks for (the validator warns `NL.W0704` on that combination); the now-pill, wave strip and marker row then stack directly and the now-line stops at the last swimlane.

The system owns the pixel mapping for all size presets internally. Users pick the semantic size; the renderer determines actual pixels.

Item height is auto-computed from `text-size` + `padding` + content — no explicit constant needed.

### Description Text Auto-Derivation

Description text styling derives automatically from the entity's title styling:

- One step smaller `text-size` (e.g., title `md` → description `sm`)
- `normal` weight (even if title is bold)
- Same `font`, `text` color, and `italic` as the title

If explicit description control is needed later, `desc-` prefixed properties (e.g., `desc-weight`, `desc-text-size`) can be added without breaking anything.

### Swimlane Separator Lines

With `spacing:none` as the swimlane default, sibling swimlanes sit directly adjacent. A thin horizontal separator line renders between sibling swimlane bands for visual distinction. Users who prefer vertical gaps can set `spacing:` on a swimlane or in defaults.

## SVG Renderer (m2b / m4)

The pure SVG renderer takes the positioned model and produces an SVG string. It is used by the CLI (m2b) and the browser embed script (m4).

### Roadmap Header

The roadmap header renders as a contained box in the top-left corner, above and to the left of the timeline:

- Title on the first line, author (if set) on a second line in smaller muted text — both in the same box
- **Company logo (optional)** — when the roadmap declares `logo:`, the logo renders inside the header card, **left of the title and author**, vertically centered in the card. The title and author shift right by the logo width plus a 12 px gap (`HEADER_LOGO_GAP_PX`). Both `header-position:beside` and `above` place it this way; see § Company Logo Size Presets for how big it draws.
- Minimal vertical footprint — the box height is determined by content, not a fixed size. A logo taller than the title and author text grows the card to the logo height plus 10 px above and below (`HEADER_LOGO_PAD_Y_PX`), and the text block centers vertically in the taller card. In `above` mode the 72 px band grows the same way, which only `logo-size:xl` triggers, and the chart moves down by the difference.
- In `beside` mode the card's bottom edge lines up with the bottom of the header rows (the now-pill row, tick panel, wave strip and marker rows) as they finally are: when the marker row grows past its first estimate, or the now-pill row is reserved on an extended axis, the card ends on the grown rows' bottom (finalize step f15, `header`, reads the bottom f7 recorded).
- A Nowline attribution mark — small version of the Nowline logo rendered in the bottom-right corner of the header box, scaled down as a subtle attribution mark. Links to `nowline.io`. The user's company logo does **not** replace or displace this mark.
- The header box does not span the full width of the chart; it sits to the left of the timeline header

#### Company Logo Formats and Embedding

`logo:` accepts four formats, distinguished by file extension:

| Extension | Embedding strategy |
|-----------|--------------------|
| `.svg` | Sanitized (see below) with its ids namespaced (`<idPrefix>-logo-*`), then inlined inside a nested `<svg data-layer="logo">` viewport sized to the logo box. The asset's root `<svg>` loses its own `x` / `y` / `width` / `height` so it fills that viewport, and the viewport's `viewBox` (the asset's intrinsic size) scales it. |
| `.png`, `.jpg` / `.jpeg`, `.webp` | Base64-encoded and embedded as `<image data-layer="logo" href="data:image/<type>;base64,...">` at the logo box's width and height. No re-encoding. |

The output artifact is self-contained and has no external references for the logo.

**SVG sanitizing.** The sanitizer is an allow-list walker (`packages/renderer/src/svg/sanitize.ts`): an element or attribute it does not know is removed, never passed through. What it does with the rest:

- **Removed, with a warning:** `<script>`, `<foreignObject>`, animation elements, event handlers (`on*`), any `href` or `url()` that is not a local `#fragment` (no external fetches), `data:` / `javascript:` values and CSS escapes, and unknown elements and attributes that could draw something.
- **Styles kept as attributes:** an inline `style` and the rules of a `<style>` sheet whose selectors are plain classes (`.cls-1, .cls-2 { ... }`, as Illustrator and Figma export) become presentation attributes, in cascade order (attribute, then class rules in sheet order, then inline `style`). Only presentation properties survive (`fill`, `stroke*`, `opacity`, `font-*`, `display`, `visibility` and the like), and each value passes the same checks as an attribute. Editors keep a logo's colors here, so dropping styles would draw it black. Other selectors and at-rules are not applied and draw a warning; the `<style>` element is never emitted.
- **Removed silently:** editor bookkeeping that never draws: `<metadata>`, namespaced elements and attributes (`inkscape:*`, `sodipodi:*`, `xmlns:*`, `xml:space`), `data-*`, `version`, vendor-prefixed style properties, typographic properties the renderer does not draw (`line-height`, `font-variant-ligatures`, ...), and any unsupported property set to `none`, `normal` or `auto`. A logo saved straight from Inkscape or Illustrator therefore draws no warning at all.

The warnings for one logo collapse into a single line: `logo <path>: removed unsupported SVG content: <script>, event handler onclick`.

**Load before layout.** The logo's size depends on its aspect ratio, which layout cannot read (it never touches asset bytes). So each render pipeline (the export kernel behind `nowline` render, `nowline serve`, and the browser pipeline behind the VS Code preview) loads the asset first with `loadLogo` from `@nowline/renderer`. It reads the intrinsic size from the file header (PNG `IHDR`, the JPEG start-of-frame, the WebP `VP8 ` / `VP8L` / `VP8X` chunk, or the SVG root's pixel `width` and `height`, else its `viewBox`) and passes it to `layoutRoadmap` as `LayoutOptions.logo`. A surface with no asset resolver (the embed) skips the logo silently.

#### Company Logo Size Presets

`logo-size:` sets the drawn logo **height**; the width follows the logo's intrinsic aspect ratio. Because the logo box always has the asset's own shape, the asset is scaled to fill it exactly, up or down: a 4000 px source and a 40 px source of the same shape draw at the same size. A raster smaller than its slot is upscaled and may look soft; supply a larger raster or an SVG.

| Preset | Height |
|--------|--------|
| `xs` | 18 px |
| `sm` | 24 px |
| `md` *(default)* | 36 px |
| `lg` | 48 px |
| `xl` | 72 px |

A logo that would be wider than 160 px (`HEADER_LOGO_MAX_WIDTH_PX`) at its preset height scales down uniformly until it is 160 px wide, so a long wordmark draws shorter than the preset. In `beside` mode the logo slot widens the card past the 240 px text-column cap; the title still wraps at the same width.

**Fit, not fill or stretch.** The renderer draws the logo with `preserveAspectRatio="xMidYMid meet"`. Since the box matches the asset's aspect ratio, `meet` (fit) and `slice` (fill) produce the same picture. `meet` only matters if the two ever disagree (an SVG whose declared size and drawing differ), and then it letterboxes rather than cropping part of a wordmark (`slice`) or distorting it (`none`).

#### Company Logo Error Handling

Logo resolution is a render-time concern. Each failure is a warning, and the chart renders exactly as if no logo were declared:

- **Unsupported extension** (anything but `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`) — `unsupported logo format: <ext> (<path>)`. The file is not read.
- **Missing file**, or a path the asset resolver refuses (one that escapes `--asset-root`) — `logo file not found: <path> (<reason>)`.
- **Unreadable** — `logo could not be parsed: <path> (<reason>)`: a raster whose header does not match its extension, or an SVG with neither a `viewBox` nor a pixel `width` and `height` on its root.
- **URL** (`http://`, `https://`, `file://`, `data:`) — not special-cased: it is treated as a local path, fails to resolve, and draws the missing-file warning. The renderer never fetches remote assets.

- **Unsafe or unsupported SVG content** — the one-line summary above; the logo still draws, minus what was removed.

`nowline <input> --strict` promotes all logo warnings to errors (exit code 3, like any export pipeline failure). Without `--strict` the CLI prints them to stderr as `warning: ...`, which `-q` silences.

### Timeline Scale

A single-row header displays the scale units (days, weeks, months, quarters, years) as defined in `config`. Height controlled by `default roadmap header-height:` (`md` = 24 px; see the style-key list above for every bucket). `header-height:none` hides the date labels entirely.

- **Grid lines**: light, dotted vertical lines drop from each labeled tick mark down through all swimlanes for visual tracking
- **Column width**: one `scale:` unit is 32 px at days, 40 px at weeks, 80 px at months, 160 px at quarters and 320 px at years (`unitPx` in [`view-preset.ts`](../packages/layout/src/view-preset.ts)); a literal's count multiplies it, so `scale:2w` is 80 px a week. Pixels per day is that width over the calendar's days per unit, so a day inside a default week column is 8 px under `calendar:business` and about 5.7 px under `calendar:full`. A day at `scale:1d` is never narrower than either: a day literal labels every column, and 32 px holds the widest `M/D` label (`12/31`, about 29 px at the 10 px tick font) the way a 40 px week holds `Sep 28`. A `calendar:custom` with fewer than two days per week makes a week's day wider than 32 px; that is the author's own unit, not the default.
- **Label thinning**: when too many tick marks exist, show every Nth label to reduce density. Default thinning thresholds:
  - Days: show every 7th (weekly markers)
  - Weeks: show every 4th (monthly markers)
  - Months: show every 3rd (quarterly markers)
  - Quarters: show every 4th (yearly markers)
  - Years: show every 5th
- **Tick positions**: day and week ticks step from the roadmap start by a fixed stride (`1` day; `days-per-week` from the calendar preset). Month, quarter, and year ticks sit on real calendar boundaries: the 1st of each month, of Jan / Apr / Jul / Oct, or of January. The calendar preset's `days-per-month` / `-quarter` / `-year` only converts `1m` / `1q` / `1y` durations into days; it never sets the length of a column on the date axis, because a fixed day count drifts across month edges. The chart's left edge is always a tick, so a roadmap starting mid-period opens with a partial column, and every column is labelled from its own start date. When a partial column at either edge is too narrow for its label, the tick stays and the label is dropped. Label thinning counts ticks from the left edge. Under a calendar with hidden days the tick rules change; see "Hidden days" below.
- **Hidden days** (`calendar:business`): the axis counts working days, so `pixelsPerDay` is pixels per visible day and a business week column is 40 px at the default week scale, not 56. The rules that differ from the calendar-day axis:
  - *Week ticks* fall on week starts: Monday under the business weekend, found by stepping from the roadmap start (the tick at the chart's left edge is the start itself). Labels read `Jan 05, 12, 19`, not `Jan 05, 10, 15`. A calendar with no recurring weekend keeps stepping from the roadmap start.
  - *Month, quarter and year ticks* keep their real boundaries. A boundary that falls on a hidden day (Feb 1 2026 is a Sunday) sits at the seam, the start of the next working day, and keeps its own label.
  - *Dropped columns*: a column with no visible day (zero width) is dropped with its label. At the days scale that is every weekend day.
  - *Narrow-column rule*: a label is dropped when it is wider than its column and the column is narrower than a full unit, the #92 edge-column rule applied to every column. The tick stays, the label keeps its `labelX`, and the closing tick's `major` flag follows the same column rule.
  - *Runs of narrow columns* (days and weeks): two or more consecutive narrowed columns form a run. Inside a run, read left to right, a dropped label comes back when, centred on its column, it fits the column plus half of each neighbouring column whose label is absent (thinned or dropped); a labelled neighbour or the chart edge lends nothing. A bounded recurrence such as `every:fri start:2026-07-01 end:2026-08-31` narrows every week in its window to 32 px, and the run's labels alternate (`Jul 06`, `Jul 20`, `Aug 03`, `Aug 17`) instead of all dropping. A lone narrowed column keeps the plain rule, and columns under half a label's width still drop every label ([`working-calendar.md` § 7.2](./working-calendar.md)).
  - *Thinning* counts visible columns. The one exception is the days scale's default (no `label-every`, not a `scale:` literal), which labels week starts instead of every Nth column, because "every N visible columns" drifts once a week has six working days; when a week start is hidden, the week's first working day takes the label. An explicit `label-every` still counts columns.
  - *Seams*: at the days scale only, a faint 1 px dotted line (`timeline.nonWorkingSeam`; light `#a0aec0`, dark `#6b7a90`, grayscale `#9a9a9a`) marks hidden days, spanning the minor-grid range. It is drawn strictly inside the chart and only where no grid line already sits. Week scale and above draw none.
  - *Dated entities*: anchors, milestones, date pins and the now-line sit at their working-day x. One dated on a hidden day sits at the seam, and its real date is in the marker's tooltip.
- **Non-working days: shown** (`default roadmap non-working:show`, or the render-time `nonWorking: 'show'` option on any surface; `calendar:business` only, because the identity mapping of `calendar:full` and `calendar:custom` has nothing to show). Precedence, first hit wins: the surface option, the file's `non-working:` key, `hide`. `hide` stays the default, so every file that does not opt in renders byte-identically. The schedule is the same in both views (`scheduleRoadmap`, and the date window projected from it, take no display input), so only x changes, and Mermaid, MS Project and XLSX output is identical for `show` and `hide`. The rules:
  - *Density and mapping*: `pixelsPerDay` is pixels per calendar day over the whole window (`widthPx / daysBetween`), `forward` is linear in calendar days and `invert` returns a calendar date. A business week column is therefore 56 px at the default week scale, not 40. Items after the first weekend sit further right than under `hide`, by design.
  - *Widths*: an item's width is the pixels from its snapped start to the end of its n-th working day (`TimeScale.advanceX`, through `itemSpanPx` in `working-span.ts`; under `hide` the helper returns the legacy `days × pixelsPerDay` verbatim). A bar paints across any weekend inside it and ends at the end of its last working day, so chained items show the gap. Group and parallel boxes span their children the same way.
  - *Starts snap only where they become geometry* (`TimeScale.startX`: a start that lies in a non-working day moves forward to the next working day; one inside a working day keeps its fraction, so a start after a half-day item stays mid-Friday). The snap sites are the sequenced item start (after wave floors and non-working pins have run on the raw value), the left edge of a group or parallel box (a group's width is `max(snapped, timeCursorX, usedRightX) − snapped`), and the row packer's predicted extent and `firstChildStartX`. Lane cursor seeds, wave floors and include-region origins are not snapped. That keeps `NL.I1008` and its tie rule identical in both views and keeps floors raw ([`working-calendar.md` § 7.3](./working-calendar.md)).
  - *Markers and the now-line* use `forward`, so a milestone or anchor dated Saturday sits on Saturday (no `hiddenDate`), and the now-line on a Sunday sits on Sunday.
  - *Waves*: the boundary `E_k` stays at the end of the last working day of wave k and `S_{k+1} = max(E_k, forward(floor))` uses the raw floor, so a weekend can sit between a boundary and the first bar of the next wave. `onWaveBoundary` can therefore differ between views (a Monday milestone is on the boundary under `hide` only); it only suppresses a doubled cut line. Wave `startDate` / `endDate` and the `NL.I1007` and `NL.I1008` texts read the working-day index back from x, so they match engine C in both views.
  - *Ticks*: week ticks still fall on week starts (Mondays), found by the same routing as under `hide`; a week column counts calendar days. Month, quarter and year ticks keep their real boundaries. At month scale and above, a closing column that holds no working day is merged into the column before it: a window that ends on Monday Feb 2 after a Sunday Feb 1 boundary does not get a one-day `Feb` sliver, matching `hide`, which drops that column for having zero width. A leading sliver column (a window that starts on a Sunday) keeps its tick and loses its label under the narrow-column rule. This is a known limit, not a defect to chase.
  - *Window end*: the timeline extension (finalize step f2, `extendTimeline`; see [`layout-phases.md`](./layout-phases.md) §3.5) reads the overflow as `indexAtX(maxContentRightX)`, rounds up through `tickBoundaryAtOrAfter`, converts the end through `dateAtWorkingIndex`, and sizes the width as `daysBetween × pixelsPerDay`. The rebuilt scale keeps the display.
  - *Bands* (`data-layer="non-working"`): each run flagged `band` is a rectangle at the run's clamped `x` and `width`, from `chartBox.y` down to the bottom of the timeline box (the span the seam and minor-grid lines use), filled with `timeline.nonWorkingFill` at `fill-opacity` `NON_WORKING_FILL_OPACITY` (0.1; the constant is exported from `@nowline/layout`). A run is clamped to the window, but `from` / `through` keep its real dates. Plain weekends are not banded at month scale and above (about 5 px each, so no run carries `band` there); a run with titles is banded at every scale and labelled (see *Labelled seams and bands* below). A banded run never carries `seam`. When no run has `band` the layer is not emitted, so `hide` output gains no bytes. Light, dark and grayscale use their own token values (`#64748b`, `#94a3b8`, `#737373`), chosen so the band reads over both lane tints (contrast 1.08 to 1.30) without hiding the grid line over it (at least 1.25).
  - *Labelled seams and bands* (`data-layer="non-working-label"`): a run with `titles` has a label, the titles joined with `, ` and ` · Nd`, N counting the working days the run removes (the suffix is dropped for 0; only dated, titled, non-working rules give a run titles, and a titled bounded recurrence is never labelled). The run is one entry in the marker row, packed after the anchors and milestones so a marker that ties it on x is placed first; a file whose only marker-row content is a titled run still gets a marker row. If the label fits neither right of `x` nor left of the chart's left edge, the chart grows on the right until it fits, the same rule every marker-row label follows (see [Marker-row labels](#marker-row-labels)). Under `hide` the layer draws a `<line>` at the run's `x` from the label's row centre to the bottom of the timeline box (stroke `timeline.nonWorkingSeam`, width 1, dash `1 3`), whatever the scale, then the label `<text>`; under `show` it draws the `<text>` only, at the band's left edge. The text is 10 px in `timeline.labelText`, and anchored `end` at the box's right edge when the label sits on the left. A titled dated `working` rule is labelled in the same layer, after the runs: each `timeline.workingExceptions` entry (a run of days the rule turns from non-working to working under the declaration precedence, a weekday make-up day inside a dated closure included) has the label `Release crunch · +1d`, the titles joined with `, ` and ` · +N` days turned. It is packed into the marker row at its first day's x (the column start under `hide`, the unshaded day under `show`) on the same terms as a run label, canvas growth included, and drawn as the `<text>` only in both views, never with a `<line>`: a working day removes no time, and the missing cut line is what tells it from a closure. An untitled `working` rule draws nothing. The layer is omitted when nothing has a label, and it needs no new theme token.
  - *Lane utilization is unchanged.* The underline's segments follow the drawn boxes, and overlaps begin on working days, so the load classes match `hide`; only the x of the segments differs.
  - *Layout insights* (`NL.I1000` caption spill and the rest) are computed from the drawn geometry. Under `show` a bar is wider in pixels than the same bar under `hide`, so a caption can spill under one view and fit in the other; the MCP `render` and `export` tools pass the display to their insight collection so the report matches the picture.
- **Range**: the first tick mark aligns with the earliest item start or anchor date, with the roadmap's `padding` as whitespace before it. The last tick mark extends to the latest item end, anchor date, or milestone date, with the same padding after. The right edge is the later of `length:` (when set) and the content end rounded up to the next tick boundary (the next month / quarter / year start on those scales), so a `length:` that runs past the content can leave a partial last column. The window is computed from the day schedule before any bar is placed; when a placed bar, marker or milestone still ends past the last tick (the pixel layout can run past the schedule's days), the timeline extension pass grows the axis to the next tick boundary, keeping the origin and pixels per day, rebuilds the ticks and calendar runs, and grows the canvas. It runs once, after placement, before the canvas is final (see [`layout-phases.md`](./layout-phases.md) §3.5, steps f1 to f4).
- **Custom units**: custom units (e.g., `sprints = 2w`) map to their underlying duration for positioning; labels use the custom unit name
- **Mirrored bottom strip**: when `timeline-position:bottom` or `timeline-position:both` is set on the roadmap, the renderer emits a second tick-label panel below the chart's last swimlane (and below any isolate-include regions), above the footnote panel. The mirrored strip shares the same fill, border, label color, and tick positions as the top strip — it has no now-pill and no marker row (anchors and milestones still belong to the top header). The default `timeline-position:top` keeps the existing single-strip layout.
- **Wave strip**: when the roadmap declares waves, a 20 px strip row (`WAVE_STRIP_HEIGHT_PX`) sits between the tick panel and the marker rows (anchors and milestones), so the header stack is now-pill, tick panel, wave strip, marker rows, then the 8 px gap above the chart. The marker-row panel moves down by the strip's height. With `timeline-position:bottom` the tick panel height is 0 and the strip sits directly under the now-pill row; the mirrored bottom panel carries no strip. Roadmaps without waves keep today's header exactly. See [Waves](#waves).
- **Minor-tick grid lines**: when `minor-grid:true` is set on the roadmap, every tick boundary (not just the labeled major ones) gets a thin dotted grid line drawn in the theme's `timeline.minorGridLine` color — fainter than the major grid lines so the major ticks still dominate. The minor lines drop from the same y as the major lines and stop at the same chart bottom. Default `minor-grid:false` keeps existing renders unchanged.

### The Now-Line

The now-line is the hero visual element — the vertical line marking today on the timeline.

**Timezone semantics.** The now-line date is resolved by the calling surface (CLI, VS Code extension, embed, web app) using the shared `resolveToday()` helper in `@nowline/layout`. The layout engine itself receives a concrete `today?: Date` (UTC midnight of the desired civil date) and is timezone-unaware. Key rules:

- Default ("today" with no override): the viewer's **local civil date** (host/viewer zone). This matches iCalendar floating-date semantics and avoids the off-by-one when it is late evening on the west side of UTC midnight.
- `--timezone <zone>` (CLI) / `timezone` option (embed, VS Code): override the zone for the clock-based default. Accepts `local` (default), `UTC`, ISO 8601 fixed offsets (`Z`, `+05:30`), or IANA names. Only consulted when `--now` is omitted.
- `--now YYYY-MM-DD`: floating date — zone-independent. The axis labels are also floating (UTC midnight), so they align exactly.
- `--now YYYY-MM-DDTHH:MM:SSZ` or with `±HH:MM` offset: the embedded offset determines the civil date. `--timezone` is ignored.
- `--now -`: suppress the now-line.
- Authored dates (item bars, milestones, anchors, axis ticks) are always floating and are never affected by `--timezone`.

- A **red vertical line** at the x-position corresponding to today's date
- Extends from the top of the timeline header through all swimlanes to the bottom of the chart
- Rendered **above** grid lines and milestone lines (highest z-order among vertical lines)
- Label: **"now"** rendered at the top of the line in the header row — ties to the product branding (the "now" in Nowline)
- When the current date falls outside the timeline range (before earliest or after latest content), the now-line is not rendered
- The now-line is drawn on the final axis, so a date the timeline extension brought into range (past the date window, with `length:` set) is drawn too, and the 16 px row for the "now" pill above the tick panel is reserved for it: the tick panel, wave strip, marker row and chart move down together, or by less when a tall beside header card already leaves room above the tick panel
- When `timeline-position:bottom` or `timeline-position:both` is set, the line continues through the mirrored bottom tick panel so the "now" sweep ties the two date strips together. The line never extends into the footnote panel below — it stops at the bottom edge of the bottom tick panel (or, when no bottom panel is present, at the bottom of the last swimlane).

### Item Bars

Each roadmap item renders as a horizontal bar that spans exactly its scheduled dates ([`true-width-layout.md`](./true-width-layout.md) §3.1): it starts at `x(start)` and ends at `x(end)` of the day schedule the exports share, and nothing widens it, so a one-day task at the default weekly scale is one 8 px day wide.

- **Seam**: the bar gives up `ITEM_SEAM_PX` (1 px) on each side, from inside its dates, so two bars that abut in time show a 2 px gap between their strokes. A bar too short for both seams and the 1 px floor shrinks its seams instead and stays centred in its dates (`itemBarInsetPx`); a seam never widens a bar.
- **Floor**: 1 px (`MIN_ITEM_WIDTH`). There is no other minimum and no gutter.
- **Corner radius**: `min(theme radius, width / 2, height / 2)`, so short bars become pills, then lines.
- **Progress strip**: drawn at the bar's true width.

Height equals the band's `bandwidth()` by default; a bar grows downward only when its contents need the room — a title that wraps to a second line beside a meta line (see the Caption rule below), or a label-chip stack that does not fit (see [Labels](#labels)). The row's pitch grows by the same amount so the next row clears the taller bar. Bar contents include title, status indicator, owner, label chiclets, footnote indicators, and inline-date glyphs (when `after:DATE` / `before:DATE` are present).

- **Status indicator:** Hue-tinted dot in the bar's upper-right — green (done), blue (in-progress), amber (at-risk), red (blocked), slate (planned). Custom statuses use a neutral slate indicator. The exact tone is picked PER-BAR based on the bar bg's relative luminance: pale or saturated mid-tone bars (label-driven `bg:blue` etc.) get the deep `onLight` palette (≈ 800-900-level), and dark bars (default dark-theme status tints like `#172554`) get the pale `onDark` palette (≈ 100-level). The two palettes cross over at `L_bar ≈ 0.24` so the dot never fades into the bar even when a label propagates a same-hue saturated bg. The inline-date `before:` glyph (when present) sits to the LEFT of the status dot and footnote indicators, sharing the same upper-right decoration row — see [Inline-date glyph](#inline-date-glyph).
- **Progress bar:** When `remaining` is set, the bar fills proportionally (e.g., `remaining:30%` → 70% filled). `remaining:` accepts both percent and single-eng effort literal forms (`remaining:30%` and `remaining:0.6w` are equivalent on a `size:m` item with no capacity); both normalize to the same painted percent during layout. `status:done` fills the bar completely regardless of `remaining`. When the literal exceeds total effort, the painted bar clamps at 100% remaining and a soft warning is emitted (see `specs/dsl.md` rule 17). The strip sits at the bar's bottom.
- **Link icon:** A 14×14 colored tile in the bar's UPPER-LEFT corner with a white outbound-arrow ↗ glyph. The glyph is the SAME for every link target — only the tile color changes by service:
    - `linear.app` → **Linear** (purple tile)
    - `github.com` → **GitHub** (slate tile)
    - `*.atlassian.net` / `jira.*` → **Jira** (blue tile)
    - any other URL → **Generic** (theme-neutral tile)

  Item-level `link:` always means "navigates to this URL", regardless of whether the target is `.nowline` or anything else. When a link icon is rendered, the in-bar caption (every title line and the meta line) starts at `bar.x + 24`: the 12 px caption inset pushed past the 14 px tile, which spans `bar.x + 6 .. bar.x + 20`, plus a 4 px gap. The title and icon therefore never overlap inside the bar, and the same 24 px inset is what the fit / wrap decision below measures against. An in-bar `after:` date glyph pushes the inset further (22 px alone, 40 px beside a link tile; see [Inline-date glyph](#inline-date-glyph)). The visually-distinct stacked-sheets glyph is reserved for the file-level `include` region badge — see [Include Region](#include-region).
- **Caption (title + meta) — wrap in-bar (≤ 2 lines, word boundaries), else spill right**: the caption's *inner width* is the bar's visual width minus the left caption inset and a 12 px right inset. The left inset is 12 px, 24 px with a link icon, 22 px with an in-bar `after:` date glyph, and 40 px with both (`itemCaptionInsetX` in [`item-bar-geometry.ts`](../packages/layout/src/item-bar-geometry.ts); it applies to every title line and the meta line, so the caption's left edge stays straight). The title's FIRST line has a narrower budget, its *first-line width*: it sits at the same height as the status dot, footnote digits and `before:` glyph in the bar's upper-right, so it stops 4 px short of the leftmost of them (see "First-line clearance" below). Line 2 and the meta line sit below that cluster and use the full inner width. Layout places the caption in this order:
    1. The title fits on one line within the first-line width and the meta line fits the inner width: one in-bar line, exactly as before.
    2. Otherwise, when the meta line fits the inner width and a greedy whitespace word-wrap of the title yields **at most two lines, the first no wider than the first-line width and the second no wider than the inner width**, the title wraps INSIDE the bar (`textSpills=false`; `PositionedItem.titleLines` carries the lines and `title` keeps the full string).
    3. Otherwise the caption renders OUTSIDE the bar to the right as a single line (`textSpills=true`). This covers a single word wider than the first-line width, a second line wider than the inner width, a title that needs three or more lines, a meta line that does not fit, and a spilled link icon (`iconSpills`).

  Words never break mid-word: wrap points are whitespace only. Wrapping is always on; there is no DSL property or style key for it.

  **First-line clearance.** The first-line width is the bar's visual width minus the left caption inset minus a right reserve. The reserve is the larger of the plain 12 px right inset and the distance from the bar's right edge to the left edge of the top-right decoration cluster plus a 4 px gap (`itemTitleFirstLineRightReservePx` in [`item-bar-geometry.ts`](../packages/layout/src/item-bar-geometry.ts)). The cluster is the leftmost of three parts, each counted only when it renders inside the bar:

    - the status dot (always present): left edge 17 px from the right edge, so the reserve is 21 px and a 148 px bar's first line is 115 px against a 124 px inner width;
    - footnote indicators: the leftmost digit's left edge is `22 + 8·(n − 1)` px plus the digit's width (estimated at the footnote font size, 10) from the right edge, so one footnote reserves about 31.8 px;
    - the `before:` inline-date glyph: its left edge, one decoration step left of the footnotes (or of the dot when there are none), so the glyph alone reserves 37 px and with one footnote 42 px.

  A decoration that spills out of a bar too narrow to host it (see "Narrow-bar decoration spill") is not part of the cluster. The same helper feeds the item measure (`measureItem`), which the row track reads for the row pitch, so a title that wraps only because of a footnote or `before:` glyph still reserves its grown row.

  **Explicit line breaks are authoritative.** A `\n` in an item title (see [`specs/dsl.md`](./dsl.md) Design Rule 9) is a hard break and replaces the three-way order above for that title:

    - `\r\n` and a lone `\r` count as `\n`; each line is trimmed; leading and trailing empty lines are dropped and interior empty lines stay as blank lines. If one line is left (`"Plan\n"`) the title is an ordinary one-line title and the rules above apply to it as usual. `\\n` in the source is just the literal text `\n` on one line.
    - No auto-wrap runs on the author's lines and the two-line cap does not apply: a three-line title is three lines.
    - The title stays in-bar (`textSpills=false`) when line 1 fits the first-line width, every other line fits the inner width, and the meta line fits. Otherwise the whole caption spills right as a multi-line block with its breaks preserved (`textSpills=true`; a narrow-bar link-icon spill spills it too). `titleLines` carries the author's lines either way, and `title` keeps the raw string, newlines included.
    - Baselines are the same as for a wrapped title (`20 + 16·n`, meta one pitch below the last line) and the bar grows by the same `max(0, lastCaptionBaseline − 38)`, whether the block is in-bar or spilled, so the row pitch always contains the text. A three-line title with a meta line grows the bar 32 px (56 → 88). A spilled block reserves an x-extent as wide as its widest line (or the meta line, if wider) and raises `NL.I1000` like any spilled caption; the insight names the item with its breaks shown as spaces. Label chips under a spilled block clear its last baseline.
    - The renderer paints one `<text>` per line (a blank line keeps its slot and paints nothing); a title containing a newline is never painted as one raw `<text>`.

  Wrapped geometry (px from the bar's top):

    - Title line `n` (0-based) has its baseline at `20 + 16·n` (line pitch `ITEM_CAPTION_TITLE_LINE_HEIGHT_PX` = 16). The meta line sits at `38 + 16·(lines − 1)`, i.e. one extra pitch per extra title line.
    - The bar grows by `max(0, lastCaptionBaseline − 38)`, where the last caption baseline is the meta baseline when the item has a meta line and the final title line otherwise. A two-line title with a meta line puts the meta at 54 and grows the bar 16 px (56 → 72). A two-line title with no meta line ends at baseline 36, so the bar does not grow. In-bar label chips then stack below the last caption baseline (see [Labels](#labels)), so a wrapped title with a meta line and in-bar chips is 77 px tall (72 + the 5 px the chip rule adds, as it does for a one-line caption: 56 → 61).
    - The row pitch grows by the same amount. The lane's minimum band height can absorb part of it: a lane whose only row holds one wrapped bar grows 10 px (the 96 px minimum band height absorbs 6), while a lane with a second row grows the full 16 px.
    - The status dot, footnote indicators and inline-date glyphs stay in the bar's upper-right and do not move with the wrap; the first title line clears them by 4 px, and later lines and the meta line use the full inner width. The progress strip rides the grown bottom edge, the same as for chip growth.

  A spilled caption (case 3) of a title without explicit breaks is always the single-line title plus meta, so its geometry is unchanged: baselines 20 and 38, no bar growth, and an x-extent reservation on the row so the next chained item bumps to a fresh row instead of overlapping the spilled text. A wrapped caption stays inside its bar, so it makes no such reservation: the next chained item keeps its row, and no `NL.I1000` (caption-spilled-right) insight is raised.
- **Caption color (in-bar vs. spilled)**: when the caption stays inside the bar, the title uses the bar's resolved text color (`i.style.text`) and the meta uses `i.style.fg` so they read against the bar fill — including label-propagated overrides (e.g. `enterprise-style` setting `text:white` on a saturated bg). When the caption spills onto the chart / group bg instead, those bar-tuned colors no longer apply (white-on-peach is unreadable when an audit-track group's orange tint shows through behind the spilled title). The spilled title and meta both fall back to the theme's default item text color (`palette.entities.item.text` — `#0f172a` light / `#e2e8f0` dark) which is tuned for chart/group surfaces.
- **Footnote indicator color**: the small `1` `2` … superscripts in the bar's upper-right render in the bar's own resolved text color (`i.style.text`), so they read with the same contrast as the title regardless of the bar fill. The "footnote = red" attention cue lives in the footnote PANEL's red number column at the bottom of the chart, where red contrasts cleanly against the panel's white surface; on saturated mid-tone bars (e.g. a `bg:blue` from a label-style ref) the same red would lose contrast against the bar. The inline-date `before:` glyph (when present) walks LEFT from the leftmost footnote indicator using the same step pitch — see [Inline-date glyph](#inline-date-glyph).
- **Label chips — natural width, horizontal-then-vertical spill, bar grows**: chips render at natural text width on a single row inside the bar when the full row fits. When the row's total width exceeds the bar's effective inner width, the chips spill past the bar's right edge and pack into one or more rows whose width is capped at the bar's visual width (multiple chips per spill row, additional rows stack DOWNWARD by `LABEL_CHIP_HEIGHT_PX + LABEL_CHIP_ROW_GAP_PX`). When the spilled column would extend past the bar's natural bottom, the BAR GROWS DOWNWARD by exactly the overflow so the chip column reads as enclosed by the bar — the bottom progress strip rides the new bottom and the row's pitch grows by the same amount so neighbors below clear cleanly. See [Labels](#labels) for the slack rule and bar-grow behavior.
- **Narrow-bar decoration spill**: very short bars (e.g. a one-day item at weekly scale, 6 px wide inside its seams) can't host the dot, link icon, and footnote at their full insets — the dot would overshoot the bar's left edge, the link icon would visually collide with the dot, and the footnote would land behind both. Each decoration has its own width threshold; when the bar falls below it, the decoration moves into the spill column to the right of the bar. Reading order mirrors the in-bar layout (`[icon] [title] [¹²] [dot]` from left to right):

  ```
  [bar] [icon?] [title][¹²?] [dot?]
        [meta on line 2 — same x as title]
  ```

  A missing decoration just collapses out of the row — an item with no link and a too-narrow bar gives `[bar] [title] [dot]`. The dot lives at the trailing edge in BOTH the in-bar and spilled cases; pushing it to the LEFT of the title would make it read as belonging to the next item. Thresholds (px):

    - Dot spills when `bar.width < 2 * ITEM_STATUS_DOT_INSET_RIGHT_PX` (24), so the dot sits inside a bar only with equal air on both sides of it.
    - Link icon spills when `bar.width < ITEM_LINK_ICON_INSET_PX + ITEM_LINK_ICON_TILE_SIZE_PX + ITEM_DECORATION_SPILL_GAP_PX + ITEM_STATUS_DOT_INSET_RIGHT_PX + ITEM_STATUS_DOT_RADIUS_PX` (≈ 41) so the icon clears the dot's column with breathing room.
    - Footnote spills when `bar.width < ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX + 1` (≈ 23).
    - Inline-date glyph spills when `bar.width < MIN_BAR_WIDTH_FOR_INLINE_DATE_PX` (40 — covers the glyph tile plus its inset and a clearance gap from the link icon / status-dot column). The `before:` glyph spills to the right of the bar in the same column the status dot uses; the `after:` glyph spills to the LEFT of the bar's leading edge so the side semantics stay readable.

  A decoration that spills no longer sits in the bar's upper-right, so it does not narrow the title's first line (the first-line clearance in the Caption rule counts only decorations that render inside the bar). When the link icon spills, the title is forced to spill alongside it so the icon→title click affordance stays intact (icon and title would otherwise sit on opposite sides of the bar). The row-packer factors the rightmost spilled glyph (`decorationsRightX`) into its spill reservation so the next chained item bumps to a fresh row instead of landing under the spilled cluster. Spilled footnotes use the chart-tuned text color (same as spilled captions) since they no longer sit on the bar fill.
- **Caption cap at the chart's end**<a id="caption-cap"></a> ([`scheduler-unification.md`](./scheduler-unification.md) §8 decision 12): a spilled caption may run at most one column past the axis end, and the axis grows by that column. Captions that end inside the axis are unchanged.
    - *The cap.* `measureItem` lays out the bar's spill column (`layoutSpillCluster` in [`item-bar-geometry.ts`](../packages/layout/src/item-bar-geometry.ts): `[icon?] [caption] [¹²?] [dot?]`) and compares its right edge with `AxisColumns.captionCapX` ([`axis-columns.ts`](../packages/layout/src/axis-columns.ts)): the end of the one full column after the axis end (`AxisColumns.captionColumn`). The axis end is the natural window's end, or the boundary at or after the bar's own right edge when the bar itself runs past it (finalize f2 extends the axis there anyway). When an explicit `length:` ends the drawn axis mid-column, the column counts from the end of that partial last column, so the caption may run to the end of the full column after it. When the column passes the cap, every title line wider than the room left (the cap, less the spilled footnotes and dot that trail the caption) is cut to its longest prefix that fits plus `…` (`ellipsizeToWidth`, on the same per-character estimate as every other fit). A cut line keeps at least its first character. The meta line is never cut, so a meta line that is itself too wide still passes the cap. The row packer, the group box and the canvas read the truncated width.
    - *The column.* Finalize step f2 (`extendTimeline`) grows the axis to the boundary at or after the rightmost spilled caption (`maxSpilledCaptionRightX`, main lanes and isolated regions) when that caption ends past the axis end, never more than one full column past it. The added column is labelled under the same rules as any other column: `label-every`, the default thinning, and the narrow-column and edge rules decide whether its opening tick is major (so its grid line draws) and whether it carries its date label. If those rules would label it, it is labelled; if not, it is not, and no other label moves. Under an explicit `length:` the same rule holds, since f2 already treats `length:` as a minimum: a caption that ends inside a `length:` window changes nothing, and one that passes it grows the axis by one column. When the window ends mid-column (`length:30d` at `scale:1w`), the partial last column is completed and the added column is the full one after it; a caption that ends inside the partial column only completes it. A caption that ends inside the extra column is not truncated, but still adds the column. Any overhang counts, however small: a caption that ends inside the right `GUTTER_PX` still adds the column (`tests/inline-date-corners`, 0.4 px past a `length:14w` axis). The gutter is the air between the content and the canvas edge, not room for content, and caption widths are per-character estimates that can run short of the drawn glyphs, so a caption let into the gutter would cross the last grid line and the header box ([`layout-phases.md` §9](./layout-phases.md#9-as-built), "Caption overhang into the gutter").
    - *The tooltip.* A truncated item carries `PositionedItem.titleTruncated: true`; `titleLines` holds the cut lines and `title` the full string. The renderer paints the cut lines and gives the item's `<g>` the full title as its `<title>` tooltip (the first child, joined by a newline with a background item's wave tooltip when it has one). An item that was not cut carries no `titleTruncated` key and no new tooltip.

#### Item Flow

- Sequential items within a swimlane flow **left-to-right** along the timeline
- Each item's x-position is determined by its start time (after the preceding item ends, or after its `after:` dependency)
- Items within a `parallel` block stack **top-to-bottom**
- **Rows never move up** ([`true-width-layout.md`](./true-width-layout.md) §3.2): the next child of a track (lane or group) stays on the previous child's row when its bar and caption fit there, and otherwise drops to a new row below it. It never moves above the previous child. Collisions read the painted footprint (bar, spilled caption and decorations, container header), so a long caption pushes the next item down, never right; the dates do not move.

### Swimlane Rendering

Swimlanes render as sequential solid bands with alternating subtle background tints for visual distinction.

- Content flows **left-to-right** (sequential items along the timeline) and **top-to-bottom** when nesting or parallel flows require vertical stacking
- **Frame label**: swimlane name renders in the top-left of the band, horizontally written, styled like a PlantUML frame tab but with a modern aesthetic — a small tab or badge that sits at the top-left edge of the band, not a full-width header. The name's width is estimated per character by width class (narrow `i l .`, semi-narrow `f r t 1 -`, wide `m w M W`, capitals and digits, everything else; `estimateFrameTabTitleWidth`), so the owner and capacity badges that follow keep the same 6 px gap whatever letters the name uses
- **Owner badge**: if the swimlane has `owner:`, the resolved owner title (a nested team's included; the bare id when the owner names no declared person or team) renders inline inside the frame tab, to the right of the swimlane name, in the tab's muted text color, led by a one-em glyph in place of an `owner:` prefix: the built-in `person` glyph for a person, `people` for a team. Layout sizes the tab from that title and carries its geometry on `PositionedSwimlane.tab`, so the collision box the row packer reserves is the chiclet the renderer draws
- **Capacity badge**: if the swimlane has `capacity:`, the value renders inline inside the frame tab, after the owner badge (or after the lane name if no owner), in the tab's muted text color. Format: `N[glyph]` where `N` is the capacity number (trailing zeros trimmed) and the glyph is determined by the resolved `capacity-icon` style property. Example with default `multiplier`: `Platform Team · Sam · 5×`. With `person`: `Platform Team · Sam · 5 [person]`. With `points`: `Platform Team · Sam · 5 ★`. See [Swimlane Capacity](#swimlane-capacity) for the full contract.
- **Footnote superscript**: footnote indicators attached to a swimlane render inside the **upper-right corner of the frame tab** (right-aligned, inset from the tab's right edge), not at the upper-right of the full band. This keeps the indicator co-located with the swimlane's own label instead of floating next to unrelated item bars on the far right of the chart
- **Nested swimlane indentation**: child swimlanes are inset by the parent swimlane's `padding`. No separate indent property — padding stacking naturally creates visual nesting hierarchy
- The swimlane band spans the full timeline width (from first to last tick mark, plus padding)

### Anchors

Anchors render as **diamonds** (Gantt milestone style). An anchor appears at its date position on the timeline, vertically aligned with the topmost item that references it. The anchor's vertical cut line is the visible "stem" of every `after:anchor` dependency ([`true-width-layout.md`](./true-width-layout.md) §3.5): an item that starts on the anchor touches the line and draws nothing more; an item that starts later (it waits on other work too) draws a **dotted** horizontal stub from the cut line, at the item's row midline, to its painted left edge, arrowhead first. Multiple items referencing the same anchor each draw their own stub; the cut line does the through-chart work. An `after:` milestone reads the same way. The cut line stops at the bottom of the last swimlane and does not invade the mirrored bottom tick panel when one is present — only the now-line and the major grid lines thread through that panel.

### Marker-row labels

Anchors, milestones (dated and `after:`-only) and titled non-working runs share the marker row under the tick panel. An isolated region packs its own anchors and milestones the same way into a marker row inside its box (see [Included Roadmap Region](#include-region)). Each label sits to the right of its marker when it fits before the canvas's right edge, else to the left when it fits after the chart's left edge (`chartLeftX`: the right edge of a `beside` header box, 0 under `header-position:above`); a label that collides with one already placed takes another row. A label that fits on neither side grows the canvas on the right until it fits there, plus the 12 px gutter, so a label never falls back onto the header card beside the chart or off the canvas's left edge. The growth (finalize step f3, `growCanvasForMarkerLabels`) reads every marker's final x (after-only milestones included) before the swimlane bands are stretched to the canvas (f4, `fitWidths`), so the lanes reach the new edge; the tick panel does not extend into the added width. A roadmap whose labels all fit on one side keeps its exact geometry. A slack or overrun arrow between two markers also claims the row it runs on, and its endpoints constrain which rows their markers take (see Milestones, "Marker predecessors").

### Inline-date glyph

When an `item`, `parallel`, or `group` declares an inline date literal in `after:` or `before:` (e.g. `after:2026-03-15` — see [`specs/dsl.md`](./dsl.md) "Inline date pins"), the renderer paints a small **calendar glyph** in the entity's top-decoration row. This is the lightweight counterpart to a declared `anchor` — it pins the entity to a specific date without claiming chart-spanning visual real estate.

- **Glyph:** the renderer's built-in `calendar` icon, rendered from the same curated SVG library as `shield`, `warning`, `lock`, etc. Same sizing and color rules as the other built-in icons; identical across web, CLI, and exports.
- **Tile size:** 12 × 12 px (`INLINE_DATE_GLYPH_TILE_SIZE_PX`). Slightly smaller than the 14 × 14 link icon — the date glyph reads as a sibling of the status dot and footnote indicators, not a peer of the link tile.
- **Side:** LEFT for `after:DATE`, RIGHT for `before:DATE`: the top-left / top-right corner of an item bar, the left / right end of a container's title row (see [Per-entity attach point](#per-entity-attach-point)). At most one glyph per side per entity (validation rule 24b enforces this structurally).
- **Color:** entity's resolved meta color (the same family as the status dot tint) so the glyph reads against any bar fill or container surface.
- **No caption.** The ISO date is not painted next to the glyph. The renderer wraps the glyph `<g>` in `<title>YYYY-MM-DD</title>` so a hover tooltip surfaces it on web targets; non-interactive exports (PDF, PNG) encode the date in alt text only. Authors who want a visible on-canvas date label declare a real `anchor` instead.
- **No vertical cut line.** Inline-date pins never extend a line through the chart — that visual is reserved for declared `anchor` and `milestone` entities.

#### Per-entity attach point

A container's glyphs sit in its **header band**, in the title row above the bracket line, never in its body: the renderer paints a container's chrome before its children, so a glyph on the body would be painted over by the first child bar.

- **Item** — top-LEFT of the painted bar for `after`, top-RIGHT for `before`. Inset insets defined in [`packages/layout/src/item-bar-geometry.ts`](../packages/layout/src/item-bar-geometry.ts).
- **Group or parallel** — in the header's title row: the glyph's top sits `(CONTAINER_BRACKET_LINE_OFFSET_PX - INLINE_DATE_GLYPH_TILE_SIZE_PX) / 2` below `box.y`, so it clears the bracket line 13 px down. The `after`-side glyph takes the row's leftmost slot, on the container's start (`box.x`), and the title moves one gap past it (`containerHeaderTitleX`). The `before`-side glyph sits `INLINE_DATE_GLYPH_INSET_RIGHT_PX` short of the container's end, so a sibling that starts on that end, level with the header, keeps clear of it. It never slides left onto the title or the `after`-side glyph: when the title's estimated end (the pessimistic 0.58 em/char text estimate) runs past that slot, it sits one gap past whichever ends last, even past the bracket's end. Layout and renderer place the title and the glyphs with the same helpers ([`packages/layout/src/container-header-geometry.ts`](../packages/layout/src/container-header-geometry.ts)). A pin never changes a container's geometry: every drawn container with a title or a bracket already has the band, and an untitled `bracket:none` container gains it only to hold its glyphs.
  - **Row reservation:** whatever the header paints past the container's end (a long title, a `before`-side glyph pushed past it) is footprint the row packer keeps, so a sibling chained onto the same row drops a row instead of painting over it (`containerHeaderRightX`).

#### Decoration-row interleaving (item)

The inline-date glyph joins the existing top-decoration family (link icon top-LEFT, status dot + footnote indicators top-RIGHT) without reordering anything else.

- **Top-LEFT (`after:DATE`)**: glyph sits one decoration step right of the link icon's right edge when a link icon is present, otherwise at the bar's leftmost decoration slot (`bar.x + 6 .. bar.x + 18` alone, `bar.x + 24 .. bar.x + 36` beside a link tile, y 5-17). The caption (every title line and the meta line) starts 4 px past the glyph's right edge, at `bar.x + 22` alone or `bar.x + 40` beside a link tile, so the title text never runs under the glyph; the fit / wrap decision measures against that inset. The glyph's left edge and the caption inset come from the same formula (`itemAfterGlyphInsideLeftX`). A glyph that spills out of a bar narrower than `MIN_BAR_WIDTH_FOR_INLINE_DATE_PX` (see Narrow-bar spill) reserves nothing, and neither does a caption that spilled to the right of the bar. With `noLinks` the tile is not drawn but layout still places the glyph beside its slot, so the caption keeps the 40 px inset.
- **Top-RIGHT (`before:DATE`)**: glyph sits one decoration step LEFT of the leftmost footnote indicator (or one step left of the status dot when no footnotes are present). The status dot stays anchored at the rightmost slot; the inline-date glyph inserts at the LEFT end of the cluster so the existing badge sequence keeps its order. The title's first line stops 4 px short of this glyph (see the Caption rule in [Item Bars](#item-bars)); the glyph's left edge comes from the same formula (`itemBeforeGlyphInsideLeftX`) that places it.

#### Narrow-bar spill

When the bar is too narrow to host the full decoration row inside, the inline-date glyph spills into the same column the existing status dot and footnote indicators spill into — same step constants, same family. The threshold is `MIN_BAR_WIDTH_FOR_INLINE_DATE_PX`. Spilled inline-date glyphs use the chart-tuned text color (same as spilled captions) since they no longer sit on the bar fill.

### Milestones

Milestones render as a **diamond in the timeline header row** at the milestone's x-position, with a **prominent dashed vertical line** (ink-dark theme color, 2px stroke, 6/4 dash pattern, round caps) cutting down from the diamond's bottom tip through all swimlanes to the bottom of the last swimlane. The cut line does not extend into the mirrored bottom tick panel when one is present — that panel is reserved for date labels, the now-line, and the major grid lines.

- Line style: prominent dashed — distinct from grid lines (1px fine dots) and anchor lines (1px fine dashes). Drawn after swimlane fills so the dashed pattern stays visible across every swimlane band.
- Line color: milestone's resolved `fg` color, or a system default (dark ink). Turns **red**, with the diamond and label, for a **date-driven** milestone that is overrun by a predecessor (see below).
- Milestone label renders adjacent to the diamond in the header (biased right; flips to the left of the diamond if right-side space is insufficient). See [Marker-row labels](#marker-row-labels).
- **Fixed (date-driven) milestone** (has `date:`) — positioned at that date. If any `after:` predecessor's duration ends past the milestone line, the milestone is **overrun**: its line, diamond and label all render in the theme's overrun colour (`milestoneDiamond.cutLineOverrun`: red in light and dark, a mid grey in grayscale), and a dotted arrow in the same colour, with a matching head, runs from the latest overrunning predecessor's end date back to the line to highlight the cause. The predecessor's own bar is not recoloured: for an item the arrow already spans exactly the overrun, from the bar's end back to the line (the red overflow tail belongs to `before:`, see [Before Constraints](#before-constraints)). An anchor or milestone predecessor has no bar. A wave that ends past the date overruns the milestone too, but draws no arrow (see [Waves](#waves)). The arrow leaves an item where its slack arrow would (see Slack arrows below), an anchor or milestone on that marker's own row (see Marker predecessors below), and a group or parallel, which has no row of its own, on the milestone's own marker row. An anchor or milestone whose diamond touches the milestone's draws no arrow; the line still turns red.
- **Floating milestone** (no `date:`, only `after:`) — positioned at the **duration end** of the **latest predecessor**, the day the exports give it, which is where that predecessor's bar ends (less its 1 px seam). By definition there is no overrun, so the line renders in the standard ink-dark prominent style (never red).
  - **Slack arrows**: each non-binding predecessor draws one dotted ink arrow from its **end date** to the milestone line (a bar spans exactly its dates, so that is where its bar ends; [`true-width-layout.md`](./true-width-layout.md) §3.5). The arrow attaches at the predecessor's **nominal row midline** (`bar.top + bandwidth / 2`, the same line its dependency arrows use, see [Attach geometry](#attach-geometry)) by default, so on a bar grown by a wrapped title or label chips the dotted arrow leaves level with the dependency arrows rather than at the taller bar's own mid-height; when the predecessor's caption spills past the bar's right edge (the title/meta render *adjacent* to the bar instead of inside it) the attach point drops to the **vertical center of the bottom progress strip** (`box.bottom - PROGRESS_STRIP_HEIGHT_PX / 2`) so the arrow stays clear of the spilled text and visually aligns with the progress bar. The horizontal gap + dotted pattern reads as "waiting time / slack before the milestone." No arrow is drawn from the binding (latest) predecessor, since it ends on the line.
  - **Flow dedupe**: predecessors are grouped by their enclosing **flow** — the deepest single-track container they live in (a swimlane root, a sequential `group { ... }`, or one sub-track of a `parallel { ... }`). Within one flow, only the **latest** predecessor (latest duration end) draws a slack arrow; siblings to its left collapse silently because file order in a single-track container already encodes the chain (an arrow from each chained sibling would be redundant). Across flows (e.g. two predecessors that sit in different `parallel` sub-tracks), each flow's last entry contributes its own slack arrow.
  - **Marker predecessors**: an anchor or milestone predecessor's slack arrow (and a dated milestone's overrun arrow from one) leaves the marker's cut line on the marker's **own row** in the marker band, at its diamond's centre: the row the final marker pack gives it, which can differ from any earlier estimate when the band grows. In an isolated region it is the region's own marker row. A marker whose diamond touches or overlaps the milestone's (centres at most two diamond radii, 12 px, apart) draws no arrow: the two diamonds already meet. These arrows run in the marker band, above the lanes, so they reserve no slack corridor among the lane rows. Instead the marker band packs around them: an arrow's run (on its source's row, between the two diamonds) is kept clear of every other diamond, label and run on that row, the target sits at or above the source's row so the arrow meets its diamond or cut line (cut lines run down from a diamond), and a label takes the side its own arrow does not run along when that side fits. Meeting these can add a row to the band; when a source fits no row at or below its target, the new row goes right below the target. A marker with arrows leaving both sides, or with no room for its label on the free side, keeps its label on the arrow.
- If all `after:` predecessors have `status:done`, the milestone renders as complete.
- **On a wave boundary**: a milestone whose diamond falls on a wave boundary (within 0.5 px, typically `milestone … after:<wave>`) keeps its diamond and label but draws **no cut line**; the boundary already marks that instant. A floating milestone bound by a wave reference sits exactly on the boundary and draws no slack arrow for the wave. A dated milestone that a wave overruns keeps its red cut line, diamond and label. See [Waves](#waves).

### Dependency Arrows

Arrows are drawn for `after:` on items and run on the dates ([`true-width-layout.md`](./true-width-layout.md) §3.4). They use orthogonal routing (horizontal and vertical legs only) with small rounded corners, and are built in finalize step f11 from the final model, after the chart's one translation to its top on the canvas (f7), so every port reads the box its bar is drawn with. Wave references and inline dates draw no arrow.

- **Z-order**: every arrow paints behind the bars and the container chrome, after the lane bands and grid. A leg that crosses a bar passes behind it at a right angle; its head always lands in a gap, so it stays in view.
- **Stroke**: 1.1 px in the theme's dependency colour. Vertical legs are solid; the horizontal leg is **dotted** (`3 3`, the milestone slack-line pattern) when the target waits on its source (its start is later than the source's end, so the leg's length is the slack) and solid when the target starts the day the source ends.
- **Head**: drawn as a path, not a `<marker>`: 7 px across and 5 px along its leg, narrowed to the target's width when the target is narrower (a one-day bar at weekly scale is 6 px), and a 3 px dot in place of the head below that (`ARROW_HEAD_WIDTH_PX`, `ARROW_HEAD_LENGTH_PX`, `ARROW_HEAD_MIN_PX`; §8 O6). The leg stops where the head starts.
- Applies to item dependencies and anchor / milestone stubs. Milestone slack lines (see Milestones) keep their own dotted look and marker. There are **no implicit join arrows** from a parallel block's tracks into the next sequential item — the block's x-end and the following item's x-position encode that ordering on their own (see `Parallel`).

#### Attach geometry

Ports take x from the **dates** and y from the **painted edges**.

- **Source port**: the middle of the source's **last day** (`end - min(day / 2, span / 2)`, so a bar shorter than a day uses its middle), on its **bottom** edge when the target is below, its **top** edge when the target is above. Day centres, never date lines: in a chain the successor starts exactly on its source's end date, so a leg on the date line would run down the successor's edge.
- **Target port**: the middle of the target's **first day**, on its **top** edge (bottom edge when the source is below), arrowhead first.
- **Group or parallel source**: leaves the bottom of its body (`box.y + box.height`) at the middle of its last day; its `box` spans exactly its dates.
- **Same row**: when the target sits on its source's row (each one's row midline crosses the other; a container source only needs the target's midline to cross it), a target that starts where its source ends draws **no arrow**, and one that waits draws a single dotted leg from the source's end date to the target's painted left edge, on the row's nominal midline (`bar.top + bandwidth / 2`), or on the source's progress strip centre (`box.bottom - PROGRESS_STRIP_HEIGHT_PX / 2`) when the source's caption spills, so the leg runs under the caption.
- **Anchor or milestone source**: see Anchors. An item that starts on the marker draws nothing; one that waits draws a dotted stub from the cut line at its row midline to its painted left edge.
- **Row midline**: an item's nominal midline is `bar.top + bandwidth / 2` (28 px below the top for the default 56 px band), not a grown bar's own mid-height, so a bar grown by a wrapped title or chips shares the line with its row neighbours.

#### Gap routing

An arrow between rows runs vertical from the source port, horizontal in a gap between rows, vertical into the target port (`packages/layout/src/edge-routing.ts`).

- **Gaps**: the free horizontal bands between the source's edge and the target's edge that nothing a horizontal leg must avoid reaches into over the leg's x-range: bars with their spilled captions and decorations, container header bands, container body bottoms, and lane and region edges, each kept 1 px clear. A horizontal leg never runs along an edge or through text.
- **Choice**: among the gaps, the router takes the one whose vertical legs keep more than 1 px from every bar and container edge they pass, then the one whose vertical legs cross the fewest bars and headers, then the one nearest the source. With no free gap, the leg runs just past the source and passes behind whatever is there.
- **Lanes**: arrows whose horizontal legs share a gap and overlap in x take lanes `CHANNEL_LANE_PX` (2.5 px) apart, the first offset toward the source so the head keeps its leg; past the gap's room they share the least crowded lane.
- **Bundling** (§8 O1): arrows landing in the same day column from the same side share one lane, so they merge into one trunk over their target. Fan-outs from one source to several targets starting the same day come out as one trunk down the source's last day that branches just above each target, because that route crosses no bar.
- **Isolated regions** route their own arrows among their own lanes with the same rules; the host routes only its own.

### Before Constraints

When an item has `before:` and its duration end passes the earliest cap it names (the date of an anchor, a milestone or an inline date, or the start of any other entity it names; [`true-width-layout.md`](./true-width-layout.md) §3.5), the item overflows. A red tail (`overflowBox`: the theme's `overflowTailFill` and `overflowTailStroke`) is drawn over the bar from the cap to the item's end date, the full band height, and when it is wider than 60 px it is captioned `past <cap>`. The comparison reads the duration end, the date the exports give, and the bar ends on that date, so the tail and the bar end together. The layout raises `NL.I1003` for each overflowing item.

### Swimlane Capacity

`capacity:` annotations on swimlanes and items render as visual badges, and lanes with `capacity:` paint a tri-state utilization underline (green / yellow / red) per timestep based on concurrent item load. None of these affect parser diagnostics — the underline is a pure rendering signal.

#### Item size chip

The meta line shows a **single driver token** first: either the `duration:` literal (when present) or the size chip (when `size:` drives the bar). Both are never shown together — the bar's width already encodes calendar span for sized items.

When `size:` drives, the chip text is the size declaration's `title` when one was provided, falling back to the id verbatim (case as typed): `size m "M" effort:1w` paints `M`, `size xs effort:0.5d` paints `xs`, `size med effort:1w` paints `med`. Authors who want the classic uppercased t-shirt look pin it via the title (`size m "M"`); the layout never folds case on its own. The chip uses the item's resolved meta color and the meta line font size; no separate background fill (it reads as inline text, not a tinted pill).

When `size:` and `duration:` are both set, the explicit `duration:` literal wins for bar width **and** for the meta line: the chip is omitted — e.g. `2w` for an item with `size:lg duration:2w`. Items without `size:` render no chip (the driver is the duration literal only).

#### Item capacity suffix

Items with `capacity:N` render the value as a suffix after the meta text: `m 2×` when `size:m capacity:2` drives (default `multiplier` glyph), `1w 2×` when `duration:1w capacity:2`, `m 2 [person]` (with `capacity-icon:person`), and similarly for `points` / `time`. The suffix appears only when the resolved capacity is `> 0`. Items without `capacity:` render no suffix.

The suffix uses the item's resolved text color and matches the meta line's font size and weight.

When driver and suffix are both present, the on-bar reading order is `[driver token] [capacity suffix]` — e.g. `m 2×` for a `size:m capacity:2` item (or `M 2×` if the size declares `title:"M"`). Optional `owner:` and `remaining` text compose between the driver and the suffix, e.g. `m Sam — 50% remaining 2×`.

#### Lane capacity badge

Swimlanes with `capacity:N` render the value as `N[glyph]` inside the frame tab, after the owner badge (or after the lane name if no owner is present). Same glyph rules and formatting as the item suffix. The capacity-icon vocabulary supports `none`, `multiplier` (default), `person`, `people`, `points`, `time`, custom `symbol` declarations, and inline Unicode literals.

#### Glyph formatting

- **Order:** number first, glyph second (`5×`, `8 ★`, `12000 $`). Reads naturally as English ("five times", "eight points").
- **Spacing:** SVG `<tspan dx="...">` between number and glyph for precise control.
  - `multiplier` glyph: no gap (`5×`) — multiplication sign is a typographic operator that already includes side-bearing.
  - Built-in SVG glyphs (`person`, `people`, `points`, `time`): `0.25em` gap (`5 [person]`, `8 [star]`). The icon is a sibling `<svg>`, so its x comes from layout's width estimate of the number (and, on an item meta line, of the meta text before it) rather than from the font; on the meta line the number is placed from the same estimate instead of flowing after the meta text, so number and icon always agree. The wider gap absorbs the estimate's error against real digit widths. Same rule on items and lane badges.
  - Custom/literal glyphs: `0.1em` gap (`12000 $`), flowed inside the `<text>` by `<tspan dx>`.
- **Number formatting:** integers render as integers (`5`, not `5.0`); decimals render with trailing zeros trimmed (`0.5`, `1.25`); percent literals already converted to decimals at parse time so they render in decimal form (`50%` author input → `0.5` rendered).
- **ASCII fallback:** when SVG output is constrained to ASCII (e.g. CLI text mode export), substitute the glyph's `ascii:` value. Built-in glyph fallbacks: `multiplier` → `x`, `person` → `p`, `people` → `P`, `points` → `*`, `time` → `t`, `none` → `` (empty). Custom `symbol` declarations supply their own `ascii:` value (default `?` if absent).

#### Built-in glyph table

| Name         | Unicode (renderer-preferred SVG path) | ASCII fallback | Notes                                                  |
| ------------ | ------------------------------------- | -------------- | ------------------------------------------------------ |
| `none`       | (no glyph)                            | (none)         | Renders the bare number.                               |
| `multiplier` | `×` (U+00D7) — emitted as `<text>`    | `x`            | Default. Reads as a quantity. No side spacing.         |
| `person`     | curated SVG single-figure path        | `p`            | For people-based capacity (FTE, headcount).            |
| `people`     | curated SVG paired-figure path        | `P`            | Plural variant; useful when each unit is a small team. |
| `points`     | `★` curated SVG star path             | `*`            | For story-points-based capacity.                       |
| `time`       | `⏱` curated SVG stopwatch path        | `t`            | For time/hours-based capacity.                         |

#### Lane utilization underline

Swimlanes with `capacity:` paint a **tri-state utilization underline** (green / yellow / red) along the bottom edge of the band. The underline is the visual surface for the lane's per-timestep load against capacity; it reads as a continuous health bar for the lane's lifetime, with color tracking utilization.

**Load function and segmentation:**

- Compute `f(x) = Σ items[i].capacity for items active at x` per timestep, walking from the lane's first item start to the lane's last item end. Items contribute their `capacity:` value (default `1` for sized items, `0` for duration-literal items with no explicit capacity — see `dsl.md` § Capacity → Default capacity).
- Slice `f(x)` into half-open intervals `[t, t+δ)` at every event boundary (item start, item end). Within each interval the load is constant.
- For each interval, compute the utilization fraction `u = f(x) / capacity` and classify against the lane's resolved thresholds (default `warn-at:80%`, `over-at:100%`):
  - `u < warn-at` → **green** segment (healthy; includes the `u = 0` "idle" case, so the underline is continuous).
  - `warn-at ≤ u < over-at` → **yellow** segment (approaching saturation).
  - `u ≥ over-at` → **red** segment (over capacity).
- Adjacent same-color segments coalesce into a single rectangle for fewer SVG nodes.

**Geometry:**

- Height: 2px, matching the milestone-line stroke weight.
- Y-position: flush with the bottom edge of the lane band, inside the band (not below).
- X-positions: align to the timestep event boundaries (item start/end), not arbitrary day grid lines. Use `pixelsPerDay` arithmetic from the time scale (pixels per visible day under `calendar:business`). Under `non-working:show` the segments follow the drawn boxes (see the "Non-working days: shown" rule under [Timeline Scale](#timeline-scale)).
- The underline spans the full lane lifetime — from the first item's left edge to the last item's right edge — so adjacent green segments make the lane read as a continuous bar.

**Theme tokens:**

| Token                                  | Light default | Dark default | Notes                                         |
| -------------------------------------- | ------------- | ------------ | --------------------------------------------- |
| `theme.swimlane.utilizationOk`         | `#10b981`     | `#34d399`    | Green; healthy (load below `warn-at`).        |
| `theme.swimlane.utilizationWarn`       | `#f59e0b`     | `#fbbf24`    | Yellow; warn band (load in `[warn, over)`).   |
| `theme.swimlane.utilizationOver`       | `#ef4444`     | `#f87171`    | Red; over capacity (load `≥ over-at`).        |

Authors can override these via the standard theme mechanism (out of scope here — see `themes.md` when it lands).

**Threshold resolution order:** lane explicit > applicable `default swimlane` > built-in default (`warn-at:80%`, `over-at:100%`). The resolved values are independent — a lane can pin `warn-at:none` to skip the yellow band while leaving `over-at` at its default.

**`none` and suppression:**

- `utilization-warn-at:none` removes the yellow band; segments at or above `warn-at`'s effective coverage paint green until they reach `over-at`.
- `utilization-over-at:none` removes the red band; segments at or above `over-at`'s effective coverage paint yellow (or green if `warn-at` is also `none`).
- Setting both to `none` suppresses the underline entirely. Equivalent to opting out of the visual.
- A lane without `capacity:` paints no underline regardless of threshold values (no denominator → undefined utilization). No diagnostic.

The underline never affects parser diagnostics — it is purely a rendering signal — and it does not affect the lane's capacity badge in the frame tab nor any item-level capacity suffixes.

### Styles

Styles defined in `config` control the visual appearance of entities. Style properties map to rendering as follows:

| Property | Effect |
|----------|--------|
| `bg` | Background/fill color of the entity (item bar, swimlane band, group box, etc.). `none` for transparent. |
| `fg` | Border/outline color of the entity. `none` for no border. |
| `text` | Color of text within the entity. `none` hides text. |
| `border` | Border/connection line style: `solid` (default), `dashed`, `dotted` |
| `icon` | Small icon rendered at the leading edge of the entity. Built-in identifiers (rendered from a curated SVG library, identical across platforms): `shield`, `warning`, `lock`, `calendar`, plus the capacity-icon vocabulary (`person`, `people`, `points`, `time`). Custom: any identifier declared by a `symbol` declaration in config. Inline: a double-quoted Unicode literal — font-dependent. |
| `shadow` | Drop shadow beneath the entity: `none` (no shadow), `subtle` (tight, small offset), `soft` (larger offset, softer blur), `hard` (solid, no blur, offset down-right). `subtle`/`soft` rendered via SVG `<feDropShadow>`; `hard` rendered as a solid duplicate shape offset behind the entity. |
| `font` | Font family for text within the entity. Named preset (`sans`, `serif`, `mono`) that maps to a cross-platform font stack. No font downloads required. |
| `weight` | Font weight for the entity's primary text (title). Maps to SVG `font-weight`: `thin` (100), `light` (300), `normal` (400), `bold` (700). `thin` degrades gracefully if the font lacks that variant. |
| `italic` | When `true`, renders the entity's primary text in italic. Maps to SVG `font-style: italic`. |
| `text-size` | Font size for the entity's primary text (title). Named preset (`xs`, `sm`, `md`, `lg`, `xl`); system owns the absolute pixel mapping. |
| `padding` | Inset padding within the entity. Named preset (`none`, `xs`, `sm`, `md`, `lg`, `xl`). |
| `spacing` | Space between children within a container entity. Named preset (`none`, `xs`, `sm`, `md`, `lg`, `xl`). |
| `header-height` | Height of the timeline scale header row (date strip), top and mirrored bottom alike. Roadmap-only. Named preset: `none` (no date strip), `xs` 16 px, `sm` 20 px, `md` 24 px (default), `lg` 32 px, `xl` 40 px. |
| `corner-radius` | Corner rounding for the entity's bounding shape. Maps to SVG `rx`/`ry`. Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`, `full`. `full` computes radius as half the rendered height. |
| `bracket` | The header bracket over a group's or parallel's dates. `none`, `solid` (group default), `dashed` (parallel default). Container-only — ignored on other entities. |
| `capacity-icon` | Glyph used as the suffix to capacity numbers on lanes and items. Built-in names (`none`, `multiplier` (default — `×`), `person`, `people`, `points` (`★`), `time` (`⏱`)) render from the renderer's curated SVG glyph library — consistent across all platforms. Custom names from `symbol` declarations and inline Unicode literals (`"💰"`) are font-dependent. ASCII fallback per the glyph definition. |
| `timeline-position` | Where the timeline date strip is rendered. `top` (default), `bottom`, `both`. Roadmap-only. `both` mirrors the strip at the chart's bottom so the dates remain readable on tall canvases without scrolling back to the top. The mirrored strip shares fill, border, label color, and tick positions with the top strip; it has no now-pill and no marker row. The now-line and major grid lines thread through the mirrored strip so the timeline reads as a single sweep; milestone and anchor cut lines stop at the bottom of the last swimlane to keep the date labels uncluttered. |
| `minor-grid` | When `true`, draws a faint dotted grid line at every tick boundary in addition to the major-tick lines. Roadmap-only. Uses `theme.timeline.minorGridLine` (a step lighter than `gridLine`) so the major lines still dominate. |
| `non-working` | How non-working days appear under a calendar that has them (`calendar:business`): `hide` (default) collapses each run to a seam; `show` draws each run at full width as a shaded band that work paints across. Roadmap-only, set on `default roadmap`; a render-time option on every surface overrides it. Uses `theme.timeline.nonWorkingFill`. See the "Non-working days: shown" rule under [Timeline Scale](#timeline-scale). |

**On a `wave`**, only four properties apply: `bg` opts the wave into a column tint and a strip-cell overlay, `fg` colours its boundary line, `text` colours its strip label, and `border` sets the boundary dash (`solid`, `dashed`, `dotted`). Every other property is ignored. There is no `default wave` and no built-in wave style; unstyled waves use the `theme.wave.*` tokens (see [Waves](#waves)).

Text style properties (`font`, `weight`, `italic`, `text-size`) apply to the entity's primary text (title). Secondary text within an entity (owner badge, status label) follows its own rendering rules.

#### Built-in Icon Library

The renderer ships a curated SVG icon library backing both `icon:` and `capacity-icon:` built-in names. Each named icon is an inline SVG path emitted directly into the output — not a Unicode codepoint, not a font reference, not an external asset. This guarantees identical rendering across web (browser SVG), CLI (terminal-rendered SVG / image), and downstream exports.

The library includes the entity-decoration set used by `icon:` (`shield`, `warning`, `lock`, `calendar`, etc.) and the capacity-suffix set used by `capacity-icon:` (`person`, `people`, `points`, `time`). `multiplier` is rendered as a `<text>×</text>` element rather than an SVG path because U+00D7 MULTIPLICATION SIGN is a basic typographic operator with consistent rendering across all standard fonts. The `calendar` icon is also reserved as the renderer-side glyph for inline-date pins (`after:DATE` / `before:DATE` on `item`, `parallel`, `group`) — see [Inline-date glyph](#inline-date-glyph).

When an author needs a glyph not in the library, the `symbol` config declaration (with `unicode:`) or an inline Unicode literal provides escape hatches — both font-dependent.

#### Font Presets

| Preset | SVG / HTML export | PNG / PDF raster export | VS Code preview |
|--------|------------------|------------------------|-----------------|
| `sans` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (generic stack) | DejaVu Sans (bundled, static) | DejaVu Sans (via `@font-face`) |
| `serif` | falls back to `sans` for raster; generic serif stack for SVG | DejaVu Sans (sans substitution) | DejaVu Sans |
| `mono` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace` (generic stack) | DejaVu Sans Mono (bundled, static) | DejaVu Sans Mono (via `@font-face`) |

**Default is bundled DejaVu everywhere for raster and preview.** The generic `FONT_STACK` is retained for `.svg` and `.html` exports so saved files render with the viewer's system fonts. System fonts for raster and preview can be enabled via `--use-system-fonts`; see `specs/handoffs/m2c.md § 10` for the full resolution order and VF guard.

#### Shadow Defaults by Entity Type

- **Items**: `shadow:subtle` (items get a drop shadow out of the box)
- **Footnotes**: `shadow:subtle` (footnote area benefits from visual separation)
- **Swimlanes, anchors, milestones**: `shadow:none`
- **Groups, parallel regions**: `shadow:none`, but users can opt in via `style:` or inline `shadow:` — only takes visual effect when the entity has a visible outline (styled group/parallel with `bg` or `border`)

#### Corner Radius Defaults by Entity Type

- **Labels**: `corner-radius:full` (chiclet/pill shape)
- **Items**: `corner-radius:sm` (slightly rounded bars)
- **Groups, footnotes**: `corner-radius:sm`
- **Swimlanes**: `corner-radius:none` (full-width bands, square edges)
- **Roadmap header box**: `corner-radius:sm`

#### Style Precedence

When multiple style sources apply to an entity, the renderer resolves them in this order (highest priority first):

1. **Entity inline properties** — style properties set directly on the entity (e.g., `item auth-refactor bg:red`).
2. **Entity `style:` reference** — a named style referenced on the entity (e.g., `item auth-refactor style:risky`).
3. **Label `style:` reference** — the named style referenced by the label.
4. **Config `defaults`** — the `default <entity>` line for the entity type. Its `style:` reference applies first and the line's raw style properties apply on top of it, the same order levels 1 and 2 use on the entity, so `default item style:subtle bg:red` reads as "`subtle`, but red". Both sit below every label and entity style.
5. **Nowline system defaults** — built-in colors and styling when nothing is specified.

When an entity has multiple labels with different styles, the first label's style takes precedence: on any property two labels' styles both set, the label listed first in `labels:` wins. A property only a later label's style sets still applies.

**Isolate scoping:** When an entity originates from an included file, style resolution uses the scope determined by the include's modes: `style:` references (levels 2 and 3) and `defaults` (level 4) resolve against whichever config scope is active under `config:isolate` / `config:merge`; label entities themselves are governed by `roadmap:isolate` / `roadmap:merge`, matching their roadmap-section classification.

### Labels

Labels render as **chiclets** — small, pill-shaped badges (`corner-radius:full` by default). They appear inline on the entity they're attached to (typically inside the item bar, just above the bottom progress strip).

- **Shape**: pill shape via `corner-radius:full` (system default for labels). Users can override to any `corner-radius` value.
- **Colors**: background and text color from the label's resolved style (`bg`, `text`). If no style, use a neutral default (light gray bg, dark text).
- **Text**: label title in a smaller text size than the entity title (auto-derived, similar to description text rules).
- **Multiple labels**: render left-to-right in declaration order, with a small horizontal gap between chiclets, **left-aligned** to the bar's caption inset.
- **Natural width, never truncated**: every chiclet renders at its natural text-fit width. Chips never shrink, never clip, never get capped to fit inside the bar.
- **Inside the bar — single row**: when the full chip row fits within the bar's effective inner width, every chip renders on a single horizontal row just above the bottom progress strip, left-aligned to the caption inset. The bar's height stays at `bandwidth()`.
- **Meta clearance (in-bar chips with metadata)**: at the default bandwidth the natural chip Y (anchored to the bar's bottom, just above the progress strip) sits ABOVE the meta baseline (38 px from bar top for a one-line title; `38 + 16·(lines − 1)` when the title wrapped, see [Item Bars](#item-bars)), which would visually overlap the meta line. When the item carries metadata (`size`, `duration`, `owner`, `remaining`, `capacity`), the in-bar chip row drops to `meta-baseline + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX` (the baseline of the last title line when there is no meta line, so chips also clear line 2 of a wrapped title) and the bar grows downward by exactly the amount needed to keep the progress strip below the chip — the same arithmetic as the chip-spill grow rule. The result reads as `title → meta → chip → progress-strip` stacked vertically with no caption/chip overlap.
- **Outside the bar — bar-width-capped column**: when the chip row's total natural width exceeds the bar's effective inner width, the chips spill past the bar's right edge starting at `bar.right + ITEM_CAPTION_SPILL_GAP_PX`. Outside the bar the chips pack into one or more rows whose width is capped at the **bar's visual width** (multiple chips per row), with subsequent rows stacking DOWNWARD by `LABEL_CHIP_HEIGHT_PX + LABEL_CHIP_ROW_GAP_PX`. All rows in the spill column share the same left x; chips are left-aligned within each row.
- **One-time row slack (25%)**: when packing a row outside the bar, if a chip would overflow the bar-width cap by **at most 25% of that chip's width**, the row stretches by exactly the overflow amount and the chip stays on the row (instead of wrapping to a fresh row). This rescues "one chip just barely overshoots" cases. The slack is **single-use per item** — once the slack has been consumed for one row, every subsequent row in the same item is packed strictly against the bar-width cap.
- **Spilled chip-row Y**: when chips spill but the title + meta caption stays inside the bar, row 0 of the spilled column sits at the chip's original Y (just above the bottom progress strip). When BOTH the caption and the chip row spill, row 0 drops below the meta baseline (the classic 38 px for a spilled break-free title, which is always one line; the block's own last baseline when explicit breaks make it taller) so the spilled stack reads as `title → meta → chip-row-0 → chip-row-1 → …` at a single column to the right of the bar, never overlapping the meta line.
- **Bar grows to enclose the spilled chip column**: when the spilled chip column would extend below the bar's natural bottom (anywhere from a single row that pushes the meta-stack past `bandwidth` to a tall multi-row column), the BAR ITSELF grows downward by the overflow amount. The bar's painted footprint becomes `bandwidth + barExtra`, where `barExtra` is the larger of `chipBarExtra` and the wrapped-title growth, the bottom progress strip rides the new bottom edge, and chip rows render INSIDE the (now-taller) bar. Row 0 stays anchored relative to the bar's TOP — at the position a single-row chip would naturally occupy in a `bandwidth`-tall bar — so growing the bar never shifts row 0; subsequent rows fill the new bar area below it. Visually the chip column reads as living inside the bar instead of dangling beneath it.
- **Row-pitch growth**: the swimlane / group / parallel row-packer reserves `step + barExtra` for the row so the next row clears the taller bar (preserving the constant `step − bandwidth` inter-row gap). The packer takes `barExtra` from the item's measure (`measureItem` in `nodes/item-measure.ts`, which resolves the caption fit and `computeChipBarExtra` once and is the same measure `sequenceItem` places from), so neighbors on later rows are positioned correctly without a retroactive pass. The measure resolves the item's real meta line and uses its exact width (a meta line wider than the bar makes the caption spill rather than wrap, so it must not reserve a wrapped bar's growth).
- **Spill x-reservation**: the chip column's right extent is folded into the row's spill reservation so the next chained item on the same row bumps to a fresh row instead of overlapping the spilled chips. Caption spill (title/meta) and chip spill share that reservation — the row reserves the **max** of the two contributions past the bar edge.
- **Link-icon column adjustment**: when an item has a `link:`, the bar's upper-left shows a square link-icon tile and the caption indents past that column. The chip row inside the bar is unaffected by the icon (or by an `after:` date glyph, which indents the caption the same way) — chips and the top-left decorations live in different rows of the bar.

### Parallel and Group Rendering

A group or a parallel is drawn **above and around its content, never beside it**, and takes no horizontal space: everything it paints that carries a date sits on that date ([`true-width-layout.md`](./true-width-layout.md) §3.3). Layout and renderer share the geometry in [`packages/layout/src/container-header-geometry.ts`](../packages/layout/src/container-header-geometry.ts).

- **Horizontal extent.** The container's `box` spans exactly its children's earliest start and latest end in time: `box.x` is the earliest start, `box.x + box.width` the latest duration end. Nothing a child paints past its dates (a spilled caption) and nothing the header paints past the end (a long title) widens it.
- **Header band** (`CONTAINER_HEADER_BAND_PX`, 18 px, from `box.y`):
  - **Title**: the container's title (or its id), 10 px semibold, at the container's start with its baseline 10 px below `box.y`, one gap past an `after:DATE` glyph when there is one. It may run past the bracket's end; the row packer keeps it as footprint, so the next sibling on that row drops a row instead of landing under it. The title takes the header's ink (a group's `fg`, a parallel's bracket stroke), not `text:`: it sits on the lane band, where a colour picked to read on `bg` may not.
  - **Bracket**: a horizontal line `CONTAINER_BRACKET_LINE_OFFSET_PX` (13 px) below `box.y` from the container's start to its end, with a tick at each end down to the body's top. `bracket:` styles it: `solid` (a group's default), `dashed` (a parallel's default), `none` hides it.
  - **Inline-date glyphs** sit in the title row beside the title (see [Inline-date glyph → Per-entity attach point](#per-entity-attach-point)).
  - The band is reserved whenever there is a title, a glyph or a visible bracket; an untitled, unpinned `bracket:none` container has no header (`headerHeight` 0).
- **Body**: a rectangle from the header's bottom (`box.y + headerHeight`) to `box.y + box.height`, spanning exactly the container's dates. Its content is padded `CONTAINER_BODY_PAD_PX` (6 px) above and below, never left or right. The body ends 6 px below the last child's painted bottom; the container's cursor advance adds the inter-row gap after it, so a sibling stacked below keeps the rhythm two items have.
- **Shading**: the body fills with the container's `bg` at `CONTAINER_BODY_FILL_OPACITY` (0.12) over the lane band. The default themes give groups and parallels distinct light tints (light: amber `#ea9818` and indigo `#635cf1`; dark: `#f0a832` and `#8c84ff`; grayscale: `#595959` and `#9e9e9e`). A `style:` with `bg` replaces the tint, and `bg:none` leaves the body unshaded. A container nested one level inside another's body takes `CONTAINER_NESTED_BODY_FILL_OPACITY` (0.06), so the two stack to a step darker rather than to a new colour; deeper than `CONTAINER_MAX_FILLED_DEPTH` (2) the body is outlined in its `bg` instead of filled, so tints never compound three deep.
- **Nesting** adds one header and its padding per level.

#### Parallel

Items and groups inside a `parallel` block render as parallel tracks stacked vertically inside its body. All tracks align to the same start x-position (the point where the preceding sequential item ends, or the parallel's own `after:`).

- **Track stacking**: each direct child (item or group) occupies its own track, an item one row and a group as many rows as it packs, top to bottom in declaration order.
- **Join**: the parallel ends on its latest track end in time, and the next sibling starts there. A caption or a header one of its tracks paints past that end is footprint the parent row keeps, so the next sibling drops a row rather than landing on it.
- **Redundant `after:` on the parallel block is elided**. If the parallel block sits directly after an item in the same swimlane (the common case), don't require the author to write `parallel after:that-item`: the spatial flow handles it. `after:` on a parallel is only meaningful when the predecessor is not the immediately-preceding sibling.
- **No implicit join arrows into the next sibling**: regardless of the `bracket` setting, the renderer never draws arrows from the parallel's track ends into the sequential item that follows the block. That ordering is already encoded by x-position, and drawing arrows would wrongly imply explicit `after:` dependencies the author did not declare. The only arrows attached to items in or around a parallel are those produced by explicit `after:` / `before:` references (and slack/predecessor connectors spec'd under Milestones and Anchors).

#### Group

A group sequences its children in its body with the same row-pack engine as a swimlane: an item whose desired start collides with a sibling's logical right edge, an upstream caption's spill reservation, or a slack-arrow corridor drops to a new row inside the group, and never moves above the previous child ([`true-width-layout.md`](./true-width-layout.md) §3.2). Parallel and group blocks nested inside a group claim a fresh row at the bottom of the stack, just like inside a swimlane. Styled and unstyled groups draw the same header and body; `style:` changes only the colours.

#### Wave-only groups

In a roadmap with waves, a group with no title (an id alone is not one), no `style:`, and no `labels:` that carries `wave:` only assigns membership (`PositionedGroup.waveOnly`): it draws nothing, neither header nor body, and reserves no header or padding, so its children flow as if they sat in the lane. `group wave:k` opens exactly on a wave boundary, and chrome on every boundary would read as noise. A titled group with `wave:` keeps its header and body. The rule is gated on `wave:` being present.

### Footnotes

Footnotes render in a footnote section rather than as floating callout boxes.

**Footnote indicators:**
- Each footnote gets a sequential number (1, 2, 3...) based on document order: the file's own footnotes as declared, then each merged include's in include order. The id plays no part, so a title-only footnote numbers where it is declared, not by its slug, and the order does not depend on the locale.
- A small superscript number renders in the upper-right corner of every entity the footnote is attached to.
- If an entity has multiple footnotes, multiple numbers appear (e.g., "1, 3").
- The number uses a small, muted style — visible but not dominant.

**Footnote area:**
- All footnote text renders in a footnote section below the roadmap — below all swimlanes, outside the roadmap's visual boundary.
- Each footnote: number + footnote title (italicized) + description text (auto-derived styling: one step smaller, normal weight, same font).
- Footnotes are ordered sequentially by document order, the same order as their numbers.
- The footnote area respects the roadmap's `padding` for horizontal alignment with the chart above.
- An isolated region's footnotes join the same panel after the host's. Their numbers continue after the host's, region by region in include order and in document order within each region, and the region's superscripts carry those numbers. Each region's run of entries is headed by the region's title on a row of its own (10 px, weight 700, in the panel's header colour), so the panel grows by one row per region with footnotes.
- *Wrap.* The panel spans the final canvas and never grows it. The title starts 32 px in from the panel's left edge (after the number column) and the description, led by `— `, sits on the title's row in a column `max(120, 6 × title length)` px further right. Text that would run past the panel's inner right edge (16 px in from its right edge) wraps onto more rows of 18 px, each starting at the title's x and using the whole width to that edge, measured with the same per-character estimate as every other fit (`estimateTextWidth`, 11 px). A title wider than the panel wraps the same way, and the description then starts on the row below the title's last row, as it does when its first word does not fit beside the title. A single word wider than the panel is never split. An entry that fits keeps its one row and its exact text. The panel grows by one row per wrapped row, region heading rows count as rows, and the attribution mark moves down with the panel's bottom.
- *Geometry.* Layout places every row (`buildFootnotePanel` in [`footnote-node.ts`](../packages/layout/src/nodes/footnote-node.ts)): each `PositionedFootnoteEntry` carries `y` (its first row's baseline, where the number sits), `titleLines` and `descriptionLines` (`{ x, y, text }` per row, the description's first row already led by `— `; `descriptionLines` is omitted without a description) and, on the first entry of a region's run, `regionHeadingY`. The renderer draws them as given.

### Included Roadmap Region (`roadmap:isolate`)<a id="include-region"></a>

When a file is included with `roadmap:isolate`, all of its content renders inside a visually distinct region:

- **Dashed border** — a dashed rectangle encloses all swimlanes, items, anchors and milestones originating from the included file. Its footnotes' superscripts sit on its items; their text goes to the chart's footnote panel (see [Footnotes](#footnotes)).
- **Region label** — the included roadmap's title is displayed at the top-left of the dashed border.
- **Include badge** — an 18×18 tile rendered just to the right of the region label tab, showing a **stacked-sheets glyph** (back rectangle peeking behind a front rectangle). This is intentionally a different glyph family from item-level `link:` icons so a viewer can tell at a glance whether they are looking at a content pull (one document brings in another) versus a navigation jump. The included file's source path renders to the right of the badge.
- **Timeline alignment** — the region shares the parent roadmap's timeline scale and axis. No separate header row is rendered for the included content.
- **Region marker row** — the region's own anchors and milestones sit in a marker row of its own, under the label tab: the band's top is 8 px below the region's top border, it holds as many 26 px rows as its pack needs, and the region's first lane starts 6 px below it. A region with no anchor or milestone to draw has no band and keeps its usual 14 px top inset. The band packs with the host's packer and label rules (see [Marker-row labels](#marker-row-labels)), bounded by 16 px insets inside the region box instead of the chart's edges; a label that fits on neither side grows the canvas until it fits on the right, and the region box widens to hold its labels. A region diamond on the window's last day grows the axis by one column, as a host one does (finalize step f2, [`layout-phases.md`](./layout-phases.md) §9), so the diamond stays inside the axis and the region's border. Each cut line runs from the diamond to the bottom of the region's last lane, so a region marker never crosses the host's lanes or another region. The host's own anchors and milestones stay in the header and their cut lines still run through every region.
- **Swimlane containment** — swimlanes within the region render normally but are visually contained within the dashed border.
- **Dependency arrows** — `after:` and `before:` resolve inside the file that declares them, so no dependency arrow or marker crosses the region boundary. A region routes its own `after:` arrows among its own lanes, by the host's rules: item to item, and a short stub from a region anchor's or milestone's cut line into the item after it. A region's anchors and milestones are drawn only in its marker row.

### Waves

A wave is a column that spans every swimlane (see [`specs/dsl.md`](./dsl.md) "Wave Declaration"). Layout computes each wave's span `[S_k, E_k]` with a barrier pass shared by the pixel layout and the day schedule (`scheduleRoadmap`, which also gives the date window its extent and the exporters their dates); it reruns the existing lane loop until the barriers settle (at most n + 1 passes for n waves). Everything below is drawn only when the roadmap declares waves; a roadmap without waves renders byte-identically. The normative detail, including geometry constants and the reasoning behind each choice, is in [`specs/waves.md`](./waves.md) § 8.7–9.10.

- **Strip and labels** (`data-layer="wave-strip"`, `wave-labels`). The strip row's backing panel uses the timeline panel fill and border. Each non-empty wave gets one cell over `[startX, endX]`, alternating `wave.stripFill` (even `visibleOrdinal`, 0-based) and `wave.stripFillAlt` (odd), so empty waves and gaps never break the alternation. Cells are inset 0.5 px from the panel and are square, except that a cell reaching an end of the panel rounds its outer corners there to the panel's radius less the inset (3.5 px), so it never covers the panel's rounded corner or border. Labels are 10 px, weight 600, centred on the visible part of the cell, on a halo in the cell's fill; footnote superscripts are right-aligned in the cell on their own halo in the cell's fill, and the label is pushed left of them. Gap floor labels and the placeholder sit on halos in the panel fill, so major grid lines never cut through strip text. Labels degrade from title to id, to an ellipsized title, to `#k`, to nothing. Every cell has a `<title>` tooltip (`Launch · 2026-02-02 – 2026-02-23 · held by i2`, end exclusive). An empty wave is a hollow 7 px diamond in the strip; a gap opened by a start floor has no cell and shows the floor reference in muted italics when it fits. When no wave has members yet, the strip shows one muted placeholder (`Waves declared: Discover, Build — no items assigned yet`) and nothing else is drawn.
- **Boundaries** (`data-layer="wave-boundary"`). A 2 px solid line (`wave.boundary`, teal in the light theme) at every distinct x in `{S_k} ∪ {E_k}` except the origin, running from the top of the strip down to the last swimlane. It is drawn after the grid and under the bars, and sits in the gap of at least 2 px (two seams) between bars of different waves. A wave's style can recolour it (`fg`), dash it (`border:dashed` `4 2`, `dotted` `1 2`).
- **Milestone on a boundary.** A milestone whose diamond falls on a boundary keeps its diamond and label but drops its cut line (see [Milestones](#milestones)).
- **Background work.** An item with no wave is drawn with a diagonal hatch overlay: a second rect drawn right after the bar rect (the bar rect stays the first `<rect>` in the item group), inset by half the bar's stroke width with the same corner radius. It fills with one of two `<pattern>` defs chosen by the bar fill's luminance, `${idPrefix}-wave-hatch-dark` (`wave.hatch`) on light fills and `${idPrefix}-wave-hatch-light` (`wave.hatchOnDark`) on dark fills, emitted inside the existing `<defs>` only when used. The hover tooltip adds `Background (no wave)`.
- **Crossings** (`data-layer="wave-cross"`). Where a boundary x lies strictly inside a background bar's visual extent (`visualLeft < x < visualRight`), a 1 px `2 2` dashed segment in the boundary colour is drawn over the bar, top to bottom, to show that the barrier does not hold this work.
- **Styled waves** (`data-layer="wave-bg"`). There is no column tint by default: tinted columns over alternating lane rows would make a four-tone checkerboard. A wave whose style sets `bg` gets a column tint at 0.12 opacity (after lane backgrounds, before the grid) and a 0.25 overlay on its strip cell. `text` colours the label; without it, the renderer keeps the label at 4.5:1 against the cell by picking dark or light text.
- **Legend** (`data-layer="wave-legend"`). PNG and PDF have no tooltips, so a legend below the chart (and below any bottom tick panel, above the footnotes) explains what the picture abbreviates. It appears when there is background work, an abbreviated label, a dropped footnote indicator, or an empty wave, and lists a hatch swatch (`Background work (not in a wave)`), a boundary swatch (`Wave boundary`), and, when any label is abbreviated or any wave is empty, the full wave names (`Waves: #1 Discover · #2 Build · #3 Hardening (TBD) (no items)`).
- **Groups that carry `wave:`** draw nothing when untitled and unstyled (see [Wave-only groups](#wave-only-groups)).
- **Include regions.** An isolated region's opaque fill would hide the early wave layers and the shown non-working bands, so `renderIncludeRegion` re-emits the bands right after the region fill rect, then styled tints and boundaries, all clipped by rect intersection to the painted region rect (no `clipPath`, no new `<defs>`), and the crossings and hatch overlays for region items after its lanes. The strip stays global.
- **Z-order.** defs, background, timeline panels then `wave-strip`, lane backgrounds, `non-working` (only under `non-working:show`; the layer name carries no "wave" so wave-layer checks do not match it), `wave-bg`, grid, `wave-boundary`, `wave-labels`, dependency arrows, lanes (background bars carry their hatch), include regions (re-emitting `non-working` and their wave layers, their own dependency arrows, their lanes, their own crossings, then their own marker cut lines, diamonds and labels), `wave-cross`, cut lines (minus those on a boundary), `non-working-label` (the named seams and labels of titled non-working runs, then the working-exception labels), markers, now-line, then footnotes and `wave-legend`, header, attribution and logo.

**Wave theme tokens** (`theme.wave.*`, defined in every built-in theme):

| Token | Light default | Dark default | Grayscale | Notes |
| --- | --- | --- | --- | --- |
| `theme.wave.stripFill` | `#f0fdfa` | `#042f2e` | `#fafafa` | Strip cells with an even visible ordinal. |
| `theme.wave.stripFillAlt` | `#ccfbf1` | `#134e4a` | `#e0e0e0` | Strip cells with an odd visible ordinal. |
| `theme.wave.labelText` | `#134e4a` | `#99f6e4` | `#212121` | Strip labels and legend text. |
| `theme.wave.labelMuted` | `#0f766e` | `#5eead4` | `#616161` | Gap floor labels and the placeholder. |
| `theme.wave.boundary` | `#0d9488` | `#2dd4bf` | `#616161` | Boundary lines, crossings, empty-wave diamonds. |
| `theme.wave.hatch` | `#0f172a` | `#0f172a` | `#000000` | Hatch stroke on light bar fills. |
| `theme.wave.hatchOnDark` | `#ffffff` | `#ffffff` | `#ffffff` | Hatch stroke on dark bar fills. |

These values are starting points to be tuned in snapshot review; theme tests enforce contrast floors (boundary against grid lines and both lane tints, labels against both strip fills).

## Output Formats

| Format | How | Milestone |
|--------|-----|-----------|
| SVG | Direct output from renderer | m2b |
| PNG | SVG → rasterize via resvg-js (WASM) | m2c |
| PDF | Positioned model → vector PDF via PDFKit | m2c |
| HTML | SVG embedded in a self-contained HTML page with viewport controls | m2c |
| Markdown+Mermaid | Transpile DSL to closest Mermaid `gantt` representation | m2c |
| XLSX | Formatted Excel workbook — multiple sheets for items, milestones, anchors, people/teams, and waves when declared. See XLSX details below. | m2c |
| MS Project XML | MS Project XML (.xml) — items as tasks, swimlanes as summary tasks, `after` as predecessors, milestones as milestones, `owner` as resource assignment. Groups map to summary tasks, parallel items share predecessors; `after:` a group links to its summary task, `after:` a parallel to the task of each of its tracks. Lane order is written as links too, so MS Project schedules each task on the chart's start. Lossy: labels, styles, footnotes, bracket visuals have no PM tool equivalent. | m2c |

### XLSX Export

Generated via ExcelJS. The workbook contains up to six sheets modeled on MS Project's Excel export conventions, adapted to the Nowline data model. The Milestones, Anchors, People and Teams, and Waves sheets are omitted when the roadmap contains no entities of that type; the Roadmap and Items sheets are always present.

#### Sheet 1: "Roadmap" (metadata)

Key-value summary of the roadmap:

| Field | Example |
|-------|---------|
| Roadmap | Platform 2026 |
| Author | Acme Engineering |
| Scale | weeks |
| Start | 2026-01-05 |
| Calendar | business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year) |
| Generated | 2026-04-14T12:00:00Z |

`Start` is the roadmap's `start:` literal (blank when omitted). `Calendar` names the calendar the Duration column counts in: the mode, the weekdays the open-ended week takes off (Monday first, or `no days off`), and the days per week, month, quarter and year. `calendar:full` reads `full (no days off; 7/30/91/365 days per week/month/quarter/year)`, and a custom calendar reads `custom (no days off; 6/26/78/312 days per week/month/quarter/year)` for those four values.

#### Sheet 2: "Items" (data table)

One row per item. This is the primary sheet.

| Column | Source | Notes |
|--------|--------|-------|
| ID | item identifier | e.g., `auth-refactor` |
| Title | item title | e.g., "Auth refactor" |
| Swimlane | parent swimlane id, falling back to title | Dotted path for nested swimlanes (e.g., `engineering.platform`) |
| Group | parent group id | If inside a `group` block; blank otherwise |
| Parallel | parent parallel id | If inside a `parallel` block; blank otherwise |
| Wave | effective wave id | Only when the roadmap declares waves (the column is absent otherwise). Own or inherited `wave:`; blank for background work |
| Duration | computed from schedule | Numeric days in the file's calendar, the chart's own count: `10` for `2w` on business, `14` on `calendar:full`. Covers `q`, a declared `size … effort:` and `capacity:`; `0` when the item has no duration |
| Duration (text) | `duration:` literal | Original DSL literal (e.g., `2w`) |
| Start | computed from schedule | Floating calendar start date (UTC midnight); anonymous items included |
| End (exclusive) | computed from schedule | Floating calendar end date (UTC midnight), exclusive, the day after the last working day: Saturday for an item that ends on a Friday under `calendar:business`; anonymous items included |
| Status | `status:` value | e.g., `done`, `at-risk`, `planned` |
| Remaining | `remaining:` value | e.g., `30%` |
| Owner | `owner:` value | Person or team identifier |
| After | `after:` value(s) | Semicolon-delimited predecessors |
| Before | `before:` value(s) | Semicolon-delimited constraints |
| Labels | `labels:` value(s) | Semicolon-delimited |
| Link | `link:` URL | External reference |
| Description | `description` text | Full description text if present |

Formatting:

- Excel Table with auto-filters on all columns
- Header row frozen (freeze panes at row 2)
- Column widths auto-fit to content
- Status column conditional formatting: green (`done`), blue (`in-progress`), yellow (`at-risk`), red (`blocked`), gray (`planned`)

#### Sheet 3: "Milestones"

| Column | Source | Notes |
|--------|--------|-------|
| ID | milestone identifier | |
| Title | milestone title | |
| Date | `date:` or computed from `after:` | Real date cell; falls back to the schedule-computed date when no `date:` is set |
| After | `after:` value(s) | Semicolon-delimited predecessor IDs |

#### Sheet 4: "Anchors"

| Column | Source | Notes |
|--------|--------|-------|
| ID | anchor identifier | |
| Title | anchor title | |
| Date | anchor date | ISO 8601 date |

#### Sheet 5: "People and Teams"

| Column | Source | Notes |
|--------|--------|-------|
| ID | person/team identifier | |
| Title | display name | |
| Type | `person` or `team` | |
| Parent Team | parent team id if nested | |
| Link | `link:` URL | |

#### Sheet 6: "Waves"

Present only when the roadmap declares waves; always the last sheet, so existing sheet indices are unchanged. One row per wave, in declaration order. Dates come from the same schedule as the Items sheet, with the wave barriers applied.

| Column | Source | Notes |
|--------|--------|-------|
| ID | wave identifier | |
| Title | wave title | Falls back to the id |
| Order | declaration order | 1-based |
| Start | computed from schedule | Wave start; real date cell |
| End (exclusive) | computed from schedule | Wave end, exclusive; equals Start for a wave with no items |
| Items | member count | Leaf items whose effective wave is this one |
| Held by | binding member | The member with the latest end (id, falling back to title); blank when no member sets the wave's end (an empty wave, or one whose members all end at or before its start floor) |
| After | `after:` value(s) | The start floor, semicolon-delimited |
| Description | `description` text | |

#### Mapping to MS Project Conventions

The column design mirrors MS Project's Excel export where concepts align:

| Nowline Column | MS Project Equivalent |
|---------------|----------------------|
| ID | ID / WBS |
| Title | Task Name |
| Duration | Duration |
| After | Predecessors |
| Owner | Resource Names |
| Remaining | inverse of % Complete |
| Swimlane | Outline Level (structural hierarchy) |
| Group | Summary Task (parent container) |
| Parallel | Shared predecessors (Finish-to-Start) |
| Milestones (separate sheet) | Milestone flag on tasks |

Key differences: Start/Finish dates are computed by `scheduleRoadmap` from the chart's sequencing rules (not MS Project's CPM engine), no WBS numbering, milestones are separate entities, and `before:` constraints have no MS Project equivalent.

### MS Project XML Export

The MS Project exporter runs the schedule (`scheduleRoadmap`) to read the file's calendar and each item's duration, and maps `after:` and the lane's own order to finish-to-start predecessor links, so MS Project's forward pass starts each task where the chart does. It writes the schedule's start (the roadmap's `start:`, else the export date, or `--start`) as the project start and no `<Start>` or `<Finish>` on work: a date would pin the task as a "start no earlier than" constraint, and a duration changed in MS Project would no longer move what follows it.

- **Calendar.** The Standard base calendar's working weekdays are the open-ended week's (`WorkingCalendar.workingWeekdays`): Monday to Friday under `calendar:business`, byte-identical to before, and all seven days, each with `WorkingTimes`, under `calendar:full` and `calendar:custom`. Each run of days the file's calendar differs from that week (a declared holiday or closure, a bounded recurrence's closed days, a working day inside a closed weekend) is one `<Exception>` in the base calendar, right after `</WeekDays>`, from `calendarExceptions` in `@nowline/layout`: `TimePeriod` from the first day at `T00:00:00` to the last at `T23:59:00`, `Occurrences` 1, `Name` the titles of the dated declarations behind it (XML-escaped, omitted without any), `Type` 1, `DayWorking` 0 or 1, and for a working day the weekday `WorkingTimes`. `<WorkWeeks>` is not written: a bounded recurrence becomes one exception per run it changes ([`specs/working-calendar.md`](./working-calendar.md) § 8).
- **Groups and parallels.** A group is a summary task over its children, one outline level down; MS Project finishes it with its last child. A parallel has no task: its tracks sit at its own outline level. `after:` a group links to the group's summary task, and `after:` a parallel links to the task of each track (an item, or a group track's summary task), so MS Project starts the successor at the latest track end, as the chart does.
- **Lane sequencing.** The chart starts each item, group or parallel where the node before it in its lane or group ended, so the export links each node finish-to-start to that node, beside its own `after:` links and wave links, each UID once. The previous node can be an item (its task), a group (its summary task, which MS Project finishes with its last child) or a parallel (every track's task, the same list `after:<parallel>` links to, so the successor waits for the latest track). A lane's first node gets no link and starts on the project start. A group's lane link and its `after:` go on its summary task, and its first child gets none: MS Project starts no subtask before its summary task's predecessors finish, which is the chart's rule that a group's children run in sequence from the group's start. A parallel has no task, so each track's task (an item, or a group track's summary task) takes the parallel's lane link and its `after:`. Task UIDs and IDs do not change. MS Project then lands every task on the chart's start except where the export already drops a term: an inline-date `after:` and an inline-date wave floor (no link and no constraint), and items in included files (the export walks the root file only).
- **Duration.** A task's `<Duration>` is the schedule's day count for the item times 480 minutes (`PT{n}M0S`), so `1w` is `PT2400M0S` on business and `PT3360M0S` on `calendar:full`. An item with no duration keeps 480 minutes, so it stays a one-day task rather than a zero-length one, which MS Project shows as a milestone. The exporter writes no `<MinutesPerWeek>` or `<DaysPerMonth>`, so MS Project displays a full-calendar week as 1.4 default weeks.

When the roadmap declares waves:

- **Wave-end milestone tasks.** One zero-duration milestone task per wave, titled `{title} (wave end)`, at outline level 1. They are appended after every other task, in declaration order, so the UIDs and IDs of all existing tasks never change. Its finish-to-start predecessors are every member that has an id, plus the previous wave's end task. `after:<wave>` on an item or milestone links to that wave's end task.
- **Barrier links.** Every member of wave k ≥ 2 gains a finish-to-start link to wave k−1's end task, merged with its own `after:` links without duplicates. Background work gets no wave links.
- **Floors.** Each `after:` element of a wave that names an anchor or a dated milestone becomes a finish-to-start predecessor of every member of that wave and of the wave's end task (so an empty wave still carries its floor). An inline-date floor is dropped and counted as `wave-floor`.
- **Limits.** Members without ids still get their barrier and floor links but cannot be linked to their wave-end task; they are counted as `wave-member-no-id`. Both drop kinds are absent when zero. A member's wave links sit after its `after:` and lane links.

### Markdown+Mermaid Bridge

The Mermaid output is a best-effort translation. The Nowline DSL is richer than Mermaid's `gantt` block — labels, footnotes, anchors, and progress tracking have no direct Mermaid equivalent. The bridge:

- Maps swimlanes to Mermaid `section` blocks.
- Maps items to Mermaid tasks with a duration in days (`Nd`, up to two decimals, e.g. `10d`, `7.5d`, `7.33d`), the schedule's count for the item in the file's calendar, so it includes `q`, declared sizes and `capacity:`. An item with no duration is written as `1d`. A `calendar:full` `4w` is `28d`.
- On `calendar:business`, emits `excludes saturday, sunday` directly after `dateFormat YYYY-MM-DD`, so Mermaid counts `Nd` in working days like the chart. `calendar:full` and `calendar:custom` have no days off in the open-ended week and emit no `excludes` line. The same line then lists the ISO date of every day in every non-working exception, ascending (`excludes saturday, sunday, 2026-11-26, 2026-11-27`), and a `calendar:full` file with a holiday gets `excludes 2026-03-02`. A `working` exception cannot be written (Mermaid's `includes` is undocumented), so its days are counted as `working-day` in the `%%` summary.
- Maps `after` dependencies to Mermaid `after` syntax. Neither a group nor a parallel is a Mermaid task, so `after:` one of them (on an item or a milestone) is written as the tasks that end it: a group's last child, every track of a parallel, recursively and without duplicates (`after:p` becomes `after fast s2 mid`). Mermaid's `after a b` starts at the latest end it names, the chart's date. Every id in an `after` token is declared in the chart, except an inline date in `after:`, which is still written as given (a known gap, [`scheduler-unification.md`](./scheduler-unification.md) § Known open gaps).
- Anchors every task with an explicit start token so Mermaid never mis-reads a task id as a start date: `after` its declared `after:` deps and the previous item in its lane (every track's end after a parallel; a group's or parallel's own `after:` ids for its first children), so `after:` only ever delays as in the chart; with neither (a lane or parallel-track leader) it anchors at the roadmap's `start:` date (falling back to the layout-computed timeline start when `start:` is omitted), moved to the first working day at or after it. Mermaid never checks a task's start against `excludes`, so explicit dates must be working days. This mirrors Nowline's default "each item starts after the preceding item in its lane" layout.
- Maps anchors to Mermaid milestones. Declared anchor and milestone dates are written as given, even on a weekend.
- Drops properties that Mermaid cannot express (labels, footnotes, owners, remaining). Parallel/group structure is flattened: tracks anchor at the block's entry point, and the lane continues after every track's end (`after long cg2 short`), so the next item starts at the latest track end, as the chart does.
- When the roadmap declares waves, emits a `section Waves` after the anchors and before the lanes, with one milestone per wave (`{title} (wave end) :milestone, {waveId}, {end date}, 0d`, dated from the schedule; the date is the first working day at or after the wave's exclusive end, the day the next wave can start, so a wave that ends on a Friday is dated Monday, not Saturday). The milestone id is the wave id, so `after:build` maps to Mermaid `after build`, and every member of wave k ≥ 2 also anchors `after` wave k−1's milestone (added to its existing `after` token, or replacing a lane leader's start date). Start floors are dropped and counted as `wave-floor` in the `%%` summary.
- Includes a comment noting the lossy conversion.

This output works as a Trojan horse — users can share roadmaps in Mermaid-compatible contexts (GitHub READMEs, Notion, Confluence) and link back to the full Nowline version.

## Theming and Styling

### Default Theme (light)

Modern, clean, light background with subtle neutral tones. Designed to look polished in documentation, presentations, slide decks, and web pages — not the sterile look of traditional Gantt charts.

- Sans-serif typography (`font:sans` system default)
- Muted dotted grid lines, clean separator lines between swimlanes
- Items with `shadow:subtle` for visual depth
- Color palette: soft whites and light grays for backgrounds, dark charcoal for text, accent colors for status indicators and the now-line (red)

### Dark Theme

Modern dark background with high-contrast elements.

- Same typographic hierarchy, inverted color palette
- Subtle shadows may be adjusted or removed for dark contexts
- Available via CLI flag (`--theme dark`) or embed config

### Custom Themes

The `config > defaults` system enables per-roadmap theming — users set `font`, `text-size`, `padding`, `spacing`, `corner-radius`, `shadow`, colors, and other style properties on entity types via defaults. Named styles in config act as reusable theme tokens. No separate "theme" feature is needed — the style system is the theming system.

## Responsive Behavior

### Embed

The embedded SVG scales to fit its container width. On narrow viewports, cards may truncate long titles with ellipsis. The aspect ratio is preserved.
