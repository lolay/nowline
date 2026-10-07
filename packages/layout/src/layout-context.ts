// Layout context — shared internal types used by `layout.ts` and the
// node files under `nodes/`. Extracted so per-entity nodes (e.g.
// `swimlane-node.ts`) can type their inputs without forcing a circular
// import on the production composition root in `layout.ts`.

import type {
    GroupBlock,
    ItemDeclaration,
    LabelDeclaration,
    ParallelBlock,
    SymbolDeclaration,
} from '@nowline/core';
import type { BandScale } from './band-scale.js';
import type { resolveCalendar } from './calendar.js';
import type { StyleContext } from './style-resolution.js';
import type { TimeScale } from './time-scale.js';
import type {
    MarkerRowPlacement,
    Point,
    PositionedItem,
    PositionedTimelineScale,
    PositionedTrackChild,
    ResolvedSize,
    SlackCorridor,
} from './types.js';
import type { WaveLayoutState } from './wave-layout.js';
import type { WorkingCalendar } from './working-calendar.js';

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
    /**
     * Midpoint per MARKER (anchor or milestone), on the marker row.
     * Dependency arrows from a marker start on its cut line at this `x`,
     * and a milestone's slack arrow from a marker predecessor reads its
     * `y`. Items are not in this map: their attach geometry is derived
     * from `placedItems`.
     */
    entityMidpoints: Map<string, Point>;
    /**
     * Every placed item, keyed by its draw key (the explicit id, or the
     * synthetic handle of an id-less item; see `syntheticItemKey`). The
     * value is the same `PositionedItem` object the positioned model
     * carries, so it always holds the item's FINAL box, however many
     * times a retroactive row growth or a marker-band growth moved it
     * down after placement. Dependency-arrow ports and slack-arrow attach
     * points are derived from that box when the arrows are built (see
     * `item-port-geometry.ts`), never captured as absolute coordinates
     * while the item is placed.
     */
    placedItems: Map<string, PositionedItem>;
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
    /**
     * Monotonic counters for id-less `parallel` / `group` blocks. Each
     * swimlane-loop pass resets both to zero; blocks without an explicit
     * `name` receive internal flow-key handles (`parallel-1`, `group-1`, …).
     * These handles are not referenceable from `after:` / `before:` / `on:`.
     */
    nextParallelId: number;
    nextGroupId: number;
    /**
     * Wave barrier state (specs/waves.md §8.4), shared by the main lanes
     * and every isolated region's context. Undefined when the roadmap
     * declares no waves.
     */
    waves?: WaveLayoutState;
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
        child: ItemDeclaration | GroupBlock | ParallelBlock,
        seqDefault: number,
        laneLeftX: number,
        ctx: LayoutContext,
    ) => number;
    newCursor: (x: number, y: number) => TrackCursor;
    estimateTextWidth: (text: string, fontSize: number) => number;
    /** Predict the extra height an item's bar will grow by (a wrapped
     *  two-line title over a meta line, or wrapped label-chip rows;
     *  whichever is larger), so callers can size the row pitch BEFORE
     *  handing off to `sequenceItem`. Returns 0 when the title fits one
     *  line (or wraps without needing a taller bar) and the item's
     *  labels all fit on a single chip row. `startX` is the snapped
     *  predicted start the bar will be placed at. */
    predictItemBarExtraHeight: (
        item: ItemDeclaration,
        startX: number,
        ctx: LayoutContext,
    ) => number;
}
