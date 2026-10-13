// A frozen copy of engine B, `computeContentEndDay` from `src/layout.ts` at
// the commit before specs/scheduler-unification.md m1.s2, kept as the oracle
// for `RoadmapSchedule.extent.contentEndDay` until m3.s2 retires it. Do not
// edit it to match the schedule: it is the old behaviour the schedule must
// reproduce.

import {
    type GroupBlock,
    type ItemDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isParallelBlock,
    type ParallelBlock,
    type ResolveResult,
    type SwimlaneDeclaration,
    type WavePlan,
} from '@nowline/core';
import { type CalendarConfig, deriveItemDurationDays, resolveSizes } from '../src/calendar.js';
import { parseDate, propValue, propValues } from '../src/dsl-utils.js';
import type { ResolvedSize } from '../src/types.js';
import { solveWaveBarriers, WavePass, waveFloorDays } from '../src/wave-barrier.js';
import type { WorkingCalendar } from '../src/working-calendar.js';

// Walk every dated/sequenced entity in the resolved content and return the
// latest day-offset from `startDate`. Mirrors the sequencer's start-rules
// (date: > start: > after: > previous-in-lane) without producing positions.
// Offsets are working-day indices: every date converts through
// `ctx.calendar.workingIndexOf`, so a date on a non-working day counts as
// the next working day.
//
// With waves (`plan` set, specs/waves.md §8.5) the lane walk runs inside the
// barrier driver: starts are floored by their wave's `S_k`, isolated regions
// are walked in-pass (one level, fresh id maps seeded with the wave edges)
// instead of by the post-hoc recursion, and the result includes `E_n` and
// every `S_k`.
export function computeContentEndDay(
    resolved: ResolveResult,
    ctx: {
        cal: CalendarConfig;
        sizes: Map<string, ResolvedSize>;
        calendar: WorkingCalendar;
    },
    startDate: Date,
    today: Date | undefined,
    plan?: WavePlan,
): number {
    const dayOf = (date: Date): number => ctx.calendar.workingIndexOf(startDate, date);
    let itemEnd = new Map<string, number>();
    const anchorEnd = new Map<string, number>();
    const milestoneEnd = new Map<string, number>();
    let maxDay = 0;

    // Pre-seed anchors fixed by `date:` so items that reference them get a
    // valid end-day during the lane walk.
    for (const anchor of resolved.content.anchors.values()) {
        const d = parseDate(propValue(anchor.properties, 'date'));
        if (d && anchor.name) {
            const day = dayOf(d);
            anchorEnd.set(anchor.name, day);
            maxDay = Math.max(maxDay, day);
        }
    }

    // The id maps one walk resolves `after:` against: the main lanes share
    // the maps above; an isolated region (wave mode only) gets fresh maps.
    interface WalkScope {
        itemEnd: Map<string, number>;
        anchorEnd: ReadonlyMap<string, number>;
        milestoneEnd: ReadonlyMap<string, number>;
        sizes: Map<string, ResolvedSize>;
    }
    const mainScope = (): WalkScope => ({ itemEnd, anchorEnd, milestoneEnd, sizes: ctx.sizes });

    // `wave` is the current barrier pass (undefined without waves); `reach`
    // receives every lane cursor so the caller can track the content end.
    const makeWalker = (
        scope: WalkScope,
        wave: WavePass | undefined,
        reach: (day: number) => void,
    ) => {
        // Resolve a single `after:` element to a day-offset from `startDate`.
        // The element is either an entity id (looked up in itemEnd /
        // anchorEnd / milestoneEnd) or an inline ISO date literal (converted
        // directly via `dayOf`). The validator already enforces "at
        // most one inline date per direction", so at most one element per
        // list will hit the date path.
        const resolveAfterDay = (ref: string): number => {
            const inlineDate = parseDate(ref);
            if (inlineDate) return dayOf(inlineDate);
            if (scope.itemEnd.has(ref)) return scope.itemEnd.get(ref)!;
            if (scope.anchorEnd.has(ref)) return scope.anchorEnd.get(ref)!;
            if (scope.milestoneEnd.has(ref)) return scope.milestoneEnd.get(ref)!;
            return 0;
        };

        const walkLane = (
            children: SwimlaneDeclaration['content'],
            baselineEnd: number,
        ): number => {
            let prevEnd = baselineEnd;
            for (const child of children) {
                if (child.$type === 'DescriptionDirective') continue;
                prevEnd = walkNode(child as ItemDeclaration | GroupBlock | ParallelBlock, prevEnd);
                reach(prevEnd);
            }
            return prevEnd;
        };

        const walkNode = (
            node: ItemDeclaration | GroupBlock | ParallelBlock,
            prevEnd: number,
        ): number => {
            if (isItemDeclaration(node)) {
                const dur = deriveItemDurationDays(node.properties, scope.sizes, ctx.cal);
                const dateProp = parseDate(propValue(node.properties, 'date'));
                const startProp = parseDate(propValue(node.properties, 'start'));
                const afterRefs = propValues(node.properties, 'after');
                let start = prevEnd;
                if (dateProp) {
                    start = dayOf(dateProp);
                } else if (startProp) {
                    start = dayOf(startProp);
                } else if (afterRefs.length > 0) {
                    start = Math.max(prevEnd, ...afterRefs.map(resolveAfterDay));
                }
                // The barrier floor is one more term in the max; a pin
                // becomes max(pin, F).
                if (wave) start = wave.apply(node, start);
                const end = start + dur;
                if (node.name) scope.itemEnd.set(node.name, end);
                wave?.accumulate(node, end);
                return end;
            }
            if (isParallelBlock(node)) {
                // All children share the parallel's start; the block's
                // effective end is the maximum child end. The parallel's own
                // `after:` (including inline-date pins) widens that shared
                // start, and so does its wave floor.
                const afterRefs = propValues(node.properties, 'after');
                let containerStart =
                    afterRefs.length > 0
                        ? Math.max(prevEnd, ...afterRefs.map(resolveAfterDay))
                        : prevEnd;
                if (wave) containerStart = wave.apply(node, containerStart);
                let parallelEnd = containerStart;
                for (const child of node.content) {
                    if (child.$type === 'DescriptionDirective') continue;
                    const childEnd = walkNode(
                        child as ItemDeclaration | GroupBlock,
                        containerStart,
                    );
                    parallelEnd = Math.max(parallelEnd, childEnd);
                }
                return parallelEnd;
            }
            if (isGroupBlock(node)) {
                // The group's own `after:` (including inline-date pins) widens
                // the baseline before walking the inner sequential lane, and
                // so does its wave floor.
                const afterRefs = propValues(node.properties, 'after');
                let containerStart =
                    afterRefs.length > 0
                        ? Math.max(prevEnd, ...afterRefs.map(resolveAfterDay))
                        : prevEnd;
                if (wave) containerStart = wave.apply(node, containerStart);
                return walkLane(node.content as SwimlaneDeclaration['content'], containerStart);
            }
            return prevEnd;
        };

        return { walkLane, resolveAfterDay };
    };

    const reachMax = (day: number): void => {
        maxDay = Math.max(maxDay, day);
    };
    if (!plan) {
        const { walkLane } = makeWalker(mainScope(), undefined, reachMax);
        for (const lane of resolved.content.swimlanes.values()) {
            walkLane(lane.content, 0);
        }
    } else {
        const ids = plan.waves.map((w) => w.name as string);
        let passMax = 0;
        const reachPass = (day: number): void => {
            passMax = Math.max(passMax, day);
        };
        const barrier = solveWaveBarriers(
            ids.length,
            0,
            waveFloorDays(plan, startDate, ctx.calendar),
            (S, E) => {
                // Reset the item maps, keep the anchors, and seed each wave
                // id with E_k so `after:<wave>` resolves to the wave's end.
                const seeds = ids.map((id, i): [string, number] => [id, E[i]]);
                itemEnd = new Map(seeds);
                passMax = 0;
                const pass = new WavePass(plan, S);
                const { walkLane } = makeWalker(mainScope(), pass, reachPass);
                for (const lane of resolved.content.swimlanes.values()) {
                    walkLane(lane.content, 0);
                }
                // Exactly one level of isolated regions, each with fresh id
                // maps seeded only with the wave edges (engine A's region
                // `childCtx`). This replaces the post-hoc region recursion.
                // In wave mode region anchors, region milestones and nested
                // regions do not extend the window, matching engine A, which
                // draws none of them.
                for (const region of resolved.content.isolatedRegions) {
                    const regionWalker = makeWalker(
                        {
                            itemEnd: new Map(seeds),
                            anchorEnd: new Map(),
                            milestoneEnd: new Map(),
                            sizes: resolveSizes(region.content.sizes, ctx.cal),
                        },
                        pass,
                        reachPass,
                    );
                    for (const lane of region.content.swimlanes.values()) {
                        regionWalker.walkLane(lane.content, 0);
                    }
                }
                return pass;
            },
        );
        // The final pass ran with the solved S/E. The content end covers the
        // last wave's end and every wave start, so floors and empty trailing
        // waves stay inside the window.
        maxDay = Math.max(maxDay, passMax, ...barrier.S, ...barrier.E.slice(-1));
    }

    // Milestones (after items so `after:` references can resolve, including
    // wave ids to their E_k).
    const { resolveAfterDay } = makeWalker(mainScope(), undefined, reachMax);
    for (const ms of resolved.content.milestones.values()) {
        const d = parseDate(propValue(ms.properties, 'date'));
        if (d) {
            const day = dayOf(d);
            if (ms.name) milestoneEnd.set(ms.name, day);
            maxDay = Math.max(maxDay, day);
            continue;
        }
        const after = propValues(ms.properties, 'after');
        if (after.length > 0) {
            // Milestones disallow inline date literals at the validator
            // level (rule 24a — milestones already have `date:`). The
            // shared `resolveAfterDay` helper still handles such input
            // gracefully if it slips past, treating the date as the
            // milestone's effective day.
            const day = Math.max(0, ...after.map(resolveAfterDay));
            if (ms.name) milestoneEnd.set(ms.name, day);
            maxDay = Math.max(maxDay, day);
        }
    }

    // Isolated includes contribute their own content extent against the
    // shared timeline. With waves they were walked in-pass above.
    if (!plan) {
        for (const region of resolved.content.isolatedRegions) {
            const nestedMax = computeContentEndDay(
                {
                    config: region.config,
                    content: region.content,
                    diagnostics: [],
                    processedFiles: new Set(),
                },
                ctx,
                startDate,
                undefined,
            );
            maxDay = Math.max(maxDay, nestedMax);
        }
    }

    if (today) {
        const t = dayOf(today);
        if (t > 0) maxDay = Math.max(maxDay, t);
    }

    return maxDay;
}
