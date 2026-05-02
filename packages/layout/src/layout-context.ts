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
} from '@nowline/core';
import type {
    PositionedTimelineScale,
    PositionedItem,
    PositionedTrackChild,
    Point,
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
    durations: Map<string, import('@nowline/core').DurationDeclaration>;
    labels: Map<string, LabelDeclaration>;
    teams: Map<string, import('@nowline/core').TeamDeclaration>;
    persons: Map<string, import('@nowline/core').PersonDeclaration>;
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
    chartTopY: number;
    chartBottomY: number;
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
}
