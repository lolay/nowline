import { beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { type RoadmapSchedule, scheduleRoadmap } from '../src/schedule.js';
import { parseAndResolve } from './helpers.js';

// `layoutRoadmap` builds its day schedule itself unless the caller hands one
// in for the same `ResolveResult` (specs/scheduler-unification.md §3.6).
// `scheduleRoadmap` is wrapped so the tests can count the builds.
vi.mock('../src/schedule.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/schedule.js')>();
    return { ...actual, scheduleRoadmap: vi.fn(actual.scheduleRoadmap) };
});

const SOURCE = `nowline v1

roadmap reuse "Schedule reuse" start:2026-01-05 scale:weeks

swimlane build
  item a "A" duration:1w
  item b "B" duration:2w
`;

const TODAY = new Date(Date.UTC(2026, 0, 12));
const scheduleSpy = vi.mocked(scheduleRoadmap);

describe('LayoutOptions.schedule', () => {
    beforeEach(() => {
        scheduleSpy.mockClear();
    });

    it('builds the schedule once when none is supplied', async () => {
        const { file, resolved } = await parseAndResolve(SOURCE);
        layoutRoadmap(file, resolved, { today: TODAY });
        expect(scheduleSpy).toHaveBeenCalledTimes(1);
    });

    it('reuses a schedule built from the same ResolveResult', async () => {
        const { file, resolved } = await parseAndResolve(SOURCE);
        const schedule = scheduleRoadmap(file, resolved, { today: TODAY });
        scheduleSpy.mockClear();

        const reused = layoutRoadmap(file, resolved, { today: TODAY, schedule });

        expect(scheduleSpy).not.toHaveBeenCalled();
        expect(reused).toEqual(layoutRoadmap(file, resolved, { today: TODAY }));
    });

    it('takes the date window from the schedule it is given', async () => {
        const { file, resolved } = await parseAndResolve(SOURCE);
        const real = scheduleRoadmap(file, resolved, { today: TODAY });
        const stretched: RoadmapSchedule = {
            ...real,
            extent: { contentEndDay: real.extent.contentEndDay + 70 },
        };

        const baseline = layoutRoadmap(file, resolved, { today: TODAY });
        scheduleSpy.mockClear();
        const result = layoutRoadmap(file, resolved, { today: TODAY, schedule: stretched });

        expect(scheduleSpy).not.toHaveBeenCalled();
        expect(result.timeline.endDate.getTime()).toBeGreaterThan(
            baseline.timeline.endDate.getTime(),
        );
    });

    it('rebuilds a schedule built from another ResolveResult', async () => {
        const { file, resolved } = await parseAndResolve(SOURCE);
        const other = await parseAndResolve(SOURCE);
        expect(other.resolved).not.toBe(resolved);
        const foreign = scheduleRoadmap(other.file, other.resolved, { today: TODAY });
        const stretched: RoadmapSchedule = {
            ...foreign,
            extent: { contentEndDay: foreign.extent.contentEndDay + 70 },
        };

        const baseline = layoutRoadmap(file, resolved, { today: TODAY });
        scheduleSpy.mockClear();
        const result = layoutRoadmap(file, resolved, { today: TODAY, schedule: stretched });

        expect(scheduleSpy).toHaveBeenCalledTimes(1);
        expect(result.timeline.endDate).toEqual(baseline.timeline.endDate);
    });
});
