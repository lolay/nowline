// Placement never reads the canvas (specs/layout-phases.md §3.4, m3.s3).
// Lanes and regions get their widths, and milestones their marker row and
// label box, only after the canvas stops growing: the lane stretch and the
// region fit (P9) and the unified marker re-pack (P10, P11). These tests
// pin that hand-off on the whole sample corpus and on a region fixture the
// corpus does not reach.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { MARKER_ROW_PITCH_PX } from '../src/nodes/marker-geometry.js';
import {
    MilestoneNode,
    type MilestonePlacement,
    positionMilestones,
} from '../src/nodes/milestone-node.js';
import type { MarkerRowPlacement, PositionedRoadmap } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The `--now` the G1 gate renders every sample with. */
const TODAY = new Date(Date.UTC(2026, 1, 9));

/** Every `examples/**.nowline` and `tests/*.nowline`, repo-relative, sorted. */
function sampleFiles(): string[] {
    const out: string[] = [];
    const walk = (rel: string, recurse: boolean): void => {
        for (const entry of readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
            const child = `${rel}/${entry.name}`;
            if (entry.isDirectory() && recurse) walk(child, true);
            else if (entry.isFile() && entry.name.endsWith('.nowline')) out.push(child);
        }
    };
    walk('examples', true);
    walk('tests', false);
    return out.sort();
}

async function layoutSample(rel: string): Promise<PositionedRoadmap> {
    const abs = path.join(REPO, rel);
    const source = await readFile(abs, 'utf8');
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    return layoutRoadmap(file, resolved, { today: TODAY });
}

afterEach((): void => {
    vi.restoreAllMocks();
});

describe('placement on the sample corpus', () => {
    const samples = sampleFiles();

    it('finds the corpus', (): void => {
        expect(samples.length).toBeGreaterThanOrEqual(60);
    });

    it('gives every milestone the model carries its row and label box from the re-pack', async (): Promise<void> => {
        const place = vi.spyOn(MilestoneNode.prototype, 'place');
        let checked = 0;
        const failures: string[] = [];
        for (const rel of samples) {
            place.mockClear();
            const model = await layoutSample(rel);
            // Placement leaves the row and the label box to the re-pack.
            const placements = place.mock.results
                .map((r) => r.value as MilestonePlacement | null)
                .filter((p): p is MilestonePlacement => p !== null);
            for (const p of placements) {
                for (const key of ['center', 'labelBox', 'labelSide']) {
                    if (key in p) failures.push(`${rel}: placement of ${p.id} carries ${key}`);
                }
            }
            // The host places its milestones last, after every isolated
            // region placed its own (with waves, a region also places them
            // on each barrier pass, and only the last pass is kept).
            const host = placements.slice(placements.length - model.milestones.length);
            expect(model.milestones.map((m) => m.id)).toEqual(host.map((p) => p.id));
            // Every positioned milestone sits on a row of the final band, its
            // label box on that row: what the re-pack gives, never a
            // provisional row computed against an earlier canvas.
            const band = model.timeline.markerRow;
            const rowCount = band.height / MARKER_ROW_PITCH_PX;
            for (const [i, m] of model.milestones.entries()) {
                const row = (m.center.y - band.y) / MARKER_ROW_PITCH_PX;
                if (!Number.isInteger(row) || row < 0 || row >= rowCount) {
                    failures.push(`${rel}: ${m.id} sits at y ${m.center.y}, off the marker rows`);
                }
                if (m.labelBox.y !== m.center.y - 4) {
                    failures.push(`${rel}: ${m.id} label box is not on its row`);
                }
                if (m.center.x !== host[i].x) {
                    failures.push(`${rel}: ${m.id} moved off its placed x`);
                }
                checked += 1;
            }
            // A region's milestones sit in its own marker row, above its
            // lanes, at an x one of its placements gave them.
            for (const region of model.includes) {
                const lanesTop = region.nestedSwimlanes[0]?.box.y ?? Number.POSITIVE_INFINITY;
                for (const m of region.milestones ?? []) {
                    if (m.center.y <= region.box.y || m.center.y + m.radius >= lanesTop) {
                        failures.push(`${rel}: region ${m.id} sits off its region's marker row`);
                    }
                    if (m.labelBox.y !== m.center.y - 4) {
                        failures.push(`${rel}: region ${m.id} label box is not on its row`);
                    }
                    if (!placements.some((p) => p.id === m.id && p.x === m.center.x)) {
                        failures.push(`${rel}: region ${m.id} moved off its placed x`);
                    }
                    checked += 1;
                }
            }
        }
        expect(failures).toEqual([]);
        expect(checked).toBeGreaterThan(0);
    });

    it('stretches every lane to the final canvas and keeps every region inside it', async (): Promise<void> => {
        let regions = 0;
        for (const rel of samples) {
            const model = await layoutSample(rel);
            for (const lane of model.swimlanes) {
                expect(lane.box.x, rel).toBe(0);
                expect(lane.box.width, rel).toBe(model.width);
            }
            for (const inc of model.includes) {
                expect(inc.box.width, rel).toBeGreaterThan(0);
                expect(inc.box.x + inc.box.width, rel).toBeLessThanOrEqual(model.width);
                for (const lane of inc.nestedSwimlanes) {
                    expect(lane.box.width, rel).toBe(inc.box.width);
                }
                regions += 1;
            }
        }
        expect(regions).toBeGreaterThan(0);
    });
});

