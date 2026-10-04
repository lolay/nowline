import { isItemDeclaration, isSwimlaneDeclaration, type NowlineFile } from '@nowline/core';
import { describe, expect, it, vi } from 'vitest';
import { layoutRoadmap, type PositionedItem, type PositionedTrackChild } from '../src/index.js';
import { SwimlaneNode, type SwimlaneNodeDeps } from '../src/nodes/swimlane-node.js';
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

    it('grows timeline date window when items exceed roadmap length property', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05 length:4w

swimlane lane "Lane"
  item support "Support" duration:4w
  item dev "Dev" duration:2w after:support
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const diffDays = Math.round(
            (model.timeline.endDate.getTime() - model.timeline.startDate.getTime()) /
                (24 * 60 * 60 * 1000),
        );
        expect(diffDays).toBe(30); // 6 weeks * 5 business days per week = 30 days
    });

    it('extends the timeline past the pre-pass window when a spilled group caption pushes a later parallel out of range', async () => {
        // `g`'s "short" item is a 1-day bar with a caption long enough to
        // spill far past it; a GROUP's painted box hugs that spill (see
        // `GroupNode.place`), so the swimlane's sequencing cursor — which
        // advances past a block's `box.x + box.width` — lands well past
        // what the pre-pass content estimate (logical bar durations only)
        // predicted. The `p` parallel that follows (no `after:`/`date:`,
        // so it sequences at the cursor) should still have its `tail`
        // item's bar fully inside the (grown) timeline window.
        const src = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane lane "Lane"
  group g "G"
    item short "This caption spills a very long way past its narrow bar" duration:1d
  parallel p "P"
    item tail "Tail" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const parallel = model.swimlanes[0].children.find((c) => c.kind === 'parallel');
        expect(parallel).toBeDefined();
        const tail = parallel?.children[0];
        expect(tail?.kind).toBe('item');
        const tailRightX = (tail?.box.x ?? 0) + (tail?.box.width ?? 0);
        const timelineRightX = model.timeline.box.x + model.timeline.box.width;
        expect(tailRightX).toBeLessThanOrEqual(timelineRightX);
    });

    it('keeps an include region box within the timeline right edge despite a long trailing caption', async () => {
        // `beta` is a 1-day bar inside the isolated include with a caption
        // long enough to spill well past it. The dashed include box must
        // shrink-wrap to the BARS (`alpha` + `beta`), not the spilled
        // caption, so it stays inside the parent's timeline window even
        // though the caption itself is allowed to overhang.
        const parentSrc = `nowline v1

include "./child.nowline" roadmap:isolate

roadmap r "R" start:2026-01-05 scale:1w

swimlane core "Core"
  item core-api "Core API" duration:5w
`;
        const childSrc = `nowline v1

roadmap child "Child" start:2026-01-05 scale:1w

swimlane plugin "Plugin"
  item alpha "Plugin alpha" duration:3w
  item beta "This is a very long trailing caption that spills quite far" duration:1d after:alpha
`;
        const { file, resolved } = await parseAndResolve(
            parentSrc,
            '/virtual/test.nowline',
            async () => childSrc,
        );
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(model.includes).toHaveLength(1);
        const include = model.includes[0];
        const timelineRightX = model.timeline.box.x + model.timeline.box.width;
        expect(include.box.x + include.box.width).toBeLessThanOrEqual(timelineRightX);
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

    it('attaches dependency arrows at the nominal row midline when the title wrapped', async () => {
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
        // edge on the row's nominal midline (28px below the top, as for any
        // 56px bar), not along the progress-strip row a spilled caption would
        // force and not at the grown bar's own mid-height (36px).
        const wp = edge?.waypoints ?? [];
        expect(wp[0].x).toBeCloseTo(tech.box.x + tech.box.width, 1);
        expect(wp[0].y).toBeCloseTo(tech.box.y + 28, 1);
    });
});

