// IncludeNode + buildIncludeRegions — render isolated `include {}`
// regions stacked under the main swimlanes. Each region runs its own
// SwimlaneNode pass against the parent's TimeScale so dates align
// vertically with the tick row above the region. The label tab is
// reserved 18 px above the first region; subsequent regions are
// separated by GAP_BETWEEN_REGIONS px.

import type { IsolatedRegion } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type {
    PositionedIncludeRegion,
    PositionedSwimlane,
    BoundingBox,
} from '../types.js';
import type { LayoutContext, TrackCursor } from '../layout-context.js';
import type { PositionedItem, PositionedTrackChild } from '../types.js';
import type { ItemDeclaration, GroupBlock, ParallelBlock, EntityProperty } from '@nowline/core';
import { SwimlaneNode } from './swimlane-node.js';
import { includeChromeGeometry } from '../include-chrome-geometry.js';

const TAB_RESERVE = 18;
const REGION_INSET_TOP = 14;
const REGION_INSET_BOTTOM = 14;
const GAP_BETWEEN_REGIONS = 16;

// Visual breathing room added past the rightmost element when sizing
// the include's bounding box. Keeps the dashed bracket from butting up
// against an item's right edge while still trimming the wide
// chart-width whitespace left over from full-width sizing.
const INCLUDE_CONTENT_RIGHT_PAD_PX = 32;

export interface IncludeNodeDeps {
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
    predictItemChipExtraHeight: (item: ItemDeclaration, ctx: LayoutContext) => number;
}

export function buildIncludeRegions(
    regions: IsolatedRegion[],
    ctx: LayoutContext,
    startY: number,
    deps: IncludeNodeDeps,
): { regions: PositionedIncludeRegion[]; endY: number } {
    let y = startY + TAB_RESERVE;
    const out: PositionedIncludeRegion[] = [];
    let isFirst = true;
    for (const region of regions) {
        if (!isFirst) y += GAP_BETWEEN_REGIONS;
        isFirst = false;
        const label = region.content.roadmap?.title ?? region.sourcePath;
        const innerStartY = y + REGION_INSET_TOP;
        const childCtx: LayoutContext = {
            cal: ctx.cal,
            styleCtx: {
                theme: ctx.styleCtx.theme,
                styles: region.config.styles,
                defaults: region.config.defaults,
                labels: region.content.labels,
            },
            durations: region.content.durations,
            labels: region.content.labels,
            teams: region.content.teams,
            persons: region.content.persons,
            glyphs: region.config.glyphs,
            footnoteIndex: new Map(),
            footnoteHosts: new Map(),
            timeline: ctx.timeline,
            scale: ctx.scale,
            calendar: ctx.calendar,
            bandScale: ctx.bandScale,
            entityLeftEdges: new Map(),
            entityRightEdges: new Map(),
            entityMidpoints: new Map(),
            itemSlackAttachY: new Map(),
            slackCorridors: [],
            markerRowPlacements: new Map(),
            chartTopY: innerStartY,
            chartBottomY: innerStartY,
            chartRightX: ctx.chartRightX,
        };
        const nestedSwimlanes: PositionedSwimlane[] = [];
        let cursorY = innerStartY;
        let bandIndex = 0;
        let nestedContentRightX = childCtx.timeline.originX;
        for (const lane of region.content.swimlanes.values()) {
            const { positioned, usedHeight, usedRightX } = new SwimlaneNode(
                { lane, bandIndex },
                deps,
            ).place({ x: childCtx.timeline.originX, y: cursorY }, childCtx);
            nestedSwimlanes.push(positioned);
            cursorY += usedHeight;
            bandIndex++;
            if (usedRightX > nestedContentRightX) nestedContentRightX = usedRightX;
        }
        const innerEndY = cursorY;
        // Floor the region height to one row's bandwidth so an empty or
        // tiny include still presents as a visible band — `bandwidth()`
        // tracks whatever the host theme uses for swimlane row height.
        const regionHeight = Math.max(
            ctx.bandScale.bandwidth(),
            innerEndY - y + REGION_INSET_BOTTOM,
        );
        // Shrink-wrap the include's bounding box to fit chrome + content
        // (with a small right pad) instead of stretching to the full
        // chart width. An include that reaches past the timeline still
        // gets clamped to the chart's natural right edge so it never
        // extends into the attribution / right-margin area.
        const boxX = 0;
        const { chromeRightX } = includeChromeGeometry(boxX, label, region.sourcePath);
        const naturalRightX = Math.max(chromeRightX, nestedContentRightX) + INCLUDE_CONTENT_RIGHT_PAD_PX;
        const boxWidth = Math.min(ctx.chartRightX - boxX, naturalRightX - boxX);
        const box: BoundingBox = {
            x: boxX,
            y,
            width: boxWidth,
            height: regionHeight,
        };
        // Mirror the shrunk width onto each nested swimlane band so the
        // tinted background fits inside the dashed bracket instead of
        // bleeding past it on the right.
        for (const lane of nestedSwimlanes) {
            lane.box.width = boxWidth;
        }
        out.push({
            sourcePath: region.sourcePath,
            label,
            box,
            nestedSwimlanes,
            style: resolveStyle('swimlane', [], ctx.styleCtx),
        });
        y += regionHeight;
    }
    return { regions: out, endY: y };
}