describe('positionMilestones', () => {
    const placement: MilestonePlacement = {
        id: 'ship',
        title: 'Ship',
        x: 120,
        radius: 6,
        fixed: false,
        slackArrows: undefined,
        isOverrun: false,
        style: {} as MilestonePlacement['style'],
        cutTopY: 80,
        cutBottomY: 200,
    };
    const row: MarkerRowPlacement = {
        rowIndex: 1,
        centerY: 61,
        labelBox: { x: 132, y: 57, width: 24, height: 12 },
        labelSide: 'right',
    };

    it('builds the milestone from its placement and its re-pack row', (): void => {
        const [m] = positionMilestones([placement], new Map([['ship', row]]));
        expect(m.center).toEqual({ x: 120, y: 61 });
        expect(m.labelBox).toBe(row.labelBox);
        expect(m.labelSide).toBe('right');
        expect([m.cutTopY, m.cutBottomY]).toEqual([80, 200]);
        // Optional keys stay omitted when the placement omits them.
        for (const key of ['onWaveBoundary', 'overrunByWave', 'overrunDate', 'hiddenDate']) {
            expect(key in m).toBe(false);
        }
    });

    it('throws when the re-pack has no row for a placed milestone', (): void => {
        expect(() => positionMilestones([placement], new Map())).toThrow(/ship/);
    });
});

// The child's bars end on the natural window's last day. The milestone on
// that day overflows the window by its radius, so the timeline extension
// grows the canvas by one week column after the region is placed. The
// region reaches 24 px past the diagram's furthest content (here the
// milestone's label), and the canvas grows to hold it, so the region is
// fitted to the final canvas, not the width at placement.
describe('include region whose bars reach the canvas edge', () => {
    const childSrc = `nowline v1

roadmap c "C" start:2026-01-05 scale:1w calendar:business

swimlane b "B"
  item x1 "X1" duration:20w
`;
    const parentSrc = `nowline v1

include "./child.nowline" roadmap:isolate

roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone ext "Ext" date:2026-05-25

swimlane a "A"
  item w1 "W1" duration:1w
`;
    // Caps the canvas at 400 px before the extension, so pixels per day
    // drop to 2.56 and one week column (12.8 px) is less than the region's
    // right pad.
    const MAX_WIDTH = 400;

    it('fits the region to the content and grows the canvas to hold it', async (): Promise<void> => {
        const { file, resolved } = await parseAndResolve(
            parentSrc,
            '/virtual/test.nowline',
            async () => childSrc,
        );
        const model = layoutRoadmap(file, resolved, { theme: 'light', width: MAX_WIDTH });
        // Guard against a vacuous pass: the canvas grew past its width at
        // placement, by the one-week extension.
        expect(model.timeline.endDate.toISOString().slice(0, 10)).toBe('2026-06-01');
        expect(model.width).toBeGreaterThan(MAX_WIDTH);
        expect(model.includes).toHaveLength(1);
        const region = model.includes[0];
        const [lane] = region.nestedSwimlanes;
        const [bar] = lane.children;
        // The milestone's label passes the bars, so it sets the edge; the
        // canvas ends at the padded box.
        const [ext] = model.milestones;
        const labelRightX = ext.labelBox.x + ext.labelBox.width;
        expect(labelRightX).toBeGreaterThan(bar.box.x + bar.box.width);
        expect(region.box.x).toBe(0);
        expect(region.box.width).toBeCloseTo(labelRightX + 24, 5);
        expect(region.box.width).toBe(model.width);
        expect(lane.box.width).toBe(region.box.width);
    });
});