describe('layoutRoadmap title first-line clearance', () => {
    // `scale:2w`: a `2w` item is a 148px bar with a 124px text area. The first
    // title line shares the bar's upper-right with the status dot, so it gets
    // 148 - 12 - 21 = 115px (dot only), 104.2px (dot + one footnote digit) or
    // 99px (dot + `before:` glyph). Later lines keep the full 124px.
    function roadmap(body: string, header = ''): string {
        return `nowline v1

roadmap r "R" start:2026-04-06 scale:2w
${header}
swimlane "Platform"
${body}`;
    }

    function items(children: PositionedTrackChild[]): PositionedItem[] {
        const out: PositionedItem[] = [];
        for (const child of children) {
            if (child.kind === 'item') out.push(child);
            else out.push(...items(child.children));
        }
        return out;
    }

    async function layout(src: string) {
        const { file, resolved } = await parseAndResolve(src);
        return layoutRoadmap(file, resolved, { theme: 'light' });
    }

    function only(model: Awaited<ReturnType<typeof layout>>, title: string): PositionedItem {
        const found = items(model.swimlanes[0].children).find((i) => i.title === title);
        if (!found) throw new Error(`no item titled ${title}`);
        return found;
    }

    it('wraps a title that fits the inner width but would run under the status dot', async () => {
        // "Plan the rollout" is 120.6px: one line at 124px, over the 115px first line.
        const model = await layout(roadmap('  item "Plan the rollout" duration:2w\n'));
        const item = only(model, 'Plan the rollout');
        expect(item.textSpills).toBe(false);
        expect(item.titleLines).toEqual(['Plan the', 'rollout']);
        expect(item.box.height).toBe(72);
    });

    it('keeps a title that clears the dot on one line', async () => {
        // "Ship the thing" is 105.6px < 115px.
        const model = await layout(roadmap('  item "Ship the thing" duration:2w\n'));
        const item = only(model, 'Ship the thing');
        expect(item.titleLines).toBeUndefined();
        expect(item.box.height).toBe(56);
    });

    it('widens the reserve for a footnote on the item', async () => {
        const model = await layout(
            roadmap(
                '  item tech "Ship the thing" duration:2w\n',
                '\nfootnote note "Note" on:tech\n',
            ),
        );
        const item = only(model, 'Ship the thing');
        expect(item.footnoteIndicators).toEqual([1]);
        // 105.6px > 104.2px first-line width.
        expect(item.titleLines).toEqual(['Ship the', 'thing']);
        expect(item.box.height).toBe(72);
    });

    it('widens the reserve for a `before:` glyph', async () => {
        const model = await layout(
            roadmap('  item "Ship the thing" duration:2w before:2026-06-29\n'),
        );
        const item = only(model, 'Ship the thing');
        expect(item.inlineDatePins?.some((p) => p.side === 'before' && !p.spilled)).toBe(true);
        // 105.6px > 99px first-line width.
        expect(item.titleLines).toEqual(['Ship the', 'thing']);
    });

    it('reserves the grown row in a group when only a footnote makes the title wrap', async () => {
        // The row predictor has to see the footnote too, or the next row lands
        // 64px below instead of 80px and overlaps the grown bar.
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

footnote note "Note" on:tech

swimlane "Platform"
  group "Squad"
    item tech "Ship the thing" duration:2w
    item below "Below" duration:2w date:2026-04-06
`;
        const model = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const tech = all.find((i) => i.title === 'Ship the thing');
        const below = all.find((i) => i.title === 'Below');
        if (!tech || !below) throw new Error('missing items');
        expect(tech.titleLines).toEqual(['Ship the', 'thing']);
        expect(tech.box.height).toBe(72);
        expect(below.box.y).toBe(tech.box.y + 80);
    });

    it('reserves the grown row in a group when only a `before:` glyph makes the title wrap', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  group "Squad"
    item tech "Ship the thing" duration:2w before:2026-06-29
    item below "Below" duration:2w date:2026-04-06
`;
        const model = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const tech = all.find((i) => i.title === 'Ship the thing');
        const below = all.find((i) => i.title === 'Below');
        if (!tech || !below) throw new Error('missing items');
        expect(tech.titleLines).toEqual(['Ship the', 'thing']);
        expect(below.box.y).toBe(tech.box.y + 80);
    });
});

