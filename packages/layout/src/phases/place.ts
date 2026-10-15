// Phase 3, place (specs/layout-phases.md §3.4): the root context, the
// entity-edge seeds from the date-pinned markers, the footnote index, the
// lanes inside the wave barrier driver (P1), the corridor rerun (P2), the
// kept isolated regions (P4), the chart bottom (P5) and the milestones (P6).
//
// Placement never reads the canvas: lanes leave their width to finalize,
// regions are fitted only there, and milestones get their marker row and
// label box from the final pack. It places on the natural scale, which
// finalize may extend but never re-places on.

import type { ResolveResult, SwimlaneDeclaration } from '@nowline/core';
import { AxisColumns } from '../axis-columns.js';
import { defaultRowBand } from '../band-scale.js';
import { localeStrings } from '../i18n.js';
import { createLayoutContext, type LayoutContext, type LayoutHelpers } from '../layout-context.js';
import { indexFootnotes } from '../nodes/footnote-node.js';
import { buildIncludeRegions } from '../nodes/include-node.js';
import {
    buildMilestones,
    collectSlackCorridors,
    type MilestonePlacement,
} from '../nodes/milestone-node.js';
import { SwimlaneNode } from '../nodes/swimlane-node.js';
import type { RoadmapSchedule } from '../schedule.js';
import { isScheduleWarmStart } from '../start-rules.js';
import { resolveStyle } from '../style-resolution.js';
import { SPACING_PX } from '../themes/shared.js';
import type { TimeScale } from '../time-scale.js';
import type { PositionedIncludeRegion, PositionedRoadmap, PositionedSwimlane } from '../types.js';
import { solveWaveBarriers, type WaveBarrierSeed } from '../wave-barrier.js';
import {
    beginWavePass,
    createWaveLayoutState,
    freezeWaves,
    seedWaveEdges,
    WAVE_EDGE_TOLERANCE_PX,
} from '../wave-layout.js';
import type { DateWindow, RoadmapScope } from './date-window.js';
import type { MeasuredRoadmap } from './measure.js';

/** Gap (px) between the last lane and the first isolated region's tab. */
const LANES_TO_REGIONS_GAP_PX = 8;

export interface PlacedChart {
    /** Entity maps and placed items of the kept pass; finalize reads them, never writes placements. */
    ctx: LayoutContext;
    swimlanes: PositionedSwimlane[];
    includes: PositionedIncludeRegion[];
    /** x, slack arrows and overrun; f6 adds the row and label box and builds `PositionedMilestone`. */
    milestones: MilestonePlacement[];
    laneEntries: SwimlaneDeclaration[];
    /** Rightmost bar or spilled caption of the kept lane pass. */
    maxRightX: number;
    /** Bottom of the last lane or region (P5). */
    bottomY: number;
    waveSolve?: PositionedRoadmap['waveSolve'];
}

