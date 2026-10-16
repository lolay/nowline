// Gate-level regression check for geometry attached to an item bar:
// dependency-arrow ends, milestone slack arrows, and inline-date glyphs.
//
// Layout moves bars down AFTER placing them when a marker band outgrows
// its sizing and pushes the whole chart down (a row that grew after later
// rows were placed did the same until rows stopped moving up,
// specs/true-width-layout.md §3.2). Anything captured from a bar while it
// was placed and not moved with it is left behind: an arrow attaching 16px
// above its bar, a calendar glyph floating above the bar it belongs to.
// `tests/late-row-shifts.nowline` exercises the shift.
//
// Every attachment is checked against its bar's FINAL box. The attach
// rules are deliberately restated here rather than imported from
// `@nowline/layout`: a regression gate that borrows the code under test
// would pass whenever that code is wrong in the same way.
//
// x comes from the item's dates (`dateSpan`, its bar sits a seam inside
// them; specs/true-width-layout.md §3.4), y from its final box:
//
//   arrow source (item) = (lastDay, box.bottom) or (lastDay, box.y) for a
//                         leg to another row, where lastDay = end -
//                         min(day / 2, span / 2); or (end, box.y + 28),
//                         (end, box.bottom - 2) when the caption spilled,
//                         for a dotted leg along its own row
//   arrow target        = (firstDay, box.y) or (firstDay, box.bottom), where
//                         firstDay = start + min(day / 2, span / 2); or
//                         (box.x, box.y + 28) for a leg along its row
//   arrow source (marker) starts on its cut line, on the target's y + 28
//   slack arrow         = (end, box.y + 28), or (end, box.bottom - 2) when
//                         the caption spilled
//   item glyph          = top at box.y + 5, inside the bar's top half
//   container glyph     = inside the header's title row, above the bracket
//                         line (box.y .. box.y + 13)
//
// (28 = half the default 56px row band; 2 = half the 4px progress strip.)
// Every `examples/*.nowline` and `tests/*.nowline` is laid out, so a new
// fixture is covered for free.

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

const NOMINAL_MID_PX = 28;
const PROGRESS_STRIP_HALF_PX = 2;
const GLYPH_INSET_TOP_PX = 5;
const GLYPH_SIZE_PX = 12;
const HEADER_TITLE_ROW_PX = 13;
const EPSILON_PX = 0.01;

const services = createNowlineServices();