describe('layoutRoadmap caption indent past an `after:` glyph', () => {
    // `scale:2w`: a `2w` item is a 148px bar. An in-bar `after:DATE` glyph sits
    // in the upper-left, so the caption starts at 22px (40px beside a link
    // tile) instead of 12 / 24: the first line gets 148 - 22 - 21 = 105px
    // (87px beside a link tile) instead of 115 / 103px, and the whole inner
    // width shrinks by the same 10 / 16px.
    function roadmap(body: string): string {
        return `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
${body}`;
    }

    function items(children: PositionedTrackChild[]): PositionedItem[] {
        const out: PositionedItem[] = [];
        for (const child of children) {
            if (child.kind === 'item') out.push(child);
            else out.push(...items(child.children));
        }
        return out;
    }

    async function layout(src: string) {
        const { file, resolved } = await parseAndResolve(src);
        return layoutRoadmap(file, resolved, { theme: 'light' });
    }

    function only(model: Awaited<ReturnType<typeof layout>>, title: string): PositionedItem {
        const found = items(model.swimlanes[0].children).find((i) => i.title === title);
        if (!found) throw new Error(`no item titled ${title}`);
        return found;
    }

    it('wraps a title that clears the dot but would run under the `after:` glyph', async () => {
        // "Ship the thing" is 105.6px: inside the 115px dot-only first line,
        // outside the 105px first line the glyph leaves.
        const control = only(
            await layout(roadmap('  item "Ship the thing" duration:2w\n')),
            'Ship the thing',
        );
        expect(control.titleLines).toBeUndefined();

        const item = only(
            await layout(roadmap('  item "Ship the thing" duration:2w after:2026-04-20\n')),
            'Ship the thing',
        );
        const pin = item.inlineDatePins?.find((p) => p.side === 'after');
        expect(pin?.spilled).toBe(false);
        // The glyph spans 6..18, so the caption (22) clears it by 4px.
        expect(pin?.glyphTopLeft.x).toBe(item.box.x + 6);
        expect(item.textSpills).toBe(false);
        expect(item.titleLines).toEqual(['Ship the', 'thing']);
        expect(item.box.height).toBe(72);
    });

    it('indents past the link tile and the glyph together (40px) when the item has both', async () => {
        // "Ship it now!!" is 98px: inside the 103px first line a link tile
        // leaves, outside the 87px first line the glyph beside it leaves.
        const linked = only(
            await layout(
                roadmap(
                    '  item "Ship it now!!" duration:2w link:https://github.com/acme/team/issues/1\n',
                ),
            ),
            'Ship it now!!',
        );
        expect(linked.titleLines).toBeUndefined();

        const item = only(
            await layout(
                roadmap(
                    '  item "Ship it now!!" duration:2w link:https://github.com/acme/team/issues/1 after:2026-04-20\n',
                ),
            ),
            'Ship it now!!',
        );
        const pin = item.inlineDatePins?.find((p) => p.side === 'after');
        expect(pin?.glyphTopLeft.x).toBe(item.box.x + 24);
        expect(item.textSpills).toBe(false);
        expect(item.titleLines).toEqual(['Ship it', 'now!!']);
    });

    it('does not narrow the caption for a glyph that spilled out of a narrow bar', async () => {
        // A 3-day bar is 36px wide, under the 40px threshold: the `after:` glyph
        // spills out to the left of the bar, so it reserves nothing at the
        // caption's left edge. The caption outcome matches the same bar without
        // `after:` (here both spill: 36px is far too narrow for any title).
        const plain = only(await layout(roadmap('  item "Tiny" duration:3d\n')), 'Tiny');
        const dated = only(
            await layout(roadmap('  item "Tiny" duration:3d after:2026-04-20\n')),
            'Tiny',
        );
        expect(dated.box.width).toBeLessThan(40);
        expect(dated.inlineDatePins?.find((p) => p.side === 'after')?.spilled).toBe(true);
        expect(dated.textSpills).toBe(plain.textSpills);
        expect(dated.titleLines).toEqual(plain.titleLines);
    });

    it('grows the row of a group item that wraps because of the `after:` glyph', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  group "Squad"
    item tech "Ship the thing" duration:2w after:2026-04-06
    item below "Below" duration:2w date:2026-04-06
`;
        const model = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const tech = all.find((i) => i.title === 'Ship the thing');
        const below = all.find((i) => i.title === 'Below');
        if (!tech || !below) throw new Error('missing items');
        expect(tech.titleLines).toEqual(['Ship the', 'thing']);
        expect(tech.box.height).toBe(72);
        expect(below.box.y).toBe(tech.box.y + 80);
    });

    it('does not over-reserve the row when the glyph turns a would-be wrap into a spill', async () => {
        // "Go Internationalize" wraps inside the plain 124px inner width (line 2
        // is 120.6px), so a row predictor that ignored the glyph would reserve
        // the wrapped bar's 16px of growth. With the glyph's 22px inset the
        // inner width is 114px: line 2 no longer fits, the caption spills, the
        // bar stays 56px and the next row sits one plain pitch (64px) below.
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  group "Squad"
    item tech "Go Internationalize" duration:2w after:2026-04-06
    item below "Below" duration:2w date:2026-04-06
`;
        const model = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const tech = all.find((i) => i.title === 'Go Internationalize');
        const below = all.find((i) => i.title === 'Below');
        if (!tech || !below) throw new Error('missing items');
        expect(tech.textSpills).toBe(true);
        expect(tech.titleLines).toBeUndefined();
        expect(tech.box.height).toBe(56);
        expect(below.box.y).toBe(tech.box.y + 64);

        // Control: the same item without the glyph wraps in-bar and grows its row.
        const control = await layout(src.replace(' after:2026-04-06', ''));
        const controlGroup = control.swimlanes[0].children[0];
        if (controlGroup.kind !== 'group') throw new Error('expected a group');
        const controlItems = items(controlGroup.children);
        const plain = controlItems.find((i) => i.title === 'Go Internationalize');
        const plainBelow = controlItems.find((i) => i.title === 'Below');
        if (!plain || !plainBelow) throw new Error('missing items');
        expect(plain.titleLines).toEqual(['Go', 'Internationalize']);
        expect(plain.box.height).toBe(72);
        expect(plainBelow.box.y).toBe(plain.box.y + 80);
    });
});

