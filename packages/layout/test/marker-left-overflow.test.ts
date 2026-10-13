// An anchor or milestone label that fits neither right of its marker nor
// left of the chart's left edge grows the canvas on the right, the way a
// non-working run label does (specs/rendering.md § Marker row). Before the
// fix it fell back to the left and drew over the beside header card.

import { describe, expect, it } from 'vitest';
import {
    type BoundingBox,
    type LayoutOptions,
    layoutRoadmap,
    type PositionedRoadmap,
} from '../src/index.js';
import { parseAndResolve } from './helpers.js';

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

// One business week of chart: a long label pinned to the first day fits
// on neither side of its marker.
const SOURCE = `nowline v1

roadmap r "Q1" start:2026-01-05 scale:1w

anchor kickoff "Kickoff and stakeholder alignment" date:2026-01-05
milestone beta "Beta to design partners" date:2026-01-06

swimlane a "A"
  item build "Build" duration:1w
`;

async function lay(source: string): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(source);
    const options: LayoutOptions = { theme: 'light', today: utc(2026, 1, 7) };
    return layoutRoadmap(file, resolved, options);
}

function intersects(a: BoundingBox, b: BoundingBox): boolean {
    return (
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
}

function anchorOf(model: PositionedRoadmap, id: string) {
    const a = model.anchors.find((x) => x.id === id);
    expect(a, `anchor ${id}`).toBeDefined();
    return a!;
}

function milestoneOf(model: PositionedRoadmap, id: string) {
    const m = model.milestones.find((x) => x.id === id);
    expect(m, `milestone ${id}`).toBeDefined();
    return m!;
}

describe('marker labels never fall back over a beside header card', () => {
    it('lays the header beside the chart (guard)', async () => {
        const model = await lay(SOURCE);
        expect(model.header.position).toBe('beside');
    });

    it('keeps the anchor label off the header card', async () => {
        const model = await lay(SOURCE);
        const anchor = anchorOf(model, 'kickoff');
        expect(intersects(anchor.labelBox, model.header.cardBox)).toBe(false);
        expect(anchor.labelSide).toBe('right');
    });

    it('keeps the milestone label off the header card', async () => {
        const model = await lay(SOURCE);
        const milestone = milestoneOf(model, 'beta');
        expect(intersects(milestone.labelBox, model.header.cardBox)).toBe(false);
        expect(milestone.labelSide).toBe('right');
    });

    it('grows the canvas so both labels fit right of the card', async () => {
        const model = await lay(SOURCE);
        const card = model.header.cardBox;
        for (const box of [
            anchorOf(model, 'kickoff').labelBox,
            milestoneOf(model, 'beta').labelBox,
        ]) {
            expect(box.x).toBeGreaterThan(card.x + card.width);
            expect(box.x + box.width).toBeLessThanOrEqual(model.width);
        }
    });

    it('keeps an after-only milestone label off the header card', async () => {
        const model = await lay(`nowline v1

roadmap r "Q1" start:2026-01-05 scale:1w

milestone ready "Ready for the partner beta review" after:build

swimlane a "A"
  item build "Build" duration:2d
`);
        const milestone = milestoneOf(model, 'ready');
        expect(intersects(milestone.labelBox, model.header.cardBox)).toBe(false);
        expect(milestone.labelBox.x + milestone.labelBox.width).toBeLessThanOrEqual(model.width);
    });
});
