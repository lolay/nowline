// Start rules — engine A's (the pixel layout's) start precedence for a lane
// or group child, built on the parsed terms of `start-terms.ts`: `date:` >
// `start:` (fixed pins) > `after:` (chain after refs and inline dates) >
// the sequential default, then the wave floor (specs/waves.md §8.4). Also
// the pin that reports NL.I1008 when it set an item's start on a
// non-working day (specs/working-calendar.md §6).

import type { EntityProperty, GroupBlock, ItemDeclaration, ParallelBlock } from '@nowline/core';
import { formatIsoDate } from './dsl-utils.js';
import type { LayoutContext } from './layout-context.js';
import { startTermsOf } from './start-terms.js';
import type { PositionedItem } from './types.js';
import { dateAtX, WAVE_EDGE_TOLERANCE_PX, waveFloorX } from './wave-layout.js';

// Resolve the desired startX for a swimlane child, honoring `date:` (fixed
// pin) > `start:` (fixed pin) > `after:` (chain after refs) > sequential
// default (continue from `seqDefault`, which is the lane's rightmost time
// cursor across all rows).
//
// `after:` accepts both entity ids (looked up in `ctx.entityRightEdges`) and
// inline ISO date literals (looked up via `ctx.scale.forwardWithinDomain`).
// The validator already enforces "at most one inline date per direction" so
// at most one element in the list will hit the date path.
//
// In a roadmap with waves the result is floored by the child's wave and,
// for a container, its lead wave (specs/waves.md §8.4), so the row
// packer's predicted start matches the start `sequenceItem` / the
// container node places.
export function resolveChildStart(
    child: ItemDeclaration | GroupBlock | ParallelBlock,
    seqDefault: number,
    ctx: LayoutContext,
): number {
    return waveFloorX(
        child,
        resolvePinnedOrSequentialStart(child.properties, seqDefault, ctx),
        ctx,
    );
}

/**
 * The start before the wave floor: a pin inside the window, else the
 * latest `after:` end (ids and inline dates) no earlier than `seqDefault`,
 * else `seqDefault`.
 */
export function resolvePinnedOrSequentialStart(
    props: EntityProperty[],
    seqDefault: number,
    ctx: LayoutContext,
): number {
    const { pin, after } = startTermsOf(props);
    if (pin) {
        const xd = ctx.scale.forwardWithinDomain(pin.date);
        if (xd !== null) return xd;
    }
    if (after.length > 0) {
        let maxEnd = seqDefault;
        for (const term of after) {
            if ('date' in term) {
                const xd = ctx.scale.forwardWithinDomain(term.date);
                if (xd !== null) maxEnd = Math.max(maxEnd, xd);
                continue;
            }
            const endX = ctx.entityRightEdges.get(term.ref);
            if (endX !== undefined) maxEnd = Math.max(maxEnd, endX);
        }
        return maxEnd;
    }
    return seqDefault;
}

/**
 * The pin on a non-working day that set an item's start (NL.I1008,
 * specs/working-calendar.md §6), for an item placed at `startX`. The pin
 * follows the start precedence of `resolvePinnedOrSequentialStart`:
 * `date:`, then `start:`, then the inline date of `after:`. It reports only
 * when it set the start, that is when the item starts at the pin's x
 * (within the edge tolerance): a later `after:` ref, the lane cursor or a
 * wave floor that pushed the item past it never reports. A pin on a
 * working day or outside the date window reports nothing.
 */
export function nonWorkingPinOf(
    props: EntityProperty[],
    startX: number,
    ctx: LayoutContext,
): PositionedItem['nonWorkingPin'] {
    if (!ctx.calendar.hasNonWorkingDays) return undefined;
    const pin = startPinOf(props);
    if (!pin || ctx.calendar.isWorkingDay(pin.date)) return undefined;
    const pinX = ctx.scale.forwardWithinDomain(pin.date);
    if (pinX === null || Math.abs(startX - pinX) >= WAVE_EDGE_TOLERANCE_PX) return undefined;
    return { key: pin.key, pin: pin.raw, start: formatIsoDate(dateAtX(startX, ctx)) };
}

/** The dated pin that can set an item's start, by the start precedence. */
function startPinOf(
    props: EntityProperty[],
): { key: 'date' | 'start' | 'after'; raw: string; date: Date } | undefined {
    const { pin, after } = startTermsOf(props);
    if (pin) return pin;
    for (const term of after) {
        if ('date' in term) return { key: 'after', raw: term.raw, date: term.date };
    }
    return undefined;
}
