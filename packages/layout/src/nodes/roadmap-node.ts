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
import { daysBetween } from '../calendar.js';
import { localeStrings } from '../i18n.js';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import type { LayoutContext, LayoutHelpers } from '../layout-context.js';
import { resolveDateWindow, resolveScope } from '../phases/date-window.js';
import { measureRoadmap, setCalendarRuns } from '../phases/measure.js';
import { placeChart } from '../phases/place.js';
import { shiftIncludeY, shiftSwimlaneY } from '../positioned-shift.js';
import type { RoadmapSchedule } from '../schedule.js';
import {
    ATTRIBUTION_GLYPH_HEIGHT,
    ATTRIBUTION_GLYPH_WIDTH,
    GUTTER_PX,
    WAVE_LEGEND_GAP_PX,
} from '../themes/shared.js';
import { TimeScale } from '../time-scale.js';
import type {
    BoundingBox,
    PositionedDependencyEdge,
    PositionedHeader,
    PositionedIncludeRegion,
    PositionedNowline,
    PositionedRoadmap,
    PositionedSwimlane,
} from '../types.js';
import { buildHeaderTicks, tickBoundaryAtOrAfter } from '../view-preset.js';
import { buildAnchors } from './anchor-node.js';
import { maxLeafItemRightX } from './content-extent.js';
import { buildFootnotePanel } from './footnote-node.js';
import { fitIncludeRegionWidth } from './include-node.js';
import {
    calendarMarkerEntries,
    type MarkerEntity,
    markerLabelsRightX,
    markerRowPlacements,
    nonWorkingRunMarkerId,
    packMarkerRow,
    workingExceptionMarkerId,
} from './marker-band.js';
import { MARKER_ROW_PITCH_PX } from './marker-geometry.js';
import { positionMilestones } from './milestone-node.js';
import { buildWaveLegend, buildWaves } from './wave-node.js';

/**
 * The canvas right edge, owned by `RoadmapNode.place` and never part of
 * a `LayoutContext`: placement does not read it. `grow` is the single
 * mutator. Every layout artifact that wants to push the canvas wider
 * passes the absolute X it wants the canvas to contain, with any
 * breathing-room margin (typically `GUTTER_PX`) baked in. Concentrating
 * growth here makes it trivial to grep for every contributor — today:
 * item caption spills, the timeline extension and marker-row labels.
 *
 * The seed is the natural date window with `GUTTER_PX` insets on each
 * side; everything that becomes known after the swimlane pass grows it.
 * The canvas is final after the marker-label growth (P8).
 *
 * The now-pill is intentionally NOT a contributor — when the line
 * lands close to either edge, `buildNowline` switches the pill to
 * "flag" mode (squared edge against the line, rounded edge into the
 * chart), so the pill always fits inside the natural canvas.
 */
class CanvasExtent {
    constructor(private right: number) {}

    grow(rightX: number): void {
        if (rightX > this.right) this.right = rightX;
    }

