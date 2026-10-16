// GroupNode — Renderable for a `group { ... }` block. Sequences
// children inside the group's body through `sequenceRowTrack`
// (row-track.ts), the loop `SwimlaneNode` uses, so an item whose desired
// start collides with a sibling's `rightEdge`, caption `spillX`, or a
// slack-arrow corridor bumps to a new row inside the group.
//
// The group is drawn above and around its content, never beside it
// (specs/true-width-layout.md §3.3): a header band (title, inline-date
// glyphs, a bracket spanning exactly its dates) over a body padded above
// and below its rows. Its box spans exactly its children's earliest start
// and latest end; see `container-header-geometry.ts`.

import type { GroupBlock } from '@nowline/core';
import { containerChrome } from '../container-header-geometry.js';
import { propValue, propValues } from '../dsl-utils.js';
import { computeContainerInlineDatePins, pickInlineDate } from '../inline-date-pin-geometry.js';
import type { LayoutContext, LayoutHelpers, TrackCursor } from '../layout-context.js';
import { resolvePinnedOrSequentialStart } from '../start-rules.js';
import { resolveStyle } from '../style-resolution.js';
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
     * Sequence children inside the group's body, advance the parent
     * `cursor` to the group's end in time (its children's duration ends,
     * never a caption spill or a header title), and return a
     * `PositionedGroup` whose box covers the header, the padded rows and
     * the group's dates.
     */
    place(cursor: TrackCursor, ctx: LayoutContext): PositionedGroup {
        const { node } = this;
        const { helpers } = this;
        const style = resolveStyle('group', node.properties, ctx.styleCtx);
        // The group starts after every `after:` term, then its own wave and
        // its lead wave floor it, so its box never opens in a column before
        // its first piece of work (specs/waves.md §5.1). A lane child's
        // cursor already sits there (`resolveChildStart`), so this is the
        // identity for it; a parallel's group track starts at the parallel's
        // start, so this is where its `after:` applies
        // (specs/scheduler-unification.md §8 decision 5).
        const startX = waveFloorX(
            node,
            resolvePinnedOrSequentialStart(node.properties, cursor.x, ctx),
            ctx,
        );
        // In a roadmap with waves, a group with no title, no `style:` and
        // no `labels:` that carries `wave:` only assigns membership: it
        // draws nothing, which would otherwise sit exactly on the wave
        // boundary its box opens at, and reserves nothing
        // (specs/waves.md §9.7). An id alone does not make it titled
        // (Example 4's `api-track`).
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
        const chrome = containerChrome({
            drawn: !waveOnly,
            hasTitle: Boolean(title),
            hasPins: Boolean(afterDate || beforeDate),
            hasBracket: style.bracket !== 'none',
        });

        const track = sequenceRowTrack(
            node,
            { leftX: startX, firstRowY: cursor.y + chrome.header + chrome.pad },
            ctx,
            helpers,
        );
        const { children, timeCursorX, timeStartX } = track;

        // Every row's height carries the inter-row gap below it; the body
        // ends `pad` below the last child's painted bottom, not below that
        // gap, and the cursor adds the gap back after the body so a sibling
        // stacked below keeps the same rhythm as two items.
        const step = ctx.bandScale.step();
        const interRowGap = step - ctx.bandScale.bandwidth();
        const contentHeight = Math.max(step, track.packer.usedHeight()) - interRowGap;
        // The bracket and body span exactly the children's dates
        // (specs/true-width-layout.md §3.3): what the group paints past them
        // (a spilled caption, its title) is footprint the row packer keeps,
        // not width.
        const box: BoundingBox = {
            x: timeStartX,
            y: cursor.y,
            width: timeCursorX - timeStartX,
            height: chrome.header + chrome.pad + contentHeight + chrome.pad,
        };
        // A parallel joins on its tracks' ends, as engine C does
        // (specs/scheduler-unification.md §8 decision 8).
        cursor.startX = box.x;
        cursor.x = timeCursorX;
        cursor.height = Math.max(cursor.height, box.height + interRowGap);
        const id = node.name;
        // `after:` the group is a time path: its last child's duration end.
        if (id) {
            ctx.entityLeftEdges.set(id, box.x);
            ctx.entityRightEdges.set(id, timeCursorX);
        }
        ctx.currentFlowKey = previousFlowKey;
        const inlineDatePins = waveOnly
            ? []
            : computeContainerInlineDatePins({ box, afterDate, beforeDate, title });
        return {
            kind: 'group',
            id,
            title,
            box,
            headerHeight: chrome.header,
            children,
            style,
            inlineDatePins: inlineDatePins.length > 0 ? inlineDatePins : undefined,
            ...(waveOnly ? { waveOnly: true as const } : {}),
        };
    }
}
