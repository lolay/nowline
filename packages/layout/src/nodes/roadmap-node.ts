// RoadmapNode — the composition root (specs/layout-phases.md §3.1). It runs
// the four phases in order: the date window (`phases/date-window.ts`),
// measure (`phases/measure.ts`), place (`phases/place.ts`) and finalize
// (`phases/finalize.ts`), each a module with a typed input and output.
// `sequenceOne` is the one helper it injects: the group and parallel nodes
// call it for their nested blocks (§8, decision 4).

import type { NowlineFile, ResolveResult } from '@nowline/core';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import type { LayoutHelpers } from '../layout-context.js';
import { resolveDateWindow, resolveScope } from '../phases/date-window.js';
import { FinalizeContext, finalizeRoadmap } from '../phases/finalize.js';
import { measureRoadmap } from '../phases/measure.js';
import { placeChart } from '../phases/place.js';
import type { RoadmapSchedule } from '../schedule.js';
import { sequenceOne } from './sequence-one.js';

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
    ): LayoutResult {
        const helpers: LayoutHelpers = { sequenceOne };
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
        const chart = placeChart(resolved, scope, window, measured, helpers);

        // Phase 4, finalize (specs/layout-phases.md §3.5): the ordered pass
        // f1 to f16 over the canvas, the axis, the marker band and the
        // chart extent, then the model.
        return finalizeRoadmap(
            new FinalizeContext(file, resolved, options, scope, window, measured, chart),
        );
    }
}
