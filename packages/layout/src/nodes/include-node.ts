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

const TAB_RESERVE = 18;
const REGION_INSET_TOP = 14;
const REGION_INSET_BOTTOM = 14;
const GAP_BETWEEN_REGIONS = 16;

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
        for (const lane of region.content.swimlanes.values()) {
            const { positioned, usedHeight } = new SwimlaneNode(
                { lane, bandIndex },
                deps,
            ).place({ x: childCtx.timeline.originX, y: cursorY }, childCtx);
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
            width: ctx.chartRightX,
            height: regionHeight,
        };
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
