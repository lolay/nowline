// Layout context — shared internal types used by the layout phases
// (`phases/`) and the node files under `nodes/`. Extracted so per-entity
// nodes (e.g. `swimlane-node.ts`) can type their inputs without importing
// the phases that drive them.

import type {
    GroupBlock,
    ItemDeclaration,
    LabelDeclaration,
    ParallelBlock,
    ResolvedConfig,
    ResolvedContent,
    SymbolDeclaration,
} from '@nowline/core';
import type { AxisColumns } from './axis-columns.js';
import type { BandScale } from './band-scale.js';
import { type resolveCalendar, resolveSizes } from './calendar.js';
import type { FootnoteIndex } from './nodes/footnote-node.js';
import type { RoadmapSchedule } from './schedule.js';
import type { StyleContext } from './style-resolution.js';
import type { Theme } from './themes/shape.js';
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
    /**
     * Where the next item begins, in time: the last child's duration end
     * (a block's latest track end), never the minimum bar width or a
     * caption spill (specs/scheduler-unification.md §8 decisions 6, 7).
     */
    x: number;
    /** Top edge of the current row. */
    y: number;
    /** Accumulated height of the track. */
    height: number;
    /**
     * Rightmost bar edge reached, in logical space: the painted footprint,
     * the minimum bar width included, never a caption spill. A parallel
     * sizes its bracket on it.
     */
    maxX: number;
}

export function newCursor(x: number, y: number): TrackCursor {
    return { x, y, height: 0, maxX: x };
}

/**
 * The working-day duration the day schedule gave `item`. Every item engine A
 * lays out is in `schedule.byNode` (the main lanes and the first-level
 * isolated regions it draws), so a miss is an invariant violation, a
 * schedule built for another roadmap or a walker that skipped a node, and
 * throws instead of falling back to a second derivation that could drift.
 */
export function scheduledItemDays(ctx: LayoutContext, item: ItemDeclaration): number {
    const scheduled = ctx.schedule.byNode.get(item);
    if (!scheduled) {
        throw new Error(
            `layout: item "${item.name ?? item.title ?? '(unnamed)'}" is not in the day schedule`,
        );
    }
    return scheduled.days;
}

/**
 * Shared layout state passed through the per-entity sequencers and
 * Renderable nodes. Owns the resolved calendar/timeline/style scope plus
 * the running entity-edge maps that `after:` / `before:` references read.
 */
export interface LayoutContext {
    cal: ReturnType<typeof resolveCalendar>;
    /**
     * The roadmap's day schedule (engine C), shared by the main lanes and
     * every isolated region's context. Item durations in working days come
     * from `schedule.byNode` (`scheduledItemDays`), never from re-deriving
     * them against the sizes (specs/scheduler-unification.md §3.4).
     */
    schedule: RoadmapSchedule;
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
    /**
     * The natural axis as tick columns, for the caption cap at the chart's
     * end (`measureItem`). Shared by the main lanes and every isolated
     * region; omitted by contexts built outside the place phase, which then
     * cap no caption.
     */
    axisColumns?: AxisColumns;
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
     * Marker-row placement (row index + label box + side). While lanes
     * are placed it holds a copy of the measure phase's pre-pack of every
     * date-pinned anchor and milestone; finalize then replaces it with the
     * final pack (f5), which adds after-only milestones and the calendar
     * runs, before milestones are positioned (f6) and anchors built (f10).
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

/** The per-file half of a context: the root file, or an isolated region. */
export interface ContextSource {
    config: Pick<ResolvedConfig, 'styles' | 'defaults' | 'symbols'>;
    content: Pick<ResolvedContent, 'sizes' | 'labels' | 'teams' | 'persons'>;
}

/**
 * Build a `LayoutContext` for the root file or for an isolated region.
 * `chart` passes the chart extents through unchanged: the root sets
 * `chartTopY` from the timeline with both bottoms at 0, a region sets all
 * three y fields to its inner start. The canvas width is not part of a
 * context: placement never reads it (finalize owns the `CanvasExtent`).
 * A region passes no footnotes and no marker placements. The caller seeds
 * the wave edges.
 */
export function createLayoutContext(
    source: ContextSource,
    shared: {
        theme: Theme;
        cal: ReturnType<typeof resolveCalendar>;
        schedule: RoadmapSchedule;
        timeline: PositionedTimelineScale;
        scale: TimeScale;
        calendar: WorkingCalendar;
        axisColumns?: AxisColumns;
        bandScale: BandScale;
        waves?: WaveLayoutState;
    },
    chart: Pick<LayoutContext, 'chartTopY' | 'chartBottomY' | 'swimlaneBottomY'>,
    init: {
        footnotes?: FootnoteIndex;
        markerRowPlacements?: Map<string, MarkerRowPlacement>;
    },
): LayoutContext {
    return {
        cal: shared.cal,
        schedule: shared.schedule,
        styleCtx: {
            theme: shared.theme,
            styles: source.config.styles,
            defaults: source.config.defaults,
            labels: source.content.labels,
        },
        // Each file declares its own sizes, resolved under the host's
        // calendar so a region's sized items render at the host's
        // pixels-per-day scale.
        sizes: resolveSizes(source.content.sizes, shared.cal),
        labels: source.content.labels,
        teams: source.content.teams,
        persons: source.content.persons,
        symbols: source.config.symbols,
        footnoteIndex: init.footnotes?.index ?? new Map(),
        footnoteHosts: init.footnotes?.hosts ?? new Map(),
        timeline: shared.timeline,
        scale: shared.scale,
        calendar: shared.calendar,
        ...(shared.axisColumns ? { axisColumns: shared.axisColumns } : {}),
        bandScale: shared.bandScale,
        entityLeftEdges: new Map(),
        entityRightEdges: new Map(),
        entityMidpoints: new Map(),
        placedItems: new Map(),
        itemFlowKey: new Map(),
        currentFlowKey: '',
        slackCorridors: [],
        markerRowPlacements: init.markerRowPlacements ?? new Map(),
        chartTopY: chart.chartTopY,
        chartBottomY: chart.chartBottomY,
        swimlaneBottomY: chart.swimlaneBottomY,
        nextParallelId: 0,
        nextGroupId: 0,
        // Wave floors are dates projected with the unclamped scale
        // (specs/waves.md §5.1); a region shares the host's wave state
        // (§8.4) so its lanes are floored and accumulate into the same pass.
        ...(shared.waves ? { waves: shared.waves } : {}),
    };
}

/**
 * The helpers the place phase injects into the nodes. Everything else a
 * node needs it imports; `sequenceOne` (`nodes/sequence-one.ts`) stays
 * injected because it dispatches to `GroupNode` and `ParallelNode`, which
 * call it for their nested blocks: importing it there would form a cycle
 * (specs/layout-phases.md §3.8, §8 decision 4).
 */
export interface LayoutHelpers {
    sequenceOne: (
        child: ItemDeclaration | GroupBlock | ParallelBlock,
        cursor: TrackCursor,
        ctx: LayoutContext,
    ) => PositionedTrackChild;
}
