// stageRoadmap builds the wave plan and the day schedule once, lays out with
// that schedule and returns both (specs/surface-options.md §3.3, §7 decision 1;
// specs/scheduler-unification.md §3.6). The three functions are wrapped, not
// replaced: the real implementations still run.

import { buildWavePlan } from '@nowline/core';
import { layoutRoadmap, scheduleRoadmap } from '@nowline/layout';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type StageInputs, stageRoadmap } from '../src/index.js';
import { getServices } from './helpers.js';

vi.mock('@nowline/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/core')>();
    return { ...actual, buildWavePlan: vi.fn(actual.buildWavePlan) };
});

vi.mock('@nowline/layout', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/layout')>();
    return {
        ...actual,
        scheduleRoadmap: vi.fn(actual.scheduleRoadmap),
        layoutRoadmap: vi.fn(actual.layoutRoadmap),
    };
});

const TODAY = new Date(Date.UTC(2026, 1, 9));

const WAVES = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"

swimlane web "Web"
  item research duration:2w wave:discover
  item checkout duration:3w wave:build
`;

const NO_WAVES = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item one duration:1w
  item two duration:2w
`;

const planSpy = vi.mocked(buildWavePlan);
const scheduleSpy = vi.mocked(scheduleRoadmap);
const layoutSpy = vi.mocked(layoutRoadmap);

function stage(source: string, layout: StageInputs['layout'] = { today: TODAY }) {
    return stageRoadmap({
        source,
        sourcePath: '/workspace/main.nowline',
        services: getServices(),
        readSource: async () => {
            throw new Error('no includes');
        },
        layout,
    });
}

beforeEach(() => {
    planSpy.mockClear();
    scheduleSpy.mockClear();
    layoutSpy.mockClear();
});

describe('stageRoadmap: wave plan and schedule', () => {
    it('returns the plan and the schedule it laid out with, with waves', async (): Promise<void> => {
        const result = await stage(WAVES);
        expect(result.kind).toBe('staged');
        if (result.kind !== 'staged') return;

        expect(planSpy).toHaveBeenCalledTimes(1);
        expect(scheduleSpy).toHaveBeenCalledTimes(1);
        expect(scheduleSpy).toHaveBeenCalledWith(result.ast, result.resolved, {
            today: TODAY,
            plan: result.plan,
        });
        expect(layoutSpy).toHaveBeenCalledTimes(1);
        expect(layoutSpy.mock.calls[0][2]?.schedule).toBe(result.schedule);

        expect(result.plan).not.toBeNull();
        expect(result.schedule.plan).toBe(result.plan);
        expect(result.schedule.resolved).toBe(result.resolved);
        expect([...(result.schedule.waves?.keys() ?? [])]).toEqual(['discover', 'build']);
    });

    it('returns a null plan and a schedule without waves, without waves', async (): Promise<void> => {
        const result = await stage(NO_WAVES);
        expect(result.kind).toBe('staged');
        if (result.kind !== 'staged') return;

        expect(planSpy).toHaveBeenCalledTimes(1);
        expect(scheduleSpy).toHaveBeenCalledTimes(1);
        expect(layoutSpy.mock.calls[0][2]?.schedule).toBe(result.schedule);
        expect(result.plan).toBeNull();
        expect(result.schedule.plan).toBeUndefined();
        expect(result.schedule.items.get('two')?.days).toBe(10);
    });

    it('schedules with the stage layout today, also when it is absent', async (): Promise<void> => {
        const result = await stage(NO_WAVES, { theme: 'dark' });
        expect(result.kind).toBe('staged');
        expect(scheduleSpy.mock.calls[0][2]).toEqual({ today: undefined, plan: null });
    });
});
