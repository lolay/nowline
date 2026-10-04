// Gate-level regression check for geometry attached to an item bar:
// dependency-arrow ends, milestone slack arrows, and inline-date glyphs.
//
// Layout moves bars down AFTER placing them in two places: a row that
// grows retroactively (a taller item lands back on an earlier row) pushes
// every later row down, and a marker band that outgrows its sizing pushes
// the whole chart down. Anything captured from a bar while it was placed
// and not moved with it is left behind: an arrow attaching 16px above its
// bar, a calendar glyph floating above the bar it belongs to.
// `tests/late-row-shifts.nowline` exercises both shifts.
//
// Every attachment is checked against its bar's FINAL box. The attach
// rules are deliberately restated here rather than imported from
// `@nowline/layout`: a regression gate that borrows the code under test
// would pass whenever that code is wrong in the same way.
//
//   arrow source (item) = (box.right, box.y + 28), or (box.right,
//                         box.bottom - 2) when the caption spilled
//   arrow target        = (box.x, box.y + 28), or (box.x, box.y +
//                         box.height / 2) when the caption spilled
//   arrow source (marker) starts on the target's attach y
//   slack arrow         = (box.right, box.y + box.height / 2), or
//                         (box.right, box.bottom - 2) when the caption spilled
//   item glyph          = top at box.y + 5, inside the bar's top half
//   container glyph     = inside a filled group's 16px chiclet row
//                         (box.y .. box.y + 16), else inside the 12px header
//                         band above the box (box.y - 12 .. box.y)
//
// (28 = half the default 56px row band; 2 = half the 4px progress strip.)
// Every `examples/*.nowline` and `tests/*.nowline` is laid out, so a new
// fixture is covered for free.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import {
    groupHasFill,
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
const GROUP_TITLE_TAB_HEIGHT_PX = 16;
const HEADER_BAND_PX = 12;
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

function arrowSourceY(i: PositionedItem): number {
    return i.textSpills
        ? i.box.y + i.box.height - PROGRESS_STRIP_HALF_PX
        : i.box.y + NOMINAL_MID_PX;
}

function arrowTargetY(i: PositionedItem): number {
    return i.textSpills ? i.box.y + i.box.height / 2 : i.box.y + NOMINAL_MID_PX;
}

function slackY(i: PositionedItem): number {
    return i.textSpills
        ? i.box.y + i.box.height - PROGRESS_STRIP_HALF_PX
        : i.box.y + i.box.height / 2;
}

interface FileScan {
    name: string;
    itemArrows: number;
    markerArrows: number;
    slackArrows: number;
    itemGlyphs: number;
    chicletRowGlyphs: number;
    headerBandGlyphs: number;
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
        chicletRowGlyphs: 0,
        headerBandGlyphs: 0,
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

    for (const edge of model.edges) {
        // An id-less target registers under a synthetic handle the model
        // does not carry; it cannot be matched to its bar here.
        const to = byId.get(edge.toId);
        if (!to) continue;
        const wp = edge.waypoints;
        const start = wp[0];
        const end = wp[wp.length - 1];
        const label = `${edge.fromId} -> ${edge.toId}`;
        if (!near(end.x, to.box.x) || !near(end.y, arrowTargetY(to))) {
            fail(
                `${label} ends at (${end.x}, ${end.y}), ` +
                    `bar attach is (${to.box.x}, ${arrowTargetY(to)})`,
            );
        }
        const from = byId.get(edge.fromId);
        if (from) {
            out.itemArrows++;
            const x = from.box.x + from.box.width;
            if (!near(start.x, x) || !near(start.y, arrowSourceY(from))) {
                fail(
                    `${label} starts at (${start.x}, ${start.y}), ` +
                        `bar attach is (${x}, ${arrowSourceY(from)})`,
                );
            }
        } else {
            // A marker source sits on its cut line, on the target's attach y.
            out.markerArrows++;
            if (!near(start.y, arrowTargetY(to))) {
                fail(`${label} starts at y=${start.y}, target attach y is ${arrowTargetY(to)}`);
            }
        }
    }

    for (const m of model.milestones) {
        for (const arrow of m.slackArrows ?? []) {
            // The model does not name a slack arrow's source; an item one
            // leaves a bar's right edge, a marker one does not.
            const sources = hostItems.filter((i) => near(i.box.x + i.box.width, arrow.x));
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
            const chicletRow = e.kind === 'group' && groupHasFill(e.style.bg);
            if (chicletRow) out.chicletRowGlyphs++;
            else out.headerBandGlyphs++;
            const [top, bottom] = chicletRow
                ? [e.box.y, e.box.y + GROUP_TITLE_TAB_HEIGHT_PX]
                : [e.box.y - HEADER_BAND_PX, e.box.y];
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
        expect(total('chicletRowGlyphs')).toBeGreaterThan(0);
        expect(total('headerBandGlyphs')).toBeGreaterThan(0);
    });

    it('ends every dependency arrow on its bars, and every slack arrow on its source bar', () => {
        expect(scans.flatMap((s) => s.arrowFailures)).toEqual([]);
    });

    it('keeps every inline-date glyph in its entity glyph row', () => {
        expect(scans.flatMap((s) => s.glyphFailures)).toEqual([]);
    });
});