describe('layoutRoadmap explicit title line breaks', () => {
    // `scale:2w`: a `2w` item is a 148px bar with a 124px text area (115px for the first line).
    // In the DSL source a `\n` escape is two characters; Langium turns it into a real newline.
    function items(children: PositionedTrackChild[]): PositionedItem[] {
        const out: PositionedItem[] = [];
        for (const child of children) {
            if (child.kind === 'item') out.push(child);
            else out.push(...items(child.children));
        }
        return out;
    }

    async function layout(src: string) {
        const { file, resolved } = await parseAndResolve(src);
        return { file, model: layoutRoadmap(file, resolved, { theme: 'light' }) };
    }

    function roadmap(body: string, header = ''): string {
        return `nowline v1

roadmap r "R" start:2026-04-06 scale:2w
${header}
swimlane "Platform"
${body}`;
    }

    function find(list: PositionedItem[], id: string): PositionedItem {
        const found = list.find((i) => i.id === id);
        if (!found) throw new Error(`no item ${id}`);
        return found;
    }

    /** The parsed title of a swimlane item, straight from the AST. */
    function astTitle(file: NowlineFile, name: string): string | undefined {
        for (const entry of file.roadmapEntries) {
            if (!isSwimlaneDeclaration(entry)) continue;
            for (const child of entry.content) {
                if (isItemDeclaration(child) && child.name === name) return child.title;
            }
        }
        throw new Error(`no item ${name} in the AST`);
    }

    it('keeps the raw title and splits it into the author lines', async () => {
        const { model } = await layout(
            roadmap('  item tech "Technology\\nSelection" duration:2w status:done\n'),
        );
        const tech = find(items(model.swimlanes[0].children), 'tech');
        expect(tech.title).toBe('Technology\nSelection');
        expect(tech.titleLines).toEqual(['Technology', 'Selection']);
        expect(tech.textSpills).toBe(false);
        expect(tech.box.height).toBe(72);
    });

    it('breaks a title that would fit one line in a wide bar (explicit beats fit)', async () => {
        // "Plan rollout" is 90px: one line in a 4w (308px) bar. The break still wins.
        const { model } = await layout(roadmap('  item plan "Plan\\nrollout" duration:4w\n'));
        const plan = find(items(model.swimlanes[0].children), 'plan');
        expect(plan.title).toBe('Plan\nrollout');
        expect(plan.titleLines).toEqual(['Plan', 'rollout']);
        expect(plan.textSpills).toBe(false);
        expect(plan.box.height).toBe(72);
    });

    it('grows the bar 32px for a three-line explicit title with a meta line, in-bar', async () => {
        const { model } = await layout(
            roadmap('  item three "Design\\nBuild\\nShip" duration:2w\n'),
        );
        const three = find(items(model.swimlanes[0].children), 'three');
        expect(three.titleLines).toEqual(['Design', 'Build', 'Ship']);
        expect(three.textSpills).toBe(false);
        expect(three.metaText).toBe('2w');
        // Meta baseline 38 + 2 * 16 = 70: grows 70 - 38 = 32px.
        expect(three.box.height).toBe(88);
    });

    it('does not grow a one-line break-free title, and still wraps nothing without a break', async () => {
        const { model } = await layout(roadmap('  item one "Design" duration:2w\n'));
        const one = find(items(model.swimlanes[0].children), 'one');
        expect(one.titleLines).toBeUndefined();
        expect('titleLines' in one).toBe(false);
        expect(one.box.height).toBe(56);
    });

    it('spills a too-wide explicit title as a multi-line block and grows the bar for its height', async () => {
        const { model } = await layout(
            roadmap('  item wide "Internationalization of\\nthe billing service" duration:2w\n'),
        );
        const wide = find(items(model.swimlanes[0].children), 'wide');
        expect(wide.textSpills).toBe(true);
        expect(wide.titleLines).toEqual(['Internationalization of', 'the billing service']);
        // titleBarExtra applies to the spilled block too, so the row contains the text.
        expect(wide.box.height).toBe(72);
    });

    it('reserves the widest title line, not the raw string, as the spill width', async () => {
        const { model } = await layout(
            roadmap('  item wide "Internationalization of\\nthe billing service" duration:2w\n'),
        );
        const wide = find(items(model.swimlanes[0].children), 'wide');
        const widest = 'Internationalization of'.length * 13 * 0.58; // 173.4px
        const rawWhole = 'Internationalization of\nthe billing service'.length * 13 * 0.58;
        const spillStart = wide.box.x + wide.box.width + 6;
        // The spill column is as wide as the widest line (the meta line is shorter).
        // Plus the status dot's column when the dot is inside, which adds nothing here.
        expect(wide.decorationsRightX - spillStart).toBeCloseTo(widest, 5);
        expect(wide.decorationsRightX - spillStart).toBeLessThan(rawWhole - 100);
    });

    it('does not let a spilled explicit block overrun the next chained item', async () => {
        const { model } = await layout(
            roadmap(
                '  item wide "Internationalization of\\nthe billing service" duration:2w\n  item after "Next" duration:2w\n',
            ),
        );
        const all = items(model.swimlanes[0].children);
        // "Next" sits on a later row: the spill reservation pushed it down.
        expect(find(all, 'after').box.y).toBeGreaterThan(find(all, 'wide').box.y);
    });

    it('predicts the grown row of an explicit three-line title so the next row clears it', async () => {
        // Inside a group the row packer reserves the row BEFORE placing: the next row
        // must start 64 (step) + 32 (growth) below, with the 8px gap intact.
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  group "Squad"
    item three "Design\\nBuild\\nShip" duration:2w
    item below "Below" duration:2w date:2026-04-06
`;
        const { model } = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const three = find(all, 'three');
        const below = find(all, 'below');
        expect(three.box.height).toBe(88);
        expect(below.box.y).toBe(three.box.y + 96);
    });

    it('predicts the grown row of a spilled explicit title too', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane "Platform"
  group "Squad"
    item wide "Internationalization of\\nthe billing service" duration:2w
    item below "Below" duration:2w date:2026-04-06
`;
        const { model } = await layout(src);
        const group = model.swimlanes[0].children[0];
        if (group.kind !== 'group') throw new Error('expected a group');
        const all = items(group.children);
        const wide = find(all, 'wide');
        const below = find(all, 'below');
        expect(wide.textSpills).toBe(true);
        expect(wide.box.height).toBe(72);
        expect(below.box.y).toBe(wide.box.y + 80);
    });

    it('predicts exactly the growth the spilled explicit block is placed with', async () => {
        // Rows commit at max(predicted, placed), so an under-predicting row
        // predictor never shows in the geometry (the test above passes with a
        // predictor that returns 0). Hold the predictor the lane was handed to
        // the placed bar directly: two spilled lines plus meta grow it 16px.
        const place = vi.spyOn(SwimlaneNode.prototype, 'place');
        try {
            const { file, model } = await layout(
                roadmap(
                    '  item wide "Internationalization of\\nthe billing service" duration:2w\n',
                ),
            );
            const lane = place.mock.contexts[0] as unknown as { deps: SwimlaneNodeDeps };
            const ctx = place.mock.calls[0][1];
            const decl = file.roadmapEntries
                .filter(isSwimlaneDeclaration)
                .flatMap((s) => s.content)
                .find((c) => isItemDeclaration(c) && c.name === 'wide');
            if (!decl || !isItemDeclaration(decl)) throw new Error('no item wide in the AST');
            const wide = find(items(model.swimlanes[0].children), 'wide');
            expect(wide.textSpills).toBe(true);
            expect(wide.box.height).toBe(72);
            expect(lane.deps.predictItemBarExtraHeight(decl, ctx)).toBe(16);
        } finally {
            place.mockRestore();
        }
    });

    it('stays single-line for a parse-level "a\\\\nb": the literal text a\\nb, not a break', async () => {
        // Source `"a\\nb"` (an escaped backslash, then n): Langium yields a, \, n, b.
        const { file, model } = await layout(
            roadmap('  item lit "a\\\\nb" duration:3w status:planned\n'),
        );
        expect(astTitle(file, 'lit')).toBe('a\\nb');
        const lit = find(items(model.swimlanes[0].children), 'lit');
        expect(lit.title).toBe('a\\nb');
        expect(lit.title).toHaveLength(4);
        expect(lit.titleLines).toBeUndefined();
        expect(lit.box.height).toBe(56);
    });

    it('parses the source escape \\n into a real newline in the AST', async () => {
        const { file } = await layout(roadmap('  item brk "a\\nb" duration:3w\n'));
        expect(astTitle(file, 'brk')).toBe('a\nb');
    });

    it('trims leading and trailing breaks off a title and lays it out as an ordinary one', async () => {
        const { model } = await layout(roadmap('  item trim "\\nPlan\\n" duration:3w\n'));
        const trim = find(items(model.swimlanes[0].children), 'trim');
        expect(trim.title).toBe('\nPlan\n');
        // One line left: painted lines are ["Plan"], not the raw string with its newlines.
        expect(trim.titleLines).toEqual(['Plan']);
        expect(trim.textSpills).toBe(false);
        expect(trim.box.height).toBe(56);
    });

    it('stacks chips below a spilled multi-line caption instead of overlapping it', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

label a-fairly-long-label-id "A"
label another-long-label-id "B"

swimlane "Platform"
  item wide "Internationalization of\\nthe billing service" duration:2w labels:[a-fairly-long-label-id, another-long-label-id]
`;
        const { model } = await layout(src);
        const wide = find(items(model.swimlanes[0].children), 'wide');
        expect(wide.textSpills).toBe(true);
        expect(wide.chipsOutside).toBe(true);
        // Meta baseline of a two-line caption is 54; the chips start 3px below it.
        for (const chip of wide.labelChips) {
            expect(chip.box.y).toBeGreaterThanOrEqual(wide.box.y + 54 + 3);
        }
        const bottom = Math.max(...wide.labelChips.map((c) => c.box.y + c.box.height));
        expect(bottom + 3 + 4).toBeLessThanOrEqual(wide.box.y + wide.box.height);
    });
});

describe('layoutRoadmap dependency-arrow attach geometry', () => {
    // A bar that grew (a wrapped title with a meta line is 72px, not 56px)
    // still attaches its dependency arrows on the row's NOMINAL midline,
    // `bandwidth / 2` (28px) below the bar top, so it shares an attach line
    // with its un-grown row neighbours.
    const NOMINAL_MID_PX = 28;
    const PROGRESS_STRIP_HALF_PX = 2;

    function items(children: PositionedTrackChild[]): PositionedItem[] {
        const out: PositionedItem[] = [];
        for (const child of children) {
            if (child.kind === 'item') out.push(child);
            else out.push(...items(child.children));
        }
        return out;
    }

    async function layout(src: string) {
        const { file, resolved } = await parseAndResolve(src);
        return layoutRoadmap(file, resolved, { theme: 'light' });
    }

    function find(model: Awaited<ReturnType<typeof layout>>, id: string): PositionedItem {
        const found = model.swimlanes.flatMap((l) => items(l.children)).find((i) => i.id === id);
        if (!found) throw new Error(`no item ${id}`);
        return found;
    }

    it('starts an item-sourced arrow at the bar when the marker band grows', async () => {
        // The anchor and the milestone label collide, so the marker band grows
        // to two rows and every chart y shifts down by one row pitch after the
        // items are placed. The arrow source must shift with the bars.
        const src = `nowline v1

roadmap repro "Marker band" start:2026-01-05 scale:1w

anchor freeze "code-freeze" date:2026-02-02

swimlane top "Top"
  item a "Alpha" duration:4w

swimlane bottom "Bottom"
  item b "Beta work" duration:2w after:a

milestone beta "Beta" after:a
`;
        const model = await layout(src);
        // The shift under test only happens when the band outgrows its sizing.
        expect(model.timeline.markerRow.height).toBeGreaterThanOrEqual(2 * 26);
        const a = find(model, 'a');
        const b = find(model, 'b');
        expect(a.box.height).toBe(56);
        const edge = model.edges.find((e) => e.fromId === 'a' && e.toId === 'b');
        expect(edge).toBeDefined();
        const wp = edge?.waypoints ?? [];
        expect(wp[0].x).toBeCloseTo(a.box.x + a.box.width, 1);
        expect(wp[0].y).toBeCloseTo(a.box.y + NOMINAL_MID_PX, 1);
        expect(wp[wp.length - 1].x).toBeCloseTo(b.box.x, 1);
        expect(wp[wp.length - 1].y).toBeCloseTo(b.box.y + NOMINAL_MID_PX, 1);
    });

    it('draws one straight segment from a grown bar to a normal bar on the same row', async () => {
        const src = `nowline v1

roadmap gap "Gap" start:2026-01-05 length:16w

swimlane s "S"
  item a "Auth refactor" duration:3w
  item b "Next" duration:2w after:a date:2026-02-23
`;
        const model = await layout(src);
        const a = find(model, 'a');
        const b = find(model, 'b');
        expect(a.box.height).toBe(72);
        expect(b.box.height).toBe(56);
        expect(b.box.y).toBe(a.box.y);
        const edge = model.edges.find((e) => e.fromId === 'a' && e.toId === 'b');
        expect(edge).toBeDefined();
        const wp = edge?.waypoints ?? [];
        // A single straight segment: two points on one horizontal line.
        expect(wp).toHaveLength(2);
        expect(wp[0].y).toBeCloseTo(wp[1].y, 3);
        expect(wp[0].y).toBeCloseTo(a.box.y + NOMINAL_MID_PX, 1);
        expect(wp[0].x).toBeCloseTo(a.box.x + a.box.width, 1);
        expect(wp[1].x).toBeCloseTo(b.box.x, 1);
    });

    it('draws one straight segment from a normal bar to a grown bar on the same row', async () => {
        const src = `nowline v1

roadmap gap "Gap" start:2026-01-05 length:16w

swimlane s "S"
  item a "Plain" duration:3w
  item b "Auth refactor" duration:3w after:a date:2026-02-23
`;
        const model = await layout(src);
        const a = find(model, 'a');
        const b = find(model, 'b');
        expect(a.box.height).toBe(56);
        expect(b.box.height).toBe(72);
        const wp = model.edges.find((e) => e.fromId === 'a' && e.toId === 'b')?.waypoints ?? [];
        expect(wp).toHaveLength(2);
        expect(wp[0].y).toBeCloseTo(wp[1].y, 3);
        expect(wp[1].y).toBeCloseTo(b.box.y + NOMINAL_MID_PX, 1);
    });

    it('draws no arrow between a grown bar and its immediate same-row successor', async () => {
        // The layout normally suppresses the arrow between file-order chained,
        // touching bars. A grown bar next to a normal one used to defeat that
        // check (their mid-heights differ) and drew a small S-jog.
        const src = `nowline v1

roadmap chain "Chain" start:2026-01-05 length:12w

swimlane s "S"
  item a "Auth refactor" duration:3w
  item b "Next" duration:2w after:a
  item c "Plainer" duration:3w
  item d "Next" duration:2w after:c
`;
        const model = await layout(src);
        expect(find(model, 'a').box.height).toBe(72);
        expect(find(model, 'c').box.height).toBe(56);
        expect(model.edges.find((e) => e.fromId === 'c' && e.toId === 'd')).toBeUndefined();
        expect(model.edges.find((e) => e.fromId === 'a' && e.toId === 'b')).toBeUndefined();
    });

    it('keeps the progress-strip attach for a spilled-caption source', async () => {
        const src = `nowline v1

roadmap spill "Spill" start:2026-01-05 scale:1w

swimlane s "S"
  item a "Infrastructure" duration:1w

swimlane t "T"
  item b "Beta" duration:2w after:a
`;
        const model = await layout(src);
        const a = find(model, 'a');
        expect(a.textSpills).toBe(true);
        const wp = model.edges.find((e) => e.fromId === 'a' && e.toId === 'b')?.waypoints ?? [];
        expect(wp[0].x).toBeCloseTo(a.box.x + a.box.width, 1);
        expect(wp[0].y).toBeCloseTo(a.box.y + a.box.height - PROGRESS_STRIP_HALF_PX, 1);
    });
});
