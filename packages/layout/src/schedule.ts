// scheduleRoadmap — compute the floating calendar start/end date for every
// named entity (items, milestones, anchors) without running the full layout.
//
// The sequencing rules exactly mirror `computeContentEndDay` in `layout.ts`
// plus the roadmap-start resolution in `RoadmapNode.place`:
//   - date: / start:  — absolute pin (date: wins over start:)
//   - after:[id|DATE]  — start after the maximum predecessor end
//   - sequential default — start where the previous item in the lane ended
//   - wave barriers (roadmaps with waves only) — every start is floored by
//     its wave's start S_k, iterated to a fixpoint by `solveWaveBarriers`
//     (specs/waves.md §8.5)
//
// Offsets are working-day indices from the start (specs/working-calendar.md
// §5): dates convert with `workingIndexOf`, so a pin on a non-working day
// starts on the next working day. A start (and an after-only milestone) is a
// point, `dateAtWorkingIndex`; an exclusive end is `spanEndDate`, so a
// Mon–Fri item ends on Saturday. Anchors and dated milestones keep their own
// dates. A calendar with no non-working day keeps calendar-day arithmetic.
//
// The schedule is every exporter's source for the chart's calendar and
// durations (handoff m2p decision 16): `calendar` is the file's resolved
// calendar and `ScheduledItem.days` the duration engine C placed. The XLSX
// exporter also reads the Start / End dates, the milestone dates and the
// wave spans; the Mermaid exporter reads the wave spans. Keeping it
// separate from `computeContentEndDay` avoids mutating the byte-stable
// snapshot pipeline.

import type {
    GroupBlock,
    ItemDeclaration,
    MilestoneDeclaration,
    NowlineFile,
    ParallelBlock,
    ResolveResult,
    SwimlaneDeclaration,
} from '@nowline/core';
import { buildWavePlan, isGroupBlock, isItemDeclaration, isParallelBlock } from '@nowline/core';
import { deriveItemDurationDays, resolveSizes } from './calendar.js';
import { type ResolvedCalendar, resolveWorkingCalendar } from './calendar-resolver.js';
import { parseDate, propValue, propValues } from './dsl-utils.js';
import { solveWaveBarriers, summarizeWaves, WavePass, waveFloorDays } from './wave-barrier.js';
import { spanEndDate } from './working-calendar.js';

/** Per-item scheduled interval, keyed by item id (name). */
export interface ScheduledItem {
    start: Date;
    end: Date;
    /**
     * Duration in working days: the `duration:` literal, or the size's effort
     * divided by `capacity:`, under the file's calendar. 0 when the item has
     * neither, or names an undeclared size.
     */
    days: number;
}

/**
 * Result of scheduling a roadmap. All dates are UTC midnight.
 *
 * `items` is keyed by DSL id and only contains **named** items.
 * `byNode` is keyed by AST node identity and contains **every** item,
 * including anonymous ones — use this when you have the AST node in hand
 * and want dates regardless of whether an id was declared.
 */
export interface RoadmapSchedule {
    /** Resolved roadmap start date (UTC midnight). */
    startDate: Date;
    /** The file's calendar, which every date and `days` here uses. */
    calendar: ResolvedCalendar;
    /** Named items keyed by their DSL id (`name`). */
    items: Map<string, ScheduledItem>;
    /** Every item keyed by AST node identity (named and anonymous). */
    byNode: WeakMap<ItemDeclaration, ScheduledItem>;
    /** Named milestones keyed by their DSL id. */
    milestones: Map<string, Date>;
    /** Every milestone keyed by AST node identity (named and anonymous). */
    milestoneByNode: WeakMap<MilestoneDeclaration, Date>;
    /** Named anchors: their declared or computed date. */
    anchors: Map<string, Date>;
    /**
     * Waves by id, in declaration order (specs/waves.md §8.5). Present only
     * when the roadmap declares waves.
     */
    waves?: Map<string, ScheduledWave>;
}

/** A wave's solved span (specs/waves.md §5.1). */
export interface ScheduledWave {
    /** 1-based declaration order. */
    index: number;
    /** `S_k` (UTC midnight). */
    start: Date;
    /** `E_k`, exclusive (UTC midnight); equals `start` for an empty wave. */
    end: Date;
    /** Members placed in the main lanes and first-level isolated regions. */
    memberCount: number;
    /** The member that sets `E_k` (id ?? title); omitted when none ends past `S_k`. */
    heldBy?: string;
    /** The wave's `after:` element that set `S_k`, when it beat the previous wave's end. */
    floorRef?: string;
}

