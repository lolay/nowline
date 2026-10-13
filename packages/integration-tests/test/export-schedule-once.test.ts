// The export kernel builds the wave plan and the day schedule once per
// export and carries them to the layout and the exporters
// (specs/scheduler-unification.md §3.6). `buildWavePlan` and `scheduleRoadmap`
// are wrapped, not replaced: the real implementations still run. Each
// exporter's own tests cover its path without `schedule`.

import * as path from 'node:path';
import { buildWavePlan } from '@nowline/core';
import { exportDocument, type HostEnv, type RenderInputs } from '@nowline/export';
import { scheduleRoadmap } from '@nowline/layout';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nowline/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/core')>();
    return { ...actual, buildWavePlan: vi.fn(actual.buildWavePlan) };
});

vi.mock('@nowline/layout', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/layout')>();
    return { ...actual, scheduleRoadmap: vi.fn(actual.scheduleRoadmap) };
});

const ROOT = path.resolve('/nowline-kernel');

const WAVES = `nowline v1

roadmap launch-plan "Launch plan" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"

swimlane web "Web"
  item web-research "UX research" duration:2w wave:discover
  item web-build "Checkout v2" duration:3w wave:build
swimlane api "API"
  item api-spike "API spike" duration:1w wave:discover
  item api-build "Payments API" duration:4w wave:build
`;

const NO_WAVES = `nowline v1

roadmap plain "Plain" start:2026-01-05 scale:1w

swimlane a "A"
  item one duration:1w
  item two duration:2w
`;

const host: HostEnv = {
    readSource: async (absPath) => {
        throw new Error(`ENOENT: ${absPath}`);
    },
    readAsset: async () => {
        throw new Error('no assets');
    },
    loadWasm: () => {
        throw new Error('this export must not need the raster wasm');
    },
};

const inputs: RenderInputs = {
    sourcePath: path.join(ROOT, 'program.nowline'),
    today: new Date(Date.UTC(2026, 0, 5)),
    locale: 'en-US',
    theme: 'light',
};

const planSpy = vi.mocked(buildWavePlan);
const scheduleSpy = vi.mocked(scheduleRoadmap);

beforeEach(() => {
    planSpy.mockClear();
    scheduleSpy.mockClear();
});

describe('export kernel: one plan and one schedule per export', () => {
    for (const [name, source] of [
        ['with waves', WAVES],
        ['without waves', NO_WAVES],
    ] as const) {
        for (const format of ['svg', 'xlsx', 'msproj', 'mermaid'] as const) {
            it(`${format} ${name} builds the wave plan once and the schedule once`, async () => {
                await exportDocument(source, format, inputs, host);
                expect(planSpy).toHaveBeenCalledTimes(1);
                expect(scheduleSpy).toHaveBeenCalledTimes(1);
            });
        }
    }
});
