// SwimlaneNode — second Renderable entity in the m2.5c port. Owns the
// per-lane row-packing decisions (title-tab top-pad collapse, sibling row
// bumps, previous-title-spill carry-forward, parallels/groups owning
// fresh rows) and emits a `PositionedSwimlane` plus the band's used
// height.
//
// The lane's children go through the shared row track (`row-track.ts`):
// items are measured and placed by `sequenceItem`, and parallel and group
// children by the injected `helpers.sequenceOne`. A lane has no separate
// measure pass: its height is the result of packing its rows, so
// `place` returns the positioned lane with its used height
// (specs/layout-phases.md §2, non-goals).

import type {
    GroupBlock,
    ItemDeclaration,
    ParallelBlock,
    SwimlaneDeclaration,
} from '@nowline/core';
import {
    capacityIconDx,
    estimateCapacitySuffixWidth,
    formatCapacityNumber,
    parseCapacityValue,
    resolveCapacityIcon,
} from '../capacity.js';
import { propValue } from '../dsl-utils.js';
import { frameTabGeometry } from '../frame-tab-geometry.js';
import { computeLaneUtilization, resolveLaneUtilizationThresholds } from '../lane-utilization.js';
import type { LayoutContext, LayoutHelpers } from '../layout-context.js';
import { resolveChildStart } from '../start-rules.js';
import { resolveStyle } from '../style-resolution.js';
import { estimateTextWidth } from '../text-measure.js';
import type { BoundingBox, PositionedCapacity, PositionedSwimlane } from '../types.js';
import { sequenceRowTrack } from './row-track.js';

/**
 * Font size (px) the renderer uses for the lane capacity badge. Mirrors
 * the owner-badge font size in `renderSwimlane` so the two reads as a
 * single info row inside the chiclet. Width estimates here must use the
 * same value or the geometry-collision math diverges from the painted
 * footprint.
 */
const LANE_CAPACITY_BADGE_FONT_SIZE_PX = 10;

/**
 * Compute the lane's PositionedCapacity (or null when no `capacity:` is
 * declared / value is non-positive) plus the px width the badge will
 * occupy inside the frame tab. The width includes the bare badge —
 * leading-separator handling lives in `frameTabGeometry`.
 */
function resolveLaneCapacity(
    lane: SwimlaneDeclaration,
    style: { capacityIcon: string },
    symbols: LayoutContext['symbols'],
): { capacity: PositionedCapacity | null; badgeWidthPx: number } {
    const raw = propValue(lane.properties, 'capacity');
    const value = parseCapacityValue(raw);
    if (value === null) return { capacity: null, badgeWidthPx: 0 };
    const text = formatCapacityNumber(value);
    const icon = resolveCapacityIcon(style.capacityIcon, symbols);
    const badgeWidthPx = estimateCapacitySuffixWidth(text, icon, LANE_CAPACITY_BADGE_FONT_SIZE_PX);
    const iconDx = capacityIconDx(text, icon, LANE_CAPACITY_BADGE_FONT_SIZE_PX);
    return {
        capacity: { value, text, icon, ...(iconDx !== undefined ? { iconDx } : {}) },
        badgeWidthPx,
    };
}

export interface SwimlaneNodeInput {
    lane: SwimlaneDeclaration;
    bandIndex: number;
}

export interface PlacedSwimlaneGeometry {
    positioned: PositionedSwimlane;
    usedHeight: number;
    /** Rightmost x reached by any item or its spilled caption. */
    usedRightX: number;
}

/** Anchor point passed to `SwimlaneNode.place`. */
export interface SwimlaneOrigin {
    x: number;
    y: number;
}

const TAB_TOP_Y = 10; // matches renderer: tabY = box.y + 10
const TAB_BOTTOM_Y = 38; // tab (height 22) plus 6 px breathing room
const TAB_GUTTER_PX = 8;

