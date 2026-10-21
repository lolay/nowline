// IncludeNode + buildIncludeRegions — render isolated `include {}`
// regions stacked under the main swimlanes. Each region runs its own
// SwimlaneNode pass against the parent's TimeScale so dates align
// vertically with the tick row above the region. The label tab is
// reserved 18 px above the first region; subsequent regions are
// separated by GAP_BETWEEN_REGIONS px.

import type { IsolatedRegion } from '@nowline/core';
import { translateSwimlaneY } from '../chart-translation.js';
import { includeChromeGeometry } from '../include-chrome-geometry.js';
import { createLayoutContext, type LayoutContext, type LayoutHelpers } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type { BoundingBox, PositionedIncludeRegion, PositionedSwimlane } from '../types.js';
import { seedWaveEdges } from '../wave-layout.js';
import { maxLeafItemRightX } from './content-extent.js';
import { indexFootnotes } from './footnote-node.js';
import {
    placeRegionMarkers,
    regionMarkerLabelsRightX,
    seedRegionAnchorEdges,
} from './region-markers.js';
import { SwimlaneNode } from './swimlane-node.js';

const TAB_RESERVE = 18;
const REGION_INSET_TOP = 14;
const REGION_INSET_BOTTOM = 14;
const GAP_BETWEEN_REGIONS = 16;

// Visual breathing room added past the rightmost element when sizing
// the include's bounding box. The rightmost element is the diagram's, not
// the region's own: every region reaches the same edge, past the furthest
// bar or spilled caption anywhere in the chart.
const INCLUDE_CONTENT_RIGHT_PAD_PX = 32;

export function buildIncludeRegions(
    regions: IsolatedRegion[],
    ctx: LayoutContext,
    startY: number,
    helpers: LayoutHelpers,
    chartRightX: number,
): { regions: PositionedIncludeRegion[]; contexts: LayoutContext[]; endY: number } {
    let y = startY + TAB_RESERVE;
    const out: PositionedIncludeRegion[] = [];
    const contexts: LayoutContext[] = [];
    let isFirst = true;
    // Region footnotes number on after the host's, in include order.
    let footnotesBefore = ctx.footnoteIndex.size;
    for (const region of regions) {
        if (!isFirst) y += GAP_BETWEEN_REGIONS;
        isFirst = false;
        const label = region.content.roadmap?.title ?? region.sourcePath;
        const innerStartY = y + REGION_INSET_TOP;
        const childCtx = createLayoutContext(
            region,
            {
                theme: ctx.styleCtx.theme,
                cal: ctx.cal,
                schedule: ctx.schedule,
                timeline: ctx.timeline,
                scale: ctx.scale,
                calendar: ctx.calendar,
                axisColumns: ctx.axisColumns,
                bandScale: ctx.bandScale,
                waves: ctx.waves,
            },
            {
                chartTopY: innerStartY,
                chartBottomY: innerStartY,
                swimlaneBottomY: innerStartY,
            },
            { footnotes: indexFootnotes(region.content.footnotes, footnotesBefore) },
        );
        footnotesBefore += region.content.footnotes.size;
        // Region ids stay invisible to the host, but the wave edges are
        // shared: seed them into the region's otherwise empty edge maps.
        // Without waves, the region's own dated anchors resolve inside it
        // instead, as engine C's `scheduleRegion` resolves them, so a lane
        // `after:kickoff` naming the region's anchor starts on its date
        // (specs/scheduler-unification.md §5 F5).
        if (ctx.waves) {
            seedWaveEdges(ctx.waves, childCtx.entityLeftEdges, childCtx.entityRightEdges);
        } else {
            seedRegionAnchorEdges(region.content.anchors, childCtx);
        }
        const nestedSwimlanes: PositionedSwimlane[] = [];
        let cursorY = innerStartY;
        let bandIndex = 0;
        for (const lane of region.content.swimlanes.values()) {
            childCtx.nextParallelId = 0;
            childCtx.nextGroupId = 0;
            const { positioned, usedHeight } = new SwimlaneNode({ lane, bandIndex }, helpers).place(
                { x: childCtx.timeline.originX, y: cursorY },
                childCtx,
            );
            nestedSwimlanes.push(positioned);
            cursorY += usedHeight;
            bandIndex++;
        }
        // The region's own anchors and milestones take a marker row under
        // its label tab, and the lanes move down below it.
        const markers = placeRegionMarkers(region, childCtx, y, innerStartY, cursorY, chartRightX);
        if (markers.laneShift !== 0) {
            for (const lane of nestedSwimlanes) translateSwimlaneY(lane, markers.laneShift);
            cursorY += markers.laneShift;
        }
        const innerEndY = cursorY;
        // Floor the region height to one row's bandwidth so an empty or
        // tiny include still presents as a visible band — `bandwidth()`
        // tracks whatever the host theme uses for swimlane row height.
        const regionHeight = Math.max(
            ctx.bandScale.bandwidth(),
            innerEndY - y + REGION_INSET_BOTTOM,
        );
        // The width waits for the final canvas: finalize (f4) fits every
        // kept region with `fitIncludeRegionWidth` once the canvas stops
        // growing, so placement never reads the canvas.
        const box: BoundingBox = {
            x: 0,
            y,
            width: 0,
            height: regionHeight,
        };
        const positioned: PositionedIncludeRegion = {
            sourcePath: region.sourcePath,
            label,
            box,
            nestedSwimlanes,
            style: resolveStyle('swimlane', [], ctx.styleCtx),
        };
        if (markers.anchors.length > 0) positioned.anchors = markers.anchors;
        if (markers.milestones.length > 0) positioned.milestones = markers.milestones;
        out.push(positioned);
        contexts.push(childCtx);
        y += regionHeight;
    }
    return { regions: out, contexts, endY: y };
}

