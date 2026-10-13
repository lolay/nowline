// GroupNode — Renderable for a `group { ... }` block. Sequences
// children inside the group's content area through `sequenceRowTrack`
// (row-track.ts), the loop `SwimlaneNode` uses, so an item whose desired start collides
// with a sibling's `rightEdge`, caption `spillX`, or a slack-arrow
// corridor bumps to a new row inside the group. The group's reported
// `box.height` grows with the row stack so parent containers stack
// against the actual painted extent.
//
// Filled-style groups paint a title chiclet flush in the upper-left
// corner of the box; the layout reserves vertical top padding equal
// to the chiclet height plus a small gutter before the first inner
// row begins. Every other group paints its title (and any inline-date
// glyphs) in a header band it reserves above the box instead; see
// `container-header-geometry.ts`.

import type { GroupBlock } from '@nowline/core';
import { GROUP_HEADER_TITLE_INSET_X_PX, groupHeaderBandPx } from '../container-header-geometry.js';
import { propValue, propValues } from '../dsl-utils.js';
import { groupHasFill, groupTitleTabWidth } from '../group-title-tab-geometry.js';
import { computeContainerInlineDatePins, pickInlineDate } from '../inline-date-pin-geometry.js';
import type { LayoutContext, LayoutHelpers, TrackCursor } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import {
    GROUP_BOTTOM_PAD_PX,
    GROUP_TITLE_TAB_GUTTER_PX,
    GROUP_TITLE_TAB_HEIGHT_PX,
    TRACK_BLOCK_TAIL_GUTTER_PX,
} from '../themes/shared.js';
import type { BoundingBox, PositionedGroup } from '../types.js';
import { waveFloorX } from '../wave-layout.js';
import { sequenceRowTrack } from './row-track.js';

export class GroupNode {
    constructor(
        public readonly node: GroupBlock,
        private readonly helpers: LayoutHelpers,
    ) {}

    get id(): string {
        return this.node.name ?? '';
    }

