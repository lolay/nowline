// The engine divergence register (specs/scheduler-unification.md §4 m1.s1,
// §6). Engine A (the pixel layout) and engine C (`scheduleRoadmap`) place
// the same roadmap differently in a few catalogued ways (§1.2, divergences
// (b) to (f); (a) was settled by F1), and `region-scope` marks an isolated
// region the engines scope differently (F5 settled the last: a region's own
// anchors, which both engines now resolve inside it). This test lays
// out every sample under `examples/` and `tests/`, converts A's logical span
// of every named item and every wave back to working days, compares it with
// C's, and checks the mismatches against `engine-divergences.json`. A
// mismatch the register does not list fails, and so does a registered one
// that no longer happens: a fix deletes its entry, or its letter from an
// entry with several causes.
//
// Samples are laid out the way `nowline <file> --now 2026-02-09` lays them
// out (no width, theme or display override), so the register describes the
// renders the G1 gate compares.

import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type GroupBlock,
    type ItemDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isParallelBlock,
    type NowlineFile,
    type ParallelBlock,
    type ResolveResult,
    type SwimlaneDeclaration,
} from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { daysBetween } from '../src/calendar.js';
import { resolveWorkingCalendar } from '../src/calendar-resolver.js';
import { layoutRoadmap } from '../src/layout.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { ITEM_INSET_PX } from '../src/themes/shared.js';
import { TimeScale } from '../src/time-scale.js';
import type { PositionedItem, PositionedRoadmap, PositionedSwimlane } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REGISTER_PATH = path.join(HERE, 'engine-divergences.json');

/** The `--now` every sample is laid out with (the G1 gate's date). */
const TODAY = new Date(Date.UTC(2026, 1, 9));

/** Spans closer than this many working days agree (pixel float noise). */
const TOLERANCE_DAYS = 1e-3;

/** The divergence classes of spec §1.2, plus C's missing region scope. */
const CLASSES = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)', 'region-scope'] as const;
type DivergenceClass = (typeof CLASSES)[number];

interface RegisterEntry {
    /** Every divergence that contributes to the mismatch. */
    classes: DivergenceClass[];
    /** One line: why A and C differ here. */
    reason: string;
}

interface Register {
    /** Sample path (repo-relative, `/`) → mismatch key → entry. */
    divergences: Record<string, Record<string, RegisterEntry>>;
}

/** `[start, end)` in working days from the roadmap start. */
interface Span {
    start: number;
    end: number;
}

interface Mismatch {
    a: Span | undefined;
    c: Span | undefined;
}

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

function loadRegister(): Register {
    return JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as Register;
}

type Walkable = ItemDeclaration | GroupBlock | ParallelBlock;

/** Every named item of `lanes`, depth first in source order. */
function namedItems(lanes: Iterable<SwimlaneDeclaration>): ItemDeclaration[] {
    const out: ItemDeclaration[] = [];
    const walk = (node: Walkable): void => {
        if (isItemDeclaration(node)) {
            if (node.name) out.push(node);
            return;
        }
        for (const child of node.content) {
            if (isItemDeclaration(child) || isGroupBlock(child) || isParallelBlock(child)) {
                walk(child);
            }
        }
    };
    for (const lane of lanes) {
        for (const child of lane.content) {
            if (isItemDeclaration(child) || isGroupBlock(child) || isParallelBlock(child)) {
                walk(child);
            }
        }
    }
    return out;
}

/** Every placed item with an id in `lanes`, by id. */
function placedById(lanes: PositionedSwimlane[]): Map<string, PositionedItem> {
    const out = new Map<string, PositionedItem>();
    const walk = (children: PositionedSwimlane['children']): void => {
        for (const child of children) {
            if (child.kind === 'item') {
                if (child.id) out.set(child.id, child);
            } else {
                walk(child.children);
            }
        }
    };
    const walkLanes = (ls: PositionedSwimlane[]): void => {
        for (const lane of ls) {
            walk(lane.children);
            walkLanes(lane.nested);
        }
    };
    walkLanes(lanes);
    return out;
}

/**
 * Engine A's x → working-day index, through a time scale rebuilt from the
 * positioned timeline (same domain, origin, pixels per day and display).
 */
