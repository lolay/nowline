// F2 of specs/layout-phases.md: placement lays the chart out with its top
// at 0, and finalize translates it to its top on the canvas once, on every
// layout (f7). A milestone's slack or overrun arrow from an anchor or
// milestone is not a chart y at all: it starts on that marker's final row,
// which only the final pack knows (f6, or the region's own pack), so the
// translation leaves it there.

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
import type { PositionedMilestone } from '../src/types.js';
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

async function phases(source: string, filePath?: string) {
    const { file, resolved } = await parseAndResolve(source, filePath, (p) =>
        fs.readFile(p, 'utf8'),
    );
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

    it("starts a marker predecessor's arrow on its final row when the band grows", async () => {
        const file = path.join(REPO_ROOT, 'tests', 'marker-predecessor-arrows.nowline');
        const { measured, model } = await phases(await fs.readFile(file, 'utf8'), file);
        expect(model.timeline.markerRow.height).toBeGreaterThan(measured.timeline.markerRow.height);
        const byId = new Map([...model.anchors, ...model.milestones].map((m) => [m.id, m]));
        const arrowFrom = (milestone: string, pred: string) => {
            const arrow = byId
                .get(milestone)
                ?.slackArrows?.find((a) => a.x === byId.get(pred)?.center.x);
            expect(arrow, `${milestone} after ${pred}`).toBeDefined();
            return arrow?.y;
        };
        // A slack and an overrun arrow from an after-only milestone, which
        // the final pack moved off the row its placement estimated.
        expect(arrowFrom('beta', 'alpha')).toBe(byId.get('alpha')?.center.y);
        expect(arrowFrom('review', 'alpha')).toBe(byId.get('alpha')?.center.y);
        expect(arrowFrom('alpha', 'kickoff')).toBe(byId.get('kickoff')?.center.y);
        expect(arrowFrom('cut', 'freeze')).toBe(byId.get('freeze')?.center.y);
    });

    it("starts a region marker predecessor's arrow on the region's own row", async () => {
        const file = path.join(REPO_ROOT, 'tests', 'marker-predecessor-arrows.nowline');
        const { model } = await phases(await fs.readFile(file, 'utf8'), file);
        const region = model.includes[0];
        const byId = new Map(
            [...(region.anchors ?? []), ...(region.milestones ?? [])].map((m) => [m.id, m]),
        );
        const arrowsOf = (id: string) =>
            (byId.get(id) as PositionedMilestone | undefined)?.slackArrows ?? [];
        const alpha = byId.get('p-alpha');
        const start = byId.get('p-start');
        // After a region anchor: drawn, on the anchor's row.
        expect(arrowsOf('p-alpha')).toEqual([{ x: start?.center.x, y: start?.center.y }]);
        // After a region milestone: on its row, not the host's band.
        expect(arrowsOf('p-beta')).toEqual([{ x: alpha?.center.x, y: alpha?.center.y }]);
        expect(arrowsOf('p-due')).toEqual([{ x: alpha?.center.x, y: alpha?.center.y }]);
        expect(alpha?.center.y).toBeGreaterThan(region.box.y);
    });

    it('draws no arrow between markers whose diamonds meet', async () => {
        // One day apart at 1w is about 8.6 px, under two diamond radii.
        const { model } = await phases(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor a1 "A1" date:2026-01-12
anchor a2 "A2" date:2026-01-13
anchor a3 "A3" date:2026-01-26

milestone slack "Slack" after:[a1, a2]
milestone late "Late" date:2026-01-12 after:a2
milestone clear "Clear" after:[a1, a3]

swimlane s "S"
  item i "I" duration:4w
`);
        const byId = new Map(model.milestones.map((m) => [m.id, m]));
        expect(byId.get('slack')?.slackArrows).toBeUndefined();
        expect(byId.get('late')?.isOverrun).toBe(true);
        expect(byId.get('late')?.slackArrows).toBeUndefined();
        const a1 = model.anchors.find((a) => a.id === 'a1');
        expect(byId.get('clear')?.slackArrows).toEqual([{ x: a1?.center.x, y: a1?.center.y }]);
    });

    it("starts a group's overrun arrow on the milestone's own row", async () => {
        const { model } = await phases(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

milestone due "Due" date:2026-01-19 after:g

swimlane s "S"
  group g "G"
    item i "I" duration:4w
`);
        const due = model.milestones[0];
        expect(due.isOverrun).toBe(true);
        expect(due.slackArrows?.map((a) => a.y)).toEqual([due.center.y]);
    });
});
