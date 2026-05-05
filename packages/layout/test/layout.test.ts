import { describe, it, expect } from 'vitest';
import { layoutRoadmap } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

describe('layoutRoadmap', () => {
    it('produces a positioned model with swimlanes and items', async () => {
        const src = `nowline v1

roadmap r1 "Test" start:2026-01-05

swimlane build "Build"
  item design "Design" duration:1w status:done
  item implement "Implement" duration:2w status:in-progress
  item ship "Ship" duration:3d status:planned
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.swimlanes).toHaveLength(1);
        expect(model.swimlanes[0].children).toHaveLength(3);
        expect(model.swimlanes[0].children[0].kind).toBe('item');
        expect(model.width).toBeGreaterThan(0);
        expect(model.height).toBeGreaterThan(0);
    });

    it('applies the dark theme palette', async () => {
        const src = `nowline v1\n\nroadmap r1 "Test"\n\nswimlane a "A"\n  item one duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const light = layoutRoadmap(file, resolved, { theme: 'light' });
        const dark = layoutRoadmap(file, resolved, { theme: 'dark' });
        expect(light.backgroundColor).not.toBe(dark.backgroundColor);
        expect(light.theme).toBe('light');
        expect(dark.theme).toBe('dark');
    });

    it('omits now-line when today is outside range', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:4w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2027, 0, 1)),
        });
        expect(model.nowline).toBeNull();
    });

    it('places now-line within range', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
        });
        expect(model.nowline).not.toBeNull();
        expect(model.nowline!.x).toBeGreaterThan(model.timeline.originX);
    });

    it('resolves anchors to their date x-coordinate', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nanchor launch "Launch" date:2026-03-01\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.anchors).toHaveLength(1);
        expect(model.anchors[0].id).toBe('launch');
        expect(model.anchors[0].center.x).toBeGreaterThan(model.timeline.originX);
    });

    it('numbers footnotes in deterministic order', async () => {
        const src = `nowline v1\n\nroadmap r1 "R"\n\nfootnote alpha "Alpha"\nfootnote beta "Beta"\n\nswimlane a "A"\n  item x duration:1w footnote:alpha\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.footnotes.entries.map((e) => e.number)).toEqual([1, 2]);
        expect(model.footnotes.entries[0].title).toBe('Alpha');
    });

    it('is deterministic across repeated invocations', async () => {
        const src = `nowline v1\n\nroadmap r1 "R"\n\nswimlane a "A"\n  item one duration:1w\n  item two duration:2w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const a = layoutRoadmap(file, resolved, { theme: 'light' });
        const b = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('applies the 5-level style chain: label style overrides entity defaults', async () => {
        const src = `nowline v1\n\nconfig\n\nstyle critical\n  bg: red\n  fg: white\n\nroadmap r1 "R"\n\nlabel urgent "Urgent" style:critical\n\nswimlane a "A"\n  item one duration:1w labels:urgent\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const chip = (model.swimlanes[0].children[0] as { labelChips: { style: { bg: string } }[] }).labelChips[0];
        expect(chip).toBeDefined();
        expect(chip.style.bg.toLowerCase()).toBe('#e53935');
    });

    it('attaches item→item dependency arrows at visual edges', async () => {
        // Two items in different swimlanes — the source's right
        // visual edge should equal the arrow's first waypoint x, and
        // the target's left visual edge should equal the last
        // waypoint x. midY at both ends.
        const src = `nowline v1

roadmap r1 "R" start:2026-01-05 length:10w

swimlane a "A"
  item upstream "Up" duration:2w

swimlane b "B"
  item downstream "Down" duration:2w after:upstream
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const upstream = model.swimlanes[0].children[0] as {
            id: string; box: { x: number; y: number; width: number; height: number };
        };
        const downstream = model.swimlanes[1].children[0] as {
            id: string; box: { x: number; y: number; width: number; height: number };
        };
        const edge = model.edges.find((e) => e.toId === 'downstream');
        expect(edge).toBeDefined();
        const wp = edge!.waypoints;
        expect(wp.length).toBeGreaterThanOrEqual(2);
        const upRight = upstream.box.x + upstream.box.width;
        const upMidY = upstream.box.y + upstream.box.height / 2;
        const downLeft = downstream.box.x;
        const downMidY = downstream.box.y + downstream.box.height / 2;
        expect(wp[0].x).toBeCloseTo(upRight, 1);
        expect(wp[0].y).toBeCloseTo(upMidY, 1);
        expect(wp[wp.length - 1].x).toBeCloseTo(downLeft, 1);
        expect(wp[wp.length - 1].y).toBeCloseTo(downMidY, 1);
    });

    it('attaches item→anchor dependency arrows at the cut line + item midY', async () => {
        // An item with `after:` an anchor — the arrow should leave
        // the anchor's vertical cut line at the dependent item's
        // row mid-Y and land at the item's left visual edge.
        const src = `nowline v1

roadmap r1 "R" start:2026-01-05 length:10w

anchor kickoff "Kick" date:2026-02-09

swimlane a "A"
  item ramp "Ramp" duration:1w
  item phase2 "Phase 2" duration:2w after:kickoff
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const phase2 = model.swimlanes[0].children.find(
            (c) => 'id' in c && c.id === 'phase2',
        ) as { id: string; box: { x: number; y: number; width: number; height: number } };
        expect(phase2).toBeDefined();
        const anchor = model.anchors.find((a) => a.id === 'kickoff');
        expect(anchor).toBeDefined();
        const edge = model.edges.find(
            (e) => e.fromId === 'kickoff' && e.toId === 'phase2',
        );
        expect(edge).toBeDefined();
        const wp = edge!.waypoints;
        expect(wp.length).toBeGreaterThanOrEqual(2);
        const phaseLeft = phase2.box.x;
        const phaseMidY = phase2.box.y + phase2.box.height / 2;
        // First waypoint sits on the anchor's vertical cut line
        // (centerX) at the target's row midY.
        expect(wp[0].x).toBeCloseTo(anchor!.center.x, 1);
        expect(wp[0].y).toBeCloseTo(phaseMidY, 1);
        // Last waypoint lands at the target's left visual edge.
        expect(wp[wp.length - 1].x).toBeCloseTo(phaseLeft, 1);
        expect(wp[wp.length - 1].y).toBeCloseTo(phaseMidY, 1);
    });
});
