// Gate-level regression check for item-title / decoration overlap
// (lolay/nowline#59 follow-up). The first line of an in-bar item title
// must stay clear of the bar's top-right decoration cluster: the status
// dot, the footnote digits and the `before:` inline-date glyph.
//
// Layout has no font metrics, so the check uses the same pessimistic
// per-character estimate layout itself uses (0.58 em per character).
// The arithmetic is deliberately restated here rather than imported from
// `@nowline/layout`: a regression gate that borrows the code under test
// would pass whenever that code is wrong in the same way.
//
//   captionX   = box.x + (link icon in bar ? 24 : 12)
//   line1Right = captionX + len(line1) * 13 * 0.58
//   cluster    = leftmost of: dot left (R - 17), leftmost footnote digit left
//                (R - 22 - (n-1)*8 - digitWidth), `before:` glyph left
//   collision  = line1Right > clusterLeft - 4
//
// Only IN-BAR captions are checked; a spilled caption paints to the right
// of the bar, away from the cluster. Every `examples/*.nowline` and
// `tests/*.nowline` is laid out, so a new fixture is covered for free.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import {
    layoutRoadmap,
    type PositionedItem,
    type PositionedRoadmap,
    type PositionedSwimlane,
    type PositionedTrackChild,
} from '@nowline/layout';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { FIXED_TODAY } from './snapshot.helpers.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SOURCE_DIRS = ['examples', 'tests'] as const;

/** Required air (px) between the end of line 1 and the cluster. */
const CLEARANCE_PX = 4;

const services = createNowlineServices();

async function layoutFile(absSource: string, tag: string): Promise<PositionedRoadmap> {
    const { shared, Nowline } = services;
    const text = await fs.readFile(absSource, 'utf-8');
    const uri = URI.parse(`memory:///caption-clearance-${tag}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, absSource, { services: Nowline });
    return layoutRoadmap(file, resolved, { theme: 'light', today: FIXED_TODAY });
}

function* itemsOf(children: PositionedTrackChild[]): Generator<PositionedItem> {
    for (const child of children) {
        if (child.kind === 'item') yield child;
        else yield* itemsOf(child.children);
    }
}

function* lanesItems(lanes: PositionedSwimlane[]): Generator<PositionedItem> {
    for (const lane of lanes) {
        yield* itemsOf(lane.children);
        yield* lanesItems(lane.nested);
    }
}

function* allItems(model: PositionedRoadmap): Generator<PositionedItem> {
    yield* lanesItems(model.swimlanes);
    for (const region of model.includes) yield* lanesItems(region.nestedSwimlanes);
}

interface Overlap {
    title: string;
    line1: string;
    /** px by which line 1 (plus the clearance) passes the cluster's left edge. */
    over: number;
}

/** The first in-bar title line against the top-right cluster, or null when clear. */
function firstLineOverlap(item: PositionedItem): Overlap | null {
    if (item.textSpills) return null;
    const right = item.box.x + item.box.width;
    const captionX = item.box.x + (item.linkIcon !== 'none' ? 24 : 12);
    const line1 = item.titleLines?.[0] ?? item.title.split('\n')[0];
    const line1Right = captionX + line1.length * 13 * 0.58;

    let clusterLeft = Number.POSITIVE_INFINITY;
    if (!item.dotSpills) clusterLeft = Math.min(clusterLeft, right - 17);
    const footnotes = item.footnoteIndicators.length;
    if (footnotes > 0 && !item.footnoteSpills) {
        const digitW = String(item.footnoteIndicators[0]).length * 10 * 0.58;
        clusterLeft = Math.min(clusterLeft, right - 22 - (footnotes - 1) * 8 - digitW);
    }
    for (const pin of item.inlineDatePins ?? []) {
        if (pin.side === 'before' && !pin.spilled) {
            clusterLeft = Math.min(clusterLeft, pin.glyphTopLeft.x);
        }
    }
    const over = line1Right - (clusterLeft - CLEARANCE_PX);
    return over > 0 ? { title: item.title, line1, over } : null;
}

interface FileScan {
    name: string;
    inBarItems: number;
    overlaps: Overlap[];
}

const scans: FileScan[] = [];
for (const dir of SOURCE_DIRS) {
    const names = (await fs.readdir(path.join(REPO_ROOT, dir)))
        .filter((f) => f.endsWith('.nowline'))
        .sort();
    for (const name of names) {
        const model = await layoutFile(path.join(REPO_ROOT, dir, name), `${dir}-${name}`);
        let inBarItems = 0;
        const overlaps: Overlap[] = [];
        for (const item of allItems(model)) {
            if (item.textSpills) continue;
            inBarItems += 1;
            const hit = firstLineOverlap(item);
            if (hit) overlaps.push(hit);
        }
        scans.push({ name: `${dir}/${name}`, inBarItems, overlaps });
    }
}

describe('item title first-line clearance of the top-right decorations', () => {
    it('scans a meaningful number of in-bar items', () => {
        // Guards against the walk silently visiting nothing.
        const total = scans.reduce((n, s) => n + s.inBarItems, 0);
        expect(scans.length).toBeGreaterThan(20);
        expect(total).toBeGreaterThan(80);
    });

    for (const scan of scans) {
        it(`${scan.name}: no in-bar first title line runs under the dot, footnotes or before: glyph`, () => {
            const report = scan.overlaps.map(
                (o) => `${JSON.stringify(o.line1)} runs ${o.over.toFixed(1)}px into the cluster`,
            );
            expect(report).toEqual([]);
        });
    }
});
