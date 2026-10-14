// The measure phase (specs/layout-phases.md §3.3): the header rows stack
// top to bottom from the timeline y, the marker band is sized from the
// pre-pack, and the pre-pack placements sit at the band's y.

import { describe, expect, it } from 'vitest';
import { MARKER_ROW_CENTER_OFFSET_PX, MARKER_ROW_PITCH_PX } from '../src/nodes/marker-geometry.js';
import { resolveDateWindow, resolveScope } from '../src/phases/date-window.js';
import { measureRoadmap } from '../src/phases/measure.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { parseAndResolve } from './helpers.js';

async function measure(source: string, today?: Date) {
    const { file, resolved } = await parseAndResolve(source);
    const options = { today };
    const schedule = scheduleRoadmap(file, resolved, { today });
    const scope = resolveScope(file, resolved, options);
    const window = resolveDateWindow(file, resolved, options, scope, schedule);
    return measureRoadmap(file, resolved, options, scope, window);
}

const roadmap = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor kickoff "Kickoff" date:2026-01-05
anchor review "Review" date:2026-01-06
milestone ship "Ship" date:2026-01-19

swimlane a "A"
  item a1 "A1" duration:2w
`;

describe('measureRoadmap', () => {
    it('stacks the header rows from the timeline y down to the chart top', async () => {
        const measured = await measure(roadmap, new Date(Date.UTC(2026, 0, 12)));
        const b = measured.bands;
        expect(b.pillRowHeight).toBeGreaterThan(0);
        expect(b.tickPanelY).toBe(b.timelineY + b.pillRowHeight);
        expect(b.waveStripY).toBe(b.tickPanelY + b.tickPanelHeight);
        // No waves: the wave strip takes no height.
        expect(b.markerRowY).toBe(b.waveStripY);
        expect(b.rowsHeight).toBe(
            b.markerRowY + b.estimatedMarkerRows * MARKER_ROW_PITCH_PX - b.timelineY,
        );
        expect(b.chartTopY).toBe(b.markerRowY + b.estimatedMarkerRows * MARKER_ROW_PITCH_PX + 8);
        expect(measured.timeline.box.y).toBe(b.timelineY);
        expect(measured.timeline.markerRow.height).toBe(
            b.estimatedMarkerRows * MARKER_ROW_PITCH_PX,
        );
    });

    it('reserves no pill row when today falls outside the natural window', async () => {
        const measured = await measure(roadmap);
        expect(measured.bands.pillRowHeight).toBe(0);
    });

    it('places the pre-pack at the band y and keeps the date-pinned markers', async () => {
        const measured = await measure(roadmap);
        const { markers, bands } = measured;
        expect(markers.hasEntities).toBe(true);
        expect(markers.datePinned.map((e) => [e.id, e.isMilestone])).toEqual([
            ['kickoff', false],
            ['review', false],
            ['ship', true],
        ]);
        // Kickoff and review sit a day apart, so their labels cannot share a row.
        expect(bands.estimatedMarkerRows).toBeGreaterThan(1);
        for (const e of markers.datePinned) {
            const p = markers.placements.get(e.id);
            expect(p).toBeDefined();
            if (!p) continue;
            expect(p.centerY).toBe(
                bands.markerRowY + MARKER_ROW_CENTER_OFFSET_PX + p.rowIndex * MARKER_ROW_PITCH_PX,
            );
            expect(p.labelBox.y).toBe(p.centerY - 4);
        }
    });

    it('measures no marker band for a roadmap without markers', async () => {
        const measured = await measure(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:full

swimlane a "A"
  item a1 "A1" duration:2w
`);
        expect(measured.markers.hasEntities).toBe(false);
        expect(measured.bands.estimatedMarkerRows).toBe(0);
        expect(measured.markers.placements.size).toBe(0);
    });
});
