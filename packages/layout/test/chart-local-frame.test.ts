// F2 of specs/layout-phases.md: placement lays the chart out with its top
// at 0, and finalize translates it to its top on the canvas once, on every
// layout (f7). A y that placement takes from the header (a marker
// predecessor's row, where its slack arrow starts) enters the chart frame
// relative to the estimated top, so the translation leaves it on its row.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { buildWavePlan } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { sequenceOne } from '../src/nodes/sequence-one.js';
import { resolveDateWindow, resolveScope } from '../src/phases/date-window.js';
import { measureRoadmap } from '../src/phases/measure.js';
import { placeChart } from '../src/phases/place.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { parseAndResolve } from './helpers.js';

const TODAY = new Date(Date.UTC(2026, 1, 9));
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const SOURCE = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor kickoff "Kickoff" date:2026-01-12
milestone ship "Ship" after:[kickoff, a2]

swimlane a "A"
  item a1 "A1" duration:2w
  item a2 "A2" duration:2w after:a1
`;

async function phases(source: string) {
    const { file, resolved } = await parseAndResolve(source);
    const options = { today: TODAY };
    const schedule = scheduleRoadmap(file, resolved, {
        today: TODAY,
        plan: buildWavePlan(resolved) ?? null,
    });
    const scope = resolveScope(file, resolved, options);
    const window = resolveDateWindow(file, resolved, options, scope, schedule);
    const measured = measureRoadmap(file, resolved, options, scope, window);
    const chart = placeChart(resolved, scope, window, measured, { sequenceOne });
    return { measured, chart, model: layoutRoadmap(file, resolved, options) };
}

describe('the chart in local coordinates', () => {
    it('is placed with its top at 0', async () => {
        const { measured, chart } = await phases(SOURCE);
        expect(measured.bands.chartTopY).toBeGreaterThan(0);
        expect(chart.ctx.chartTopY).toBe(0);
        expect(chart.ctx.estimatedChartTopY).toBe(measured.bands.chartTopY);
        expect(chart.swimlanes[0].box.y).toBe(0);
        expect(chart.milestones[0].cutTopY).toBe(0);
    });

    it('is translated to its top even when the header rows do not grow', async () => {
        const { measured, model } = await phases(SOURCE);
        const top = measured.bands.chartTopY;
        expect(model.swimlanes[0].box.y).toBe(top);
        expect(model.milestones[0].cutTopY).toBe(top);
        expect(model.milestones[0].cutBottomY).toBe(
            model.swimlanes[0].box.y + model.swimlanes[0].box.height,
        );
        expect(model.timeline.box.y + model.timeline.box.height).toBe(
            model.milestones[0].cutBottomY,
        );
    });

    it('is translated below a marker band that grew', async () => {
        const file = path.join(REPO_ROOT, 'tests', 'late-row-shifts.nowline');
        const { measured, model } = await phases(await fs.readFile(file, 'utf8'));
        const grown = model.timeline.markerRow.height - measured.timeline.markerRow.height;
        expect(grown).toBeGreaterThan(0);
        expect(model.swimlanes[0].box.y).toBe(measured.bands.chartTopY + grown);
    });

    it("keeps a marker predecessor's slack arrow on the marker's row", async () => {
        const { model } = await phases(SOURCE);
        const arrows = model.milestones[0].slackArrows ?? [];
        expect(arrows).toHaveLength(1);
        expect(arrows[0].x).toBe(model.anchors[0].center.x);
        expect(arrows[0].y).toBe(model.anchors[0].center.y);
    });
});
