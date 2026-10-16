// No overlap (specs/true-width-layout.md §3.2, §6): within a track, no item's
// bar lands on another item's painted footprint, its bar and whatever it
// spills right of the bar (caption, dot, icon, footnotes, chips). Rows pack on
// that footprint, so a long caption pushes the next item down, never under it;
// that holds for a caption spilled inside a parallel, whose box spans only its
// dates, too.
//
// Checked on every lane (main lanes and first-level isolated regions) of every
// sample under `examples/` and `tests/`, laid out as
// `nowline <file> --now 2026-02-09` lays them out, and on the 60 generated
// roadmaps with waves.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
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
    return children.flatMap((child) =>
        child.kind === 'item' ? [child] : trackItems(child.children),
    );
}

/** The items of each lane: main lanes and the lanes of include regions. */
function laneItems(model: PositionedRoadmap): PositionedItem[][] {
    const walk = (lanes: PositionedSwimlane[]): PositionedItem[][] =>
        lanes.flatMap((lane) => [trackItems(lane.children), ...walk(lane.nested)]);
    return [...walk(model.swimlanes), ...walk(model.includes.flatMap((r) => r.nestedSwimlanes))];
}

/** Right edge of what an item paints: its bar, or what it spills past it. */
function footprintRight(item: PositionedItem): number {
    const barRight = item.box.x + item.box.width;
    const spills =
        item.textSpills ||
        item.chipsOutside ||
        item.dotSpills ||
        item.iconSpills ||
        item.footnoteSpills;
    if (!spills) return barRight;
    return Math.max(barRight, item.decorationsRightX, item.chipsOutside ? item.chipsRightX : 0);
}

function overlaps(model: PositionedRoadmap): string[] {
    const out: string[] = [];
    for (const lane of laneItems(model)) {
        for (const a of lane) {
            for (const b of lane) {
                if (a === b) continue;
                const sameBand =
                    a.box.y < b.box.y + b.box.height && b.box.y < a.box.y + a.box.height;
                const hits = a.box.x < b.box.x + b.box.width && b.box.x < footprintRight(a);
                if (sameBand && hits) out.push(`${a.id ?? a.title} paints over ${b.id ?? b.title}`);
            }
        }
    }
    return out;
}

describe('no item lands on the bar or spilled caption of another', () => {
    it.each(sampleFiles())('%s', async (rel) => {
        const abs = path.join(REPO, rel);
        const source = await readFile(abs, 'utf8');
        const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
        expect(overlaps(layoutRoadmap(file, resolved, { today: TODAY }))).toEqual([]);
    });

    it('holds on the 60 generated roadmaps with waves', async () => {
        const rand = mulberry32(0x5eed);
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            expect(overlaps(layoutRoadmap(file, resolved)), gen.source).toEqual([]);
        }
    });
});
