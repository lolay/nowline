// scheduleRoadmap — compute the floating calendar start/end date for every
// named entity (items, milestones, anchors) without running the full layout.
//
// The sequencing rules exactly mirror `computeContentEndDay` in `layout.ts`
// plus the roadmap-start resolution in `RoadmapNode.place`:
//   - date: / start:  — absolute pin (date: wins over start:)
//   - after:[id|DATE]  — start after the maximum predecessor end
//   - sequential default — start where the previous item in the lane ended
//
// Used by the XLSX exporter to populate the "Start" / "End" date columns and
// the milestone "Date" cell when no explicit `date:` is set. Keeping it
// separate from `computeContentEndDay` avoids mutating the byte-stable snapshot
// pipeline.

import type {
    GroupBlock,
    ItemDeclaration,
    MilestoneDeclaration,
    NowlineFile,
    ParallelBlock,
    ResolveResult,
    SwimlaneDeclaration,
} from '@nowline/core';
import { isGroupBlock, isItemDeclaration, isParallelBlock } from '@nowline/core';
import {
    addDays,
    daysBetween,
    deriveItemDurationDays,
    resolveCalendar,
    resolveSizes,
} from './calendar.js';
import { parseDate, propValue, propValues } from './dsl-utils.js';

/** Per-item scheduled interval, keyed by item id (name). */
export interface ScheduledItem {
    start: Date;
    end: Date;
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
    const cal = resolveCalendar(file, resolved.config.calendar);
    const sizes = resolveSizes(resolved.content.sizes, cal);

    // Resolve roadmap start date — same precedence as RoadmapNode.place.
    const startRaw = propValue(file.roadmapDecl?.properties ?? [], 'start');
    const startDate = parseDate(startRaw) ?? utcMidnight(options.today ?? new Date());

    // These maps accumulate end-day offsets (from startDate) for cross-entity
    // `after:` resolution, matching computeContentEndDay exactly.
    const itemEnd = new Map<string, number>(); // id → end day
    const anchorEnd = new Map<string, number>(); // id → date day
    const milestoneEnd = new Map<string, number>(); // id → date day

    // Result maps (Date objects).
    const itemResults = new Map<string, ScheduledItem>();
    const itemByNode = new WeakMap<ItemDeclaration, ScheduledItem>();
    const milestoneResults = new Map<string, Date>();
    const milestoneByNode = new WeakMap<MilestoneDeclaration, Date>();
    const anchorResults = new Map<string, Date>();

    // Resolve a single `after:` element to a day-offset.
    const resolveAfterDay = (ref: string): number => {
        const inlineDate = parseDate(ref);
        if (inlineDate) return daysBetween(startDate, inlineDate);
        if (itemEnd.has(ref)) return itemEnd.get(ref)!;
        if (anchorEnd.has(ref)) return anchorEnd.get(ref)!;
        if (milestoneEnd.has(ref)) return milestoneEnd.get(ref)!;
        return 0;
    };

    // Pre-seed named anchors (they may be referenced by item after: before we
    // walk the lanes).
    for (const [id, anchor] of resolved.content.anchors) {
        const d = parseDate(propValue(anchor.properties, 'date'));
        if (d) {
            const day = daysBetween(startDate, d);
            anchorEnd.set(id, day);
            anchorResults.set(id, addDays(startDate, day));
        }
    }

    // Walk a sequential lane, returning the end-day of the last child.
    const walkLane = (children: SwimlaneDeclaration['content'], baselineEnd: number): number => {
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
            const dur = deriveItemDurationDays(node.properties, sizes, cal);
            const dateProp = parseDate(propValue(node.properties, 'date'));
            const startProp = parseDate(propValue(node.properties, 'start'));
            const afterRefs = propValues(node.properties, 'after');
            let start = prevEnd;
            if (dateProp) {
                start = daysBetween(startDate, dateProp);
            } else if (startProp) {
                start = daysBetween(startDate, startProp);
            } else if (afterRefs.length > 0) {
                start = Math.max(prevEnd, ...afterRefs.map(resolveAfterDay));
            }
            const end = start + dur;
            const scheduled: ScheduledItem = {
                start: addDays(startDate, start),
                end: addDays(startDate, end),
            };
            itemByNode.set(node, scheduled);
            if (node.name) {
                itemEnd.set(node.name, end);
                itemResults.set(node.name, scheduled);
            }
            return end;
        }
        if (isParallelBlock(node)) {
            const afterRefs = propValues(node.properties, 'after');
            const containerStart =
                afterRefs.length > 0
                    ? Math.max(prevEnd, ...afterRefs.map(resolveAfterDay))
                    : prevEnd;
            let parallelEnd = containerStart;
            for (const child of node.content) {
                if (child.$type === 'DescriptionDirective') continue;
                const childEnd = walkNode(child as ItemDeclaration | GroupBlock, containerStart);
                parallelEnd = Math.max(parallelEnd, childEnd);
            }
            return parallelEnd;
        }
        if (isGroupBlock(node)) {
            const afterRefs = propValues(node.properties, 'after');
            const containerStart =
                afterRefs.length > 0
                    ? Math.max(prevEnd, ...afterRefs.map(resolveAfterDay))
                    : prevEnd;
            return walkLane(node.content as SwimlaneDeclaration['content'], containerStart);
        }
        return prevEnd;
    };

    for (const lane of resolved.content.swimlanes.values()) {
        walkLane(lane.content, 0);
    }

    // Milestones — same pass order as computeContentEndDay (after items so
    // after: can resolve item end-days).
    for (const [id, ms] of resolved.content.milestones) {
        const d = parseDate(propValue(ms.properties, 'date'));
        if (d) {
            const day = daysBetween(startDate, d);
            const resolved2 = addDays(startDate, day);
            milestoneEnd.set(id, day);
            milestoneResults.set(id, resolved2);
            milestoneByNode.set(ms, resolved2);
            continue;
        }
        const after = propValues(ms.properties, 'after');
        if (after.length > 0) {
            const day = Math.max(0, ...after.map(resolveAfterDay));
            const resolved2 = addDays(startDate, day);
            milestoneEnd.set(id, day);
            milestoneResults.set(id, resolved2);
            milestoneByNode.set(ms, resolved2);
        }
    }

    return {
        startDate,
        items: itemResults,
        byNode: itemByNode,
        milestones: milestoneResults,
        milestoneByNode,
        anchors: anchorResults,
    };
}

function utcMidnight(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