async function layoutFile(absSource: string, tag: string): Promise<PositionedRoadmap> {
    const { shared, Nowline } = services;
    const text = await fs.readFile(absSource, 'utf-8');
    const uri = URI.parse(`memory:///attach-geometry-${tag}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, absSource, { services: Nowline });
    return layoutRoadmap(file, resolved, { theme: 'light', today: FIXED_TODAY });
}

function* entitiesOf(children: PositionedTrackChild[]): Generator<PositionedTrackChild> {
    for (const child of children) {
        yield child;
        if (child.kind !== 'item') yield* entitiesOf(child.children);
    }
}

function* laneEntities(lanes: PositionedSwimlane[]): Generator<PositionedTrackChild> {
    for (const lane of lanes) {
        yield* entitiesOf(lane.children);
        yield* laneEntities(lane.nested);
    }
}

/** Every item, group and parallel, include regions included. */
function* allEntities(model: PositionedRoadmap): Generator<PositionedTrackChild> {
    yield* laneEntities(model.swimlanes);
    for (const region of model.includes) yield* laneEntities(region.nestedSwimlanes);
}

function near(a: number, b: number): boolean {
    return Math.abs(a - b) <= EPSILON_PX;
}

/** Where a leg along an item's own row leaves it. */
function rowExitY(i: PositionedItem): number {
    return i.textSpills
        ? i.box.y + i.box.height - PROGRESS_STRIP_HALF_PX
        : i.box.y + NOMINAL_MID_PX;
}

function rowY(i: PositionedItem): number {
    return i.box.y + NOMINAL_MID_PX;
}

function slackY(i: PositionedItem): number {
    return rowExitY(i);
}

function lastDayMid(i: PositionedItem, day: number): number {
    const { startX, endX } = i.dateSpan;
    return endX - Math.min(day / 2, (endX - startX) / 2);
}

function firstDayMid(i: PositionedItem, day: number): number {
    const { startX, endX } = i.dateSpan;
    return startX + Math.min(day / 2, (endX - startX) / 2);
}

const at = (p: { x: number; y: number }, x: number, y: number): boolean =>
    near(p.x, x) && near(p.y, y);

interface FileScan {
    name: string;
    itemArrows: number;
    markerArrows: number;
    slackArrows: number;
    itemGlyphs: number;
    headerGlyphs: number;
    arrowFailures: string[];
    glyphFailures: string[];
}

function scan(name: string, model: PositionedRoadmap): FileScan {
    const out: FileScan = {
        name,
        itemArrows: 0,
        markerArrows: 0,
        slackArrows: 0,
        itemGlyphs: 0,
        headerGlyphs: 0,
        arrowFailures: [],
        glyphFailures: [],
    };
    const fail = (msg: string) => out.arrowFailures.push(`${name}: ${msg}`);
    const failGlyph = (msg: string) => out.glyphFailures.push(`${name}: ${msg}`);
    // Dependency edges only run between the host roadmap's own items.
    const hostItems = [...laneEntities(model.swimlanes)].filter(
        (e): e is PositionedItem => e.kind === 'item',
    );
    const byId = new Map(hostItems.filter((i) => i.id).map((i) => [i.id, i]));

    const day = model.timeline.pixelsPerDay;
    for (const edge of model.edges) {
        // An id-less target registers under a synthetic handle the model
        // does not carry; it cannot be matched to its bar here.
        const to = byId.get(edge.toId);
        if (!to) continue;
        const wp = edge.waypoints;
        const start = wp[0];
        const end = wp[wp.length - 1];
        const label = `${edge.fromId} -> ${edge.toId}`;
        const alongRow = wp.length === 2 && near(start.y, end.y);
        const targetOk = alongRow
            ? at(end, to.box.x, end.y) && end.y >= to.box.y && end.y <= to.box.y + to.box.height
            : at(end, firstDayMid(to, day), to.box.y) ||
              at(end, firstDayMid(to, day), to.box.y + to.box.height);
        if (!targetOk) fail(`${label} ends at (${end.x}, ${end.y}), off its target's ports`);
        const from = byId.get(edge.fromId);
        if (from) {
            out.itemArrows++;
            const sourceOk = alongRow
                ? near(start.x, from.dateSpan.endX) &&
                  (near(start.y, rowExitY(from)) || near(start.y, rowY(to)))
                : at(start, lastDayMid(from, day), from.box.y + from.box.height) ||
                  at(start, lastDayMid(from, day), from.box.y);
            if (!sourceOk)
                fail(`${label} starts at (${start.x}, ${start.y}), off its source's ports`);
        } else if (alongRow) {
            // A marker source sits on its cut line, on the target's row.
            out.markerArrows++;
            if (!near(start.y, rowY(to))) {
                fail(`${label} starts at y=${start.y}, target row y is ${rowY(to)}`);
            }
        }
    }

    for (const m of model.milestones) {
        for (const arrow of m.slackArrows ?? []) {
            // The model does not name a slack arrow's source; an item one
            // leaves its end date, a marker one does not.
            const sources = hostItems.filter((i) => near(i.dateSpan.endX, arrow.x));
            if (sources.length === 0) continue;
            out.slackArrows++;
            if (!sources.some((i) => near(slackY(i), arrow.y))) {
                fail(
                    `milestone ${m.id} slack arrow at (${arrow.x}, ${arrow.y}) is on no ` +
                        `bar ending there (attach y ${sources.map(slackY).join(', ')})`,
                );
            }
        }
    }

    for (const e of allEntities(model)) {
        for (const pin of e.inlineDatePins ?? []) {
            const { x, y } = pin.glyphTopLeft;
            const where = `${e.kind} ${e.id ?? JSON.stringify(e.title)} ${pin.side} glyph at (${x}, ${y})`;
            if (e.kind === 'item') {
                out.itemGlyphs++;
                const top = e.box.y + GLYPH_INSET_TOP_PX;
                if (!near(y, top) || y + GLYPH_SIZE_PX > e.box.y + NOMINAL_MID_PX) {
                    failGlyph(`${where}: expected top ${top} (bar top ${e.box.y})`);
                }
                const right = e.box.x + e.box.width;
                if (!pin.spilled && (x < e.box.x || x + GLYPH_SIZE_PX > right)) {
                    failGlyph(`${where}: outside the bar's x ${e.box.x}..${right}`);
                }
                continue;
            }
            out.headerGlyphs++;
            const [top, bottom] = [e.box.y, e.box.y + HEADER_TITLE_ROW_PX];
            if (y < top - EPSILON_PX || y + GLYPH_SIZE_PX > bottom + EPSILON_PX) {
                failGlyph(`${where}: outside its glyph row ${top}..${bottom}`);
            }
        }
    }
    return out;
}

const scans: FileScan[] = [];
for (const dir of SOURCE_DIRS) {
    const names = (await fs.readdir(path.join(REPO_ROOT, dir)))
        .filter((f) => f.endsWith('.nowline'))
        .sort();
    for (const name of names) {
        const model = await layoutFile(path.join(REPO_ROOT, dir, name), `${dir}-${name}`);
        scans.push(scan(`${dir}/${name}`, model));
    }
}

type Counter = Exclude<keyof FileScan, 'name' | 'arrowFailures' | 'glyphFailures'>;

function total(key: Counter): number {
    return scans.reduce((n, s) => n + s[key], 0);
}

describe('geometry attached to an item bar sits on its final box', () => {
    it('really scans arrows, slack arrows and glyphs of every kind', () => {
        // Guards against the walk silently visiting nothing.
        expect(scans.length).toBeGreaterThan(20);
        expect(total('itemArrows')).toBeGreaterThan(10);
        expect(total('markerArrows')).toBeGreaterThan(0);
        expect(total('slackArrows')).toBeGreaterThan(0);
        expect(total('itemGlyphs')).toBeGreaterThan(5);
        expect(total('headerGlyphs')).toBeGreaterThan(0);
    });

    it('ends every dependency arrow on its bars, and every slack arrow on its source bar', () => {
        expect(scans.flatMap((s) => s.arrowFailures)).toEqual([]);
    });

    it('keeps every inline-date glyph in its entity glyph row', () => {
        expect(scans.flatMap((s) => s.glyphFailures)).toEqual([]);
    });
});