/**
 * Right edge (canvas px) of the lane title tab. Delegates to the
 * shared `frameTabGeometry` helper that the renderer also uses, so
 * the chiclet's collision footprint and its painted footprint stay
 * exactly in sync. Capacity badge and footnote-indicator widths are
 * added when present so the first-item collision math reserves
 * enough horizontal space for the (now-wider) chiclet.
 */
function computeLaneTabRightX(
    lane: SwimlaneDeclaration,
    capacityBadgeWidthPx: number,
    footnoteIndicatorWidthPx: number,
): number {
    const title = lane.title ?? lane.name ?? '';
    if (!title) return 0;
    const ownerRaw = propValue(lane.properties, 'owner');
    // Box is laid out at `box.x = 0` for top-level lanes; the helper
    // adds the standard `FRAME_TAB_OFFSET_FROM_BOX_PX` itself.
    return frameTabGeometry(
        0,
        title,
        ownerRaw ?? undefined,
        capacityBadgeWidthPx,
        footnoteIndicatorWidthPx,
    ).rightX;
}

/**
 * Footnote indicators (1-based numbers) that name this lane via `on:`,
 * sorted ascending. Empty when the lane has no name or no matching
 * footnote hosts. Computed up-front so the chiclet width reservation
 * and the painted footnote text use the same numbers.
 */
function collectFootnoteIndicators(lane: SwimlaneDeclaration, ctx: LayoutContext): number[] {
    if (!lane.name) return [];
    const out: number[] = [];
    for (const [fid, host] of ctx.footnoteHosts.entries()) {
        if (host.includes(lane.name)) {
            const n = ctx.footnoteIndex.get(fid);
            if (n !== undefined) out.push(n);
        }
    }
    out.sort((a, b) => a - b);
    return out;
}

/**
 * Desired starting x for the first non-description child of a lane.
 * Returns undefined when the lane has no chartable children. Used by
 * the top-pad collapse decision (a row whose first item lives past the
 * tab can sit at TAB_TOP_Y; otherwise rows drop below the tab).
 */
function firstChildStartX(
    lane: SwimlaneDeclaration,
    laneLeftX: number,
    ctx: LayoutContext,
): number | undefined {
    for (const child of lane.content) {
        if (child.$type === 'DescriptionDirective') continue;
        // Snapped like the start it predicts (a no-op under `hide`).
        return ctx.scale.startX(
            resolveChildStart(
                child as ItemDeclaration | GroupBlock | ParallelBlock,
                laneLeftX,
                ctx,
            ),
        );
    }
    return undefined;
}

export class SwimlaneNode {
    constructor(
        public readonly input: SwimlaneNodeInput,
        private readonly helpers: LayoutHelpers,
    ) {}

    get id(): string {
        return this.input.lane.name ?? '';
    }

