// A milestone's place and a `before:` cap are time paths
// (specs/scheduler-unification.md §8 decision 14, §9): they read an item's
// duration end. Since m4.15 a bar spans exactly its dates
// (specs/true-width-layout.md §3.1), so its painted edge is its end less a
// 1 px seam, and the arrows leave it there. At `scale:1w` a 1-day bar spans
// 5.71 px.

import { describe, expect, it } from 'vitest';
import {
    layoutRoadmap,
    type PositionedItem,
    type PositionedMilestone,
    type PositionedRoadmap,
    type PositionedTrackChild,
    scheduleRoadmap,
} from '../src/index.js';
import { parseAndResolve } from './helpers.js';

const TODAY = new Date(Date.UTC(2026, 0, 5));

const HEADER = `nowline v1

roadmap r "Probe" start:2026-01-05 scale:1w calendar:full

swimlane s "Team"
`;

async function laidOut(body: string) {
    const { file, resolved } = await parseAndResolve(HEADER + body);
    const model = layoutRoadmap(file, resolved, { theme: 'light', today: TODAY });
    const schedule = scheduleRoadmap(file, resolved, { today: TODAY });
    return { model, schedule };
}

/** Days from the roadmap start at chart x, to two decimals. */
function dayAt(model: PositionedRoadmap, x: number): number {
    const { originX, pixelsPerDay } = model.timeline;
    return Math.round(((x - originX) / pixelsPerDay) * 100) / 100;
}

/** Days from the roadmap start of a schedule date. */
function dayOf(date: Date | undefined): number {
    if (!date) throw new Error('no date');
    return (date.getTime() - TODAY.getTime()) / 86_400_000;
}

function milestone(model: PositionedRoadmap, id: string): PositionedMilestone {
    const m = model.milestones.find((x) => x.id === id);
    if (!m) throw new Error(`no milestone ${id}`);
    return m;
}

function item(model: PositionedRoadmap, id: string): PositionedItem {
    const walk = (children: PositionedTrackChild[]): PositionedItem | undefined => {
        for (const child of children) {
            if (child.kind === 'item') {
                if (child.id === id) return child;
            } else {
                const found = walk(child.children);
                if (found) return found;
            }
        }
        return undefined;
    };
    for (const lane of model.swimlanes) {
        const found = walk(lane.children);
        if (found) return found;
    }
    throw new Error(`no item ${id}`);
}

describe('after-only milestone sits on the duration end', () => {
    it('after a 1-day item, on engine C’s day', async () => {
        const { model, schedule } = await laidOut(`  item a "A" duration:1d

milestone m "After A" after:a
`);
        const a = item(model, 'a');
        // The bar ends inside its day, a seam short of the end.
        expect(dayAt(model, a.box.x + a.box.width)).toBeLessThan(1);
        expect(dayOf(schedule.milestones.get('m'))).toBe(1);
        expect(dayAt(model, milestone(model, 'm').center.x)).toBe(1);
    });

    it('after an unclamped item, on its duration end, not its inset bar edge', async () => {
        const { model, schedule } = await laidOut(`  item a "A" duration:1d
  item b "B" duration:2w

milestone m "After B" after:b
`);
        expect(dayOf(schedule.milestones.get('m'))).toBe(15);
        expect(dayAt(model, milestone(model, 'm').center.x)).toBe(15);
    });

    it('starts the slack arrow of a non-binding bar on its end date', async () => {
        const { model } = await laidOut(`  item a "A" duration:1w
swimlane t "Other"
  item b "B" duration:3w

milestone m "Both" after:[a, b]
`);
        const m = milestone(model, 'm');
        const a = item(model, 'a');
        expect(dayAt(model, m.center.x)).toBe(21);
        expect(m.slackArrows?.map((p) => p.x)).toEqual([a.dateSpan.endX]);
        expect(dayAt(model, a.dateSpan.endX)).toBe(7);
    });
});

describe('a dated milestone overruns by duration end', () => {
    it('is not overrun when a 1-day bar’s duration ends on the date', async () => {
        const { model } = await laidOut(`  item a "A" duration:1d

milestone m "Jan 6" date:2026-01-06 after:a
`);
        const m = milestone(model, 'm');
        expect(m.isOverrun).toBe(false);
        expect(m.slackArrows).toBeUndefined();
    });

    it('is overrun when the duration passes the date; a day late, the diamonds meet and it does not slip', async () => {
        const { model } = await laidOut(`  item a "A" duration:2d

milestone m "Jan 6" date:2026-01-06 after:a
`);
        const m = milestone(model, 'm');
        const a = item(model, 'a');
        expect(m.isOverrun).toBe(true);
        expect(m.slackArrows).toBeUndefined();
        // One day at this scale is under two diamond radii.
        expect(a.dateSpan.endX - m.center.x).toBeLessThan(12);
        expect(m.slip).toBeUndefined();
    });
});

describe('before: overflow compares the duration end', () => {
    it('does not flag a 1-day bar whose duration meets the cap', async () => {
        const { model } = await laidOut(`  item a "A" duration:1d before:2026-01-06
`);
        const a = item(model, 'a');
        expect(a.hasOverflow).toBe(false);
        expect(a.overflowBox).toBeUndefined();
    });

    it('flags one whose duration passes the cap, the tail to the painted end', async () => {
        const { model } = await laidOut(`  item a "A" duration:2d before:2026-01-06
`);
        const a = item(model, 'a');
        expect(a.hasOverflow).toBe(true);
        expect(dayAt(model, a.overflowBox?.x ?? 0)).toBe(1);
    });
});