    /**
     * Sequence children inside the group's content area, advance the
     * parent `cursor` past the group's right edge plus
     * `TRACK_BLOCK_TAIL_GUTTER_PX` of breathing room, and return a
     * `PositionedGroup` whose `box.height` covers the chiclet pad,
     * every row-packed child row, and the bottom pad.
     */
    place(cursor: TrackCursor, ctx: LayoutContext): PositionedGroup {
        const { node } = this;
        const { helpers } = this;
        const style = resolveStyle('group', node.properties, ctx.styleCtx);
        // The group's own wave and its lead wave floor its start, so its
        // box never opens in a column before its first piece of work
        // (specs/waves.md §5.1). A no-op without waves, and for a lane
        // child, whose `resolveChildStart` already applied it.
        const startX = waveFloorX(node, cursor.x, ctx);
        // In a roadmap with waves, a group with no title, no `style:` and
        // no `labels:` that carries `wave:` only assigns membership: it
        // draws no bracket, which would otherwise sit exactly on the wave
        // boundary its box opens at, and no id label (specs/waves.md §9.7).
        // An id alone does not make it titled (Example 4's `api-track`).
        const waveOnly =
            ctx.waves !== undefined &&
            node.title === undefined &&
            propValue(node.properties, 'wave') !== undefined &&
            propValue(node.properties, 'style') === undefined &&
            propValues(node.properties, 'labels').length === 0;
        const title = waveOnly ? undefined : (node.title ?? node.name);

        // Group children chain in time inside the group, so they
        // form one sub-flow under the parent's flow path. See
        // `LayoutContext.currentFlowKey`.
        const previousFlowKey = ctx.currentFlowKey;
        ctx.nextGroupId += 1;
        ctx.currentFlowKey = `${previousFlowKey}/group:${node.name ?? `group-${ctx.nextGroupId}`}`;
        const afterDate = pickInlineDate(propValues(node.properties, 'after'));
        const beforeDate = pickInlineDate(propValues(node.properties, 'before'));
        const hasPins = Boolean(afterDate || beforeDate);
        // Same `groupHasFill` predicate `renderGroup` paints with, so the
        // painted box and the layout's reservation agree on whether a
        // chiclet exists.
        const hasFill = groupHasFill(style.bg);
        const hasChiclet = hasFill && Boolean(title);
        // The first child row starts flush with the box's top corners,
        // so a filled group's inline-date glyphs need the chiclet row
        // reserved even when there is no chiclet to share it with.
        const hasTabRow = hasChiclet || (hasFill && hasPins);
        const topPad = hasTabRow ? GROUP_TITLE_TAB_HEIGHT_PX + GROUP_TITLE_TAB_GUTTER_PX : 0;
        const bottomPad = hasTabRow ? GROUP_BOTTOM_PAD_PX : 0;
        // Bracket / unstyled groups paint their title at `box.y - 2`
        // (baseline) and their inline-date glyphs beside it, all ABOVE
        // box.y. Without an explicit reservation the title collides with
        // whatever ends just above (two bracket-titled groups stacked in
        // a parallel: the previous sibling's bracket-foot), and the
        // glyphs would have to sit on the first child row. Shift `box.y`
        // down by the header band so both land in space we own.
        const headerBand = groupHeaderBandPx(hasFill, Boolean(title), hasPins);
        const startY = cursor.y + headerBand;

        const step = ctx.bandScale.step();
        const groupContentLeftX = startX;
        const track = sequenceRowTrack(
            node.content,
            { leftX: groupContentLeftX, firstRowY: startY + topPad },
            ctx,
            helpers,
        );
        const { children, timeCursorX } = track;

        const innerHeight = Math.max(step, track.packer.usedHeight());
        // The group's painted box hugs everything its children put on
        // screen, including caption text that spills past a bar's right
        // edge. `usedRightX` is the rightmost extent any row reached —
        // either a bar's logical right or a caption's reserved spill —
        // so the orange tint visually "owns" the spilled title/meta.
        //
        // The cursor channel (`cursor.x` / `cursor.maxX`) stays on the
        // COMPACT `timeCursorX` (bar logical ends only). Bubbling the
        // wide `visualRightX` upward would propagate through
        // `ParallelNode.maxRight → parallel.box.width → swimlane
        // blockEnd → timeCursorX`, pushing every subsequent sibling
        // right by the spill width — including siblings on entirely
        // different rows of the parent swimlane. The painted box and
        // the logical cursor advance are intentionally decoupled here.
        const visualRightX = Math.max(timeCursorX, track.packer.usedRightX());
        // Under `show` the box opens on a working day; its children keep the
        // raw start as their cursor seed, so their pins and ties read as
        // under `hide`, and are snapped where they are placed.
        const boxLeftX = ctx.scale.showsNonWorking ? ctx.scale.startX(startX) : startX;
        const boxRightX = ctx.scale.showsNonWorking
            ? Math.max(boxLeftX, visualRightX)
            : visualRightX;
        const box: BoundingBox = {
            x: boxLeftX,
            y: startY,
            width: boxRightX - boxLeftX,
            height: topPad + innerHeight + bottomPad,
        };
        cursor.x = timeCursorX + TRACK_BLOCK_TAIL_GUTTER_PX;
        cursor.maxX = Math.max(cursor.maxX, cursor.x);
        // The painted `box.height` is the group's tight visual
        // footprint (chiclet + content + bottomPad). The cursor
        // advance, however, must include one inter-row gap
        // (`step - bandwidth`) so a sibling stacked below in a
        // `parallel` (or any track-pack consumer) doesn't butt
        // right up against the group's bottom edge. Items naturally
        // include that gap because they report `cursor.height = step`
        // (bandwidth + gap); groups need to add it explicitly since
        // their painted height is gap-less.
        const interRowGap = ctx.bandScale.step() - ctx.bandScale.bandwidth();
        cursor.height = Math.max(cursor.height, headerBand + box.height + interRowGap);
        const id = node.name;
        if (id) {
            ctx.entityLeftEdges.set(id, box.x);
            ctx.entityRightEdges.set(id, box.x + box.width);
        }
        ctx.currentFlowKey = previousFlowKey;
        const inlineDatePins = computeContainerInlineDatePins({
            box,
            afterDate,
            beforeDate,
            row: hasFill
                ? // The chiclet owns the box's top-left corner; the glyphs clear it.
                  {
                      kind: 'title-tab-row',
                      titleTabWidth: title ? groupTitleTabWidth(title) : undefined,
                  }
                : { kind: 'header-band', title, titleInsetX: GROUP_HEADER_TITLE_INSET_X_PX },
        });
        return {
            kind: 'group',
            id,
            title,
            box,
            children,
            style,
            inlineDatePins: inlineDatePins.length > 0 ? inlineDatePins : undefined,
            ...(waveOnly ? { waveOnly: true as const } : {}),
        };
    }
}