/**
 * Size an include's bounding box to the diagram's content: it reaches past
 * `contentRightX`, the furthest bar or spilled caption anywhere in the
 * chart (and past its own chrome and marker labels), by a small right pad,
 * so every region in a chart ends at the same edge (specs/rendering.md,
 * Included Roadmaps). It is clamped to `chartRightX`;
 * finalize grows the canvas to hold the pad first (f3). Finalize runs it
 * once per kept region (f4), after the canvas width is final: the spill
 * growth, the timeline extension and the marker labels can all still grow
 * the canvas after the region is placed.
 */
export function fitIncludeRegionWidth(
    region: PositionedIncludeRegion,
    chartRightX: number,
    contentRightX: number,
): void {
    const boxWidth = includeRegionWidth(region, chartRightX, contentRightX);
    region.box.width = boxWidth;
    // Mirror the shrunk width onto each nested swimlane band so the
    // tinted background fits inside the dashed bracket instead of
    // bleeding past it on the right.
    for (const lane of region.nestedSwimlanes) {
        lane.box.width = boxWidth;
    }
}

/**
 * The width `fitIncludeRegionWidth` gives `region` on a canvas ending at
 * `chartRightX`, with the diagram's content ending at `contentRightX`.
 */
export function includeRegionWidth(
    region: PositionedIncludeRegion,
    chartRightX: number,
    contentRightX: number,
): number {
    const boxX = region.box.x;
    const { chromeRightX } = includeChromeGeometry(boxX, region.label, region.sourcePath);
    // Bars-only extent (never a spilled caption — see
    // `maxLeafItemRightX`), so a long trailing item caption inside
    // the include can overhang the dashed bracket instead of
    // dragging it wider.
    const barsRightX = maxLeafItemRightX(region.nestedSwimlanes);
    const naturalRightX =
        Math.max(chromeRightX, barsRightX, regionMarkerLabelsRightX(region), contentRightX) +
        INCLUDE_CONTENT_RIGHT_PAD_PX;
    return Math.min(chartRightX - boxX, naturalRightX - boxX);
}