function indexAtX(file: NowlineFile, resolved: ResolveResult, model: PositionedRoadmap) {
    const { timeline } = model;
    const calendar = resolveWorkingCalendar(file, resolved).working;
    const nonWorking = timeline.nonWorkingDisplay ?? 'hide';
    const shows = nonWorking === 'show' && calendar.hasNonWorkingDays;
    const spanDays = Math.max(
        1,
        shows
            ? daysBetween(timeline.startDate, timeline.endDate)
            : calendar.workingIndexOf(timeline.startDate, timeline.endDate),
    );
    const scale = new TimeScale({
        domain: [timeline.startDate, timeline.endDate],
        range: [timeline.originX, timeline.originX + spanDays * timeline.pixelsPerDay],
        calendar,
        nonWorking,
    });
    return (x: number): number => scale.indexAtX(x);
}

const differs = (a: Span | undefined, c: Span | undefined): boolean =>
    !a ||
    !c ||
    Math.abs(a.start - c.start) > TOLERANCE_DAYS ||
    Math.abs(a.end - c.end) > TOLERANCE_DAYS;

/**
 * Lay a sample out with both engines and return every mismatch, keyed by
 * item id (main lanes), `<include path>#<id>` (first-level isolated
 * regions) or `wave:<id>`.
 */
async function observe(rel: string): Promise<Map<string, Mismatch>> {
    const abs = path.join(REPO, rel);
    const source = await readFile(abs, 'utf8');
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    const model = layoutRoadmap(file, resolved, { today: TODAY });
    const schedule = scheduleRoadmap(file, resolved, { today: TODAY });
    const xToDay = indexAtX(file, resolved, model);
    const dayOf = (d: Date): number =>
        schedule.calendar.working.workingIndexOf(schedule.startDate, d);

    const out = new Map<string, Mismatch>();
    const compare = (key: string, a: Span | undefined, c: Span | undefined): void => {
        if (differs(a, c)) out.set(key, { a, c });
    };
    const compareItems = (
        prefix: string,
        lanes: Iterable<SwimlaneDeclaration>,
        placed: PositionedSwimlane[],
    ): void => {
        const byId = placedById(placed);
        for (const node of namedItems(lanes)) {
            const it = byId.get(node.name as string);
            const a = it
                ? {
                      start: xToDay(it.box.x - ITEM_INSET_PX),
                      end: xToDay(it.box.x + it.box.width + ITEM_INSET_PX),
                  }
                : undefined;
            const s = schedule.byNode.get(node);
            const c = s ? { start: dayOf(s.start), end: dayOf(s.end) } : undefined;
            compare(`${prefix}${node.name}`, a, c);
        }
    };

    compareItems('', resolved.content.swimlanes.values(), model.swimlanes);
    resolved.content.isolatedRegions.forEach((region, i) => {
        compareItems(
            `${region.sourcePath}#`,
            region.content.swimlanes.values(),
            model.includes[i]?.nestedSwimlanes ?? [],
        );
    });
    for (const wave of model.waves ?? []) {
        const s = schedule.waves?.get(wave.id);
        compare(
            `wave:${wave.id}`,
            { start: xToDay(wave.startX), end: xToDay(wave.endX) },
            s ? { start: dayOf(s.start), end: dayOf(s.end) } : undefined,
        );
    }
    return out;
}

const fmt = (s: Span | undefined): string =>
    s ? `[${Math.round(s.start * 1000) / 1000}, ${Math.round(s.end * 1000) / 1000}]` : 'none';

const samples = sampleFiles();
const register = loadRegister();

describe('engine divergence register (specs/scheduler-unification.md §6)', () => {
    it('finds the samples', () => {
        expect(samples.length).toBeGreaterThan(50);
        expect(samples).toContain('examples/showcase.nowline');
        expect(samples).toContain('tests/late-row-shifts.nowline');
    });

    it('every entry names a sample, a known class and a reason', () => {
        for (const [sample, entries] of Object.entries(register.divergences)) {
            expect(samples, sample).toContain(sample);
            for (const [key, entry] of Object.entries(entries)) {
                expect(entry.classes.length, `${sample} ${key}`).toBeGreaterThan(0);
                for (const cls of entry.classes) expect(CLASSES, `${sample} ${key}`).toContain(cls);
                expect(entry.reason.trim(), `${sample} ${key}`).not.toBe('');
            }
        }
    });

    it.each(samples)('%s: engines A and C differ only where registered', async (sample) => {
        const observed = await observe(sample);
        const registered = register.divergences[sample] ?? {};
        const unregistered = [...observed]
            .filter(([key]) => !(key in registered))
            .map(([key, m]) => `${key}: A ${fmt(m.a)} C ${fmt(m.c)}`);
        const vanished = Object.keys(registered).filter((key) => !observed.has(key));
        expect(
            { unregistered, vanished },
            'a new A/C mismatch needs a register entry; a fixed one needs its entry deleted',
        ).toEqual({ unregistered: [], vanished: [] });
    });
});