export function placeChart(
    resolved: ResolveResult,
    scope: RoadmapScope,
    window: DateWindow,
    measured: MeasuredRoadmap,
    helpers: LayoutHelpers,
): PlacedChart {
    const { theme, styleCtx } = scope;
    const { cal, calendar, schedule } = window;
    const plan = schedule.plan;
    const { originX, scale: timeScale } = measured.axis;
    const { timeline, bands } = measured;

    // Footnotes index must exist before sequencing items reference
    // them.
    const ctx = createLayoutContext(
        resolved,
        {
            theme,
            cal,
            schedule,
            timeline,
            scale: timeScale,
            calendar,
            axisColumns: new AxisColumns(window, timeScale),
            bandScale: defaultRowBand(),
            waves: plan
                ? createWaveLayoutState(
                      plan,
                      timeScale,
                      originX,
                      localeStrings(scope.locale).waveBackgroundItem,
                  )
                : undefined,
        },
        {
            chartTopY: bands.chartTopY,
            chartBottomY: 0,
            swimlaneBottomY: 0,
        },
        {
            footnotes: indexFootnotes(resolved.content.footnotes),
            // A copy: the final pack (P10) replaces the context's
            // placements, and the estimate stays as measured.
            markerRowPlacements: new Map(measured.markers.placements),
        },
    );

    // Seed the entity-edge maps from the date-pinned pack so item
    // `after:kickoff` references resolve before swimlanes run. Mid
    // points use the row-aware centerY so dependency arrows from the
    // anchor land on the diamond's actual row.
    for (const e of measured.markers.datePinned) {
        const placement = ctx.markerRowPlacements.get(e.id);
        if (!placement) continue;
        ctx.entityLeftEdges.set(e.id, e.centerX);
        ctx.entityRightEdges.set(e.id, e.centerX);
        ctx.entityMidpoints.set(e.id, { x: e.centerX, y: placement.centerY });
    }

    // Snapshot the entity maps after pre-positioning so we can reset
    // them between the two swimlane passes. Date-pinned anchors and
    // milestones live in this baseline; item-derived entries get
    // re-added on each pass.
    const baselineEntityLeft = new Map(ctx.entityLeftEdges);
    const baselineEntityRight = new Map(ctx.entityRightEdges);
    const baselineEntityMid = new Map(ctx.entityMidpoints);
    // Item-only maps don't carry baseline entries (date-pinned
    // markers are never placed items), so pass-2 reruns reset them
    // to fresh empties. With waves, every reset re-seeds the wave
    // edges (`entityRightEdges[w_k] = E_k`, `entityLeftEdges[w_k] =
    // S_k`) on top of the baseline, so forward references stay
    // dropped exactly as they are without waves.
    const resetEntityMaps = (): void => {
        ctx.entityLeftEdges = new Map(baselineEntityLeft);
        ctx.entityRightEdges = new Map(baselineEntityRight);
        ctx.entityMidpoints = new Map(baselineEntityMid);
        // placedItems and itemFlowKey only ever hold item entries
        // (markers never write to them), so a fresh map is the right
        // reset: the next pass's items will repopulate.
        ctx.placedItems = new Map();
        ctx.itemFlowKey = new Map();
        ctx.currentFlowKey = '';
        if (ctx.waves) seedWaveEdges(ctx.waves, ctx.entityLeftEdges, ctx.entityRightEdges);
    };

    // Build swimlanes (declared order). Inter-band gap comes from
    // the swimlane default style's `spacing` bucket. Default
    // `spacing: none` keeps existing samples byte-stable; bumping to
    // `md` introduces an 8 px gap.
    const laneEntries = [...resolved.content.swimlanes.values()];
    const swimlaneDefaultStyle = resolveStyle('swimlane', [], styleCtx);
    const interBandGapPx = SPACING_PX[swimlaneDefaultStyle.spacing as keyof typeof SPACING_PX] ?? 0;

    const runSwimlaneLoop = (): {
        swimlanes: PositionedSwimlane[];
        nextY: number;
        maxRightX: number;
    } => {
        ctx.nextParallelId = 0;
        ctx.nextGroupId = 0;
        const out: PositionedSwimlane[] = [];
        let cursorY = ctx.chartTopY;
        let bIndex = 0;
        let maxRightX = ctx.timeline.originX;
        for (const lane of laneEntries) {
            if (bIndex > 0) cursorY += interBandGapPx;
            const { positioned, usedHeight, usedRightX } = new SwimlaneNode(
                { lane, bandIndex: bIndex },
                helpers,
            ).place({ x: ctx.timeline.originX, y: cursorY }, ctx);
            out.push(positioned);
            cursorY += usedHeight;
            if (usedRightX > maxRightX) maxRightX = usedRightX;
            bIndex++;
        }
        return { swimlanes: out, nextY: cursorY, maxRightX };
    };

    const isolated = resolved.content.isolatedRegions;

    // Pass 1 — place items without corridor knowledge. With waves
    // (specs/waves.md §8.3-§8.4) it is the barrier driver's pass
    // loop: each pass resets the maps, re-seeds the wave edges, places
    // the lanes with the pass's floors, then places the isolated
    // regions only to accumulate their members (those region
    // placements are discarded). The driver iterates to the least
    // fixpoint; its last pass ran with the solved S/E, so its lane
    // placements are kept.
    let pass: ReturnType<typeof runSwimlaneLoop>;
    let waveSolve: PositionedRoadmap['waveSolve'];
    const waves = ctx.waves;
    if (waves) {
        let last: ReturnType<typeof runSwimlaneLoop> | undefined;
        // Warm start (specs/scheduler-unification.md §5, F4): engine C's
        // `S_k` and `E_k`, projected, are a lower bound of engine A's, so
        // the passes start from them and settle on the same fixpoint in
        // fewer passes.
        const seed = isScheduleWarmStart() ? waveSeed(waves.ids, schedule, timeScale) : undefined;
        const solved = solveWaveBarriers(
            waves.ids.length,
            waves.origin,
            waves.floors,
            (S, E) => {
                beginWavePass(waves, S, E);
                resetEntityMaps();
                last = runSwimlaneLoop();
                if (isolated.length > 0) {
                    buildIncludeRegions(
                        isolated,
                        ctx,
                        last.nextY + LANES_TO_REGIONS_GAP_PX,
                        helpers,
                    );
                }
                return waves.pass;
            },
            WAVE_EDGE_TOLERANCE_PX,
            seed,
        );
        // From here on the barrier is frozen: later placements floor
        // with the solved S/E and accumulate nothing.
        freezeWaves(waves, solved);
        waveSolve = { passes: solved.passes, capped: solved.capped };
        pass = last as ReturnType<typeof runSwimlaneLoop>;
    } else {
        pass = runSwimlaneLoop();
    }
    let swimlanes = pass.swimlanes;
    let y = pass.nextY;

    // Collect slack-arrow corridors from the milestones (mirrors
    // MilestoneNode.place's pred resolution). When the result is
    // non-empty, an item sat inside an arrow's path on pass 1 — rerun
    // the swimlane loop with corridors known so the row-packer can
    // bump the offending items down to a clear row. Bumping never
    // changes an item's x, so corridors stay valid across the rerun;
    // no fixed-point iteration needed. With waves the rerun runs once,
    // after the barrier has settled: it floors with the frozen S/E,
    // and the reset re-seeds the wave edges.
    const corridors = collectSlackCorridors(resolved.content.milestones, ctx);
    if (corridors.length > 0) {
        resetEntityMaps();
        ctx.slackCorridors = corridors;
        pass = runSwimlaneLoop();
        swimlanes = pass.swimlanes;
        y = pass.nextY;
    }

    // Include regions under the swimlanes. Reserve the 8 px gap +
    // tab-reserve only when there's at least one isolated region —
    // otherwise the now-line and chart bottom would extend past the
    // last swimlane into empty space. With waves this is the one kept
    // region placement, floored with the frozen S/E.
    let includes: PositionedIncludeRegion[] = [];
    if (isolated.length > 0) {
        const r = buildIncludeRegions(isolated, ctx, y + LANES_TO_REGIONS_GAP_PX, helpers);
        includes = r.regions;
        y = r.endY;
    }

    ctx.chartBottomY = y;
    ctx.swimlaneBottomY = y;
    timeline.box.height = ctx.chartBottomY - timeline.box.y;

    // Milestones first so anchors know which xs are occupied (for
    // collision bumps). Placement gives each its x, slack arrows and
    // overrun; its marker row and label box come from the final pack in
    // finalize, once every centerX is known and the canvas is final.
    const milestones = buildMilestones(resolved.content.milestones, ctx);

    return {
        ctx,
        swimlanes,
        includes,
        milestones,
        laneEntries,
        maxRightX: pass.maxRightX,
        bottomY: y,
        ...(waveSolve ? { waveSolve } : {}),
    };
}

/**
 * The barrier driver's warm start: engine C's wave spans projected to px
 * (`start` is `S_k`; the exclusive `end` projects to `E_k`). A wave C did
 * not schedule seeds nothing.
 */
function waveSeed(
    ids: readonly string[],
    schedule: RoadmapSchedule,
    scale: TimeScale,
): WaveBarrierSeed {
    const spans = ids.map((id) => schedule.waves?.get(id));
    return {
        S: spans.map((w) => (w ? scale.forward(w.start) : null)),
        E: spans.map((w) => (w ? scale.forward(w.end) : null)),
    };
}
