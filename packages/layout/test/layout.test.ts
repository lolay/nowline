import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedItem, type PositionedTrackChild } from '../src/index.js';
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

    it('now-pill: en-US default produces 36px width with `now` label', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
        });
        expect(model.nowline!.label).toBe('now');
        expect(model.nowline!.pillWidth).toBe(36);
    });

    it('now-pill: fr locale grows the pill to fit `maint.`', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
            locale: 'fr',
        });
        expect(model.nowline!.label).toBe('maint.');
        // Floored at 36 (default); fr label 'maint.' (6 chars × 10px × 0.58 + 12 inset
        // ≈ 47px) clears the floor and grows the pill.
        expect(model.nowline!.pillWidth).toBeGreaterThan(36);
    });

    it('now-pill: fr-CA falls through fr overlay and renders the same pill width as fr', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const fr = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
            locale: 'fr',
        });
        const frCA = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
            locale: 'fr-CA',
        });
        expect(frCA.nowline!.label).toBe(fr.nowline!.label);
        expect(frCA.nowline!.pillWidth).toBe(fr.nowline!.pillWidth);
    });

    it('locale: directive locale honored when LayoutOptions.locale is undefined', async () => {
        const src = `nowline v1 locale:fr\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
        });
        expect(model.nowline!.label).toBe('maint.');
    });

    it('locale: file directive wins over LayoutOptions.locale (content-chain precedence)', async () => {
        // The file is the artifact: a French roadmap stays French even when
        // an operator passes `--locale en-US`. The override only acts as a
        // fallback when the file declines to declare its own locale. See
        // specs/localization.md for the two-chain model.
        const src = `nowline v1 locale:fr\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
            locale: 'en-US',
        });
        expect(model.nowline!.label).toBe('maint.');
    });

    it('locale: LayoutOptions.locale used as fallback when the file omits the directive', async () => {
        const src = `nowline v1\n\nroadmap r1 "R" start:2026-01-01 length:26w\n\nswimlane a "A"\n  item x duration:1w\n`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 2, 1)),
            locale: 'fr',
        });
        expect(model.nowline!.label).toBe('maint.');
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
        const chip = (model.swimlanes[0].children[0] as { labelChips: { style: { bg: string } }[] })
            .labelChips[0];
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
                capacity: {
                    value: number;
                    text: string;
                    icon: { kind: string; name?: string } | null;
                };
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
            const item = model.swimlanes[0].children[0] as {
                capacity: { text: string; value: number };
            };
            expect(item.capacity.text).toBe('1.25');
            expect(item.capacity.value).toBe(1.25);
        });

        it('converts percent literals to decimal capacity (50% → 0.5)', async () => {
            const src = `nowline v1\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:50%\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            const item = model.swimlanes[0].children[0] as {
                capacity: { text: string; value: number };
            };
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

        it('dereferences custom symbol ids to literal Unicode payload', async () => {
            // Style ref sits on the item itself so the icon applies to the
            // item's resolved style (style chain is per-entity, not
            // parent-cascading).
            const src = `nowline v1\n\nconfig\nsymbol budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r\n\nswimlane s\n  item x duration:1w capacity:12000 style:finance\n`;
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

        it('declared symbol id reaches ResolvedStyle and the symbol survives in ResolvedConfig', async () => {
            const src = `nowline v1\n\nconfig\nsymbol budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r\n\nswimlane s style:finance\n  item x duration:1w\n`;
            const { file, resolved } = await parseAndResolve(src);
            const model = layoutRoadmap(file, resolved, { theme: 'light' });
            expect(model.swimlanes[0].style.capacityIcon).toBe('budget');
            expect(resolved.config.symbols.has('budget')).toBe(true);
            expect(resolved.config.symbols.get('budget')?.title).toBe('Budget');
        });
    });

    describe('vocabulary aliases', () => {
        it('canonicalizes status:active to in-progress at the layout boundary', async () => {
            // Both spellings reach the same StatusKind so downstream consumers
            // (renderer color/dot, exports) only see the canonical form.
            const aliasSrc = `nowline v1\n\nroadmap r1\n\nswimlane s\n  item x duration:1w status:active\n`;
            const canonicalSrc = `nowline v1\n\nroadmap r1\n\nswimlane s\n  item x duration:1w status:in-progress\n`;
            const aliasOut = await parseAndResolve(aliasSrc);
            const canonicalOut = await parseAndResolve(canonicalSrc);
            const aliasModel = layoutRoadmap(aliasOut.file, aliasOut.resolved, { theme: 'light' });
            const canonicalModel = layoutRoadmap(canonicalOut.file, canonicalOut.resolved, {
                theme: 'light',
            });
            const aliasItem = aliasModel.swimlanes[0].children[0] as { status: string };
            const canonicalItem = canonicalModel.swimlanes[0].children[0] as { status: string };
            expect(aliasItem.status).toBe('in-progress');
            expect(canonicalItem.status).toBe('in-progress');
            expect(aliasItem.status).toBe(canonicalItem.status);
        });

        it('canonicalizes status:completed to done at the layout boundary', async () => {
            const aliasSrc = `nowline v1\n\nroadmap r1\n\nswimlane s\n  item x duration:1w status:completed\n`;
            const canonicalSrc = `nowline v1\n\nroadmap r1\n\nswimlane s\n  item x duration:1w status:done\n`;
            const aliasOut = await parseAndResolve(aliasSrc);
            const canonicalOut = await parseAndResolve(canonicalSrc);
            const aliasModel = layoutRoadmap(aliasOut.file, aliasOut.resolved, { theme: 'light' });
            const canonicalModel = layoutRoadmap(canonicalOut.file, canonicalOut.resolved, {
                theme: 'light',
            });
            const aliasItem = aliasModel.swimlanes[0].children[0] as { status: string };
            const canonicalItem = canonicalModel.swimlanes[0].children[0] as { status: string };
            expect(aliasItem.status).toBe('done');
            expect(canonicalItem.status).toBe('done');
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
            id: string;
            box: { x: number; y: number; width: number; height: number };
        };
        const downstream = model.swimlanes[1].children[0] as {
            id: string;
            box: { x: number; y: number; width: number; height: number };
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
        const phase2 = model.swimlanes[0].children.find((c) => 'id' in c && c.id === 'phase2') as {
            id: string;
            box: { x: number; y: number; width: number; height: number };
        };
        expect(phase2).toBeDefined();
        const anchor = model.anchors.find((a) => a.id === 'kickoff');
        expect(anchor).toBeDefined();
        const edge = model.edges.find((e) => e.fromId === 'kickoff' && e.toId === 'phase2');
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

    it('places title-only swimlanes from resolved content', async () => {
        const src = `nowline v1

roadmap "Generative AI" start:2026-04-06 scale:2w calendar:business

swimlane "Platform"
  item "Technology Selection" duration:2w

swimlane "Web"
  item "Web Prototype" duration:4w

swimlane "Mobile"
  parallel
    group "iOS"
      item "iOS Prototype" duration:4w
`;
        const { file, resolved } = await parseAndResolve(src);
        expect(resolved.content.swimlanes.size).toBe(3);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.swimlanes).toHaveLength(3);
        expect(model.swimlanes.map((lane) => lane.title)).toEqual(['Platform', 'Web', 'Mobile']);
    });

    it('assigns distinct flow keys to sibling id-less parallel blocks', async () => {
        // `a` (1w) and `b` (3w) sit in two separate id-less parallel blocks.
        // Distinct flow keys keep both as the last entry of their own flow, so
        // the after-only `ship` milestone draws one slack arrow back from the
        // non-binding `a`. A shared fallback key would collapse them into one
        // flow, dedupe `a` away, and leave zero slack arrows — so the count
        // assertion fails without the per-block flow key.
        const src = `nowline v1

roadmap r "R" start:2026-01-05

swimlane lane "Lane"
  parallel
    item a "First" duration:1w
  parallel
    item b "Second" duration:3w
  milestone ship "Ship" after:[a, b]
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const lane = model.swimlanes[0];
        const parallels = lane.children.filter((c) => c.kind === 'parallel');
        expect(parallels).toHaveLength(2);
        const ship = model.milestones.find((m) => m.title === 'Ship');
        expect(ship).toBeDefined();
        expect(ship?.slackArrows?.length ?? 0).toBe(1);
    });

    it('draws a dependency arrow into a title-only item carrying after:', async () => {
        // The `after:` source `api` is explicit; the item that carries the
        // `after:` is title-only. The arrow must still draw — an id-less item
        // gets an internal handle so it registers as a dependency-edge target.
        // Before the fix the title-only target never entered the items map,
        // so no edge was built unless it also had an (otherwise unused) id.
        const src = `nowline v1

roadmap r "R" start:2026-01-05

swimlane plat "Platform"
  item api "API" duration:2w

swimlane web "Web"
  item "Web SDK" duration:2w after:api
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.edges).toHaveLength(1);
        expect(model.edges[0].fromId).toBe('api');
    });
});

describe('layoutRoadmap item title wrapping', () => {
    // The Platform lane from lolay/nowline#59, trimmed. At `scale:2w` a `2w`
    // item is a 160px logical column: a 148px bar with a 124px text area.
    // "Technology Selection" estimates at ~151px, so it used to spill and push
    // "API" down a whole row; wrapped as "Technology" / "Selection" it fits.
    function issueRoadmap(firstTitle = 'Technology Selection', extraItems = ''): string {
        return `nowline v1

roadmap "Generative AI" start:2026-04-06 scale:2w calendar:business

swimlane "Platform"
  item "${firstTitle}" duration:2w status:done
  item api "API" duration:3w status:done
  item "Agent Instructions" duration:3w status:in-progress
  item api-integration "Agent Integration" duration:4w status:planned
  item "Agent MCP" duration:2w status:planned
  item platform-e2e-test "E2E Test" duration:2w status:planned
${extraItems}`;
    }

    function items(children: PositionedTrackChild[]): PositionedItem[] {
        const out: PositionedItem[] = [];
        for (const child of children) {
            if (child.kind === 'item') out.push(child);
            else out.push(...items(child.children));
        }
        return out;
    }

    function byTitle(list: PositionedItem[], title: string): PositionedItem {
        const found = list.find((i) => i.title === title);
        if (!found) throw new Error(`no item titled ${title}`);
        return found;
    }

    async function layout(src: string) {
        const { file, resolved } = await parseAndResolve(src);
        return layoutRoadmap(file, resolved, { theme: 'light' });
    }

    it('keeps "API" on row 0 at the same y as the wrapped "Technology Selection"', async () => {
        const model = await layout(issueRoadmap());
        const all = items(model.swimlanes[0].children);
        const tech = byTitle(all, 'Technology Selection');
        const api = byTitle(all, 'API');
        expect(tech.titleLines).toEqual(['Technology', 'Selection']);
        expect(tech.textSpills).toBe(false);
        expect(tech.title).toBe('Technology Selection');
        // Chained in time on the same row; no spill reservation pushed it down.
        expect(api.box.y).toBe(tech.box.y);
        // Every item in the lane shares row 0.
        expect(new Set(all.map((i) => i.box.y)).size).toBe(1);
        // A title that fits on one line carries no `titleLines` at all.
        expect(api.titleLines).toBeUndefined();
        expect('titleLines' in api).toBe(false);
    });

    it('grows the wrapped bar to 72px when it has a meta line; row-mates stay 56px', async () => {
        const model = await layout(issueRoadmap());
        const all = items(model.swimlanes[0].children);
        const tech = byTitle(all, 'Technology Selection');
        expect(tech.metaText).toBe('2w');
        expect(tech.box.height).toBe(72);
        expect(byTitle(all, 'API').box.height).toBe(56);
        expect(byTitle(all, 'Agent MCP').box.height).toBe(56);
    });

    it('makes a lane 16px taller than the one-line version, not a whole 64px row', async () => {
        // A pinned second item collides with the first and drops to row 1, so
        // the lane's used height (not its minimum height) decides the band.
        const pinned = '  item pinned "Pinned" duration:2w date:2026-04-06\n';
        const wrapped = await layout(issueRoadmap('Technology Selection', pinned));
        // "Tech Selection" fits one line (105.6px < 124px): same lane, no wrap.
        const control = await layout(issueRoadmap('Tech Selection', pinned));
        const controlTech = byTitle(items(control.swimlanes[0].children), 'Tech Selection');
        expect(controlTech.titleLines).toBeUndefined();
        expect(controlTech.box.height).toBe(56);
        expect(wrapped.swimlanes[0].box.height - control.swimlanes[0].box.height).toBe(16);
    });

    it('grows the issue lane by less than one row, since the minimum lane height absorbs some', async () => {
        const wrapped = await layout(issueRoadmap('Technology Selection'));
        const control = await layout(issueRoadmap('Tech Selection'));
        const growth = wrapped.swimlanes[0].box.height - control.swimlanes[0].box.height;
        // The single-row lane sits on the `step + 32` minimum band height, so
        // the 16px row growth shows up as 10px; a spill would have added a
        // whole 64px row for "API".
        expect(growth).toBeGreaterThan(0);
        expect(growth).toBeLessThanOrEqual(16);
    });

    it('puts label chips below line 2 of a wrapped title and grows the bar to hold them', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

label urgent "Urgent"

swimlane "Platform"
  item "Technology Selection" duration:2w labels:urgent
`;
        const model = await layout(src);
        const tech = byTitle(items(model.swimlanes[0].children), 'Technology Selection');
        expect(tech.titleLines).toEqual(['Technology', 'Selection']);
        expect(tech.chipsOutside).toBe(false);
        expect(tech.labelChips).toHaveLength(1);
        const chip = tech.labelChips[0];
        const metaBaselineY = tech.box.y + 54; // 38 + one extra 16px title line
        const line2BaselineY = tech.box.y + 36; // 20 + 16
        expect(chip.box.y).toBeGreaterThan(metaBaselineY);
        expect(chip.box.y).toBeGreaterThan(line2BaselineY);
        // Chip top = meta baseline + 3px gap; the bar grows so the chip, its
        // 3px gap above the 4px progress strip, and the strip all fit.
        expect(chip.box.y).toBe(tech.box.y + 57);
        expect(tech.box.height).toBe(57 + 13 + 3 + 4);
        expect(chip.box.y + chip.box.height + 3 + 4).toBeLessThanOrEqual(
            tech.box.y + tech.box.height,
        );
    });

    it('regression guard: a title whose meta line is too wide still spills and does not over-reserve the row', async () => {
        // The meta "2w Lead Person - 40% remaining"-style line is wider than the
        // 124px text area, so the caption spills even though the title alone
        // would wrap. The row predictor must see that (it resolves the real meta
        // line); assuming the meta fits would reserve a taller row for a bar
        // that never grows.
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

person lead "Lead Person"

swimlane "Platform"
  item "Technology Selection" duration:2w owner:lead status:in-progress remaining:50%
  item api "API" duration:3w
`;
        const model = await layout(src);
        const all = items(model.swimlanes[0].children);
        const tech = byTitle(all, 'Technology Selection');
        expect(tech.textSpills).toBe(true);
        expect(tech.titleLines).toBeUndefined();
        expect(tech.box.height).toBe(56);
        // The spill reservation still pushes the next item down exactly one
        // plain row (step = 64), not 64 + a phantom 16px of wrap growth.
        expect(byTitle(all, 'API').box.y).toBe(tech.box.y + 64);
    });

    it('reserves the grown row inside a group so the next row does not overlap', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  group "Squad"
    item "Technology Selection" duration:2w
    item below "Below" duration:2w date:2026-04-06
`;
        const model = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const tech = byTitle(all, 'Technology Selection');
        const below = byTitle(all, 'Below');
        expect(tech.box.height).toBe(72);
        expect(below.box.y).toBeGreaterThanOrEqual(tech.box.y + tech.box.height);
        // Row pitch is step (64) + the 16px growth, keeping the 8px gap.
        expect(below.box.y).toBe(tech.box.y + 80);
        // The group's painted box encloses both rows.
        expect(group.box.y + group.box.height).toBeGreaterThanOrEqual(
            below.box.y + below.box.height,
        );
    });

    it('reserves the grown row inside a parallel so the next sub-track does not overlap', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  parallel
    item "Technology Selection" duration:2w
    item below "Below" duration:2w
`;
        const model = await layout(src);
        const parallel = model.swimlanes[0].children[0];
        if (parallel.kind !== 'parallel') throw new Error('expected a parallel');
        const all = items(parallel.children);
        const tech = byTitle(all, 'Technology Selection');
        const below = byTitle(all, 'Below');
        expect(tech.box.height).toBe(72);
        expect(below.box.y).toBeGreaterThanOrEqual(tech.box.y + tech.box.height);
        expect(below.box.y).toBe(tech.box.y + 80);
        expect(parallel.box.height).toBe(80 + 64);
    });

    it('bumps a colliding swimlane item below a wrapped bar by the grown row pitch', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  item "Technology Selection" duration:2w
  item below "Below" duration:2w date:2026-04-06
`;
        const model = await layout(src);
        const all = items(model.swimlanes[0].children);
        const tech = byTitle(all, 'Technology Selection');
        const below = byTitle(all, 'Below');
        expect(below.box.y).toBe(tech.box.y + 80);
    });

    it('attaches dependency arrows at the grown bar midpoint when the title wrapped', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane a "A"
  item tech "Technology Selection" duration:2w

swimlane b "B"
  item downstream "Down" duration:2w after:tech
`;
        const model = await layout(src);
        const tech = byTitle(items(model.swimlanes[0].children), 'Technology Selection');
        expect(tech.box.height).toBe(72);
        const edge = model.edges.find((e) => e.fromId === 'tech');
        expect(edge).toBeDefined();
        // A wrapped title does not spill, so the arrow leaves the bar's right
        // edge at the grown bar's midpoint, not along the progress-strip row a
        // spilled caption would force.
        const wp = edge?.waypoints ?? [];
        expect(wp[0].x).toBeCloseTo(tech.box.x + tech.box.width, 1);
        expect(wp[0].y).toBeCloseTo(tech.box.y + tech.box.height / 2, 1);
    });
});
