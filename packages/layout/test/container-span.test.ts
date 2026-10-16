// Container span (specs/true-width-layout.md §3.3, §6): a group's or a
// parallel's bracket and body span exactly its children's earliest start and
// latest end. Both are drawn over the container's box, so the box's left edge
// is the earliest scheduled start of any item inside it, and its right edge
// the latest scheduled end, each projected through the scale the item was
// placed with. A title or a spilled caption may run past that end; neither
// widens the box.
//
// Checked on every group and parallel A places (main lanes and first-level
// isolated regions) of every sample under `examples/` and `tests/`, laid out
// as `nowline <file> --now 2026-02-09` lays them out, and on the 60 generated
// roadmaps with waves.

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
    PositionedGroup,
    PositionedItem,
    PositionedParallel,
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

type Container = PositionedGroup | PositionedParallel;

function containersIn(children: PositionedTrackChild[]): Container[] {
    return children.flatMap((child) =>
        child.kind === 'item' ? [] : [child, ...containersIn(child.children)],
    );
}

function itemsIn(children: PositionedTrackChild[]): PositionedItem[] {
    return children.flatMap((child) => (child.kind === 'item' ? [child] : itemsIn(child.children)));
}

/** Every container the model carries: main lanes and the lanes of include regions. */
function modelContainers(model: PositionedRoadmap): Container[] {
    const walk = (lanes: PositionedSwimlane[]): Container[] =>
        lanes.flatMap((lane) => [...containersIn(lane.children), ...walk(lane.nested)]);
    return [...walk(model.swimlanes), ...walk(model.includes.flatMap((r) => r.nestedSwimlanes))];
}

/**
 * Lay out with engine A, tracing every placement, and return each container
 * whose box leaves its items' scheduled span, plus how many were compared.
 */
function violations(
    file: NowlineFile,
    resolved: ResolveResult,
    today?: Date,
): { compared: number; out: string[] } {
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
    const out: string[] = [];
    let compared = 0;
    for (const container of modelContainers(model)) {
        let start = Number.POSITIVE_INFINITY;
        let end = Number.NEGATIVE_INFINITY;
        for (const item of itemsIn(container.children)) {
            const t = traced.get(item);
            const c = t && schedule.byNode.get(t.measure.node);
            if (!t || !c) continue;
            start = Math.min(start, t.scale.forward(c.start));
            end = Math.max(end, t.scale.forward(c.end));
        }
        if (start === Number.POSITIVE_INFINITY) continue;
        compared++;
        const left = container.box.x;
        const right = container.box.x + container.box.width;
        if (Math.abs(left - start) > TOLERANCE_PX || Math.abs(right - end) > TOLERANCE_PX) {
            out.push(
                `${container.kind} ${container.id ?? container.title ?? '(anonymous)'}: box [${left}, ${right}], items [${start}, ${end}]`,
            );
        }
    }
    return { compared, out };
}

afterEach(() => setItemNodeTrace(undefined));

describe('every group and parallel spans exactly its children (true-width layout)', () => {
    it.each(sampleFiles())('%s', async (rel) => {
        const abs = path.join(REPO, rel);
        const source = await readFile(abs, 'utf8');
        const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
        expect(violations(file, resolved, TODAY).out).toEqual([]);
    });

    it('holds on the 60 generated roadmaps with waves', async () => {
        const rand = mulberry32(0x5eed);
        let compared = 0;
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            const result = violations(file, resolved);
            expect(result.out, gen.source).toEqual([]);
            compared += result.compared;
        }
        expect(compared).toBeGreaterThan(0);
    });

    it('a title and a spilled caption run past the box, never widen it', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 calendar:full scale:1w

swimlane s "S"
  group g "A group title far longer than its one day of work"
    item a "A caption far longer than its one-day bar" duration:1d
  item z "Z" duration:1w
`);
        const model = layoutRoadmap(file, resolved);
        const lane = model.swimlanes[0];
        const group = lane.children.find((c): c is PositionedGroup => c.kind === 'group')!;
        const z = lane.children.find((c): c is PositionedItem => c.kind === 'item')!;
        const { originX, pixelsPerDay } = model.timeline;
        expect(group.box.x).toBeCloseTo(originX, 6);
        expect(group.box.width).toBeCloseTo(pixelsPerDay, 6);
        // z starts on its date, the group's end, and drops below the group
        // rather than landing under its title or caption.
        expect(z.box.x).toBeLessThanOrEqual(originX + pixelsPerDay + 1);
        expect(z.box.y).toBeGreaterThanOrEqual(group.box.y + group.box.height);
    });
});
