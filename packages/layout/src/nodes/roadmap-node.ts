// RoadmapNode — the m2.5c composition root. Walks the per-entity
// Renderable nodes (ItemNode via sequenceItem, SwimlaneNode, ParallelNode
// via sequenceOne, AnchorNode/MilestoneNode via build*, footnote/include
// helpers) to produce the final `PositionedRoadmap` model.
//
// RoadmapNode does NOT import the sequencer helpers or the orchestration
// helpers (`collectItems`, `buildDependencies`, `buildNowline`) at
// module-init time. They live in
// `layout.ts` and are passed in via the `deps` argument. This avoids a
// runtime cycle while keeping the composition logic in a dedicated file.

import type {
    ItemDeclaration,
    NowlineFile,
    ResolveResult,
    SwimlaneDeclaration,
} from '@nowline/core';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import type { LayoutContext, LayoutHelpers } from '../layout-context.js';
import { resolveDateWindow, resolveScope } from '../phases/date-window.js';
import { FinalizeContext, finalizeRoadmap } from '../phases/finalize.js';
import { measureRoadmap } from '../phases/measure.js';
import { placeChart } from '../phases/place.js';
import type { RoadmapSchedule } from '../schedule.js';
import type {
    PositionedDependencyEdge,
    PositionedIncludeRegion,
    PositionedNowline,
    PositionedSwimlane,
} from '../types.js';

/**
 * Bundle of orchestration + sequencer helpers RoadmapNode delegates to.
 * `layout.ts` builds this struct from its private helpers and passes it
 * once when calling `RoadmapNode.place(...)`.
 */
export interface RoadmapNodeDeps extends LayoutHelpers {
    collectItems: (swimlanes: SwimlaneDeclaration[]) => Map<string, ItemDeclaration>;
    buildDependencies: (
        items: Map<string, ItemDeclaration>,
        swimlanes: PositionedSwimlane[],
        includes: PositionedIncludeRegion[],
        ctx: LayoutContext,
    ) => PositionedDependencyEdge[];
    buildNowline: (
        today: Date | undefined,
        ctx: LayoutContext,
        locale: string,
        chartRightX: number,
    ) => PositionedNowline | null;
}

export class RoadmapNode {
    /**
     * `schedule` is the roadmap's day schedule (engine C), built once by
     * `layoutRoadmap` or handed in through `LayoutOptions.schedule`. The date
     * window is a projection of it, and `schedule.plan` (the wave plan,
     * undefined without waves) drives the barrier passes below (engine A).
     */
    place(
        file: NowlineFile,
        resolved: ResolveResult,
        options: LayoutOptions,
        schedule: RoadmapSchedule,
        deps: RoadmapNodeDeps,
    ): LayoutResult {
        // Phase 1, the date window (specs/layout-phases.md §3.2): the scope
        // (theme, locale, style context, `default roadmap` style) and the
        // natural window, a projection of the day schedule
        // (specs/scheduler-unification.md §3.3).
        const scope = resolveScope(file, resolved, options);
        const window = resolveDateWindow(file, resolved, options, scope, schedule);

        // Phase 2, measure (specs/layout-phases.md §3.3): the header, the
        // natural axis, the header rows with the marker-band estimate, and
        // the timeline of the natural window.
        const measured = measureRoadmap(file, resolved, options, scope, window);

        // Phase 3, place (specs/layout-phases.md §3.4): the context, the
        // entity-edge seeds, the footnote index, the barrier passes (P1),
        // the corridor rerun (P2), the kept regions (P4), the chart bottom
        // (P5) and the milestones (P6). Placement never reads the canvas.
        const chart = placeChart(resolved, scope, window, measured, deps);

        // Phase 4, finalize (specs/layout-phases.md §3.5): the ordered pass
        // f1 to f16 over the canvas, the axis, the marker band and the
        // chart extent, then the model.
        return finalizeRoadmap(
            new FinalizeContext(file, resolved, options, scope, window, measured, chart, deps),
        );
    }
}