    get rightX(): number {
        return this.right;
    }
}

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
        const { themeName, theme, locale } = scope;
        const { calendar, preset: scale, startDate, spanDays, nonWorking } = window;

        // Phase 2, measure (specs/layout-phases.md §3.3): the header, the
        // natural axis, the header rows with the marker-band estimate, and
        // the timeline of the natural window.
        const measured = measureRoadmap(file, resolved, options, scope, window);
        const { header: measuredHeader, headerNode, bands, timeline } = measured;
        const { chartLeftX } = measuredHeader;
        const { originX, ppd } = measured.axis;
        const { markerRowY, estimatedMarkerRows: markerRowsCount, estimatedRowsBottomY } = bands;
        const datePinnedEntries = measured.markers.datePinned;
        const hasMarkerEntities = measured.markers.hasEntities;

        // Phase 3, place (specs/layout-phases.md §3.4): the context, the
        // entity-edge seeds, the footnote index, the barrier passes (P1),
        // the corridor rerun (P2), the kept regions (P4), the chart bottom
        // (P5) and the milestones (P6). Placement never reads the canvas.
        const chart = placeChart(resolved, scope, window, measured, deps);
        const { ctx, swimlanes, includes, laneEntries, waveSolve } = chart;
        const milestonePlacements = chart.milestones;

        // The canvas extent: the natural axis, grown first to fit any
        // caption that spilled past its bar (`textSpills`, f1). Otherwise
        // the long captions on narrow charts — e.g. `examples/minimal.svg`
        // and `tests/text-spills-right.svg` — would land outside the SVG's
        // viewBox and clip in browsers. The marker re-pack below sees the
        // expanded width and picks a less aggressive label side.
        const canvas = new CanvasExtent(measured.naturalChartRightX);
        canvas.grow(chart.maxRightX + GUTTER_PX);

        // Post-layout timeline extension. `computeDateWindow`'s pre-pass
        // only knows about logical bar durations; caption spill,
        // dependency slack, and floating (`after:`) markers can push
        // real content further right once the swimlane + include passes
        // run. Measure the rightmost CONTENT BOX edge — leaf item bars
        // (never a spilled caption, see `maxLeafItemRightX`) and marker
        // diamonds — and grow the window to the next tick boundary when
        // content overflows it. Captions may still overhang past the
        // last column; their boxes may not. This is driven purely by
        // boxes, never by `today`, so the `length:`-as-minimum + now-line
        // boundary behavior is unaffected.
        let maxContentRightX = maxLeafItemRightX(swimlanes);
        for (const inc of includes) {
            maxContentRightX = Math.max(maxContentRightX, maxLeafItemRightX(inc.nestedSwimlanes));
        }
        for (const e of datePinnedEntries) {
            maxContentRightX = Math.max(maxContentRightX, e.centerX + e.radius);
        }
        for (const m of milestonePlacements) {
            maxContentRightX = Math.max(maxContentRightX, m.x + m.radius);
        }
        const tickDays = calendar.daysPerUnit(scale.unit);
        // Working-day counts on both sides of the comparison: under `show` x
        // is linear in calendar days, so the overflow is read back through
        // the scale and the window keeps its working-day span.
        const overflowDays = ctx.scale.showsNonWorking
            ? ctx.scale.indexAtX(maxContentRightX)
            : (maxContentRightX - originX) / ppd;
        const paddedDays =
            overflowDays > 0
                ? tickBoundaryAtOrAfter(startDate, overflowDays, scale.unit, tickDays, calendar)
                : 0;
        if (paddedDays > spanDays) {
            const extendedEndDate = calendar.dateAtWorkingIndex(startDate, paddedDays);
            const extendedWidth = ctx.scale.showsNonWorking
                ? daysBetween(startDate, extendedEndDate) * ppd
                : paddedDays * ppd;
            const extendedScale = new TimeScale({
                domain: [startDate, extendedEndDate],
                range: [originX, originX + extendedWidth],
                calendar,
                nonWorking,
            });
            ctx.scale = extendedScale;
            timeline.endDate = extendedEndDate;
            timeline.box.width = extendedWidth;
            timeline.ticks = buildHeaderTicks(extendedScale, scale, calendar, locale);
            setCalendarRuns(timeline, extendedScale, scale.unit);
            canvas.grow(originX + extendedWidth + GUTTER_PX);
        }

        // Every marker (date-pinned anchor, date-pinned milestone,
        // after-only milestone, titled run, working exception) with its final
        // centerX. Calendar labels come from the final runs and exceptions:
        // the extension pass above rebuilt them, so never the pre-pack's copies. A label that fits
        // neither side grows the canvas so the re-pack places it right.
        const allMarkerEntries: MarkerEntity[] = datePinnedEntries.map((e) => ({
            id: e.id,
            centerX: e.centerX,
            radius: e.radius,
            title: e.title,
            fontSize: e.fontSize,
            bold: e.bold,
        }));
        for (const m of milestonePlacements) {
            if (m.fixed) continue;
            allMarkerEntries.push({
                id: m.id,
                centerX: m.x,
                radius: m.radius,
                title: m.title,
                fontSize: 10,
                bold: true,
            });
        }
        const runEntries = calendarMarkerEntries(timeline.nonWorking, timeline.workingExceptions);
        allMarkerEntries.push(...runEntries);
        canvas.grow(
            markerLabelsRightX(allMarkerEntries, chartLeftX, canvas.rightX, deps.estimateTextWidth),
        );

        // The canvas is final from here on. Placement left every width
        // that spans it unset: stretch every band to the canvas so the
        // lane background contains its own spilled captions
        // (text-spills-right's "1w — 50% remaining" would otherwise sit
        // outside it) and reaches the extended tick panel, and fit each
        // include so its right-edge clamp reads the final width.
        const chartRightX = canvas.rightX;
        for (const lane of swimlanes) {
            lane.box.width = chartRightX;
        }
        for (const inc of includes) {
            fitIncludeRegionWidth(inc, chartRightX);
        }

        // Unified marker re-pack over `allMarkerEntries`, so
        // packMarkerRow can sort by tick and assign rows + label sides
        // bottom-first. This is the single source of truth for
        // `ctx.markerRowPlacements`; the pre-pack only existed to size
        // the marker band before swimlanes ran.
        const repacked = packMarkerRow(
            allMarkerEntries,
            chartLeftX,
            chartRightX,
            deps.estimateTextWidth,
        );

        ctx.markerRowPlacements = markerRowPlacements(repacked.placements, markerRowY);

        // Build the positioned milestones from their placements and the
        // re-pack, then push the final placements onto the titled runs,
        // the working exceptions and every marker's entityMidpoints entry
        // (used by edge routing and slack-arrow geometry).
        const milestones = positionMilestones(milestonePlacements, ctx.markerRowPlacements);
        for (const run of timeline.nonWorking ?? []) {
            if (run.label === undefined) continue;
            const placement = ctx.markerRowPlacements.get(nonWorkingRunMarkerId(run));
            if (!placement) continue;
            run.labelBox = placement.labelBox;
            run.labelSide = placement.labelSide;
        }
        for (const exception of timeline.workingExceptions ?? []) {
            const placement = ctx.markerRowPlacements.get(workingExceptionMarkerId(exception));
            if (!placement) continue;
            exception.labelBox = placement.labelBox;
            exception.labelSide = placement.labelSide;
        }
        for (const e of datePinnedEntries) {
            const p = ctx.markerRowPlacements.get(e.id);
            if (!p) continue;
            ctx.entityMidpoints.set(e.id, { x: e.centerX, y: p.centerY });
        }
        for (const m of milestones) {
            if (m.fixed) continue;
            ctx.entityMidpoints.set(m.id ?? '', { x: m.center.x, y: m.center.y });
        }

        // If the unified pack needs more rows than we sized for, grow
        // the marker band and translate every chart coordinate below
        // it. Anchors, edges, nowline, footnotes, and the attribution
        // mark are built AFTER this block so they pick up the new ctx
        // values without further work.
        const actualRowCount =
            hasMarkerEntities || runEntries.length > 0 ? Math.max(1, repacked.rowCount) : 0;
        if (actualRowCount > markerRowsCount) {
            const deltaY = (actualRowCount - markerRowsCount) * MARKER_ROW_PITCH_PX;
            ctx.timeline.markerRow.height = actualRowCount * MARKER_ROW_PITCH_PX;
            ctx.timeline.box.height += deltaY;
            ctx.chartTopY += deltaY;
            ctx.chartBottomY += deltaY;
            ctx.swimlaneBottomY += deltaY;
            // `shiftSwimlaneY` moves every absolute y the positioned model
            // carries (see `positioned-shift.ts`). No LayoutContext map needs
            // a shift: item attach ports are derived from the (now-shifted)
            // boxes in `placedItems` when edges are built below, the edge maps
            // hold X only, itemFlowKey holds strings, marker midpoints and
            // markerRowPlacements are already final, and slackCorridors are
            // pass-2 inputs consumed before this block.
            for (const lane of swimlanes) shiftSwimlaneY(lane, deltaY);
            for (const inc of includes) shiftIncludeY(inc, deltaY);
            for (const m of milestones) {
                m.cutTopY = ctx.chartTopY;
                m.cutBottomY = ctx.swimlaneBottomY;
                // Slack arrows were baked with the pre-shift attach Y
                // when buildMilestones ran above. Shift them now so
                // they land on the same row band as the (now-shifted)
                // predecessor bar.
                if (m.slackArrows) {
                    for (const arrow of m.slackArrows) arrow.y += deltaY;
                }
            }
        }

        // Insert the mirrored bottom tick panel directly above the
        // footnote area, BELOW the chart's last swimlane / include
        // region. Done AFTER any marker-row-growth shift so the panel
        // y honors the final chartBottomY. `timeline.box.height` stays
        // anchored to the chart's bottom edge — grid lines therefore
        // stop at the panel's TOP, not at its bottom — while the panel
        // gets its own fill / border / labels in the renderer. Milestone
        // and anchor cut-lines stay anchored to `swimlaneBottomY` so
        // they never invade the bottom date strip; only the now-line
        // (and full-height major grid lines) thread through this panel.
        if (bands.bottomTickPanelHeight > 0) {
            const gapAbovePanel = 8;
            ctx.timeline.bottomTickPanelY = ctx.chartBottomY + gapAbovePanel;
            ctx.timeline.bottomTickPanelHeight = bands.bottomTickPanelHeight;
            ctx.chartBottomY += gapAbovePanel + bands.bottomTickPanelHeight;
        }

        // Positioned waves (specs/waves.md §8.7): after the extent growth
        // (final scale) and the marker-row shift, so the columns, the
        // boundaries and the crossings read final geometry.
        const strings = localeStrings(locale);
        const builtWaves = ctx.waves
            ? buildWaves(ctx.waves, ctx, strings, swimlanes, includes)
            : undefined;
        if (builtWaves) {
            builtWaves.regionCrossings.forEach((crossings, i) => {
                if (crossings.length > 0) includes[i].waveCrossings = crossings;
            });
            if (builtWaves.placeholder !== undefined && timeline.waveStrip) {
                timeline.waveStrip.placeholder = builtWaves.placeholder;
            }
        }

        const milestoneXs = new Set<number>(milestones.map((m) => m.center.x));
        const anchors = buildAnchors(resolved.content.anchors, ctx, milestoneXs);
        const itemsMap = deps.collectItems(laneEntries);
        const edges = deps.buildDependencies(itemsMap, swimlanes, includes, ctx);

        // Now-line (if today is within the window). Stops at the bottom
        // timeline panel when present, otherwise at the last swimlane —
        // see `buildNowline`. Footnote panels below do not extend it.
        const nowline = deps.buildNowline(options.today, ctx, locale, chartRightX);

        // The wave legend (specs/waves.md §8.8, §9.5) sits below the chart
        // and any bottom tick panel, above the footnotes: grow the chart
        // bottom by its gap and lines before the footnote panel is placed.
        const waveLegend = builtWaves
            ? buildWaveLegend(
                  builtWaves,
                  ctx,
                  strings,
                  ctx.chartBottomY + WAVE_LEGEND_GAP_PX,
                  chartRightX,
              )
            : undefined;
        if (waveLegend) ctx.chartBottomY += WAVE_LEGEND_GAP_PX + waveLegend.box.height;

        // Finalize footnotes at the bottom.
        const footnotePanel = buildFootnotePanel(
            resolved.content.footnotes,
            ctx,
            ctx.chartBottomY,
            chartRightX,
        );

        // Header (depends on chart height in beside-mode and on the
        // final canvas width in above-mode).
        const headerParts = headerNode.place(measuredHeader, {
            rowsBottomY: estimatedRowsBottomY,
            chartBottomY: ctx.chartBottomY,
            canvasRightX: chartRightX,
        });

        // Attribution wordmark placement. Canvas grows by GUTTER_PX +
        // glyph height + GUTTER_PX so the wordmark sits in a clean bottom
        // margin below all content (last swimlane / footnote panel /
        // include region). Today only the bottom-right slot fires, but
        // the priority order is bottom-right → upper-right → bottom-left
        // — when content density makes bottom-right disruptive in some
        // future case, fall back to upper-right (above the timeline) and
        // then bottom-left (under the header card in beside-mode).
        //
        // When there are no footnotes, `footnotePanel.box` still carries a 16 px
        // top-of-panel offset; that's a placeholder for the footnote
        // header gap and shouldn't push the attribution down. Use the
        // bare `chartBottomY` in that case so the bottom margin is
        // exactly `GUTTER_PX + glyphHeight + GUTTER_PX`.
        const contentBottomY =
            footnotePanel.entries.length > 0
                ? footnotePanel.box.y + footnotePanel.box.height
                : ctx.chartBottomY;
        const attributionBox: BoundingBox = {
            x: chartRightX - GUTTER_PX - ATTRIBUTION_GLYPH_WIDTH,
            y: contentBottomY + GUTTER_PX,
            width: ATTRIBUTION_GLYPH_WIDTH,
            height: ATTRIBUTION_GLYPH_HEIGHT,
        };
        const height = attributionBox.y + attributionBox.height + GUTTER_PX;

        const header: PositionedHeader = { ...headerParts, attributionBox };

        const model: PositionedRoadmap = {
            width: chartRightX,
            height,
            theme: themeName,
            palette: theme,
            backgroundColor: theme.surface.page,
            header,
            timeline,
            nowline,
            swimlanes,
            anchors,
            milestones,
            edges,
            footnotes: footnotePanel,
            includes,
            chartBox: {
                x: chartLeftX,
                y: ctx.chartTopY,
                width: chartRightX - chartLeftX,
                height: ctx.chartBottomY - ctx.chartTopY,
            },
            ...(waveSolve ? { waveSolve } : {}),
            ...(builtWaves ? { waves: builtWaves.waves } : {}),
            ...(builtWaves && builtWaves.boundaries.length > 0
                ? { waveBoundaries: builtWaves.boundaries }
                : {}),
            ...(builtWaves && builtWaves.crossings.length > 0
                ? { waveCrossings: builtWaves.crossings }
                : {}),
            ...(waveLegend ? { waveLegend } : {}),
        };
        return model;
    }
}
