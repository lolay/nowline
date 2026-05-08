// Layout context — shared internal types used by `layout.ts` and the
// node files under `nodes/`. Extracted so per-entity nodes (e.g.
// `swimlane-node.ts`) can type their inputs without forcing a circular
// import on the production composition root in `layout.ts`.

import type {
    LabelDeclaration,
    ItemDeclaration,
    GroupBlock,
    ParallelBlock,
    EntityProperty,
    SymbolDeclaration,
} from '@nowline/core';
import type {
    PositionedTimelineScale,
    PositionedItem,
    PositionedTrackChild,
    Point,
    SlackCorridor,
    MarkerRowPlacement,
    ResolvedSize,
} from './types.js';
import type { resolveCalendar } from './calendar.js';
import type { StyleContext } from './style-resolution.js';
import type { TimeScale } from './time-scale.js';
import type { WorkingCalendar } from './working-calendar.js';
import type { BandScale } from './band-scale.js';

/** Slim accumulator used while sequencing items into a track. */
export interface TrackCursor {
    /** Left edge where the next item begins. */
    x: number;
    /** Top edge of the current row. */
    y: number;
    /** Accumulated height of the track. */
    height: number;
    /** Rightmost edge reached. */
    maxX: number;
}

export function newCursor(x: number, y: number): TrackCursor {
    return { x, y, height: 0, maxX: x };
}

/**
 * Shared layout state passed through the per-entity sequencers and
 * Renderable nodes. Owns the resolved calendar/timeline/style scope plus
 * the running entity-edge maps that `after:` / `before:` references read.
 */
export interface LayoutContext {
    cal: ReturnType<typeof resolveCalendar>;
    styleCtx: StyleContext;
    sizes: Map<string, ResolvedSize>;
    labels: Map<string, LabelDeclaration>;
    teams: Map<string, import('@nowline/core').TeamDeclaration>;
    persons: Map<string, import('@nowline/core').PersonDeclaration>;
    /**
     * Custom `symbol` declarations from `ResolvedConfig.symbols`. Used by
     * `resolveCapacityIcon` (in `capacity.ts`) to dereference custom symbol
     * ids like `capacity-icon:budget` to the symbol's `unicode:` payload.
     * Empty when the file declares no symbols.
     */
    symbols: Map<string, SymbolDeclaration>;
    footnoteIndex: Map<string, number>;
    /** For each footnote id, the list of `on:` host ids it references. */
    footnoteHosts: Map<string, string[]>;
    timeline: PositionedTimelineScale;
    scale: TimeScale;
    calendar: WorkingCalendar;
    bandScale: BandScale;
    entityLeftEdges: Map<string, number>;
    entityRightEdges: Map<string, number>;
    entityMidpoints: Map<string, Point>;
    /**
     * Visual edges for items (entries with a painted bar). Differs
     * from `entityLeftEdges`/`entityRightEdges` (logical column
     * boundaries) by `ITEM_INSET_PX` on each side so dependency
     * arrows attach to the painted bar edge instead of landing in
     * the inter-column gutter. Anchors and milestones are absent —
     * their attach geometry uses `(center.x, target.row.midY)` on
     * the cut line, computed inline by `buildDependencies`.
     */
    entityVisualLeftX: Map<string, number>;
    entityVisualRightX: Map<string, number>;
    /**
     * Per-item exit point for `after:` dependency arrows leaving
     * this entity. Default = `(visualRight, midY)`. When the
     * caption spills past the bar's right edge (`textSpills`), the
     * exit drops to `(box.x + box.width / 2, box.y + box.height)`
     * — the bottom-middle of the progress strip — so the arrow
     * doesn't visually pierce the spilled title/meta text to the
     * right of the bar.
     */
    itemArrowSource: Map<string, Point>;
    /**
     * Flow key for each item, used to dedupe milestone slack arrows.
     * A "flow" is the deepest enclosing single-track container —
     * swimlane root, sequential group, or one parallel sub-track.
     * Two items share a flowKey iff they share that container path
     * (file order already encodes their ordering, so only the
     * latest predecessor in each flow contributes a slack arrow).
     */
    itemFlowKey: Map<string, string>;
    /**
     * The flow key currently being built by the swimlane walk.
     * Container nodes (`SwimlaneNode`, `GroupNode`, `ParallelNode`)
     * push their own segment onto this string before recursing into
     * children and restore it afterward. `sequenceItem` reads this
     * value to populate `itemFlowKey`.
     */
    currentFlowKey: string;
    /**
     * Y coordinate where milestone slack arrows attach for each item id.
     * Defaults to the item's row midpoint; when an item's caption spills
     * past the bar's right edge, drops to the progress-strip's vertical
     * center (`box.y + box.height - PROGRESS_STRIP_HEIGHT_PX / 2`) so the
     * arrow stays clear of the spilled title/meta line and visually
     * aligns with the bottom-edge progress bar instead.
     */
    itemSlackAttachY: Map<string, number>;
    /**
     * Horizontal arrow corridors that the swimlane row-packer must avoid.
     * Empty during the first layout pass; populated from the first
     * pass's milestones and consulted on the second pass so the binding
     * predecessor (and any unrelated overlapping item) drops to a row
     * whose Y does not match the corridor.
     */
    slackCorridors: SlackCorridor[];
    /**
     * Pre-computed marker-row placement (row index + label box + side)
     * for every anchor and date-pinned milestone. After-only milestones
     * pack against this map at build time; date-pinned entries are
     * snapshot upstream so their (Y, label) survives swimlane reflows.
     */
    markerRowPlacements: Map<string, MarkerRowPlacement>;
    chartTopY: number;
    chartBottomY: number;
    /**
     * Y coordinate at the bottom of the last swimlane / include region.
     * Distinct from `chartBottomY`, which extends through any mirrored
     * bottom timeline tick panel. Marker cut-lines (anchors, milestones)
     * stop here so they never invade the bottom date strip; the now-line
     * uses the wider `chartBottomY` (or the bottom panel's bottom edge)
     * to thread the entire timeline strip.
     */
    swimlaneBottomY: number;
    chartRightX: number;
}

/**
 * Bundle of layout-internal helper callbacks injected from `layout.ts`
 * into the per-entity Renderable nodes. Keeping the helpers in
 * `layout.ts` (rather than splitting them across many tiny files) means
 * the nodes stay small and importable without a runtime cycle: they
 * receive the helpers at construction time via this struct.
 */
export interface LayoutHelpers {
    sequenceItem: (
        child: ItemDeclaration,
        cursor: TrackCursor,
        ctx: LayoutContext,
        ownerOverride?: string,
    ) => PositionedItem;
    sequenceOne: (
        child: ItemDeclaration | GroupBlock | ParallelBlock,
        cursor: TrackCursor,
        ctx: LayoutContext,
    ) => PositionedTrackChild;
    resolveChildStart: (
        props: EntityProperty[],
        seqDefault: number,
        laneLeftX: number,
        ctx: LayoutContext,
    ) => number;
    newCursor: (x: number, y: number) => TrackCursor;
    estimateTextWidth: (text: string, fontSize: number) => number;
    /** Predict the extra height an item's wrapped label-chip rows will
     *  add, so callers can size the row pitch BEFORE handing off to
     *  `sequenceItem`. Returns 0 when the item's labels all fit on a
     *  single chip row. */
    predictItemChipExtraHeight: (item: ItemDeclaration, ctx: LayoutContext) => number;
}
