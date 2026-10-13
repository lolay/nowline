// IncludeNode + buildIncludeRegions — render isolated `include {}`
// regions stacked under the main swimlanes. Each region runs its own
// SwimlaneNode pass against the parent's TimeScale so dates align
// vertically with the tick row above the region. The label tab is
// reserved 18 px above the first region; subsequent regions are
// separated by GAP_BETWEEN_REGIONS px.

import type { IsolatedRegion } from '@nowline/core';
import { includeChromeGeometry } from '../include-chrome-geometry.js';
import { createLayoutContext, type LayoutContext, type LayoutHelpers } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type { BoundingBox, PositionedIncludeRegion, PositionedSwimlane } from '../types.js';
import { seedWaveEdges } from '../wave-layout.js';
import { maxLeafItemRightX } from './content-extent.js';
import { SwimlaneNode } from './swimlane-node.js';

const TAB_RESERVE = 18;
const REGION_INSET_TOP = 14;
const REGION_INSET_BOTTOM = 14;
const GAP_BETWEEN_REGIONS = 16;

// Visual breathing room added past the rightmost element when sizing
// the include's bounding box. Keeps the dashed bracket from butting up
// against an item's right edge while still trimming the wide
// chart-width whitespace left over from full-width sizing.
const INCLUDE_CONTENT_RIGHT_PAD_PX = 32;

export function buildIncludeRegions(
    regions: IsolatedRegion[],
    ctx: LayoutContext,
    startY: number,
    deps: LayoutHelpers,
): { regions: PositionedIncludeRegion[]; endY: number } {
    let y = startY + TAB_RESERVE;
    const out: PositionedIncludeRegion[] = [];
    let isFirst = true;
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
                bandScale: ctx.bandScale,
                waves: ctx.waves,
            },
            {
                chartTopY: innerStartY,
                chartBottomY: innerStartY,
                swimlaneBottomY: innerStartY,
                chartRightX: ctx.chartRightX,
            },
            {},
        );
        // Region ids stay invisible to the host, but the wave edges are
        // shared: seed them into the region's otherwise empty edge maps.
        if (ctx.waves) {
            seedWaveEdges(ctx.waves, childCtx.entityLeftEdges, childCtx.entityRightEdges);
        }
        const nestedSwimlanes: PositionedSwimlane[] = [];
        let cursorY = innerStartY;
        let bandIndex = 0;
        for (const lane of region.content.swimlanes.values()) {
            childCtx.nextParallelId = 0;
            childCtx.nextGroupId = 0;
            const { positioned, usedHeight } = new SwimlaneNode({ lane, bandIndex }, deps).place(
                { x: childCtx.timeline.originX, y: cursorY },
                childCtx,
            );
            nestedSwimlanes.push(positioned);
            cursorY += usedHeight;
            bandIndex++;
        }
        const innerEndY = cursorY;
        // Floor the region height to one row's bandwidth so an empty or
        // tiny include still presents as a visible band — `bandwidth()`
        // tracks whatever the host theme uses for swimlane row height.
        const regionHeight = Math.max(
            ctx.bandScale.bandwidth(),
            innerEndY - y + REGION_INSET_BOTTOM,
        );
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
        fitIncludeRegionWidth(positioned, ctx.chartRightX);
        out.push(positioned);
        y += regionHeight;
    }
    return { regions: out, endY: y };
}

/**
 * Shrink-wrap an include's bounding box to fit chrome + content (with a
 * small right pad) instead of stretching to the full chart width. An
 * include that reaches past the timeline still gets clamped to
 * `chartRightX` so it never extends into the attribution / right-margin
 * area. Idempotent for a given `chartRightX`; `RoadmapNode` re-runs it
 * once the canvas width is final, since the clamp reads the width at
 * build time and the post-layout timeline extension can still grow it.
 */
export function fitIncludeRegionWidth(region: PositionedIncludeRegion, chartRightX: number): void {
    const boxX = region.box.x;
    const { chromeRightX } = includeChromeGeometry(boxX, region.label, region.sourcePath);
    // Bars-only extent (never a spilled caption — see
    // `maxLeafItemRightX`), so a long trailing item caption inside
    // the include can overhang the dashed bracket instead of
    // dragging it wider.
    const barsRightX = maxLeafItemRightX(region.nestedSwimlanes);
    const naturalRightX = Math.max(chromeRightX, barsRightX) + INCLUDE_CONTENT_RIGHT_PAD_PX;
    const boxWidth = Math.min(chartRightX - boxX, naturalRightX - boxX);
    region.box.width = boxWidth;
    // Mirror the shrunk width onto each nested swimlane band so the
    // tinted background fits inside the dashed bracket instead of
    // bleeding past it on the right.
    for (const lane of region.nestedSwimlanes) {
        lane.box.width = boxWidth;
    }
}
