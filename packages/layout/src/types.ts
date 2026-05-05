// Positioned-model types. One type per entity in specs/rendering.md §
// The Positioned Model. Coordinates are in SVG user units with origin at
// top-left. All colors in `ResolvedStyle` are concrete hex strings baked
// in by style-resolution; the renderer is palette-dumb.

export type SizeBucket = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ShadowKind = 'none' | 'subtle' | 'fuzzy' | 'hard';
export type BorderKind = 'solid' | 'dashed' | 'dotted';
export type FontFamily = 'sans' | 'serif' | 'mono';
export type FontWeight = 'thin' | 'light' | 'normal' | 'bold';
export type BracketKind = 'none' | 'solid' | 'dashed';
export type HeaderPosition = 'beside' | 'above';
export type StatusKind =
    | 'planned'
    | 'in-progress'
    | 'done'
    | 'at-risk'
    | 'blocked'
    | 'neutral';

// The 17 style properties from specs/dsl.md § Style Properties plus header-position.
// Every one has a concrete value after resolution (theme + defaults fill gaps).
export interface ResolvedStyle {
    bg: string;             // hex or 'none'
    fg: string;             // hex
    text: string;           // hex
    border: BorderKind;
    icon: string;           // identifier like 'linear' | 'github' | 'jira' | 'generic' | 'none'
    shadow: ShadowKind;
    font: FontFamily;
    weight: FontWeight;
    italic: boolean;
    textSize: SizeBucket;       // 'none'..'xl'
    padding: SizeBucket;        // 'none'..'xl'
    spacing: SizeBucket;        // 'none'..'xl'
    headerHeight: SizeBucket;   // 'none'..'xl'
    cornerRadius: SizeBucket;   // 'none'..'xl'|'full'
    bracket: BracketKind;
    headerPosition: HeaderPosition;
    /**
     * Glyph used as the suffix on capacity numbers (`5×`, `5 [person]`, etc.).
     * Stores the raw value as the author wrote it: a built-in icon name
     * (`'multiplier'`, `'person'`, ...), a custom glyph id declared via
     * `glyph` in config, or an inline Unicode literal (`'💰'`). The renderer
     * resolves built-in vs custom vs literal at paint time using
     * `ResolvedConfig.glyphs` and the `BUILTIN_CAPACITY_ICONS` set.
     * Default `'multiplier'`.
     */
    capacityIcon: string;
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

// Header + attribution mark + optional logo.
export interface PositionedLogo {
    box: BoundingBox;
    assetRef?: string;  // path as declared in DSL; renderer resolves via AssetResolver
}

export interface PositionedHeader {
    box: BoundingBox;
    position: HeaderPosition;   // 'beside' | 'above'
    title: string;              // empty string if no title set
    author?: string;
    // Word-wrapped title and author lines, sized to the resolved card
    // width (title text wraps when it exceeds HEADER_BESIDE_MAX_WIDTH_PX
    // minus padding). The renderer stacks them inside `cardBox` and does
    // not need to do any text measurement of its own.
    titleLines: string[];
    authorLines: string[];
    // Bounding box of the visible white card inside `box`. The card hugs
    // its content (width = max line width + padding, clamped to MIN..MAX;
    // height grows for wrapped lines).
    cardBox: BoundingBox;
    logo?: PositionedLogo;
    style: ResolvedStyle;
    // Attribution mark (Nowline wordmark + link) lives in the top-right.
    attributionBox: BoundingBox;
}

// A single tick on the timeline scale (e.g. "W1", "Q2", "Feb").
//
// `x` is the tick's BOUNDARY position (the start of the column the tick
// represents — also where the dotted grid line drops). `labelX` is where
// the label TEXT sits, centered horizontally within the column (i.e.
// halfway between this tick's x and the next tick's x). The final tick
// has no following column, so its `labelX` is undefined and the renderer
// skips drawing its label.
export interface PositionedTick {
    x: number;
    labelX?: number;
    label?: string;     // undefined for thinned ticks
    major: boolean;     // full-height major line vs short minor tick
}

export interface PositionedTimelineScale {
    box: BoundingBox;
    ticks: PositionedTick[];
    // Pixel-per-day used for all entities in the chart.
    pixelsPerDay: number;
    // Day 0 (the roadmap start date) is at x = originX.
    originX: number;
    startDate: Date;
    endDate: Date;
    labelStyle: ResolvedStyle;
    // Now-pill row sits at the very top of the timeline area (above the
    // date labels). Height is 0 when there's no now-line to draw.
    pillRowHeight: number;
    // Tick-label panel (the date headers). Always rendered.
    tickPanelY: number;
    tickPanelHeight: number;
    // Marker row sits BELOW the tick-label panel. Anchors + milestones live
    // here. The collision band sits ABOVE the in-row baseline so an anchor
    // colliding with a milestone can be bumped up. Height is 0 when there
    // are no markers to render — the renderer then omits the panel
    // entirely so we don't reserve dead space.
    markerRow: {
        y: number;          // y of the in-row diamond center
        height: number;     // total height of the marker row band (in-row + collision)
        collisionY: number; // y of the bumped-up diamond center
    };
}

/**
 * How the now-pill is positioned relative to the now-line.
 *
 *   - `center` — pill centered on the line (default). Used when both
 *     edges have at least `NOW_PILL_WIDTH_PX/2` of clearance from the
 *     chart's left/right edges.
 *   - `flag-right` — line at the pill's left edge, pill extends to the
 *     right with the right side rounded and the label left-aligned.
 *     Used when the line lands close enough to `chartLeftX` that a
 *     centered pill would overlap the header card / canvas left edge.
 *   - `flag-left` — line at the pill's right edge, pill extends to the
 *     left with the left side rounded and the label right-aligned.
 *     Used when the line lands close enough to `chartRightX` that a
 *     centered pill would clip past the canvas right edge.
 *
 * In both flag modes the squared edge IS the now-line, so the pill
 * visually anchors to the line without growing the canvas.
 */
export type NowPillMode = 'center' | 'flag-right' | 'flag-left';

export interface PositionedNowline {
    x: number;
    // Top of the vertical red line. Sits at the BOTTOM of the now-pill —
    // just above the tick-label panel — so the line drops through the
    // date headers and any marker row, into the chart.
    topY: number;
    // Bottom of the vertical red line (chart bottom).
    bottomY: number;
    // Top edge of the pill rectangle. Pill height is fixed in the
    // renderer; the layout reserves the space at the very top of the
    // timeline area so the pill sits ABOVE the date headers.
    pillTopY: number;
    /** How the pill aligns to the line (see `NowPillMode`). */
    pillMode: NowPillMode;
    label: string;      // 'Today' by default
    style: ResolvedStyle;
}

export interface PositionedItem {
    kind: 'item';
    id?: string;
    title: string;
    box: BoundingBox;
    status: StatusKind;
    progressFraction: number;   // 0..1; 1 == fully filled
    footnoteIndicators: number[];  // 1-based superscript numbers, empty when no footnotes
    labelChips: PositionedLabelChip[];
    /** True when the chip row's natural total width exceeded the bar's
     *  effective inner width and the whole row spilled past the bar's
     *  right edge. The chips' `box.x` already reflects the spilled
     *  position; this flag exists for the row-packer to reserve the
     *  spilled extent and for the renderer / debug overlays to know
     *  the row sits outside the bar's painted footprint. */
    chipsOutside: boolean;
    /** Logical right x reached by the chip row, INCLUDING the chips
     *  whether painted inside or outside the bar. Equals the start x
     *  when there are no chips. The row-packer's spill reservation
     *  uses this to grow the chart canvas / bump siblings. */
    chipsRightX: number;
    linkIcon?: LinkIconKind;
    linkHref?: string;
    hasOverflow: boolean;       // true when before: forced the item past its natural end
    overflowBox?: BoundingBox;  // the offending tail, flagged red
    // The id of the `before:` anchor/milestone the item overran. Used by the
    // renderer to caption the overflow tail ("past <id>").
    overflowAnchorId?: string;
    owner?: string;             // owner id (person/team) for annotation
    description?: string;
    // Pre-formatted secondary line shown under the title inside the item bar
    // (e.g. "1w" or "2w — 50% remaining"). Layout assembles this so the
    // renderer stays palette-and-string-dumb.
    metaText?: string;
    // True when the title OR the meta line is wider than the bar's inner
    // padded width. We treat title + meta as an atomic block: if either
    // one wouldn't fit inside the bar, BOTH get drawn beside the bar
    // (stacked, just past its right edge) so they read as one caption
    // rather than splitting across the bar boundary. The layout also
    // bumps the next item to a fresh row so the spilled caption has
    // empty space to occupy.
    textSpills: boolean;
    /** True when the bar is too narrow to host the status dot inside
     *  with its full inset (`MIN_BAR_WIDTH_FOR_DOT_PX`). The dot
     *  renders in the spill column to the right of the bar instead
     *  of overshooting the bar's left edge. */
    dotSpills: boolean;
    /** True when the bar is too narrow to host the link-icon tile
     *  inside without colliding with the status dot column
     *  (`MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX`). The icon spills out and
     *  renders ahead of the (also-spilled) title so the icon stays
     *  visually attached to the title text. Implies `textSpills`. */
    iconSpills: boolean;
    /** True when the bar is too narrow to host the footnote
     *  superscript at its inset-right position. The indicator(s)
     *  render in the spill column trailing the title text instead
     *  of at the bar's upper-right corner. */
    footnoteSpills: boolean;
    /** Pre-computed x positions for the spilled decorations. `null`
     *  when the matching `*Spills` flag is false (decoration stays
     *  inside the bar at its inset-anchored position). */
    dotSpillCx: number | null;
    iconSpillX: number | null;
    /** First footnote indicator's left edge in the spill column.
     *  Subsequent indicators walk right by `ITEM_FOOTNOTE_INDICATOR_STEP_PX`. */
    footnoteSpillStartX: number | null;
    /** Right edge of the spilled-decoration cluster (inclusive of
     *  spilled title and footnote glyphs). Used by the row-packer
     *  to size the row's spill reservation so the next chained item
     *  doesn't land underneath. */
    decorationsRightX: number;
    /**
     * Capacity suffix data when the item declares `capacity:N`. Null when
     * the item has no capacity, the value is non-positive, or the resolved
     * `capacity-icon` is `none` and no number should render either way.
     *
     * Renders alongside the item's `metaText` (or stand-alone when no meta
     * is present) per specs/rendering.md § Item capacity suffix. The `text`
     * is the formatted number (`'5'`, `'0.5'`, `'1.25'`); `icon` tells the
     * renderer which glyph to draw and whether to use the SVG library, the
     * `×` text node, or an inline literal.
     */
    capacity: PositionedCapacity | null;
    style: ResolvedStyle;
}

/**
 * Positioned capacity suffix shared by `PositionedItem` and (in m7) the lane
 * frame-tab badge. The shape stays small and serializable: a formatted number
 * string plus a discriminated union for the glyph. The renderer paints both.
 *
 * `icon === null` means the resolved `capacity-icon` was `'none'` — render
 * the bare number with no glyph or separator.
 */
export interface PositionedCapacity {
    /** Numeric capacity, post-percent-sugar conversion (e.g. `50%` → 0.5). */
    value: number;
    /** Display string per spec number-formatting rules (`'5'`, `'0.5'`). */
    text: string;
    /** Resolved glyph instruction, or `null` when the icon is `'none'`. */
    icon: ResolvedCapacityIconRef | null;
}

/**
 * Renderer-facing capacity-icon reference. Mirrors the layout-internal
 * `ResolvedCapacityIcon` from `capacity.ts` but lives in the shared
 * positioned-model types so the renderer can read it without importing
 * layout internals.
 */
export type ResolvedCapacityIconRef =
    | { kind: 'builtin'; name: 'multiplier' | 'person' | 'people' | 'points' | 'time' }
    | { kind: 'literal'; text: string };

export type LinkIconKind = 'linear' | 'github' | 'jira' | 'generic' | 'none';

export interface PositionedLabelChip {
    text: string;
    style: ResolvedStyle;
    // Chip box is laid out inside the item bar; coordinates are absolute.
    box: BoundingBox;
}

export interface PositionedGroup {
    kind: 'group';
    id?: string;
    title?: string;
    box: BoundingBox;
    // Bracket is drawn on the left edge when style.bracket != 'none'.
    children: PositionedTrackChild[];
    style: ResolvedStyle;
}

export interface PositionedParallel {
    kind: 'parallel';
    id?: string;
    title?: string;
    box: BoundingBox;
    children: PositionedTrackChild[];   // sub-tracks stacked vertically
    style: ResolvedStyle;
}

export type PositionedTrackChild = PositionedItem | PositionedParallel | PositionedGroup;

export interface PositionedSwimlane {
    id?: string;
    title: string;     // display name; falls back to id
    box: BoundingBox;
    bandIndex: number; // zero-based; even/odd drives tint
    children: PositionedTrackChild[];
    nested: PositionedSwimlane[];   // recursive sub-swimlanes
    style: ResolvedStyle;
    // Owner display string ("Platform Team", "Sam Chen") rendered inside
    // the frame tab. Resolved from team/person id → title.
    owner?: string;
    // Footnote indicator numbers attached to this swimlane (via `on:` in the
    // footnote declaration). Rendered in the upper-right of the frame tab.
    footnoteIndicators: number[];
    /**
     * Lane-level capacity badge data when the swimlane declares
     * `capacity:N`. Null when no capacity is set or the value parses to
     * zero. The renderer paints the badge inside the frame tab after the
     * owner badge (or after the lane title when no owner is present),
     * per specs/rendering.md § Lane capacity badge. m8 (overload sweep)
     * also reads `value` to compute load against item capacities.
     *
     * `capacity-icon:none` resolves to `icon: null` here (just the bare
     * number renders, no glyph) but the badge still appears. Authors who
     * want the badge fully hidden simply omit `capacity:`.
     */
    capacity: PositionedCapacity | null;
}

export interface PositionedAnchor {
    id?: string;
    title: string;
    center: Point;         // diamond center (post-collision-resolution)
    radius: number;
    style: ResolvedStyle;
    // Non-binding predecessor edges: small arrows from prior items, drawn by renderer.
    predecessorPoints: Point[];
    // Vertical span of the anchor's "cut line" through the swimlane area,
    // drawn by the renderer after items so it overlays the lane fills.
    cutTopY: number;
    cutBottomY: number;
    // True when this anchor was bumped above the in-row baseline because a
    // milestone shares the same x-column.
    bumpedUp: boolean;
    // Resolved label placement. The marker-row packer decides whether the
    // title sits to the right (default) or the left of the diamond, and
    // whether the entity drops to a lower row to avoid colliding with
    // earlier markers' label boxes. Renderer uses `labelBox.x/y` directly
    // (start-anchored text) — no further geometry decisions.
    labelBox: BoundingBox;
    labelSide: 'left' | 'right';
}

export interface PositionedMilestone {
    id?: string;
    title: string;
    center: Point;
    radius: number;
    fixed: boolean;            // true for date: style, false for after: style
    // One slack arrow per non-binding predecessor. Each entry's (x, y) is
    // the predecessor's right-edge midpoint; the arrow runs horizontally
    // from there to (center.x - 6) at y. Empty / undefined when the
    // milestone has zero or one predecessor.
    slackArrows?: Array<{ x: number; y: number }>;
    isOverrun: boolean;        // true when the aggregated predecessor end exceeds `date:`
    style: ResolvedStyle;
    // Vertical span of the milestone's cut line through the swimlane area.
    cutTopY: number;
    cutBottomY: number;
    // See PositionedAnchor.labelBox — same packing logic applies.
    labelBox: BoundingBox;
    labelSide: 'left' | 'right';
}

/**
 * Result of packing a marker-row entity (anchor or milestone) into the
 * dynamic row stack. `rowIndex == 0` is the in-row baseline; positive
 * indices push the diamond DOWN by `step` px each. The label box is
 * absolute and already accounts for left/right side flipping when the
 * preferred side would overflow the chart.
 */
export interface MarkerRowPlacement {
    rowIndex: number;
    centerY: number;
    labelBox: BoundingBox;
    labelSide: 'left' | 'right';
}

/**
 * Horizontal corridor occupied by a milestone's slack arrow. Sits at
 * the slack predecessor's row Y, running from the predecessor's right
 * edge to the milestone's column. Items whose natural placement would
 * intersect this band must drop to a row whose Y does not match `y`,
 * so the arrow has clear horizontal space to travel.
 */
export interface SlackCorridor {
    xStart: number;       // slack pred's right edge (logical chart x)
    xEnd: number;         // binding pred's right edge / milestone center.x
    y: number;            // slack pred's row midpoint
    slackPredId: string;  // exempt from bumping (owns the arrow's origin)
    milestoneId: string;
}

export interface PositionedDependencyEdge {
    fromId: string;
    toId: string;
    waypoints: Point[];    // first = source port; last = target port
    kind: 'normal' | 'overflow';
    style: ResolvedStyle;
}

export interface PositionedFootnoteIndicator {
    // Not a separate geometry in the chart — rendered as a superscript on the
    // host item. Kept in the model for completeness, keyed to the host item id.
    number: number;
    hostItemId: string;
    style: ResolvedStyle;
}

export interface PositionedFootnoteArea {
    box: BoundingBox;
    entries: PositionedFootnoteEntry[];
}

export interface PositionedFootnoteEntry {
    number: number;
    title: string;
    description?: string;
    style: ResolvedStyle;
}

export interface PositionedIncludeRegion {
    sourcePath: string;    // relative to the parent file
    label: string;         // e.g. the child roadmap's title or basename
    box: BoundingBox;
    // Nested swimlanes laid out inside the region. They share the parent's
    // timeline (originX, pixelsPerDay) so cross-region dates align with the
    // tick row above the region.
    nestedSwimlanes: PositionedSwimlane[];
    style: ResolvedStyle;
}

// Top-level result handed to the renderer.
export interface PositionedRoadmap {
    width: number;
    height: number;
    theme: 'light' | 'dark';
    /**
     * Resolved palette — every color the renderer reads. m2.5d moved
     * theme resolution into the layout side, so the renderer no longer
     * branches on `theme === 'dark'`. The `theme` field above stays for
     * `data-theme` SVG attribution; all color decisions read `palette`.
     */
    palette: import('./themes/index.js').Theme;
    backgroundColor: string;    // resolved from theme.surface.page
    header: PositionedHeader;
    timeline: PositionedTimelineScale;
    nowline: PositionedNowline | null;
    swimlanes: PositionedSwimlane[];
    anchors: PositionedAnchor[];
    milestones: PositionedMilestone[];
    edges: PositionedDependencyEdge[];
    footnotes: PositionedFootnoteArea;
    includes: PositionedIncludeRegion[];
    // Frame (chart area) in chart-space. Useful for renderer overlays.
    chartBox: BoundingBox;
}
