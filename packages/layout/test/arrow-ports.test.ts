// Arrow ports (specs/true-width-layout.md §3.4, §6): every dependency arrow
// starts in its source's last day and ends in its target's first day, and
// no vertical leg runs along a bar edge (within 1 px of a bar's left or
// right edge over that bar's height).
//
// The days come from engine C's dates projected through the scale each item
// was placed with (traced, as in `date-truth.test.ts`), never from the code
// under test; a group or parallel source spans its box (`container-span`).
// A marker source starts on its cut line. Every segment is horizontal or
// vertical.
//
// Checked on every arrow of every sample under `examples/` and `tests/`
// (main lanes and isolated regions, each among its own lanes), laid out as
// `nowline <file> --now 2026-02-09` lays them out, on the 60 generated
// roadmaps with waves, and on focused cases from the design's stress files
// (`specs/true-width-layout.md` §6).

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWavePlan, type NowlineFile, type ResolveResult } from '@nowline/core';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import type { ItemMeasure } from '../src/nodes/item-measure.js';
import { setItemNodeTrace } from '../src/nodes/item-node.js';
import { scheduleRoadmap } from '../src/schedule.js';
import type {
    BoundingBox,
    Point,
    PositionedDependencyEdge,
    PositionedItem,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
} from '../src/types.js';
import { generateRoadmap, mulberry32 } from './generated-roadmaps.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The `--now` the G1 gate renders every sample with. */
const TODAY = new Date(Date.UTC(2026, 1, 9));

/** Pixel float noise. */
const TOLERANCE_PX = 1e-6;

/** How close a vertical leg may come to a bar edge it passes (§6). */
const EDGE_CLEARANCE_PX = 1;

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

/** An entity's dates in x and its painted box. */
interface Span {
    start: number;
    end: number;
    box: BoundingBox;
}

function childrenOf(lanes: PositionedSwimlane[]): PositionedTrackChild[] {
    const walk = (children: PositionedTrackChild[]): PositionedTrackChild[] =>
        children.flatMap((c) => (c.kind === 'item' ? [c] : [c, ...walk(c.children)]));
    return lanes.flatMap((lane) => [...walk(lane.children), ...childrenOf(lane.nested)]);
}

interface Chart {
    edges: PositionedDependencyEdge[];
    lanes: PositionedSwimlane[];
    markers: Map<string, number>;
}

function charts(model: PositionedRoadmap): Chart[] {
    const markers = (list: Array<{ id?: string; center: Point }>): Map<string, number> =>
        new Map(list.filter((m) => m.id).map((m) => [m.id as string, m.center.x]));
    return [
        {
            edges: model.edges,
            lanes: model.swimlanes,
            markers: markers([...model.anchors, ...model.milestones]),
        },
        ...model.includes.map((r) => ({
            edges: r.edges ?? [],
            lanes: r.nestedSwimlanes,
            markers: markers([...(r.anchors ?? []), ...(r.milestones ?? [])]),
        })),
    ];
}

const inRange = (x: number, lo: number, hi: number): boolean =>
    x >= lo - TOLERANCE_PX && x <= hi + TOLERANCE_PX;

/**
 * Lay out, tracing every item's dates, and return each broken rule plus how
 * many arrows were checked.
 */