export interface ScheduleOptions {
    /** Passed as the reference date when the roadmap omits `start:`. */
    today?: Date;
}

/**
 * Compute the scheduled start/end date for every named entity in the roadmap.
 * Does NOT run the full layout (no SVG geometry, no pixel coordinates).
 */
export function scheduleRoadmap(
    file: NowlineFile,
    resolved: ResolveResult,
    options: ScheduleOptions = {},
): RoadmapSchedule {
    const resolvedCalendar = resolveWorkingCalendar(file, resolved);
    const { config: cal, working: calendar } = resolvedCalendar;
    const sizes = resolveSizes(resolved.content.sizes, cal);

    // Resolve roadmap start date — same precedence as RoadmapNode.place.
    const startRaw = propValue(file.roadmapDecl?.properties ?? [], 'start');
    const startDate = parseDate(startRaw) ?? utcMidnight(options.today ?? new Date());
    // Working-day index of a date, and back: a point and an exclusive end.
    const dayOf = (date: Date): number => calendar.workingIndexOf(startDate, date);
    const pointAt = (day: number): Date => calendar.dateAtWorkingIndex(startDate, day);
    const endAt = (start: number, end: number): Date =>
        spanEndDate(calendar, startDate, start, end);

    // These maps accumulate end-day offsets (from startDate) for cross-entity
    // `after:` resolution, matching computeContentEndDay exactly. In a
    // roadmap with waves the item maps are rebuilt on every barrier pass.
    let itemEnd = new Map<string, number>(); // id → end day
    const anchorEnd = new Map<string, number>(); // id → date day
    const milestoneEnd = new Map<string, number>(); // id → date day

    // Result maps (Date objects).
    let itemResults = new Map<string, ScheduledItem>();
    let itemByNode = new WeakMap<ItemDeclaration, ScheduledItem>();
    const milestoneResults = new Map<string, Date>();
    const milestoneByNode = new WeakMap<MilestoneDeclaration, Date>();
    const anchorResults = new Map<string, Date>();

    // Pre-seed named anchors (they may be referenced by item after: before we
    // walk the lanes).
    for (const [id, anchor] of resolved.content.anchors) {
        const d = parseDate(propValue(anchor.properties, 'date'));
        if (d) {
            anchorEnd.set(id, dayOf(d));
            anchorResults.set(id, d);
        }
    }

    // The id maps one walk resolves `after:` against: the main lanes share
    // the maps above; an isolated region (wave mode only) gets fresh maps.
    interface WalkScope {
        itemEnd: Map<string, number>;
        anchorEnd: ReadonlyMap<string, number>;
        milestoneEnd: ReadonlyMap<string, number>;
        sizes: typeof sizes;
        /** Id-keyed results; omitted for a region, whose ids stay invisible. */
        itemResults?: Map<string, ScheduledItem>;
    }
    const mainScope = (): WalkScope => ({ itemEnd, anchorEnd, milestoneEnd, sizes, itemResults });

    // `wave` is the current barrier pass, undefined when there are no waves.
    const makeWalker = (scope: WalkScope, wave: WavePass | undefined) => {
        // Resolve a single `after:` element to a day-offset.
        const resolveAfterDay = (ref: string): number => {
            const inlineDate = parseDate(ref);
            if (inlineDate) return dayOf(inlineDate);
            if (scope.itemEnd.has(ref)) return scope.itemEnd.get(ref)!;
            if (scope.anchorEnd.has(ref)) return scope.anchorEnd.get(ref)!;
            if (scope.milestoneEnd.has(ref)) return scope.milestoneEnd.get(ref)!;
            return 0;
        };

        // Walk a sequential lane, returning the end-day of the last child.
        const walkLane = (
            children: SwimlaneDeclaration['content'],
            baselineEnd: number,
        ): number => {
            let prevEnd = baselineEnd;
            for (const child of children) {
                if (child.$type === 'DescriptionDirective') continue;
                prevEnd = walkNode(child as ItemDeclaration | GroupBlock | ParallelBlock, prevEnd);
            }
            return prevEnd;
        };

        const walkNode = (
            node: ItemDeclaration | GroupBlock | ParallelBlock,
            prevEnd: number,
        ): number => {
            if (isItemDeclaration(node)) {
                const dur = deriveItemDurationDays(node.properties, scope.sizes, cal);
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
                const scheduled: ScheduledItem = {
                    start: pointAt(start),
                    end: endAt(start, end),
                    days: dur,
                };
                itemByNode.set(node, scheduled);
                if (node.name) {
                    scope.itemEnd.set(node.name, end);
                    scope.itemResults?.set(node.name, scheduled);
                }
                wave?.accumulate(node, end);
                return end;
            }
            if (isParallelBlock(node)) {
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

    const plan = buildWavePlan(resolved);
    let waves: Map<string, ScheduledWave> | undefined;
    if (!plan) {
        const { walkLane } = makeWalker(mainScope(), undefined);
        for (const lane of resolved.content.swimlanes.values()) {
            walkLane(lane.content, 0);
        }
    } else {
        // Wave barriers (specs/waves.md §8.5): iterate the lane walk to the
        // least fixpoint. The final pass's results are the schedule.
        const ids = plan.waves.map((w) => w.name as string);
        const floors = waveFloorDays(plan, startDate, calendar);
        let finalPass: WavePass | undefined;
        const result = solveWaveBarriers(ids.length, 0, floors, (S, E) => {
            // Reset the item maps, keep the anchors, and seed each wave id
            // with E_k so `after:<wave>` resolves to the wave's end.
            const seeds = ids.map((id, i): [string, number] => [id, E[i]]);
            itemEnd = new Map(seeds);
            itemResults = new Map();
            itemByNode = new WeakMap();
            const pass = new WavePass(plan, S);
            const { walkLane } = makeWalker(mainScope(), pass);
            for (const lane of resolved.content.swimlanes.values()) {
                walkLane(lane.content, 0);
            }
            // Exactly one level of isolated regions, each with fresh id maps
            // seeded only with the wave edges. Region items join the barrier
            // and `byNode`; their ids stay out of `items`.
            for (const region of resolved.content.isolatedRegions) {
                const regionWalker = makeWalker(
                    {
                        itemEnd: new Map(seeds),
                        anchorEnd: new Map(),
                        milestoneEnd: new Map(),
                        sizes: resolveSizes(region.content.sizes, cal),
                    },
                    pass,
                );
                for (const lane of region.content.swimlanes.values()) {
                    regionWalker.walkLane(lane.content, 0);
                }
            }
            finalPass = pass;
            return pass;
        });
        waves = new Map();
        for (const span of summarizeWaves(plan, result, finalPass!, 0, floors)) {
            waves.set(span.id, {
                index: span.index,
                start: pointAt(span.start),
                end: endAt(span.start, span.end),
                memberCount: span.memberCount,
                ...(span.heldBy !== undefined ? { heldBy: span.heldBy } : {}),
                ...(span.floorRef !== undefined ? { floorRef: span.floorRef } : {}),
            });
        }
    }

    // Milestones — same pass order as computeContentEndDay (after items so
    // after: can resolve item end-days, and wave ids their E_k).
    const { resolveAfterDay } = makeWalker(mainScope(), undefined);
    for (const [id, ms] of resolved.content.milestones) {
        const d = parseDate(propValue(ms.properties, 'date'));
        if (d) {
            milestoneEnd.set(id, dayOf(d));
            milestoneResults.set(id, d);
            milestoneByNode.set(ms, d);
            continue;
        }
        const after = propValues(ms.properties, 'after');
        if (after.length > 0) {
            // A point at the latest predecessor end: the next working day.
            const day = Math.max(0, ...after.map(resolveAfterDay));
            const resolved2 = pointAt(day);
            milestoneEnd.set(id, day);
            milestoneResults.set(id, resolved2);
            milestoneByNode.set(ms, resolved2);
        }
    }

    return {
        startDate,
        calendar: resolvedCalendar,
        items: itemResults,
        byNode: itemByNode,
        milestones: milestoneResults,
        milestoneByNode,
        anchors: anchorResults,
        ...(waves ? { waves } : {}),
    };
}

function utcMidnight(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
