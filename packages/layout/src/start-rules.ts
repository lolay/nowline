// Start rules — engine A's (the pixel layout's) start rule for a lane or
// group child, built on the parsed terms of `start-terms.ts`: the latest of
// the sequential default and the `after:` terms (refs and inline dates),
// then the wave floor (specs/waves.md §8.4). Also the inline
// `after:` date that reports NL.I1008 when it set an item's start on a
// non-working day (specs/working-calendar.md §6).

import {
    type EntityProperty,
    type GroupBlock,
    type ItemDeclaration,
    type ParallelBlock,
} from '@nowline/core';
import { formatIsoDate } from './dsl-utils.js';
import type { LayoutContext } from './layout-context.js';
import { startTermsOf } from './start-terms.js';
import type { PositionedItem } from './types.js';
import { dateAtX, WAVE_EDGE_TOLERANCE_PX, waveFloorX } from './wave-layout.js';

// Resolve the desired startX for a swimlane child: the latest of the
// sequential default (`seqDefault`, the lane's rightmost time cursor across
// all rows) and every `after:` term. Work has no fixed start pin, so
// `after:` only ever delays (specs/dsl.md § Item Properties).
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

let scheduleWarmStart = true;

/**
 * Turn the warm start from the day schedule on or off: the barrier seed of
 * the place phase. Tests turn it off to compare against a cold start (same
 * output, more barrier passes); layout never does.
 */
export function setScheduleWarmStart(enabled: boolean): void {
    scheduleWarmStart = enabled;
}

/** True unless a test turned the warm start off (`setScheduleWarmStart`). */
export function isScheduleWarmStart(): boolean {
    return scheduleWarmStart;
}

/**
 * The start before the wave floor: the latest `after:` end (ids and inline
 * dates inside the window) no earlier than `seqDefault`, else `seqDefault`.
 */
export function resolvePinnedOrSequentialStart(
    props: EntityProperty[],
    seqDefault: number,
    ctx: LayoutContext,
): number {
    const { after } = startTermsOf(props);
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
 * The inline `after:` date on a non-working day that set an item's start
 * (NL.I1008, specs/working-calendar.md §6), for an item placed at `startX`.
 * It reports only when it set the start, that is when the item starts at
 * the date's x (within the edge tolerance): a later `after:` ref, the lane
 * cursor or a wave floor that pushed the item past it never reports. A date
 * on a working day or outside the date window reports nothing.
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

/** The inline `after:` date that can set an item's start. */
function startPinOf(
    props: EntityProperty[],
): { key: 'after'; raw: string; date: Date } | undefined {
    const { after } = startTermsOf(props);
    for (const term of after) {
        if ('date' in term) return { key: 'after', raw: term.raw, date: term.date };
    }
    return undefined;
}
