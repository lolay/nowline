import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedRoadmap } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

// An isolated region draws its own anchors and milestones in a marker row
// under its label tab (specs/rendering.md § Included Roadmap Region).

const HOST = `nowline v1

include "./child.nowline" roadmap:isolate

roadmap r "R" start:2026-01-05 scale:1w

anchor launch "Launch" date:2026-01-05

swimlane core "Core"
  item api "API" duration:8w after:launch
`;

const CHILD = `nowline v1

roadmap child "Child" start:2026-01-05 scale:1w

anchor kickoff "Kickoff" date:2026-01-12

swimlane a "A"
  item alpha "Alpha" duration:3w after:kickoff
swimlane b "B"
  item bravo "Bravo" duration:1w

milestone beta "Beta" after:[alpha, bravo]
milestone gate "Gate" date:2026-02-16
`;

async function layout(host: string, child: string): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(
        host,
        '/virtual/test.nowline',
        async () => child,
    );
    return layoutRoadmap(file, resolved, { theme: 'light' });
}

describe('isolated region markers', () => {
    it('draws the region anchors and milestones in a marker row above its lanes', async () => {
        const model = await layout(HOST, CHILD);
        const region = model.includes[0];
        expect(region.anchors?.map((a) => a.id)).toEqual(['kickoff']);
        expect(region.milestones?.map((m) => m.id)).toEqual(['beta', 'gate']);
        // The host keeps its own markers only.
        expect(model.anchors.map((a) => a.id)).toEqual(['launch']);
        expect(model.milestones).toEqual([]);

        const markers = [...(region.anchors ?? []), ...(region.milestones ?? [])];
        const lanes = region.nestedSwimlanes;
        const lanesTop = lanes[0].box.y;
        const lastLane = lanes[lanes.length - 1];
        const lanesBottom = lastLane.box.y + lastLane.box.height;
        for (const m of markers) {
            expect(m.center.y - m.radius).toBeGreaterThan(region.box.y);
            expect(m.center.y + m.radius).toBeLessThan(lanesTop);
            expect(m.cutBottomY).toBe(lanesBottom);
            expect(m.labelBox.x).toBeGreaterThanOrEqual(region.box.x + 16);
            expect(m.labelBox.x + m.labelBox.width).toBeLessThanOrEqual(
                region.box.x + region.box.width - 8,
            );
        }
        expect(lanesBottom).toBeLessThan(region.box.y + region.box.height);

        // The after-only milestone floats to its latest predecessor; the
        // earlier one draws a slack arrow on its own lane's band.
        const beta = region.milestones?.[0];
        const kickoff = region.anchors?.[0];
        expect(beta?.fixed).toBe(false);
        expect(beta?.center.x ?? 0).toBeGreaterThan(kickoff?.center.x ?? 0);
        expect(beta?.slackArrows).toHaveLength(1);
        const arrowY = beta?.slackArrows?.[0].y ?? 0;
        expect(arrowY).toBeGreaterThan(lanes[1].box.y);
        expect(arrowY).toBeLessThan(lanes[1].box.y + lanes[1].box.height);
    });

    it('leaves a region without markers as it was', async () => {
        const child = CHILD.replace(/^anchor .*$/m, '')
            .replace(/^milestone .*$/gm, '')
            .replace(' after:kickoff', '');
        const model = await layout(HOST, child);
        const region = model.includes[0];
        expect('anchors' in region).toBe(false);
        expect('milestones' in region).toBe(false);
        // REGION_INSET_TOP: the first lane sits 14 px under the top border.
        expect(region.nestedSwimlanes[0].box.y).toBe(region.box.y + 14);
    });

    it('grows the canvas for a region label that fits on neither side', async () => {
        const title = 'A milestone title far too long to fit on either side of its diamond here';
        const child = `${CHILD}milestone late "${title}" date:2026-02-23\n`;
        const model = await layout(HOST, child);
        const region = model.includes[0];
        const late = region.milestones?.find((m) => m.id === 'late');
        expect(late?.labelSide).toBe('right');
        const labelRight = (late?.labelBox.x ?? 0) + (late?.labelBox.width ?? 0);
        expect(model.width).toBeGreaterThanOrEqual(labelRight + 16);
        expect(labelRight).toBeLessThanOrEqual(region.box.x + region.box.width - 8);
    });
});

