// `after:` on a lane or group child honours the lane cursor
// (specs/scheduler-unification.md §5 F1, §8 decision 3): the child starts at
// max(previous item end, every referenced entity's end), so `after:` only ever
// delays. Engine A used to start it at max(lane left edge, refs), which put it
// before its predecessor. The chart now matches engine C, which the exports use.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import {
    layoutRoadmap,
    type PositionedGroup,
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
    return { model, chart: chartWeeks(model), schedule: scheduleWeeks(file, resolved) };
}

/** The placed group `id`, anywhere in the lanes. */
function findGroup(model: PositionedRoadmap, id: string): PositionedGroup | undefined {
    const walk = (children: PositionedTrackChild[]): PositionedGroup | undefined => {
        for (const child of children) {
            if (child.kind === 'item') continue;
            if (child.kind === 'group' && child.id === id) return child;
            const found = walk(child.children);
            if (found) return found;
        }
        return undefined;
    };
    for (const lane of model.swimlanes) {
        const found = walk(lane.children);
        if (found) return found;
    }
    return undefined;
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

/** Lane `s` holds a group whose second item is `q after:x`; lane `r` holds `x`. */
const groupChildSource = (xWeeks: number): string => `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane r "Refs"
  item x "X" duration:${xWeeks}w

swimlane s "Subject"
  group g "G"
    item p "P" duration:3w
    item q "Q" duration:1w after:x
`;

/** The same, with a lane-level parallel after `a` in place of the item. */
const parallelSource = (xWeeks: number): string => `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane r "Refs"
  item x "X" duration:${xWeeks}w

swimlane s "Subject"
  item a "A" duration:3w
  parallel pp after:x
    item t1 "T1" duration:1w
    item t2 "T2" duration:2w
`;

/**
 * Lane `s` holds `a`, then a parallel whose second track is the group
 * `gg after:x`; lane `r` holds `x`.
 */
const groupTrackSource = (xWeeks: number): string => `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane r "Refs"
  item x "X" duration:${xWeeks}w

swimlane s "Subject"
  item a "A" duration:3w
  parallel pp
    item t1 "T1" duration:1w
    group gg "GG" after:x
      item g1 "G1" duration:1w
      item g2 "G2" duration:1w
  item z "Z" duration:1w
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

    it('group child: x ends before the previous item, so q starts at p’s end', async () => {
        const { chart, schedule } = await weeksOf(groupChildSource(1));
        expect(chart.p).toEqual([0, 3]);
        expect(chart.q).toEqual([3, 4]);
        expect(schedule.q).toEqual([3, 4]);
    });

    it('group child: x ends after the previous item, so q starts at x’s end', async () => {
        const { chart, schedule } = await weeksOf(groupChildSource(5));
        expect(chart.q).toEqual([5, 6]);
        expect(schedule.q).toEqual([5, 6]);
    });

    it('parallel: x ends before the previous item, so the parallel starts at a’s end', async () => {
        const { chart, schedule } = await weeksOf(parallelSource(1));
        expect(chart.t1).toEqual([3, 4]);
        expect(chart.t2).toEqual([3, 5]);
        expect(schedule.t1).toEqual([3, 4]);
        expect(schedule.t2).toEqual([3, 5]);
    });

    it('parallel: x ends after the previous item, so the parallel starts at x’s end', async () => {
        const { chart, schedule } = await weeksOf(parallelSource(5));
        expect(chart.t1).toEqual([5, 6]);
        expect(schedule.t2).toEqual([5, 7]);
        expect(chart.t2).toEqual([5, 7]);
    });
});

// Divergence (e) (specs/scheduler-unification.md §5 F2, §8 decision 5): a
// group track of a parallel starts at max(the parallel's start, every
// referenced entity's end), as engine C and a lane-level group do.
describe('after: on a group track of a parallel', () => {
    it('x ends before the parallel starts, so the group starts with the parallel', async () => {
        const { chart, schedule } = await weeksOf(groupTrackSource(1));
        expect(chart.t1).toEqual([3, 4]);
        expect(chart.g1).toEqual([3, 4]);
        expect(chart.g2).toEqual([4, 5]);
        // The parallel joins on the group's end, with no tail gutter
        // (divergence (d), §8 decision 8), so the lane resumes there.
        expect(chart.z).toEqual([5, 6]);
        for (const id of ['t1', 'g1', 'g2', 'z']) expect(chart[id], id).toEqual(schedule[id]);
    });

    it('x ends after the parallel starts, so the group starts at x’s end', async () => {
        const { chart, schedule } = await weeksOf(groupTrackSource(5));
        expect(chart.t1).toEqual([3, 4]);
        expect(chart.g1).toEqual([5, 6]);
        expect(chart.g2).toEqual([6, 7]);
        expect(chart.z).toEqual([7, 8]);
        for (const id of ['t1', 'g1', 'g2', 'z']) expect(chart[id], id).toEqual(schedule[id]);
    });

    it('the canvas covers a caption spilled from a group track at the chart’s end', async () => {
        // The group track starts late (after:x), and its one-day item's
        // caption spills past the bar, the group's box and the axis end.
        const { model } = await weeksOf(`nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane r "Refs"
  item x "X" duration:5w

swimlane s "Subject"
  item a "A" duration:3w
  parallel pp
    item t1 "T1" duration:1w
    group gg "Screens" after:x
      item sc "Screens for the onboarding flow and the settings pages" duration:1d
`);
        const group = findGroup(model, 'gg');
        expect(group).toBeDefined();
        const [screens] = (group as PositionedGroup).children;
        expect(screens.kind).toBe('item');
        expect((screens as PositionedItem).textSpills).toBe(true);
        const captionRight = (screens as PositionedItem).decorationsRightX;
        const groupRight = (group as PositionedGroup).box.x + (group as PositionedGroup).box.width;
        expect(groupRight).toBeGreaterThanOrEqual(captionRight);
        expect(model.width).toBeGreaterThanOrEqual(groupRight);
    });
});

/** The placed item `id`, anywhere in the lanes. */
function findItem(model: PositionedRoadmap, id: string): PositionedItem {
    const items: PositionedItem[] = [];
    for (const lane of model.swimlanes) collectItems(lane.children, items);
    const found = items.find((it) => it.id === id);
    if (!found) throw new Error(`no item ${id}`);
    return found;
}

// Divergence (c) (specs/scheduler-unification.md §5 F3, §8 decision 7): a
// group's spilled caption stays out of the lane cursor. The item after the
// group starts at the group's last child end, as in engine C, and drops
// below the caption because the row packer keeps the group's painted box.
describe('a group caption spill stays out of the lane cursor', () => {
    const spill = 'Bootstrap the onboarding flow and every settings page';

    it('lane-level group: the next item starts at the group’s compact end, a row lower', async () => {
        const { model, chart, schedule } = await weeksOf(`nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane s "Subject"
  group g "G"
    item a "A" duration:1w
    item b "${spill}" duration:1w
  item z "Z" duration:1w
`);
        const b = findItem(model, 'b');
        expect(b.textSpills).toBe(true);
        expect(chart.b).toEqual([1, 2]);
        expect(chart.z).toEqual([2, 3]);
        expect(chart.z).toEqual(schedule.z);
        // The group's painted box (caption included) still owns its row.
        const g = findGroup(model, 'g') as PositionedGroup;
        expect(g.box.x + g.box.width).toBeGreaterThan(findItem(model, 'z').box.x);
        expect(findItem(model, 'z').box.y).toBeGreaterThanOrEqual(g.box.y + g.box.height);
    });

    it('a parallel after the group starts its tracks at the group’s compact end', async () => {
        const { model, chart, schedule } = await weeksOf(`nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane s "Subject"
  group g "G"
    item a "A" duration:1w
    item b "${spill}" duration:1w
  parallel pp
    item t "T" duration:1w
    item u "U" duration:2w
`);
        expect(findItem(model, 'b').textSpills).toBe(true);
        expect(chart.t).toEqual([2, 3]);
        expect(chart.u).toEqual([2, 4]);
        expect(chart.t).toEqual(schedule.t);
        expect(chart.u).toEqual(schedule.u);
    });
});

// Divergence (b) (specs/scheduler-unification.md §5 F3, §8 decision 6): the
// minimum bar width stays out of the lane cursor. The cursor advances by the
// duration, so the next item starts on its date, as in engine C; the clamped
// bar keeps its width (presentation), and the row packer keeps that painted
// footprint, so the next bar drops a row instead of overlapping it.
describe('the minimum bar width stays out of the lane cursor', () => {
    const source = (waves: boolean): string => `nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w
${waves ? '\nwave w1 "W1"\nwave w2 "W2"\n' : ''}
swimlane s "Subject"
  item a "A" duration:1d${waves ? ' wave:w1' : ''}
  item b "B" duration:1w${waves ? ' wave:w2' : ''}
`;

    it('the next item starts at the clamped item’s duration end, a row lower', async () => {
        const { model, chart, schedule } = await weeksOf(source(false));
        // a is drawn wider than its one day: presentation.
        expect(chart.a[1]).toBeGreaterThan(schedule.a[1]);
        expect(chart.b).toEqual(schedule.b);
        expect(chart.b[0]).toBeLessThan(chart.a[1]);
        expect(findItem(model, 'b').box.y).toBeGreaterThan(findItem(model, 'a').box.y);
    });

    it('a clamped wave member closes its wave at its duration end', async () => {
        const { model, chart, schedule } = await weeksOf(source(true));
        expect(chart.b).toEqual(schedule.b);
        const [w1, w2] = model.waves ?? [];
        expect(w2.startX).toBeCloseTo(w1.endX, 6);
        expect(w2.startX).toBeLessThan(
            findItem(model, 'a').box.x + findItem(model, 'a').box.width + ITEM_INSET_PX,
        );
    });
});
