# Nowline — Rendering Specification

## Overview

Nowline's OSS rendering path produces **static SVG** from a parsed roadmap. It is used by the CLI (m2b) and the browser embed script (m3). Both consume the same positioned model from `@nowline/layout`.

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
- **Item bars** — x, y, width (from `duration`), height (auto-computed from `text-size` + `padding` + content), title, metadata (status, owner, remaining), link, label chiclets, footnote indicators
- **Swimlane bands** — x, y, width, height, frame label, separator lines, nested swimlane children
- **Timeline scale** — header row with scale units (days/weeks/months/etc.), tick marks, grid lines, derived from `config`
- **Now-line** — x position (today's date), label ("now"), full-height red vertical line
- **Anchors** — x, y, date, label, diamond marker, predecessor edges to referencing items
- **Milestones** — x position (from `date` or computed from `depends`), label, diamond marker in header, solid vertical cut line
- **Dependency edges** — source point, target point, orthogonal segments with rounded corners (`after`/`before` relationships)
- **Footnote indicators** — superscript numbers in upper-right of referenced entities
- **Footnote area** — ordered list of footnote text, positioned below the roadmap boundary
- **Resolved styles** — each entity carries a resolved style (all 15 style properties) computed from style precedence
- **Parallel regions** — bounding area for parallel tracks, with optional bracket visual (controlled by `bracket` property)
- **Group regions** — bounding area for sequential item bundles, with optional label (visible only when styled)
- **Include regions** — bounding rectangle for `roadmap:isolate` includes, with label and indicator metadata

The layout engine is pure computation — no DOM, no SVG, no side effects. It runs identically in Node.js and the browser.

## Layout and Spacing

All spacing and sizing values are **style properties** — no separate `config > layout` block needed. They follow the standard style precedence chain (inline > `style:` ref > label > defaults > system defaults).

### Spacing Style Properties

These join the style system alongside `bg`, `fg`, etc.:

- `padding` — inset padding within the entity. On `roadmap`, this is the outer canvas margin. On items, swimlanes, groups, footnotes — content inset. Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`. Default varies by entity type.
- `spacing` — space between children within a container entity. Applies to swimlanes (vertical space between items/child swimlanes), groups (space between sequential items), and parallel blocks (vertical space between tracks). Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`. Default: `none` for swimlanes (adjacent bands separated by lines, no vertical gap).
- `header-height` — height of the timeline scale header row. Roadmap-only — ignored on all other entities. Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`. Default: `md`.

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

## SVG Renderer (m2b / m3)

The pure SVG renderer takes the positioned model and produces an SVG string. It is used by the CLI (m2b) and the browser embed script (m3).

### Roadmap Header

The roadmap header renders as a contained box in the top-left corner, above and to the left of the timeline:

- Title on the first line, author (if set) on a second line in smaller muted text — both in the same box
- **Company logo (optional)** — when the roadmap declares `logo:`, the logo renders to the **left of the title**, vertically centered with the title line. Logo height follows `logo-size:` (default `md`) and is capped at the header box height; aspect ratio is preserved by scaling width to match.
- Minimal vertical footprint — the box height is determined by content, not a fixed size. The company logo does not expand the header — if the logo's natural height at the selected `logo-size` exceeds the box, it is scaled down to fit.
- A Nowline attribution mark — small version of the Nowline logo rendered in the bottom-right corner of the header box, scaled down as a subtle attribution mark. Links to `nowline.io`. The user's company logo does **not** replace or displace this mark.
- The header box does not span the full width of the chart; it sits to the left of the timeline header

#### Company Logo Formats and Embedding

`logo:` accepts four formats, distinguished by file extension:

| Extension | Embedding strategy |
|-----------|--------------------|
| `.svg` | Inlined as an SVG `<symbol>`/`<g>` inside the output. The logo's `<defs>` / IDs are namespaced (`nl-logo-*`) to avoid collisions with the renderer's own SVG. `<script>`, external `href`, and foreign-object content are stripped during embedding (sanitized inline SVG only). |
| `.png`, `.jpg` / `.jpeg`, `.webp` | Base64-encoded and embedded as `<image href="data:image/<type>;base64,...">`. The raster is read from disk once at render time; no re-encoding. |

All embedding is synchronous during render — the output artifact is self-contained and has no external references for the logo.

#### Company Logo Size Presets

`logo-size:` maps to a logical height relative to the title text. Concrete pixel values are renderer-owned (same convention as `text-size` and `padding`):

- `xs` — roughly the x-height of the title text
- `sm` — roughly the cap-height of the title text
- `md` *(default)* — roughly the full line-height of the title
- `lg` — title line-height + author line-height (fills the header content box)
- `xl` — 1.25× the full header content box; triggers a header height bump so the logo fits

Width is derived from the logo's intrinsic aspect ratio. Logos wider than the default title column push the title text to the right within the header box rather than overflowing it.

#### Company Logo Error Handling

Logo resolution is a render-time concern:

- **Missing file** — warning `logo file not found: <path>`; render proceeds without the logo.
- **Unsupported extension** — warning `unsupported logo format: <ext>` (only `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp` are accepted); render proceeds without the logo.
- **Corrupt / unparseable** — warning `logo could not be parsed: <path>`; render proceeds without the logo.
- **Non-local URL** (`http://`, `https://`, `file://`, `data:`) — this is a parser error and never reaches the renderer; see `dsl.md`.

`nowline <input> --strict` promotes all logo warnings to errors with a non-zero exit code.

### Timeline Scale

A single-row header displays the scale units (days, weeks, months, quarters, years) as defined in `config`. Height controlled by `header-height` on the `roadmap` entity.

- **Grid lines**: light, dotted vertical lines drop from each labeled tick mark down through all swimlanes for visual tracking
- **Label thinning**: when too many tick marks exist, show every Nth label to reduce density. Default thinning thresholds:
  - Days: show every 7th (weekly markers)
  - Weeks: show every 4th (monthly markers)
  - Months: show every 3rd (quarterly markers)
  - Quarters: show every 4th (yearly markers)
  - Years: show every 5th
- **Range**: the first tick mark aligns with the earliest item start or anchor date, with the roadmap's `padding` as whitespace before it. The last tick mark extends to the latest item end, anchor date, or milestone date, with the same padding after.
- **Custom units**: custom units (e.g., `sprints = 2w`) map to their underlying duration for positioning; labels use the custom unit name

### The Now-Line

The now-line is the hero visual element — the vertical line marking today on the timeline.

- A **red vertical line** at the x-position corresponding to today's date
- Extends from the top of the timeline header through all swimlanes to the bottom of the chart
- Rendered **above** grid lines and milestone lines (highest z-order among vertical lines)
- Label: **"now"** rendered at the top of the line in the header row — ties to the product branding (the "now" in Nowline)
- When the current date falls outside the timeline range (before earliest or after latest content), the now-line is not rendered

### Item Bars

Each roadmap item renders as a horizontal bar. Width is determined by `duration`. Height equals the band's `bandwidth()` — bars are uniform-height within a row regardless of label count. Bar contents include title, status indicator, owner, label chiclets, and footnote indicators.

- **Status indicator:** Hue-tinted dot in the bar's upper-right — green (done), blue (in-progress), amber (at-risk), red (blocked), slate (planned). Custom statuses use a neutral slate indicator. The exact tone is picked PER-BAR based on the bar bg's relative luminance: pale or saturated mid-tone bars (label-driven `bg:blue` etc.) get the deep `onLight` palette (≈ 800-900-level), and dark bars (default dark-theme status tints like `#172554`) get the pale `onDark` palette (≈ 100-level). The two palettes cross over at `L_bar ≈ 0.24` so the dot never fades into the bar even when a label propagates a same-hue saturated bg.
- **Progress bar:** When `remaining` is set, the bar fills proportionally (e.g., `remaining:30%` → 70% filled). `status:done` fills the bar completely regardless of `remaining`. The strip sits at the bar's bottom.
- **Link icon:** A 14×14 colored tile in the bar's UPPER-LEFT corner with a white outbound-arrow ↗ glyph. The glyph is the SAME for every link target — only the tile color changes by service:
    - `linear.app` → **Linear** (purple tile)
    - `github.com` → **GitHub** (slate tile)
    - `*.atlassian.net` / `jira.*` → **Jira** (blue tile)
    - any other URL → **Generic** (theme-neutral tile)

  Item-level `link:` always means "navigates to this URL", regardless of whether the target is `.nowline` or anything else. When a link icon is rendered, the caption text indents past the icon column so the title and icon never overlap inside the bar. The visually-distinct stacked-sheets glyph is reserved for the file-level `include` region badge — see [Include Region](#include-region).
- **Caption (title + meta) — no wrap, horizontal spill**: when the title or meta line is wider than the bar's inner area, the caption renders OUTSIDE the bar to the right (`textSpills=true`). Caption text never wraps to a second line. Caption spill reserves an x-extent on the row so the next chained item bumps to a fresh row instead of overlapping the spilled text.
- **Caption color (in-bar vs. spilled)**: when the caption stays inside the bar, the title uses the bar's resolved text color (`i.style.text`) and the meta uses `i.style.fg` so they read against the bar fill — including label-propagated overrides (e.g. `enterprise-style` setting `text:white` on a saturated bg). When the caption spills onto the chart / group bg instead, those bar-tuned colors no longer apply (white-on-peach is unreadable when an audit-track group's orange tint shows through behind the spilled title). The spilled title and meta both fall back to the theme's default item text color (`palette.entities.item.text` — `#0f172a` light / `#e2e8f0` dark) which is tuned for chart/group surfaces.
- **Footnote indicator color**: the small `1` `2` … superscripts in the bar's upper-right render in the bar's own resolved text color (`i.style.text`), so they read with the same contrast as the title regardless of the bar fill. The "footnote = red" attention cue lives in the footnote PANEL's red number column at the bottom of the chart, where red contrasts cleanly against the panel's white surface; on saturated mid-tone bars (e.g. a `bg:blue` from a label-style ref) the same red would lose contrast against the bar.
- **Label chips — natural width, horizontal-then-vertical spill, bar grows**: chips render at natural text width on a single row inside the bar when the full row fits. When the row's total width exceeds the bar's effective inner width, the chips spill past the bar's right edge and pack into one or more rows whose width is capped at the bar's visual width (multiple chips per spill row, additional rows stack DOWNWARD by `LABEL_CHIP_HEIGHT_PX + LABEL_CHIP_ROW_GAP_PX`). When the spilled column would extend past the bar's natural bottom, the BAR GROWS DOWNWARD by exactly the overflow so the chip column reads as enclosed by the bar — the bottom progress strip rides the new bottom and the row's pitch grows by the same amount so neighbors below clear cleanly. See [Labels](#labels) for the slack rule and bar-grow behavior.
- **Narrow-bar decoration spill**: very short bars (e.g. a 3-day item rendered at 12 px wide) can't host the dot, link icon, and footnote at their full insets — the dot would overshoot the bar's left edge, the link icon would visually collide with the dot, and the footnote would land behind both. Each decoration has its own width threshold; when the bar falls below it, the decoration moves into the spill column to the right of the bar. Reading order mirrors the in-bar layout (`[icon] [title] [¹²] [dot]` from left to right):

  ```
  [bar] [icon?] [title][¹²?] [dot?]
        [meta on line 2 — same x as title]
  ```

  A missing decoration just collapses out of the row — an item with no link and a too-narrow bar gives `[bar] [title] [dot]`. The dot lives at the trailing edge in BOTH the in-bar and spilled cases; pushing it to the LEFT of the title would make it read as belonging to the next item. Thresholds (px):

    - Dot spills when `bar.width < ITEM_STATUS_DOT_INSET_RIGHT_PX + ITEM_STATUS_DOT_RADIUS_PX` (≈ 17).
    - Link icon spills when `bar.width < ITEM_LINK_ICON_INSET_PX + ITEM_LINK_ICON_TILE_SIZE_PX + ITEM_DECORATION_SPILL_GAP_PX + ITEM_STATUS_DOT_INSET_RIGHT_PX + ITEM_STATUS_DOT_RADIUS_PX` (≈ 41) so the icon clears the dot's column with breathing room.
    - Footnote spills when `bar.width < ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX + 1` (≈ 23).

  When the link icon spills, the title is forced to spill alongside it so the icon→title click affordance stays intact (icon and title would otherwise sit on opposite sides of the bar). The row-packer factors the rightmost spilled glyph (`decorationsRightX`) into its spill reservation so the next chained item bumps to a fresh row instead of landing under the spilled cluster. Spilled footnotes use the chart-tuned text color (same as spilled captions) since they no longer sit on the bar fill.

#### Item Flow

- Sequential items within a swimlane flow **left-to-right** along the timeline
- Each item's x-position is determined by its start time (after the preceding item ends, or after its `after:` dependency)
- Items within a `parallel` block stack **top-to-bottom**

### Swimlane Rendering

Swimlanes render as sequential solid bands with alternating subtle background tints for visual distinction.

- Content flows **left-to-right** (sequential items along the timeline) and **top-to-bottom** when nesting or parallel flows require vertical stacking
- **Frame label**: swimlane name renders in the top-left of the band, horizontally written, styled like a PlantUML frame tab but with a modern aesthetic — a small tab or badge that sits at the top-left edge of the band, not a full-width header
- **Owner badge**: if the swimlane has `owner:`, the resolved owner title renders inline inside the frame tab, to the right of the swimlane name, in the tab's muted text color
- **Footnote superscript**: footnote indicators attached to a swimlane render inside the **upper-right corner of the frame tab** (right-aligned, inset from the tab's right edge), not at the upper-right of the full band. This keeps the indicator co-located with the swimlane's own label instead of floating next to unrelated item bars on the far right of the chart
- **Nested swimlane indentation**: child swimlanes are inset by the parent swimlane's `padding`. No separate indent property — padding stacking naturally creates visual nesting hierarchy
- The swimlane band spans the full timeline width (from first to last tick mark, plus padding)

### Anchors

Anchors render as **diamonds** (Gantt milestone style). An anchor appears at its date position on the timeline, vertically aligned with the topmost item that references it. Items linked to an anchor via `after` or `before` show a Gantt-style predecessor line (arrow) connecting the item bar to the diamond. If multiple items reference the same anchor, they all draw predecessor lines to the single diamond.

### Milestones

Milestones render as a **diamond in the timeline header row** at the milestone's x-position, with a **prominent dashed vertical line** (ink-dark theme color, 2px stroke, 6/4 dash pattern, round caps) cutting down from the diamond's bottom tip through all swimlanes to the bottom of the chart.

- Line style: prominent dashed — distinct from grid lines (1px fine dots) and anchor lines (1px fine dashes). Drawn after swimlane fills so the dashed pattern stays visible across every swimlane band.
- Line color: milestone's resolved `fg` color, or a system default (dark ink). Turns **red** for a **date-driven** milestone that is overrun by a predecessor (see below).
- Milestone label renders adjacent to the diamond in the header (biased right; flips to the left of the diamond if right-side space is insufficient).
- **Fixed (date-driven) milestone** (has `date:`) — positioned at that date. If any `after:` predecessor extends past the milestone line, the line, diamond, and label all render red; the overflowing predecessor bars also show their overflow in red. A red dotted arrow may be drawn from the overrunning predecessor's visual start back to the line to highlight the cause.
- **Floating milestone** (no `date:`, only `after:`) — positioned at the **visual right** of the **rightmost predecessor**. By definition there is no overrun, so the line renders in the standard ink-dark prominent style (never red).
  - **Slack arrows**: for each predecessor whose visual right is strictly earlier than the milestone line, draw a dotted ink arrow from that predecessor's visual right to the milestone line. The arrow attaches at the predecessor's **row midline** by default; when the predecessor's caption spills past the bar's right edge (the title/meta render *adjacent* to the bar instead of inside it) the attach point drops to the **vertical center of the bottom progress strip** (`box.bottom - PROGRESS_STRIP_HEIGHT_PX / 2`) so the arrow stays clear of the spilled text and visually aligns with the progress bar. The horizontal gap + dotted pattern reads as "waiting time / slack before the milestone." No arrow is drawn from the binding (latest) predecessor, since its visual end coincides with the line.
- If all `after:` predecessors have `status:done`, the milestone renders as complete.

### Dependency Arrows

All dependency arrows use orthogonal routing — horizontal and vertical segments only, no diagonal or curved lines.

- **Rounded corners** at every bend point (small radius, consistent across all edges)
- **Routing priority**: keep lines separated from each other; bias toward distinct paths rather than overlapping segments
- **Overflow tolerance**: if routing around all items creates overly complex paths, lines may route below an item bar rather than taking a long detour. Prefer the simpler path.
- **Separation**: when multiple arrows run parallel, offset them slightly so they remain visually distinct (no stacking on top of each other)
- **Z-order**: arrows render above item bars and swimlane backgrounds, below the now-line
- Applies to: dependency arrows (`after`/`before`), anchor predecessor lines, milestone slack/predecessor connectors, and (when a parallel opts in via `bracket:solid`/`bracket:dashed`) the parallel's bracket strokes. There are **no implicit join arrows** from a parallel block's tracks into the next sequential item — the block's x-end and the following item's x-position encode that ordering on their own (see `Parallel`).

### Before Constraints

When an item has `before:anchor-id` and its duration would push past the anchor date, the overflowing portion of the item bar renders in red.

### Styles

Styles defined in `config` control the visual appearance of entities. Style properties map to rendering as follows:

| Property | Effect |
|----------|--------|
| `bg` | Background/fill color of the entity (item bar, swimlane band, group box, etc.). `none` for transparent. |
| `fg` | Border/outline color of the entity. `none` for no border. |
| `text` | Color of text within the entity. `none` hides text. |
| `border` | Border/connection line style: `solid` (default), `dashed`, `dotted` |
| `icon` | Small icon rendered at the leading edge of the entity (e.g., shield, warning, lock) |
| `shadow` | Drop shadow beneath the entity: `none` (no shadow), `subtle` (tight, small offset), `fuzzy` (soft, larger offset), `hard` (solid, no blur, offset down-right). `subtle`/`fuzzy` rendered via SVG `<feDropShadow>`; `hard` rendered as a solid duplicate shape offset behind the entity. |
| `font` | Font family for text within the entity. Named preset (`sans`, `serif`, `mono`) that maps to a cross-platform font stack. No font downloads required. |
| `weight` | Font weight for the entity's primary text (title). Maps to SVG `font-weight`: `thin` (100), `light` (300), `normal` (400), `bold` (700). `thin` degrades gracefully if the font lacks that variant. |
| `italic` | When `true`, renders the entity's primary text in italic. Maps to SVG `font-style: italic`. |
| `text-size` | Font size for the entity's primary text (title). Named preset (`xs`, `sm`, `md`, `lg`, `xl`); system owns the absolute pixel mapping. |
| `padding` | Inset padding within the entity. Named preset (`none`, `xs`, `sm`, `md`, `lg`, `xl`). |
| `spacing` | Space between children within a container entity. Named preset (`none`, `xs`, `sm`, `md`, `lg`, `xl`). |
| `header-height` | Height of the timeline scale header row. Roadmap-only. Named preset (`none`, `xs`, `sm`, `md`, `lg`, `xl`). |
| `corner-radius` | Corner rounding for the entity's bounding shape. Maps to SVG `rx`/`ry`. Values: `none`, `xs`, `sm`, `md`, `lg`, `xl`, `full`. `full` computes radius as half the rendered height. |
| `bracket` | Bracket/join line on parallel blocks. `none` (default), `solid`, `dashed`. Parallel-only — ignored on other entities. |

Text style properties (`font`, `weight`, `italic`, `text-size`) apply to the entity's primary text (title). Secondary text within an entity (owner badge, status label) follows its own rendering rules.

#### Font Presets

| Preset | macOS | Windows | Linux |
|--------|-------|---------|-------|
| `sans` | SF Pro, Helvetica Neue | Segoe UI | Liberation Sans, DejaVu Sans |
| `serif` | Georgia, New York | Georgia, Times New Roman | Liberation Serif, DejaVu Serif |
| `mono` | SF Mono, Menlo | Cascadia Code, Consolas | Liberation Mono, DejaVu Sans Mono |

Each preset maps to a font stack (ordered fallback list). The renderer emits the full stack in the SVG `font-family` attribute so it renders correctly on any platform with no font downloads.

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
4. **Config `defaults`** — fallback properties for the entity type (e.g., `defaults` > `item style:subtle`).
5. **Nowline system defaults** — built-in colors and styling when nothing is specified.

When an entity has multiple labels with different styles, the first label's style takes precedence.

**Isolate scoping:** When an entity originates from an included file, style resolution uses the scope determined by the include's modes: `style:` references (levels 2 and 3) and `defaults` (level 4) resolve against whichever config scope is active under `config:isolate` / `config:merge`; label entities themselves are governed by `roadmap:isolate` / `roadmap:merge`, matching their roadmap-section classification.

### Labels

Labels render as **chiclets** — small, pill-shaped badges (`corner-radius:full` by default). They appear inline on the entity they're attached to (typically inside the item bar, just above the bottom progress strip).

- **Shape**: pill shape via `corner-radius:full` (system default for labels). Users can override to any `corner-radius` value.
- **Colors**: background and text color from the label's resolved style (`bg`, `text`). If no style, use a neutral default (light gray bg, dark text).
- **Text**: label title in a smaller text size than the entity title (auto-derived, similar to description text rules).
- **Multiple labels**: render left-to-right in declaration order, with a small horizontal gap between chiclets, **left-aligned** to the bar's caption inset.
- **Natural width, never truncated**: every chiclet renders at its natural text-fit width. Chips never shrink, never clip, never get capped to fit inside the bar.
- **Inside the bar — single row**: when the full chip row fits within the bar's effective inner width, every chip renders on a single horizontal row just above the bottom progress strip, left-aligned to the caption inset. The bar's height stays at `bandwidth()`.
- **Meta clearance (in-bar chips with metadata)**: at the default bandwidth the natural chip Y (anchored to the bar's bottom, just above the progress strip) sits ABOVE the meta baseline (38 px from bar top), which would visually overlap the meta line. When the item carries metadata (`duration`, `owner`, `remaining`), the in-bar chip row drops to `meta-baseline + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX` and the bar grows downward by exactly the amount needed to keep the progress strip below the chip — the same arithmetic as the chip-spill grow rule. The result reads as `title → meta → chip → progress-strip` stacked vertically with no caption/chip overlap.
- **Outside the bar — bar-width-capped column**: when the chip row's total natural width exceeds the bar's effective inner width, the chips spill past the bar's right edge starting at `bar.right + ITEM_CAPTION_SPILL_GAP_PX`. Outside the bar the chips pack into one or more rows whose width is capped at the **bar's visual width** (multiple chips per row), with subsequent rows stacking DOWNWARD by `LABEL_CHIP_HEIGHT_PX + LABEL_CHIP_ROW_GAP_PX`. All rows in the spill column share the same left x; chips are left-aligned within each row.
- **One-time row slack (25%)**: when packing a row outside the bar, if a chip would overflow the bar-width cap by **at most 25% of that chip's width**, the row stretches by exactly the overflow amount and the chip stays on the row (instead of wrapping to a fresh row). This rescues "one chip just barely overshoots" cases. The slack is **single-use per item** — once the slack has been consumed for one row, every subsequent row in the same item is packed strictly against the bar-width cap.
- **Spilled chip-row Y**: when chips spill but the title + meta caption stays inside the bar, row 0 of the spilled column sits at the chip's original Y (just above the bottom progress strip). When BOTH the caption and the chip row spill, row 0 drops below the meta baseline so the spilled stack reads as `title → meta → chip-row-0 → chip-row-1 → …` at a single column to the right of the bar, never overlapping the meta line.
- **Bar grows to enclose the spilled chip column**: when the spilled chip column would extend below the bar's natural bottom (anywhere from a single row that pushes the meta-stack past `bandwidth` to a tall multi-row column), the BAR ITSELF grows downward by the overflow amount. The bar's painted footprint becomes `bandwidth + chipBarExtra`, the bottom progress strip rides the new bottom edge, and chip rows render INSIDE the (now-taller) bar. Row 0 stays anchored relative to the bar's TOP — at the position a single-row chip would naturally occupy in a `bandwidth`-tall bar — so growing the bar never shifts row 0; subsequent rows fill the new bar area below it. Visually the chip column reads as living inside the bar instead of dangling beneath it.
- **Row-pitch growth**: the swimlane / group / parallel row-packer reserves `step + chipBarExtra` for the row so the next row clears the taller bar (preserving the constant `step − bandwidth` inter-row gap). The packer pre-computes `chipBarExtra` via `predictItemChipExtraHeight`, mirroring `computeChipBarExtra` in `sequenceItem`, so neighbors on later rows are positioned correctly without a retroactive pass.
- **Spill x-reservation**: the chip column's right extent is folded into the row's spill reservation so the next chained item on the same row bumps to a fresh row instead of overlapping the spilled chips. Caption spill (title/meta) and chip spill share that reservation — the row reserves the **max** of the two contributions past the bar edge.
- **Link-icon column adjustment**: when an item has a `link:`, the bar's upper-left shows a square link-icon tile and the caption indents past that column. The chip row inside the bar is unaffected by the icon — chips and icon live in different rows of the bar.

### Parallel and Group Rendering

#### Parallel

Items and groups inside a `parallel` block render as parallel horizontal tracks stacked vertically within the swimlane. All tracks align to the same start x-position (the point where the preceding sequential item ends).

- **Default (`bracket:none`)**: items stack vertically on parallel tracks with no visual connector. The parallel block is purely structural — items appear on separate rows but with no fork/join indication. Specifically: **no rails**, **no horizontal join line**, and **no arrows** are drawn on or around the block. The shared start x and the next sibling's start x convey the fork and join on their own.
- **`bracket:solid`**: full **`[ ]` brackets** frame the parallel block. The left bracket `[` sits at the logical start x of the parallel (top serif, vertical, bottom serif); the right bracket `]` sits at the logical end x. Both brackets extend **12px above the topmost track's top** and **12px below the bottommost track's bottom** — the same vertical padding a styled group uses around its nested items, so `parallel` and `group` feel like kin. No separate horizontal join line is drawn — the brackets themselves communicate fork + join.
- **`bracket:dashed`**: identical geometry to `bracket:solid`, but the `[ ]` strokes are dashed.
- **Bracket x-position** — brackets snap to **logical** parallel edges (the start x where the parallel begins, and the end x = start + max-track-duration). Nested items sit just inside the brackets with the normal 6px symmetric column inset, so there's a consistent breathing gap between bracket and item.
- **Redundant `after:` on the parallel block is elided**. If the parallel block sits directly after an item in the same swimlane (the common case), don't require the author to write `parallel after:that-item` — the spatial flow handles it. `after:` on a parallel is only meaningful when the predecessor is not the immediately-preceding sibling.
- **Track stacking** — each direct child (item or group) occupies its own horizontal row within the parallel region.
- **Width** — the parallel region's width is the maximum of its children's widths.
- **No implicit join arrows into the next sibling** — regardless of `bracket` setting, the renderer never draws arrows from the parallel's track ends into the sequential item that follows the block. That ordering is already encoded by x-position, and drawing arrows would wrongly imply explicit `after:` dependencies the author did not declare. The only arrows attached to items in or around a parallel are those produced by explicit `after:` / `before:` references (and slack/predecessor connectors spec'd under Milestones and Anchors).

#### Group (styled)

When a group has `style:`, `labels:`, or other visual properties, it renders as a visible bounding box around its sequential items. The box uses the resolved style (bg, border, corner-radius, shadow, label badges, etc.).

- **Title chiclet**: the group title renders as a small filled rounded-rectangle chiclet anchored **flush in the upper-left corner** of the bounding box. The chiclet's top edge aligns with the group box's top edge and its left edge aligns with the box's left edge — there is **no overhang**: the chiclet sits entirely *inside* the bounding box, never extending up or left of it. The chiclet hugs its title text width plus a small horizontal padding so short titles produce small chiclets and long titles produce wider ones.
- **Top padding**: a styled group reserves vertical space inside its box equal to the chiclet height plus a small gutter before the first inner row begins, so the chiclet never overlaps with content.
- **Bottom padding**: the group reserves a symmetric bottom pad before its lower stroke so children breathe at both ends of the box.
- **Inner row-packing**: a group sequences children using the same row-pack engine as a swimlane. An item whose desired start collides with a sibling's logical right edge, an upstream caption's spill reservation, or a slack-arrow corridor bumps to a new inner row inside the group. The group's bounding box grows vertically to encompass every populated row plus the chiclet pad and bottom pad. Parallel/group blocks nested inside a group claim a fresh row at the bottom of the stack, just like inside a swimlane.
- **Horizontal expansion for caption spill**: the painted box also grows *horizontally* to encompass any caption text that spills past the right edge of an inner item's bar (titles and meta render adjacent to the bar — see [Item Bars](#item-bars)). The orange tint visually "owns" the spilled title/meta so the captions read as belonging to the group rather than floating in empty whitespace. The painted box and the logical cursor advance are intentionally decoupled: the group reports the wide right edge in `box.width` (used by the renderer) but reports the compact right edge in the cursor channel (used by the parent for sequencing the next sibling). This keeps siblings to the right of the group positioned against the bars rather than the captions, while the orange tint still wraps the visible footprint. Because the cursor channel stays compact, the group's wide painted box can extend past the parent `parallel`'s logical right edge — the parallel renders no rect of its own, so the visual is owned by the inner group.

#### Group (unstyled)

When a group has no style or labels, it is purely structural — no visible border, background, no chiclet. Items render with the same row-pack flow as a styled group (so collisions still bump to new rows), but the box reserves no top/bottom pad and the renderer paints no border or background. The group is invisible in the rendered output but still governs sequencing and inner row growth.

#### Group (bracket-style with title)

A group with a `title` but **no fill** (no `style:` providing a colored bg, or `bg:none`) renders as a closed `[`-bracket that wraps both the title and the items. The bracket is a single path: top foot (4 px stub from `box.x` to `box.x + 4`) at `box.y - GROUP_BRACKET_LABEL_OVERHANG_PX`, vertical stroke down `box.x` to `box.y + box.height`, then bottom foot (4 px stub from `box.x` to `box.x + 4`) at the box bottom. The title text sits just above `box.y` (baseline at `box.y - 2`) inside the reserved overhang region — visually framed by the bracket on its left.
The label glyph extent lives entirely ABOVE `box.y`, so the group reserves a fixed `GROUP_BRACKET_LABEL_OVERHANG_PX` of space above its content (mirroring the way a styled group's chiclet pad sits below `box.y`). Without that reservation, two bracket-titled groups stacked inside a parallel collide visually: the previous sibling's bracket-foot ends at its `box.bottom`, and the next sibling's label-top — and the next sibling's bracket top-foot — would render in the same gap. The group implements the reservation by shifting its own `box.y` down by the overhang amount and reporting `bracketLabelOverhang + box.height + interRowGap` as its cursor-height advance.
Title-less bracket groups keep the historical asymmetric shape (vertical stroke + a single bottom foot, no top foot) since there is no label to enclose and no overhang is reserved.

#### Parallel with Groups

Each group inside a parallel block renders as its own horizontal sub-track. Styled groups show their bounding boxes (with the upper-left chiclet); unstyled groups just show their items in a row. The parallel bracket and join line (when `bracket` is set) encompass all sub-tracks. A styled group inside a parallel reports its full grown height (chiclet pad + every inner row + bottom pad) so the parallel stacks subsequent sub-tracks below the group's painted footprint, not just its first row. Bracket-titled groups additionally include their `GROUP_BRACKET_LABEL_OVERHANG_PX` reservation so the next sibling's label has clear vertical space above the previous bracket's bottom-foot.

### Footnotes

Footnotes render in a footnote section rather than as floating callout boxes.

**Footnote indicators:**
- Each footnote gets a sequential number (1, 2, 3...) based on document order.
- A small superscript number renders in the upper-right corner of every entity the footnote is attached to.
- If an entity has multiple footnotes, multiple numbers appear (e.g., "1, 3").
- The number uses a small, muted style — visible but not dominant.

**Footnote area:**
- All footnote text renders in a footnote section below the roadmap — below all swimlanes, outside the roadmap's visual boundary.
- Each footnote: number + footnote title (italicized) + description text (auto-derived styling: one step smaller, normal weight, same font).
- Footnotes are ordered sequentially by document order.
- The footnote area respects the roadmap's `padding` for horizontal alignment with the chart above.

### Included Roadmap Region (`roadmap:isolate`)<a id="include-region"></a>

When a file is included with `roadmap:isolate`, all of its content renders inside a visually distinct region:

- **Dashed border** — a dashed rectangle encloses all swimlanes, items, anchors, milestones, and footnotes originating from the included file.
- **Region label** — the included roadmap's title is displayed at the top-left of the dashed border.
- **Include badge** — an 18×18 tile rendered just to the right of the region label tab, showing a **stacked-sheets glyph** (back rectangle peeking behind a front rectangle). This is intentionally a different glyph family from item-level `link:` icons so a viewer can tell at a glance whether they are looking at a content pull (one document brings in another) versus a navigation jump. The included file's source path renders to the right of the badge.
- **Timeline alignment** — the region shares the parent roadmap's timeline scale and axis. No separate header row is rendered for the included content.
- **Swimlane containment** — swimlanes within the region render normally but are visually contained within the dashed border.
- **Cross-references** — dependency arrows and predecessor lines that cross the region boundary render normally, passing through the dashed border.

## Output Formats

| Format | How | Milestone |
|--------|-----|-----------|
| SVG | Direct output from renderer | m2b |
| PNG | SVG → rasterize via resvg-js (WASM) | m2c |
| PDF | Positioned model → vector PDF via PDFKit | m2c |
| HTML | SVG embedded in a self-contained HTML page with viewport controls | m2c |
| Markdown+Mermaid | Transpile DSL to closest Mermaid `gantt` representation | m2c |
| XLSX | Formatted Excel workbook — multiple sheets for items, milestones, anchors, people/teams. See XLSX details below. | m2c |
| MS Project XML | MS Project XML (.xml) — items as tasks, swimlanes as summary tasks, `after` as predecessors, milestones as milestones, `owner` as resource assignment. Groups map to summary tasks, parallel items share predecessors. Lossy: labels, styles, footnotes, bracket visuals have no PM tool equivalent. | m2c |

### XLSX Export

Generated via ExcelJS. The workbook contains five sheets modeled on MS Project's Excel export conventions, adapted to the Nowline data model.

#### Sheet 1: "Roadmap" (metadata)

Key-value summary of the roadmap:

| Field | Example |
|-------|---------|
| Roadmap | Platform 2026 |
| Author | Acme Engineering |
| Scale | weeks |
| Generated | 2026-04-14T12:00:00Z |

#### Sheet 2: "Items" (data table)

One row per item. This is the primary sheet.

| Column | Source | Notes |
|--------|--------|-------|
| ID | item identifier | e.g., `auth-refactor` |
| Title | item title | e.g., "Auth refactor" |
| Swimlane | parent swimlane id | Dotted path for nested swimlanes (e.g., `engineering.platform`) |
| Duration | `duration:` value | Raw DSL value (e.g., `2w`, `l`) |
| Status | `status:` value | e.g., `done`, `at-risk`, `planned` |
| Remaining | `remaining:` value | e.g., `30%` |
| Owner | `owner:` value | Person or team identifier |
| After | `after:` value(s) | Semicolon-delimited predecessors |
| Before | `before:` value(s) | Semicolon-delimited constraints |
| Labels | `labels:` value(s) | Semicolon-delimited |
| Group | parent group id | If inside a `group` block; blank otherwise |
| Parallel | parent parallel id | If inside a `parallel` block; blank otherwise |
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
| Date | `date:` value | Fixed date if specified |
| Depends | `depends:` value(s) | Semicolon-delimited item IDs |

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

Key differences: no computed Start/Finish dates (Nowline uses relative positioning, not absolute scheduling), no WBS numbering, milestones are separate entities, and `before:` constraints have no MS Project equivalent.

### Markdown+Mermaid Bridge

The Mermaid output is a best-effort translation. The Nowline DSL is richer than Mermaid's `gantt` block — labels, footnotes, anchors, and progress tracking have no direct Mermaid equivalent. The bridge:

- Maps swimlanes to Mermaid `section` blocks.
- Maps items to Mermaid tasks with duration.
- Maps `after` dependencies to Mermaid `after` syntax.
- Maps anchors to Mermaid milestones.
- Drops properties that Mermaid cannot express (labels, footnotes, owners, remaining).
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