function check(
    file: NowlineFile,
    resolved: ResolveResult,
    today?: Date,
): { arrows: number; model: PositionedRoadmap; out: string[] } {
    const dates = new Map<PositionedItem, { start: number; end: number }>();
    const schedule = scheduleRoadmap(file, resolved, {
        today,
        plan: buildWavePlan(resolved) ?? null,
    });
    setItemNodeTrace((node, ctx, item) => {
        const c = schedule.byNode.get((node.geometry as ItemMeasure).node);
        if (c) dates.set(item, { start: ctx.time.forward(c.start), end: ctx.time.forward(c.end) });
    });
    let model: PositionedRoadmap;
    try {
        model = layoutRoadmap(file, resolved, { today, schedule });
    } finally {
        setItemNodeTrace(undefined);
    }
    const ppd = model.timeline.pixelsPerDay;
    const out: string[] = [];
    let arrows = 0;
    for (const chart of charts(model)) {
        const spans = new Map<string, Span>();
        const bars: BoundingBox[] = [];
        for (const child of childrenOf(chart.lanes)) {
            if (child.kind === 'item') {
                bars.push(child.box);
                const d = dates.get(child);
                if (child.id && d) spans.set(child.id, { ...d, box: child.box });
            } else if (child.id) {
                const { box } = child;
                spans.set(child.id, { start: box.x, end: box.x + box.width, box });
            }
        }
        for (const edge of chart.edges) {
            const label = `${edge.fromId} -> ${edge.toId}`;
            const wp = edge.waypoints;
            const first = wp[0];
            const last = wp[wp.length - 1];
            const target = spans.get(edge.toId);
            // An id-less target registers under a handle the model does not carry.
            if (!target) continue;
            arrows++;
            for (let i = 1; i < wp.length; i++) {
                const a = wp[i - 1];
                const b = wp[i];
                if (Math.abs(a.x - b.x) > TOLERANCE_PX && Math.abs(a.y - b.y) > TOLERANCE_PX) {
                    out.push(`${label}: diagonal segment ${i}`);
                }
            }
            const firstDay = [target.start, Math.min(target.end, target.start + ppd)];
            if (!inRange(last.x, firstDay[0], firstDay[1])) {
                out.push(
                    `${label}: ends at x ${last.x}, outside the target's first day ${firstDay}`,
                );
            }
            const t = target.box;
            if (!inRange(last.y, t.y, t.y + t.height)) {
                out.push(`${label}: ends at y ${last.y}, off the target ${t.y}..${t.y + t.height}`);
            }
            const source = spans.get(edge.fromId);
            const markerX = chart.markers.get(edge.fromId);
            if (source) {
                const lastDay = [Math.max(source.start, source.end - ppd), source.end];
                if (!inRange(first.x, lastDay[0], lastDay[1])) {
                    out.push(
                        `${label}: starts at x ${first.x}, outside the source's last day ${lastDay}`,
                    );
                }
                const s = source.box;
                if (!inRange(first.y, s.y, s.y + s.height)) {
                    out.push(
                        `${label}: starts at y ${first.y}, off the source ${s.y}..${s.y + s.height}`,
                    );
                }
            } else if (markerX !== undefined) {
                if (Math.abs(first.x - markerX) > TOLERANCE_PX) {
                    out.push(`${label}: starts at x ${first.x}, off the marker line ${markerX}`);
                }
            } else {
                out.push(`${label}: unknown source`);
            }
            for (let i = 1; i < wp.length; i++) {
                const a = wp[i - 1];
                const b = wp[i];
                if (Math.abs(a.x - b.x) > TOLERANCE_PX) continue;
                const lo = Math.min(a.y, b.y);
                const hi = Math.max(a.y, b.y);
                for (const bar of bars) {
                    const overlap = Math.min(hi, bar.y + bar.height) - Math.max(lo, bar.y);
                    if (overlap <= TOLERANCE_PX) continue;
                    for (const edgeX of [bar.x, bar.x + bar.width]) {
                        if (Math.abs(a.x - edgeX) <= EDGE_CLEARANCE_PX) {
                            out.push(
                                `${label}: vertical leg at x ${a.x} runs along a bar edge at ${edgeX}`,
                            );
                        }
                    }
                }
            }
        }
    }
    return { arrows, model, out };
}

async function layout(source: string): Promise<ReturnType<typeof check>> {
    const { file, resolved } = await parseAndResolve(source);
    return check(file, resolved);
}

afterEach(() => setItemNodeTrace(undefined));

describe('every dependency arrow runs on its dates (true-width layout)', () => {
    it.each(sampleFiles())('%s', async (rel) => {
        const abs = path.join(REPO, rel);
        const source = await readFile(abs, 'utf8');
        const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
        expect(check(file, resolved, TODAY).out).toEqual([]);
    });

    it('holds on the 60 generated roadmaps with waves', async () => {
        const rand = mulberry32(0x5eed);
        let arrows = 0;
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const result = await layout(gen.source);
            expect(result.out, gen.source).toEqual([]);
            arrows += result.arrows;
        }
        expect(arrows).toBeGreaterThan(20);
    });
});

