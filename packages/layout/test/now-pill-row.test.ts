// L2 (specs/layout-phases.md §1.3): the now-pill row is reserved when the
// axis extension (finalize step f2) brings `today` into the axis, not only
// when `today` falls inside the natural window. Before the fix the pill was
// drawn on the tick panel's y with no row reserved for it.

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectLayoutInsights, layoutRoadmap, type PositionedRoadmap } from '../src/index.js';
import { MARKER_ROW_CENTER_OFFSET_PX, MARKER_ROW_PITCH_PX } from '../src/nodes/marker-geometry.js';
import { NOW_PILL_HEIGHT_PX } from '../src/themes/shared.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, '../../../examples/platform-2026.nowline');

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

async function lay(source: string, today: Date | undefined): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(source);
    return layoutRoadmap(file, resolved, { theme: 'light', today });
}

/** `examples/platform-2026.nowline` with `length:1w` on its roadmap line. */
async function platformWithLength(): Promise<string> {
    const source = await readFile(PLATFORM, 'utf8');
    const edited = source.replace(/^(roadmap platform-2026 .*)$/m, '$1 length:1w');
    expect(edited).not.toBe(source);
    return edited;
}

/** Every y of the header rows and the chart that the pill row moves down. */
function rowsAndChartYs(model: PositionedRoadmap): number[] {
    return [
        model.timeline.tickPanelY,
        model.timeline.markerRow.y,
        model.timeline.markerRow.collisionY,
        model.chartBox.y,
        ...model.swimlanes.map((lane) => lane.box.y),
        ...model.milestones.map((m) => m.center.y),
        ...model.milestones.map((m) => m.cutTopY),
        ...model.milestones.map((m) => m.cutBottomY),
        ...model.anchors.map((a) => a.center.y),
    ];
}

describe('now-pill row on an extended axis (L2)', () => {
    // The spec's repro: `length:1w` keeps the natural window at the content
    // end (2026-03-16, the GA milestone), whose diamond makes f2 extend the
    // axis by a week; 2026-03-17 lies in that extension.
    const TODAY = utc(2026, 3, 17);

    it('reserves the pill row above the tick panel', async () => {
        const model = await lay(await platformWithLength(), TODAY);
        const nowline = model.nowline;
        expect(nowline).not.toBeNull();
        if (!nowline) return;
        expect(model.timeline.endDate.getTime()).toBeGreaterThanOrEqual(TODAY.getTime());
        expect(model.timeline.pillRowHeight).toBe(NOW_PILL_HEIGHT_PX);
        expect(nowline.pillTopY).toBe(model.timeline.box.y);
        expect(nowline.pillTopY + NOW_PILL_HEIGHT_PX).toBe(model.timeline.tickPanelY);
        expect(nowline.topY).toBe(model.timeline.tickPanelY);
    });

    it('stays silent on NL.W1000, since today lies on the extended axis', async () => {
        // NL.W1000 compares today with the axis the chart draws, extension
        // included, so a now-line the chart shows is never reported as outside.
        const model = await lay(await platformWithLength(), TODAY);
        expect(model.nowline).not.toBeNull();
        const insights = collectLayoutInsights(model, { today: TODAY, locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.W1000')).toBe(false);
    });

    it('moves the tick panel, marker band and chart down by the pill row', async () => {
        const source = await platformWithLength();
        const withNow = await lay(source, TODAY);
        const without = await lay(source, undefined);
        expect(without.timeline.pillRowHeight).toBe(0);
        // The beside card is shorter than the rows here, so the rows grow
        // by the full pill height.
        expect(withNow.timeline.box.y).toBe(without.timeline.box.y);
        expect(rowsAndChartYs(withNow)).toEqual(
            rowsAndChartYs(without).map((y) => y + NOW_PILL_HEIGHT_PX),
        );
        expect(withNow.timeline.box.height).toBe(without.timeline.box.height + NOW_PILL_HEIGHT_PX);
        expect(withNow.chartBox.height).toBe(without.chartBox.height);
        expect(withNow.height).toBe(without.height + NOW_PILL_HEIGHT_PX);
    });

    it('packs the marker band below the pill row', async () => {
        const model = await lay(await platformWithLength(), TODAY);
        const markerRowY = model.timeline.markerRow.y - MARKER_ROW_CENTER_OFFSET_PX;
        expect(markerRowY).toBeGreaterThanOrEqual(
            model.timeline.tickPanelY + model.timeline.tickPanelHeight,
        );
        for (const m of model.milestones) {
            const row = (m.center.y - model.timeline.markerRow.y) / MARKER_ROW_PITCH_PX;
            expect(Number.isInteger(row) && row >= 0).toBe(true);
            expect(m.labelBox?.y).toBe(m.center.y - 4);
        }
    });

    // A tall beside card already pushes the rows down (the rule of
    // `headerRowsTimelineY`): the pill row takes room above the tick panel
    // instead of moving it.
    it('lets a tall beside card absorb the pill row', async () => {
        const source = `nowline v1

roadmap r "A roadmap title long enough to wrap onto several lines of the beside card" author:"Someone with a long name" start:2026-01-05 scale:1w length:1w

anchor done "Done" date:2026-01-19

swimlane a "A"
  item build "Build" duration:2w
`;
        const today = utc(2026, 1, 21);
        const withNow = await lay(source, today);
        const without = await lay(source, undefined);
        expect(withNow.nowline).not.toBeNull();
        expect(without.timeline.pillRowHeight).toBe(0);
        // Precondition: the card, not the chart-top gap, sets the timeline y.
        expect(without.timeline.box.y).toBeGreaterThanOrEqual(8 + NOW_PILL_HEIGHT_PX);
        expect(withNow.timeline.pillRowHeight).toBe(NOW_PILL_HEIGHT_PX);
        expect(withNow.timeline.box.y).toBe(without.timeline.box.y - NOW_PILL_HEIGHT_PX);
        expect(rowsAndChartYs(withNow)).toEqual(rowsAndChartYs(without));
        expect(withNow.height).toBe(without.height);
    });
});