describe('isolated region dependency edges', () => {
    it("routes a region's own after: arrows among its lanes", async () => {
        const child = CHILD.replace(
            '  item bravo "Bravo" duration:1w',
            '  item bravo "Bravo" duration:1w\n  item charlie "Charlie" duration:1w after:alpha',
        );
        const model = await layout(HOST, child);
        const region = model.includes[0];
        const edges = region.edges ?? [];
        // alpha after the region's anchor (a stub off its cut line), and
        // charlie after alpha across lanes.
        expect(edges.map((e) => `${e.fromId}>${e.toId}`).sort()).toEqual([
            'alpha>charlie',
            'kickoff>alpha',
        ]);
        // The host routes only its own.
        expect(model.edges.map((e) => `${e.fromId}>${e.toId}`)).toEqual(['launch>api']);
        const kickoff = region.anchors?.[0];
        const stub = edges.find((e) => e.fromId === 'kickoff');
        expect(stub?.waypoints[0].x).toBe(kickoff?.center.x);
        // Every waypoint stays inside the region box.
        for (const e of edges) {
            for (const p of e.waypoints) {
                expect(p.y).toBeGreaterThan(region.box.y);
                expect(p.y).toBeLessThan(region.box.y + region.box.height);
            }
        }
    });

    it('omits the key on a region with no after: references', async () => {
        const child = CHILD.replace(' after:kickoff', '');
        const region = (await layout(HOST, child)).includes[0];
        expect('edges' in region).toBe(false);
    });
});

describe('isolated region footnotes', () => {
    const host = `${HOST}
footnote vendor "Vendor" on:api
`;
    const regionSource = (id: string, title: string) => `nowline v1

roadmap ${id} "${title}" start:2026-01-05 scale:1w

swimlane lane "Lane"
  item ${id}-a "A" duration:2w
  item ${id}-b "B" duration:1w

footnote zz "Later" on:${id}-a
footnote aa "Earlier" on:${id}-b
`;

    it('numbers each region on after the host, in include order and then document order, in the one panel', async () => {
        const twoRegions = host.replace(
            'include "./child.nowline" roadmap:isolate',
            'include "./one.nowline" roadmap:isolate\ninclude "./two.nowline" roadmap:isolate',
        );
        const { file, resolved } = await parseAndResolve(
            twoRegions,
            '/virtual/test.nowline',
            async (abs) =>
                abs.endsWith('one.nowline')
                    ? regionSource('one', 'Region One')
                    : regionSource('two', 'Region Two'),
        );
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.footnotes.entries.map((e) => [e.number, e.title, e.region ?? null])).toEqual([
            [1, 'Vendor', null],
            [2, 'Later', 'Region One'],
            [3, 'Earlier', 'Region One'],
            [4, 'Later', 'Region Two'],
            [5, 'Earlier', 'Region Two'],
        ]);
        // Each superscript carries the panel's number.
        const indicators = (i: number, id: string) =>
            model.includes[i].nestedSwimlanes[0].children.find(
                (c) => c.kind === 'item' && c.id === id,
            );
        const oneA = indicators(0, 'one-a');
        const twoB = indicators(1, 'two-b');
        expect(oneA?.kind === 'item' && oneA.footnoteIndicators).toEqual([2]);
        expect(twoB?.kind === 'item' && twoB.footnoteIndicators).toEqual([5]);
        // Header, five entries and two region headings, then the padding.
        expect(model.footnotes.box.height).toBe(28 + 7 * 18 + 16);
    });

    it('leaves the panel as it was when no region has footnotes', async () => {
        const model = await layout(host, CHILD);
        expect(model.footnotes.entries.map((e) => [e.number, 'region' in e])).toEqual([[1, false]]);
        expect(model.footnotes.box.height).toBe(28 + 18 + 16);
    });
});