const edgesOf = (model: PositionedRoadmap) =>
    new Map(model.edges.map((e) => [`${e.fromId}>${e.toId}`, e]));

describe('date-port arrows (focused cases)', () => {
    it('a chain of one-day tasks (five-days): each drop lands on its successor', async () => {
        const { model, out } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane s "S"
  item a "Rate limiting" duration:1d
  item b "Retry policy" duration:1d after:a
  item c "Circuit breaker" duration:1d after:b
  item d "Timeouts" duration:1d after:c
  item e "Bulkheads" duration:1d after:d
`);
        expect(out).toEqual([]);
        const edges = edgesOf(model);
        // Each caption spills, so each task drops a row and gets a down arrow,
        // solid: it starts the day its source ends.
        for (const key of ['a>b', 'b>c', 'c>d', 'd>e']) {
            const e = edges.get(key);
            expect(e, key).toBeDefined();
            expect(e?.slack).toBe(false);
            expect(e?.waypoints[0].y).toBeLessThan(e?.waypoints.at(-1)?.y ?? 0);
        }
    });

    it('draws no arrow for a same-row target that starts where its source ends', async () => {
        const { model } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane s "S"
  item a "A" duration:2w
  item b "B" duration:2w after:a
`);
        expect(model.edges).toEqual([]);
    });

    it('a same-row target that waits gets one dotted leg on the midline', async () => {
        const { model, out } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor later date:2026-01-26

swimlane s "S"
  item a "A" duration:2w
  item b "B" duration:2w after:[a, later]
`);
        expect(out).toEqual([]);
        const e = edgesOf(model).get('a>b');
        expect(e?.slack).toBe(true);
        expect(e?.waypoints).toHaveLength(2);
        expect(e?.waypoints[0].y).toBe(e?.waypoints[1].y);
    });

    it('draws no stub for an item that starts on its anchor, a dotted one when it waits', async () => {
        const { model } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor go date:2026-01-12

swimlane s "S"
  item a "On the line" duration:1w after:go

swimlane t "T"
  item x "Earlier" duration:2w
  item b "Waits" duration:1w after:[go, x]
`);
        const edges = edgesOf(model);
        expect(edges.has('go>a')).toBe(false);
        const stub = edges.get('go>b');
        expect(stub?.slack).toBe(true);
        expect(stub?.waypoints).toHaveLength(2);
    });

    it('a parallel source leaves the bottom of its body (after-container)', async () => {
        const { model, out } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane s "S"
  parallel p "Build"
    item a "API" duration:2w
    item b "Client" duration:3w

swimlane t "T"
  item x "Prep" duration:4w
  item y "Launch" duration:1w after:p
`);
        expect(out).toEqual([]);
        const par = model.swimlanes[0].children[0];
        const e = edgesOf(model).get('p>y');
        expect(e).toBeDefined();
        expect(e?.waypoints[0].y).toBeCloseTo(par.box.y + par.box.height, 6);
        expect(e?.slack).toBe(true);
    });

    it('arrows landing on one day share a lane (O1 bundling)', async () => {
        const { model, out } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane s "S"
  item a "A" duration:3w
  item b "B" duration:2w

swimlane t "T"
  item c "Joins" duration:1w after:[a, b]
`);
        expect(out).toEqual([]);
        const edges = edgesOf(model);
        const a = edges.get('a>c');
        const b = edges.get('b>c');
        expect(a && b).toBeTruthy();
        // a and b share a row, so both drop into the gap below it and land on
        // c's first day on one horizontal lane: one trunk.
        expect(a?.waypoints.at(-1)).toEqual(b?.waypoints.at(-1));
        expect(a?.waypoints[1].y).toBe(b?.waypoints[1].y);
    });

    it('scales the arrowhead to a narrow target and makes it a dot below 3 px (O6)', async () => {
        const { model } = await layout(`nowline v1

roadmap r "R" start:2026-01-05 scale:1m

swimlane s "S"
  item a "A caption that spills" duration:1w
  item b "B" duration:1d after:a
`);
        const e = edgesOf(model).get('a>b');
        expect(e?.head).toBe('dot');
        expect(e?.headWidth).toBe(3);
    });
});
