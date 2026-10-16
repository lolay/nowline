// Region markers — an isolated region's own anchors and milestones, drawn
// in a marker row of the region's own, under its label tab
// (specs/rendering.md § Included Roadmap Region). The row packs with the
// host's packer and label rules, bounded by the region's dashed border
// instead of the chart; the region's lanes move down by its height, and
// each cut line stops at the region's last lane.

import type { AnchorDeclaration, IsolatedRegion } from '@nowline/core';
import type { LayoutContext } from '../layout-context.js';
import { estimateTextWidth } from '../text-measure.js';
import type { PositionedAnchor, PositionedIncludeRegion, PositionedMilestone } from '../types.js';
import { buildAnchors } from './anchor-node.js';
import {
    datePinnedMarkerEntries,
    type MarkerEntity,
    markerLabelsRightX,
    markerRowPlacements,
    packMarkerRow,
} from './marker-band.js';
import { MARKER_ROW_PITCH_PX } from './marker-geometry.js';
import { buildMilestones, type MilestonePlacement, positionMilestones } from './milestone-node.js';

/**
 * How far a region's marker labels stay inside the region box on either
 * side: the renderer's 8 px border inset plus 8 px of air.
 */
export const REGION_MARKER_INSET_X_PX = 16;

/** The region marker band's top, below the region's top border. */
const REGION_MARKER_BAND_TOP_PX = 8;

/** Air between the region marker band and the region's first lane. */
const REGION_MARKER_BAND_GAP_PX = 6;

/** A region's placed markers and how far its lanes move down for them. */
export interface RegionMarkers {
    anchors: PositionedAnchor[];
    milestones: PositionedMilestone[];
    /** The lanes' shift: 0 when the region has no marker to draw. */
    laneShift: number;
}

/**
 * Place `region`'s anchors and milestones once its lanes are laid out
 * from `lanesTopY` down to `lanesBottomY`, inside a region whose top
 * border is at `regionTopY`. The pack is bounded by the region's left
 * inset and by `chartRightX` (the canvas before finalize grows it) less
 * the right inset; a label that fits on neither side packs to the right
 * and finalize f3 grows the canvas for it (`regionMarkerCanvasRightX`).
 * The caller shifts the lanes by `laneShift`.
 */
export function placeRegionMarkers(
    region: IsolatedRegion,
    ctx: LayoutContext,
    regionTopY: number,
    lanesTopY: number,
    lanesBottomY: number,
    chartRightX: number,
): RegionMarkers {
    // A milestone `after:` an anchor reads the anchor's edge. Without waves
    // the edges are already seeded for the lanes; with waves they are
    // seeded here, after the lanes, so the lanes still see only the wave
    // edges.
    seedRegionAnchorEdges(region.content.anchors, ctx);
    const placements = buildMilestones(region.content.milestones, ctx);
    const entries = regionMarkerEntries(region.content.anchors, placements, ctx);
    if (entries.length === 0) return { anchors: [], milestones: [], laneShift: 0 };

    const leftX = REGION_MARKER_INSET_X_PX;
    const packed = packMarkerRow(
        entries,
        leftX,
        markerLabelsRightX(
            entries,
            leftX,
            chartRightX - REGION_MARKER_INSET_X_PX,
            estimateTextWidth,
        ),
        estimateTextWidth,
    );
    const bandTopY = regionTopY + REGION_MARKER_BAND_TOP_PX;
    const laneShift =
        bandTopY + packed.rowCount * MARKER_ROW_PITCH_PX + REGION_MARKER_BAND_GAP_PX - lanesTopY;
    const cutBottomY = lanesBottomY + laneShift;

    const rows = markerRowPlacements(packed.placements, bandTopY);
    ctx.markerRowPlacements = rows;
    ctx.chartTopY = lanesTopY + laneShift;
    ctx.swimlaneBottomY = cutBottomY;
    const anchors = buildAnchors(region.content.anchors, ctx, new Set());
    // Placement read each predecessor's y before the lanes moved.
    const milestones = positionMilestones(
        placements.map((p) => ({
            ...p,
            cutTopY: ctx.chartTopY,
            cutBottomY,
            slackArrows: p.slackArrows?.map((a) => ({ x: a.x, y: a.y + laneShift })),
        })),
        rows,
    );
    return { anchors, milestones, laneShift };
}

/**
 * The canvas right edge `region`'s marker labels need: a label that fits
 * on neither side of its marker inside the region's insets grows the
 * canvas until it fits on the right, the host's marker-row rule. Returns
 * `chartRightX` when every label fits.
 */
export function regionMarkerCanvasRightX(
    region: PositionedIncludeRegion,
    chartRightX: number,
): number {
    const entries: MarkerEntity[] = [
        ...(region.anchors ?? []).map((a) => positionedEntry(a, false)),
        ...(region.milestones ?? []).map((m) => positionedEntry(m, true)),
    ];
    if (entries.length === 0) return chartRightX;
    const rightX = markerLabelsRightX(
        entries,
        region.box.x + REGION_MARKER_INSET_X_PX,
        chartRightX - REGION_MARKER_INSET_X_PX,
        estimateTextWidth,
    );
    return rightX + REGION_MARKER_INSET_X_PX;
}

/** The right end of `region`'s rightmost marker label, or 0 with none. */
export function regionMarkerLabelsRightX(region: PositionedIncludeRegion): number {
    let rightX = 0;
    for (const m of [...(region.anchors ?? []), ...(region.milestones ?? [])]) {
        rightX = Math.max(rightX, m.labelBox.x + m.labelBox.width);
    }
    return rightX;
}

/**
 * The host's marker order: the date-pinned anchors, the dated milestones,
 * then the after-only ones, so the stable sort in `packMarkerRow` breaks
 * a tie on x the same way the host's band does.
 */
function regionMarkerEntries(
    anchors: ReadonlyMap<string, AnchorDeclaration>,
    milestones: readonly MilestonePlacement[],
    ctx: LayoutContext,
): MarkerEntity[] {
    const entries: MarkerEntity[] = datePinnedMarkerEntries(anchors, new Map(), ctx.scale);
    const milestoneEntry = (m: MilestonePlacement): MarkerEntity => ({
        id: m.id,
        centerX: m.x,
        radius: m.radius,
        title: m.title,
        fontSize: 10,
        bold: true,
    });
    entries.push(...milestones.filter((m) => m.fixed).map(milestoneEntry));
    entries.push(...milestones.filter((m) => !m.fixed).map(milestoneEntry));
    return entries;
}

function positionedEntry(m: PositionedAnchor | PositionedMilestone, bold: boolean): MarkerEntity {
    return {
        id: m.id ?? '',
        centerX: m.center.x,
        radius: m.radius,
        title: m.title,
        fontSize: 10,
        bold,
    };
}

/**
 * Seed a region's dated anchors into its context's edge maps at their x on
 * the host's scale, the way the host seeds its own (`phases/place.ts`).
 * An anchor outside the date window is skipped, as on the host.
 */
export function seedRegionAnchorEdges(
    anchors: ReadonlyMap<string, AnchorDeclaration>,
    ctx: LayoutContext,
): void {
    for (const e of datePinnedMarkerEntries(anchors, new Map(), ctx.scale)) {
        ctx.entityLeftEdges.set(e.id, e.centerX);
        ctx.entityRightEdges.set(e.id, e.centerX);
    }
}
