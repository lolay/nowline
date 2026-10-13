// `after:` on a lane or group child honours the lane cursor
// (specs/scheduler-unification.md §5 F1, §8 decision 3): the child starts at
// max(previous item end, every referenced entity's end), so `after:` only ever
// delays. Engine A used to start it at max(lane left edge, refs), which put it
// before its predecessor. The chart now matches engine C, which the exports use.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import {
    layoutRoadmap,
    type PositionedItem,
    type PositionedRoadmap,
    type PositionedTrackChild,
    scheduleRoadmap,
} from '../src/index.js';
import { ITEM_INSET_PX } from '../src/themes/shared.js';
import { parseAndResolve } from './helpers.js';

function collectItems(children: PositionedTrackChild[], out: PositionedItem[]): void {
    for (const child of children) {
        if (child.kind === 'item') out.push(child);
        else collectItems(child.children, out);
    }
}

/** The chart's logical `[start, end]` of every named item, in weeks (calendar:full). */
function chartWeeks(model: PositionedRoadmap): Record<string, [number, number]> {
    const items: PositionedItem[] = [];
    for (const lane of model.swimlanes) collectItems(lane.children, items);
    const { originX, pixelsPerDay } = model.timeline;
    const weeks = (x: number): number => Math.round(((x - originX) / pixelsPerDay / 7) * 100) / 100;
    const out: Record<string, [number, number]> = {};
    for (const it of items) {
        if (!it.id) continue;
        out[it.id] = [
            weeks(it.box.x - ITEM_INSET_PX),
            weeks(it.box.x + it.box.width + ITEM_INSET_PX),
        ];
    }
    return out;
}

/** The schedule's `[start, end]` of every named item, in weeks from the roadmap start. */
function scheduleWeeks(
    file: NowlineFile,
    resolved: ResolveResult,
): Record<string, [number, number]> {
    const schedule = scheduleRoadmap(file, resolved, { today: new Date(Date.UTC(2026, 0, 5)) });
    const weeks = (d: Date): number =>
        Math.round(((d.getTime() - schedule.startDate.getTime()) / 86_400_000 / 7) * 100) / 100;
    const out: Record<string, [number, number]> = {};
    for (const [id, s] of schedule.items) out[id] = [weeks(s.start), weeks(s.end)];
    return out;
}

async function weeksOf(source: string) {
    const { file, resolved } = await parseAndResolve(source);
    const model = layoutRoadmap(file, resolved, {
        theme: 'light',
        today: new Date(Date.UTC(2026, 0, 5)),
    });
    return { chart: chartWeeks(model), schedule: scheduleWeeks(file, resolved) };
}

/** Lane `s` holds `a` (3w) then `b after:x`; lane `r` holds `x`, placed first. */
const itemSource = (xWeeks: number): string => `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane r "Refs"
  item x "X" duration:${xWeeks}w

swimlane s "Subject"
  item a "A" duration:3w
  item b "B" duration:1w after:x
`;

/** The same, with a lane-level group in place of the item. */
const groupSource = (xWeeks: number): string => `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane r "Refs"
  item x "X" duration:${xWeeks}w

swimlane s "Subject"
  item a "A" duration:3w
  group g "G" after:x
    item g1 "G1" duration:1w
`;

describe('after: on a lane child honours the lane cursor', () => {
    it('item: x ends before the previous item, so b starts at a’s end', async () => {
        const { chart, schedule } = await weeksOf(itemSource(1));
        expect(chart.x).toEqual([0, 1]);
        expect(chart.a).toEqual([0, 3]);
        expect(chart.b).toEqual([3, 4]);
        expect(schedule.b).toEqual([3, 4]);
    });

    it('item: x ends after the previous item, so b starts at x’s end', async () => {
        const { chart, schedule } = await weeksOf(itemSource(5));
        expect(chart.a).toEqual([0, 3]);
        expect(chart.b).toEqual([5, 6]);
        expect(schedule.b).toEqual([5, 6]);
    });

    it('item: an inline date before the previous item’s end never pulls b earlier', async () => {
        const { chart, schedule } = await weeksOf(`nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane s "Subject"
  item a "A" duration:3w
  item b "B" duration:1w after:2026-01-12
`);
        expect(chart.b).toEqual([3, 4]);
        expect(schedule.b).toEqual([3, 4]);
    });

    it('group: x ends before the previous item, so the group starts at a’s end', async () => {
        const { chart, schedule } = await weeksOf(groupSource(1));
        expect(chart.g1).toEqual([3, 4]);
        expect(schedule.g1).toEqual([3, 4]);
    });

    it('group: x ends after the previous item, so the group starts at x’s end', async () => {
        const { chart, schedule } = await weeksOf(groupSource(5));
        expect(chart.g1).toEqual([5, 6]);
        expect(schedule.g1).toEqual([5, 6]);
    });
});
