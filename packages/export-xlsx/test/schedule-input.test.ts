// `ExportInputs.schedule` is optional (specs/scheduler-unification.md §3.6):
// an export given the kernel's schedule is the export of the same inputs
// without one, and the wave plan comes from `schedule.plan`.

import { scheduleRoadmap } from '@nowline/layout';
import { describe, expect, it } from 'vitest';
import { exportXlsx } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

const TODAY = new Date(Date.UTC(2026, 0, 5));

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

const PLAIN = `nowline v1

roadmap plain "Plain" start:2026-01-05 scale:1w

swimlane a "A"
  item one duration:1w
  item two duration:2w
`;

async function withSchedule(source: string) {
    const inputs = await buildExportInputs(source, { today: TODAY });
    const schedule = scheduleRoadmap(inputs.ast, inputs.resolved, { today: TODAY });
    return { inputs, schedule };
}

describe('exportXlsx and ExportInputs.schedule', () => {
    for (const [name, source] of [
        ['with waves', WAVES],
        ['without waves', PLAIN],
    ] as const) {
        it(`gives the same output with and without a schedule ${name}`, async () => {
            const { inputs, schedule } = await withSchedule(source);
            const bare = await exportXlsx(inputs, { generated: TODAY });
            const carried = await exportXlsx({ ...inputs, schedule }, { generated: TODAY });
            expect(Buffer.from(carried).equals(Buffer.from(bare))).toBe(true);
        });
    }

    it('reads the wave plan from schedule.plan', async () => {
        const { inputs, schedule } = await withSchedule(WAVES);
        expect(schedule.plan).toBeDefined();
        const out = await exportXlsx({ ...inputs, schedule }, { generated: TODAY });
        const stripped = await exportXlsx(
            { ...inputs, schedule: { ...schedule, plan: undefined } },
            { generated: TODAY },
        );
        expect(Buffer.from(out).equals(Buffer.from(stripped))).toBe(false);
    });
});
