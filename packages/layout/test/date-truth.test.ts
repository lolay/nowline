// Date truth (specs/true-width-layout.md §6): every bar the chart draws spans
// its scheduled dates. Engine C's start and exclusive end, projected through
// the scale the item was placed with, bound the painted box: the box starts at
// most one seam right of the start and ends at most one seam left of the end,
// never outside them. A bar shorter than the 1 px floor may end past its end
// date by less than a pixel.
//
// Checked on every item A places (main lanes and first-level isolated
// regions) of every sample under `examples/` and `tests/`, laid out as
// `nowline <file> --now 2026-02-09` lays them out, and on the 60 generated
// roadmaps with waves.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWavePlan, type NowlineFile, type ResolveResult } from '@nowline/core';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { ITEM_SEAM_PX, MIN_ITEM_WIDTH } from '../src/themes/shared.js';
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
    /** The painted box's left and right edges. */
    box: [number, number];
    /** Engine C's start and exclusive end, projected to px. */
    dates: [number, number];
}

/**
 * Lay out with engine A, tracing every placement, and return each item whose
 * painted box leaves its scheduled dates, plus how many items were compared.
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
        // Engine C's exclusive end projects to the duration end: under `hide`
        // a non-working end date sits on the seam, under `show` on its own day.
        const start = t.scale.forward(c.start);
        const end = t.scale.forward(c.end);
        const left = item.box.x;
        const right = item.box.x + item.box.width;
        // A bar under the floor is the floor wide, so it may end past its date.
        const floorOverhang = Math.max(0, MIN_ITEM_WIDTH - (end - start));
        const ok =
            left >= start - TOLERANCE_PX &&
            left <= start + ITEM_SEAM_PX + TOLERANCE_PX &&
            right <= end + floorOverhang + TOLERANCE_PX &&
            right >= end - ITEM_SEAM_PX - TOLERANCE_PX;
        if (!ok) out.push({ item: item.id ?? item.title, box: [left, right], dates: [start, end] });
    }
    return { compared, out };
}

afterEach(() => setItemNodeTrace(undefined));

describe('every bar spans its scheduled dates (true-width layout)', () => {
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
