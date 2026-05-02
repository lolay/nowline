// Minimal subset of @nowline/layout's Positioned* types for the prototype.
//
// Just enough to render minimal.nowline (header, timeline scale with multi-row
// headers, swimlane band, item bars, now-line). Names match the production
// `PositionedRoadmap` so it's obvious which fields would be reused.

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PositionedItem {
    id: string;
    title: string;
    box: Box;
    status: 'planned' | 'in-progress' | 'done' | 'at-risk' | 'blocked';
    /** 0..1 fraction of the bar that is *remaining* (so bar fills 1 - remaining). */
    remaining: number;
    /**
     * Shelf-pack row index assigned by SwimlaneNode.place. Items whose
     * intrinsic content width would collide are pushed to a new row so the
     * lane's bands can stretch and the bar widths stay column-aligned.
     */
    row: number;
    /**
     * Pre-formatted second-line label rendered under the title — e.g.
     * "1w", "2w - 50% remaining". Computed in the layout layer so the
     * renderer has no DSL semantics.
     */
    metaText: string;
    /**
     * X coordinate where the title and meta `<text>` elements should anchor.
     * When the text fits inside the bar this is `box.x + 12` (the production
     * inset). When the text overflows the bar's visible width this jumps to
     * `box.x + box.width + gap` so the text reads cleanly to the right of
     * the block instead of spilling out of it.
     */
    textX: number;
}

export interface PositionedSwimlane {
    id: string;
    title: string;
    band: Box;
    /**
     * Frame-tab badge that displays the swimlane title (PlantUML-style
     * tab pinned to the top-left of the band). Computed in the layout
     * layer because the renderable tree uses its bounds to decide whether
     * the first row of items can sit at band.y + tab.y (top-aligned with
     * the tab) or has to shift down to clear it.
     */
    tab: Box;
    children: PositionedItem[];
}

export interface PositionedHeaderRowTick {
    label: string | undefined;
    /** Center x of the cell. */
    centerX: number;
    /** Left and right of the tick cell, for drawing dividers. */
    leftX: number;
    rightX: number;
}

export interface PositionedHeaderRow {
    /** Row's vertical bounds inside the timeline panel. */
    y: number;
    height: number;
    ticks: PositionedHeaderRowTick[];
}

export interface PositionedTimelineScale {
    box: Box;
    rows: PositionedHeaderRow[];
    /** Vertical resolution-tick gridlines (drop down through swimlanes). */
    gridX: number[];
}

export interface PositionedHeader {
    box: Box;
    title: string;
    author?: string;
}

export interface PositionedNowline {
    x: number;
    topY: number;
    bottomY: number;
    label: string;
}

export interface PositionedRoadmap {
    width: number;
    height: number;
    backgroundColor: string;
    header: PositionedHeader;
    timeline: PositionedTimelineScale;
    swimlanes: PositionedSwimlane[];
    nowline: PositionedNowline | null;
}
