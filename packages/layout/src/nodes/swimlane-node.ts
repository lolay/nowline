// SwimlaneNode — second Renderable entity in the m2.5c port. Owns the
// per-lane row-packing decisions (title-tab top-pad collapse, sibling row
// bumps, previous-title-spill carry-forward, parallels/groups owning
// fresh rows) and emits a `PositionedSwimlane` plus the band's used
// height.
//
// Step-2 transitional shape:
//   - Item children flow through the injected `deps.sequenceItem`. Once
//     ItemNode's wire-in is complete (step 1 — done) the production
//     `sequenceItem` already routes through ItemNode internally; deferring
//     the recursive Renderable call here keeps the diff small.
//   - Parallel + group children flow through `deps.sequenceOne` until
//     their own nodes land in step 3.
//   - The Renderable interface's `measure(MeasureContext)` is not yet
//     wired through the production pipeline. The composition-root work
//     in step 5 (`RoadmapNode`) will exercise it; meanwhile the legacy
//     two-pass "buildSwimlane returns positioned + usedHeight" shape is
//     preserved.

import type {
    SwimlaneDeclaration,
    ItemDeclaration,
    GroupBlock,
    ParallelBlock,
    EntityProperty,
} from '@nowline/core';
import { isItemDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import { ITEM_INSET_PX } from '../themes/shared.js';
import type {
    PositionedSwimlane,
    PositionedTrackChild,
    PositionedItem,
    BoundingBox,
} from '../types.js';
import type { LayoutContext, TrackCursor } from '../layout-context.js';
import { propValue } from '../dsl-utils.js';

/** Helpers that SwimlaneNode delegates to until the rest of m2.5c lands. */
export interface SwimlaneNodeDeps {
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
}

export interface SwimlaneNodeInput {
    lane: SwimlaneDeclaration;
    bandIndex: number;
}

export interface PlacedSwimlaneGeometry {
    positioned: PositionedSwimlane;
    usedHeight: number;
}

/** Anchor point passed to `SwimlaneNode.place`. */
export interface SwimlaneOrigin {
    x: number;
    y: number;
}

const TAB_TOP_Y = 10;     // matches renderer: tabY = box.y + 10
const TAB_BOTTOM_Y = 38;  // tab (height 22) plus 6 px breathing room
const TAB_GUTTER_PX = 8;

/**
 * Right edge (canvas px) of the lane title tab. Mirrors the chiclet
 * sizing in `renderSwimlane`; keep the two formulas in sync.
 */
function computeLaneTabRightX(lane: SwimlaneDeclaration): number {
    const title = lane.title ?? lane.name ?? '';
    if (!title) return 0;
    const ownerRaw = propValue(lane.properties, 'owner');
    const titleWidth = Math.max(40, title.length * 7);
    const ownerWidth = ownerRaw ? Math.max(60, ('owner: ' + ownerRaw).length * 5.6) : 0;
    const padding = 24;
    const tabX = 10; // matches renderer: tabX = box.x + 10, box.x = 0
    return tabX + titleWidth + ownerWidth + padding;
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
    deps: Pick<SwimlaneNodeDeps, 'resolveChildStart'>,
): number | undefined {
    for (const child of lane.content) {
        if (child.$type === 'DescriptionDirective') continue;
        const props = isItemDeclaration(child)
            ? child.properties
            : (child as ParallelBlock | GroupBlock).properties ?? [];
        return deps.resolveChildStart(props, laneLeftX, laneLeftX, ctx);
    }
    return undefined;
}

export class SwimlaneNode {
    constructor(
        public readonly input: SwimlaneNodeInput,
        private readonly deps: SwimlaneNodeDeps,
    ) {}

    get id(): string {
        return this.input.lane.name ?? '';
    }

    place(origin: SwimlaneOrigin, ctx: LayoutContext): PlacedSwimlaneGeometry {
        const { lane, bandIndex } = this.input;
        const { deps } = this;
        const style = resolveStyle('swimlane', lane.properties, ctx.styleCtx);
        const laneLeftX = origin.x;

        // Title-tab geometry (mirrors the renderer; see renderSwimlane).
        const tabRightX = computeLaneTabRightX(lane);
        // First-row Y: when the first child's desired x is past the title
        // tab, top-align with the tab and reclaim ~28 px per lane.
        // Otherwise drop below the tab.
        const firstChildDesiredX = firstChildStartX(lane, laneLeftX, ctx, deps);
        const canAlignFirstRowWithTab =
            !lane.title ||
            firstChildDesiredX === undefined ||
            firstChildDesiredX >= tabRightX + TAB_GUTTER_PX;
        const startY = origin.y + (canAlignFirstRowWithTab ? TAB_TOP_Y : TAB_BOTTOM_Y);

        // Row-packing state. See buildSwimlane history for the legacy
        // formulation; the bump rules are preserved verbatim:
        //   (a) item.desiredStart < currentRow.rightEdge — sibling collision
        //   (b) item.desiredStart < prevTitleSpillX — caption-bleed collision
        //   parallels / groups always own a fresh row.
        let rowY = startY;
        let rowEndX = laneLeftX;
        let timeCursorX = laneLeftX;
        let prevTitleSpillX = laneLeftX;

        const children: PositionedTrackChild[] = [];
        for (const child of lane.content) {
            if (child.$type === 'DescriptionDirective') continue;

            if (!isItemDeclaration(child)) {
                if (rowEndX > laneLeftX) {
                    rowY += ctx.bandScale.step();
                }
                const blockProps = (child as ParallelBlock | GroupBlock).properties ?? [];
                const blockStart = deps.resolveChildStart(blockProps, timeCursorX, laneLeftX, ctx);
                const cursor = deps.newCursor(blockStart, rowY);
                const positioned = deps.sequenceOne(
                    child as ItemDeclaration | GroupBlock | ParallelBlock,
                    cursor,
                    ctx,
                );
                children.push(positioned);
                const blockEnd = positioned.box.x + positioned.box.width;
                rowY += Math.max(ctx.bandScale.step(), cursor.height);
                rowEndX = laneLeftX;
                timeCursorX = Math.max(timeCursorX, blockEnd);
                prevTitleSpillX = laneLeftX;
                continue;
            }

            const props = (child as ItemDeclaration).properties;
            const desiredStart = deps.resolveChildStart(props, timeCursorX, laneLeftX, ctx);

            const collidesWithRow = desiredStart < rowEndX;
            const collidesWithSpill = desiredStart < prevTitleSpillX;
            if (collidesWithRow || collidesWithSpill) {
                rowY += ctx.bandScale.step();
                rowEndX = laneLeftX;
                prevTitleSpillX = laneLeftX;
            }

            const cursor = deps.newCursor(desiredStart, rowY);
            const positioned = deps.sequenceItem(child as ItemDeclaration, cursor, ctx);
            children.push(positioned);

            // Item end in LOGICAL space (one ITEM_INSET_PX past the visual
            // bar's right edge). The next chained item starts here and
            // lands edge-to-edge in time, with a 2 × ITEM_INSET_PX visible
            // gutter between bars.
            const itemLogicalEnd = positioned.box.x + positioned.box.width + ITEM_INSET_PX;
            timeCursorX = Math.max(timeCursorX, itemLogicalEnd);
            rowEndX = itemLogicalEnd;

            // If the caption spills past the bar (computed in
            // sequenceItem), reserve enough horizontal room so the next
            // item bumps to a fresh row instead of rendering under the
            // floating caption.
            if (positioned.textSpills) {
                const titleWidth = deps.estimateTextWidth(positioned.title, 13);
                const metaWidth = positioned.metaText
                    ? deps.estimateTextWidth(positioned.metaText, 11)
                    : 0;
                const visualRight = positioned.box.x + positioned.box.width;
                prevTitleSpillX = visualRight + 6 + Math.max(titleWidth, metaWidth) + 6;
            } else {
                prevTitleSpillX = laneLeftX;
            }
        }

        const lastRowBottom = rowY + ctx.bandScale.step();
        const bandHeight = Math.max(ctx.bandScale.step() + 32, lastRowBottom - origin.y + 16);
        const box: BoundingBox = {
            x: 0,
            y: origin.y,
            width: ctx.chartRightX,
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

        // Footnote indicators that name this swimlane via `on:`.
        const footnoteIndicators: number[] = [];
        if (lane.name) {
            for (const [fid, host] of ctx.footnoteHosts.entries()) {
                if (host.includes(lane.name)) {
                    const n = ctx.footnoteIndex.get(fid);
                    if (n !== undefined) footnoteIndicators.push(n);
                }
            }
            footnoteIndicators.sort((a, b) => a - b);
        }

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
            },
            usedHeight: bandHeight,
        };
    }
}
