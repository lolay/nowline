// Engine C is a lower bound of engine A (specs/scheduler-unification.md
// §3.1, follow-up F4). With F1, F2, F5 and F8 landed, every rule where the
// pixel layout and `scheduleRoadmap` differ only ever makes the pixel start
// later ((b) to (d), and the shapes C does not resolve yet, such as an
// `after:` on a parallel or a group), so C's start, projected to px, is at
// most A's for every item. That is what lets A floor its starts from C and
// warm-start its barrier passes from C's `S_k` without moving a bar.
//
// The property is checked on every item A places (anonymous ones included,
// main lanes and first-level isolated regions), and on every wave's `S_k`
// and `E_k`, of every sample under
// `examples/` and `tests/`, laid out as `nowline <file> --now 2026-02-09`
// lays them out, and of the 60 generated roadmaps with waves.

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
import type { TimeScale } from '../src/time-scale.js';
import type {
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

/** Pixel float noise: a projected date and a sum of widths can differ by ulps. */
const TOLERANCE_PX = 1e-6;

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

function trackItems(children: PositionedTrackChild[]): PositionedItem[] {
    const out: PositionedItem[] = [];
    for (const child of children) {
        if (child.kind === 'item') out.push(child);
        else out.push(...trackItems(child.children));
    }
    return out;
}

/** Every item the model carries: main lanes and the lanes of include regions. */
function modelItems(model: PositionedRoadmap): PositionedItem[] {
    const walk = (lanes: PositionedSwimlane[]): PositionedItem[] =>
        lanes.flatMap((lane) => [...trackItems(lane.children), ...walk(lane.nested)]);
    return [...walk(model.swimlanes), ...walk(model.includes.flatMap((r) => r.nestedSwimlanes))];
}

interface Violation {
    item: string;
    /** A's start (px) and C's start projected to px. */
    a: number;
    c: number;
    cDate: string;
}

/**
 * Lay out with engine A, tracing every placement, and return each kept item
 * whose start lies before engine C's (projected through the scale A placed
 * it with), plus how many items were compared.
 */
function violations(
    file: NowlineFile,
    resolved: ResolveResult,
    today?: Date,
): { compared: number; out: Violation[] } {
    const traced = new Map<PositionedItem, { measure: ItemMeasure; scale: TimeScale }>();
    setItemNodeTrace((node, ctx, item) =>
        traced.set(item, { measure: node.geometry as ItemMeasure, scale: ctx.time }),
    );
    // Hand layout the schedule, so A is compared with the very C it ran with.
    const schedule = scheduleRoadmap(file, resolved, {
        today,
        plan: buildWavePlan(resolved) ?? null,
    });
    let model: PositionedRoadmap;
    try {
        model = layoutRoadmap(file, resolved, { today, schedule });
    } finally {
        setItemNodeTrace(undefined);
    }
    const out: Violation[] = [];
    let compared = 0;
    for (const item of modelItems(model)) {
        const t = traced.get(item);
        expect(t, `untraced item ${item.id ?? item.title}`).toBeDefined();
        if (!t) continue;
        const c = schedule.byNode.get(t.measure.node);
        if (!c) continue;
        compared++;
        const cx = t.scale.forward(c.start);
        if (t.measure.startX < cx - TOLERANCE_PX) {
            out.push({
                item: item.id ?? item.title,
                a: t.measure.startX,
                c: cx,
                cDate: c.start.toISOString().slice(0, 10),
            });
        }
    }
    // The wave spans the barrier driver is seeded with: C's `S_k` and
    // `E_k` (the exclusive end projects to the duration end).
    const scale = [...traced.values()][0]?.scale;
    for (const wave of model.waves ?? []) {
        const c = schedule.waves?.get(wave.id);
        if (!c || !scale) continue;
        compared++;
        for (const [edge, a, date] of [
            ['S', wave.startX, c.start],
            ['E', wave.endX, c.end],
        ] as const) {
            const cx = scale.forward(date);
            if (a < cx - TOLERANCE_PX) {
                out.push({
                    item: `wave:${wave.id}.${edge}`,
                    a,
                    c: cx,
                    cDate: date.toISOString().slice(0, 10),
                });
            }
        }
    }
    return { compared, out };
}

afterEach(() => setItemNodeTrace(undefined));

describe("engine C's start is a lower bound of engine A's (scheduler-unification F4)", () => {
    it.each(sampleFiles())('%s', async (rel) => {
        const abs = path.join(REPO, rel);
        const source = await readFile(abs, 'utf8');
        const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
        const { compared, out } = violations(file, resolved, TODAY);
        expect(out).toEqual([]);
        expect(compared).toBeGreaterThan(0);
    });

    it('holds on the 60 generated roadmaps with waves', async () => {
        const rand = mulberry32(0x5eed);
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            const { compared, out } = violations(file, resolved);
            expect(out, gen.source).toEqual([]);
            expect(compared, gen.source).toBeGreaterThan(0);
        }
    });
});
