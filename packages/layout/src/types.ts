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

// The 16 style properties from specs/dsl.md § Style Properties plus header-position.
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
    logo?: PositionedLogo;
    style: ResolvedStyle;
    // Attribution mark (Nowline wordmark + link) lives in the top-right.
    attributionBox: BoundingBox;
}

// A single tick on the timeline scale (e.g. "W1", "Q2", "Feb").
export interface PositionedTick {
    x: number;
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
}

export interface PositionedNowline {
    x: number;
    topY: number;
    bottomY: number;
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
    linkIcon?: LinkIconKind;
    linkHref?: string;
    hasOverflow: boolean;       // true when before: forced the item past its natural end
    overflowBox?: BoundingBox;  // the offending tail, flagged red
    owner?: string;             // owner id (person/team) for annotation
    description?: string;
    style: ResolvedStyle;
}

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
}

export interface PositionedAnchor {
    id?: string;
    title: string;
    center: Point;         // diamond center
    radius: number;
    style: ResolvedStyle;
    // Non-binding predecessor edges: small arrows from prior items, drawn by renderer.
    predecessorPoints: Point[];
}

export interface PositionedMilestone {
    id?: string;
    title: string;
    center: Point;
    radius: number;
    fixed: boolean;            // true for date: style, false for after: style
    slackX?: number;           // for floating milestones, the x of the current "earliest can start"
    isOverrun: boolean;        // true when the aggregated predecessor end exceeds `date:`
    style: ResolvedStyle;
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
    // The include's own mini-layout is NOT materialized here (out of scope for
    // m2b). The renderer draws a dashed-bordered region with the label and a
    // link badge; a future milestone can nest a full PositionedRoadmap.
    style: ResolvedStyle;
}

// Top-level result handed to the renderer.
export interface PositionedRoadmap {
    width: number;
    height: number;
    theme: 'light' | 'dark';
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
