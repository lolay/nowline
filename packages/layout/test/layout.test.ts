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
});
