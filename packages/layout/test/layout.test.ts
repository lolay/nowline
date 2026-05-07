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
        const src = `nowline v1\n\nroadmap r1 "R"\n\nfootnote alpha "Alpha" on:x\nfootnote beta "Beta" on:x\n\nswimlane a "A"\n  item x duration:1w\n`;
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

    describe('PositionedSwimlane.capacity emission', () => {
        it('omits capacity when the lane declares none', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s "Lane"\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].capacity).toBeNull();
        });

        it('emits a multiplier badge by default for lanes with capacity', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s "Sprint" capacity:5\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].capacity).toEqual({
                value: 5,
                text: '5',
                icon: { kind: 'builtin', name: 'multiplier' },
            });
        });

        it('honors capacity-icon overrides on the lane via style chain', async () => {
            const src = `nowline v1\n\nconfig\nstyle counted\n  capacity-icon: people\n\nroadmap r\n\nswimlane s "Team" capacity:3 style:counted\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].capacity?.icon).toEqual({
                kind: 'builtin',
                name: 'people',
            });
        });

        it('grows the frame tab to fit the capacity badge', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s "Sprint"\n  item x duration:1w\n`;
            const srcWithCap = `nowline v1\n\nroadmap r\n\nswimlane s "Sprint" capacity:12000\n  item x duration:1w\n`;
            const { file: f1, resolved: r1 } = await parseAndResolve(src);
            const { file: f2, resolved: r2 } = await parseAndResolve(srcWithCap);
            const m1 = layoutRoadmap(f1, r1, { theme: 'light' });
            const m2 = layoutRoadmap(f2, r2, { theme: 'light' });
            // Frame tab itself isn't directly exposed, but it determines
            // where the first item lands in x. With a capacity badge the
            // chiclet is wider, so the first item gets pushed further
            // right (or below the tab — same row-pack outcome). Verify
            // the chart-level box width grows.
            expect(m2.width).toBeGreaterThanOrEqual(m1.width);
        });

        it('decimal lane capacity formats per spec', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s "Half" capacity:0.5\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].capacity?.value).toBe(0.5);
            expect(model.swimlanes[0].capacity?.text).toBe('0.5');
        });
    });

    describe('PositionedItem.capacity emission', () => {
        it('omits capacity when the item declares none', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as { capacity: unknown };
            expect(item.capacity).toBeNull();
        });

        it('emits a multiplier suffix by default for items with capacity', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:5\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as {
                capacity: { value: number; text: string; icon: { kind: string; name?: string } | null };
            };
            expect(item.capacity).toEqual({
                value: 5,
                text: '5',
                icon: { kind: 'builtin', name: 'multiplier' },
            });
        });

        it('formats decimal capacity per spec (trailing zeros trimmed)', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:1.25\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as { capacity: { text: string; value: number } };
            expect(item.capacity.text).toBe('1.25');
            expect(item.capacity.value).toBe(1.25);
        });

        it('converts percent literals to decimal capacity (50% → 0.5)', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:50%\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as { capacity: { text: string; value: number } };
            expect(item.capacity.value).toBe(0.5);
            expect(item.capacity.text).toBe('0.5');
        });

        it('honors capacity-icon override on the item', async () => {
            const src = `nowline v1\n\nconfig\nstyle counted\n  capacity-icon: person\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:3 style:counted\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as {
                capacity: { icon: { kind: string; name?: string } };
            };
            expect(item.capacity.icon).toEqual({ kind: 'builtin', name: 'person' });
        });

        it('dereferences custom glyph ids to literal Unicode payload', async () => {
            // Style ref sits on the item itself so the icon applies to the
            // item's resolved style (style chain is per-entity, not
            // parent-cascading).
            const src = `nowline v1\n\nconfig\nglyph budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:12000 style:finance\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as {
                capacity: { icon: { kind: string; text?: string } };
            };
            expect(item.capacity.icon).toEqual({ kind: 'literal', text: '💰' });
        });

        it('treats inline Unicode literal capacity-icon as a literal', async () => {
            const src = `nowline v1\n\nconfig\nstyle gear\n  capacity-icon: "⚙"\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:2 style:gear\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as {
                capacity: { icon: { kind: string; text?: string } };
            };
            expect(item.capacity.icon).toEqual({ kind: 'literal', text: '⚙' });
        });

        it('drops icon to null when capacity-icon is "none"', async () => {
            const src = `nowline v1\n\nconfig\nstyle silent\n  capacity-icon: none\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:3 style:silent\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as { capacity: { icon: unknown } };
            expect(item.capacity.icon).toBeNull();
        });
    });

    describe('capacity-icon precedence', () => {
        it('defaults to multiplier when nothing overrides', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].style.capacityIcon).toBe('multiplier');
            expect(model.swimlanes[0].children[0].style.capacityIcon).toBe('multiplier');
        });

        it('default swimlane capacity-icon overrides the system default', async () => {
            const src = `nowline v1\n\nconfig\ndefault swimlane capacity-icon:person\n\nroadmap r\n\nswimlane s\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].style.capacityIcon).toBe('person');
            // No `default item capacity-icon` set, so item still resolves to system default.
            expect(model.swimlanes[0].children[0].style.capacityIcon).toBe('multiplier');
        });

        it('style block capacity-icon flows through entity style refs', async () => {
            const src = `nowline v1\n\nconfig\nstyle finance\n  capacity-icon: points\n\nroadmap r\n\nswimlane s style:finance\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].style.capacityIcon).toBe('points');
        });

        it('inline Unicode literal on default reaches ResolvedStyle as-is', async () => {
            const src = `nowline v1\n\nconfig\ndefault swimlane capacity-icon:"⚙"\n\nroadmap r\n\nswimlane s\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].style.capacityIcon).toBe('⚙');
        });

        it('declared glyph id reaches ResolvedStyle and the glyph survives in ResolvedConfig', async () => {
            const src = `nowline v1\n\nconfig\nglyph budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r\n\nswimlane s style:finance\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].style.capacityIcon).toBe('budget');
            expect(resolved.config.glyphs.has('budget')).toBe(true);
            expect(resolved.config.glyphs.get('budget')?.title).toBe('Budget');
        });
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