    place(origin: SwimlaneOrigin, ctx: LayoutContext): PlacedSwimlaneGeometry {
        const { lane, bandIndex } = this.input;
        const { helpers } = this;
        const style = resolveStyle('swimlane', lane.properties, ctx.styleCtx);
        const laneLeftX = origin.x;
        const step = ctx.bandScale.step();

        // Each swimlane root opens a fresh flow — its direct children
        // chain in time, so a milestone's `after:` predecessors that
        // share a swimlane collapse to the latest one in file order
        // (file order encodes the dependency on its own). Restored at
        // the bottom of `place()`.
        const previousFlowKey = ctx.currentFlowKey;
        ctx.currentFlowKey = `lane:${lane.name ?? bandIndex}`;

        // Resolve lane capacity early — its width feeds into the
        // chiclet's right-edge collision calculation, which determines
        // whether the first row sits at TAB_TOP_Y or TAB_BOTTOM_Y.
        const { capacity, badgeWidthPx } = resolveLaneCapacity(lane, style, ctx.symbols);
        // Footnote indicators (the small "1, 2" red text in the upper
        // right of the chiclet) need to be reserved in the chiclet's
        // width too, otherwise they paint on top of the owner / badge
        // for shrink-wrapped chiclets. Computed up front from the
        // pre-resolved footnote index/host map.
        const footnoteIndicators = collectFootnoteIndicators(lane, ctx);
        const footnoteIndicatorWidthPx =
            footnoteIndicators.length > 0
                ? estimateTextWidth(footnoteIndicators.join(','), LANE_CAPACITY_BADGE_FONT_SIZE_PX)
                : 0;
        // Title-tab geometry (mirrors the renderer; see renderSwimlane).
        const tabRightX = computeLaneTabRightX(lane, badgeWidthPx, footnoteIndicatorWidthPx);
        // First-row Y: when the first child's desired x is past the title
        // tab, top-align with the tab and reclaim ~28 px per lane.
        // Otherwise drop below the tab.
        const firstChildDesiredX = firstChildStartX(lane, laneLeftX, ctx);
        const canAlignFirstRowWithTab =
            !lane.title ||
            firstChildDesiredX === undefined ||
            firstChildDesiredX >= tabRightX + TAB_GUTTER_PX;
        const startY = origin.y + (canAlignFirstRowWithTab ? TAB_TOP_Y : TAB_BOTTOM_Y);

        // The shared row-track loop (row-track.ts) packs the lane's
        // children below the tab offset chosen above.
        const track = sequenceRowTrack(lane, { leftX: laneLeftX, firstRowY: startY }, ctx, helpers);
        const { children } = track;

        // `track.packer.usedHeight()` measures from `startY` (the first row,
        // below the title tab); the swimlane band spans from `origin.y`
        // (the band top, above the tab). Add the tab offset back so the
        // band height covers everything the user sees.
        const tabOffset = startY - origin.y;
        const bandHeight = Math.max(step + 32, tabOffset + track.packer.usedHeight() + 16);
        // Include the chiclet's right edge in the lane's reported
        // right-extent so empty lanes still report a non-zero right edge
        // — `buildIncludeRegions` uses this to size the include's dashed
        // bracket around its content, and a lane with only a chiclet
        // (no items) should still fit visibly inside that bracket.
        const usedRightX = Math.max(track.packer.usedRightX(), tabRightX);
        // The band spans the canvas, whose width is final only after the
        // post-placement growth: finalize (`fitWidths`, f4) sets a main
        // lane's width to it and `fitIncludeRegionWidth` a region lane's to
        // the region's. Placement never reads the canvas.
        const box: BoundingBox = {
            x: 0,
            y: origin.y,
            width: 0,
            height: bandHeight,
        };

        // Owner display string: id → title for teams/people; falls back to id.
        const ownerRaw = propValue(lane.properties, 'owner');
        let ownerDisplay: string | undefined;
        if (ownerRaw) {
            const team = ctx.teams.get(ownerRaw);
            const person = ctx.persons.get(ownerRaw);
            ownerDisplay = team?.title ?? person?.title ?? ownerRaw;
        }

        // Lane utilization underline (m12). Computed *after* children are
        // positioned so the contributors carry their final box.x / box.width.
        // Returns null when the lane has no `capacity:`, no contributing
        // items, or has opted out of every color band — the renderer reads
        // null as "paint nothing".
        const utilization = capacity
            ? (() => {
                  const { warn, over } = resolveLaneUtilizationThresholds(
                      lane,
                      ctx.styleCtx.defaults,
                  );
                  return computeLaneUtilization({
                      children,
                      capacityValue: capacity.value,
                      warnFraction: warn,
                      overFraction: over,
                  });
              })()
            : null;

        ctx.currentFlowKey = previousFlowKey;
        return {
            positioned: {
                id: lane.name,
                title: lane.title ?? lane.name ?? '',
                box,
                bandIndex,
                children,
                nested: [],
                style,
                owner: ownerDisplay,
                footnoteIndicators,
                capacity,
                capacityBadgeWidth: badgeWidthPx,
                footnoteIndicatorWidth: footnoteIndicatorWidthPx,
                utilization,
            },
            usedHeight: bandHeight,
            usedRightX,
        };
    }
}
