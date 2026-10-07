// Engine A (pixel layout) wave barriers: specs/waves.md §5.1, §8.1-§8.4,
// §8.6, §8.7, §11.
//
// Positions are converted back to week offsets from the start through the
// timeline's `pixelsPerDay` and the calendar's days per week (5 under the
// default `calendar:business`, 7 under `calendar:full`). An item's logical
// extent is its bar inset by `ITEM_INSET_PX` on each side.

import * as path from 'node:path';
import {
    buildWavePlan,
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
import { resolveCalendar } from '../src/calendar.js';
import { type LayoutOptions, layoutRoadmap } from '../src/layout.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { ITEM_INSET_PX, TRACK_BLOCK_TAIL_GUTTER_PX } from '../src/themes/shared.js';
import type {
    PositionedGroup,
    PositionedItem,
    PositionedMilestone,
    PositionedParallel,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
} from '../src/types.js';
import { fromCalendarConfig, type WorkingCalendar } from '../src/working-calendar.js';
import { parseAndResolve } from './helpers.js';
import {
    EXAMPLE_1,
    EXAMPLE_3,
    EXAMPLE_5,
    EXAMPLE_8,
    EXAMPLE_9,
    EXAMPLE_11,
    EXAMPLE_12,
    EXAMPLE_16,
    EXAMPLE_19,
} from './wave-examples.js';

interface Laid {
    file: NowlineFile;
    resolved: ResolveResult;
    model: PositionedRoadmap;
    perWeek: number;
    /** The roadmap's working calendar: dates convert to day counts through it. */
    calendar: WorkingCalendar;
}

function errorsOf(file: NowlineFile): string[] {
    return (file.$document?.diagnostics ?? [])
        .filter((d) => d.severity === 1)
        .map((d) => d.message);
}

async function lay(source: string): Promise<Laid> {
    const { file, resolved } = await parseAndResolve(source);
    expect(errorsOf(file)).toEqual([]);
    return finish(file, resolved);
}

// Resolves `files[main]` under `/root` with an in-memory file system.
async function layIncludes(files: Record<string, string>, main: string): Promise<Laid> {
    const readFile = async (abs: string): Promise<string> => {
        const rel = path.relative('/root', abs).split(path.sep).join('/');
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
    const { file, resolved } = await parseAndResolve(
        files[main],
        path.resolve('/root', main),
        readFile,
    );
    expect(errorsOf(file)).toEqual([]);
    expect(resolved.diagnostics).toEqual([]);
    return finish(file, resolved);
}

function finish(file: NowlineFile, resolved: ResolveResult): Laid {
    const model = layoutRoadmap(file, resolved);
    const config = resolveCalendar(file, resolved.config.calendar);
    return {
        file,
        resolved,
        model,
        perWeek: config.daysPerWeek,
        calendar: fromCalendarConfig(config),
    };
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Week offset of an x position. */
function weeksAt(laid: Laid, x: number): number {
    const { timeline } = laid.model;
    return round((x - timeline.originX) / timeline.pixelsPerDay / laid.perWeek);
}

const logicalStart = (item: PositionedItem): number => item.box.x - ITEM_INSET_PX;
const logicalEnd = (item: PositionedItem): number => item.box.x + item.box.width + ITEM_INSET_PX;

function childItems(children: PositionedTrackChild[], out: PositionedItem[]): void {
    for (const child of children) {
        if (child.kind === 'item') out.push(child);
        else childItems(child.children, out);
    }
}

function laneItems(lanes: PositionedSwimlane[]): PositionedItem[] {
    const out: PositionedItem[] = [];
    for (const lane of lanes) {
        childItems(lane.children, out);
        out.push(...laneItems(lane.nested));
    }
    return out;
}

/** Every placed item (main lanes, then isolated regions), by id. */
function itemsById(model: PositionedRoadmap): Map<string, PositionedItem> {
    const all = [
        ...laneItems(model.swimlanes),
        ...model.includes.flatMap((inc) => laneItems(inc.nestedSwimlanes)),
    ];
    const out = new Map<string, PositionedItem>();
    for (const item of all) if (item.id) out.set(item.id, item);
    return out;
}

function allItems(model: PositionedRoadmap): PositionedItem[] {
    return [
        ...laneItems(model.swimlanes),
        ...model.includes.flatMap((inc) => laneItems(inc.nestedSwimlanes)),
    ];
}

function item(laid: Laid, id: string): PositionedItem {
    const found = itemsById(laid.model).get(id);
    expect(found, id).toBeDefined();
    return found as PositionedItem;
}

function milestone(laid: Laid, id: string): PositionedMilestone {
    const found = laid.model.milestones.find((m) => m.id === id);
    expect(found, id).toBeDefined();
    return found as PositionedMilestone;
}

/** Engine A: `[start, end]` in weeks for every item with an id. */
function engineAWeeks(laid: Laid): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    for (const [id, it] of itemsById(laid.model)) {
        out[id] = [weeksAt(laid, logicalStart(it)), weeksAt(laid, logicalEnd(it))];
    }
    return out;
}

type Walkable = ItemDeclaration | GroupBlock | ParallelBlock;

function astItems(lanes: Iterable<SwimlaneDeclaration>): ItemDeclaration[] {
    const out: ItemDeclaration[] = [];
    const walk = (node: Walkable): void => {
        if (isItemDeclaration(node)) {
            out.push(node);
            return;
        }
        for (const c of node.content) {
            if (isItemDeclaration(c) || isGroupBlock(c) || isParallelBlock(c)) walk(c);
        }
    };
    for (const lane of lanes) {
        for (const c of lane.content) {
            if (isItemDeclaration(c) || isGroupBlock(c) || isParallelBlock(c)) walk(c);
        }
    }
    return out;
}

/** The items layout places: the main lanes and each first-level region. */
function placedAstItems(resolved: ResolveResult): ItemDeclaration[] {
    return [
        ...astItems(resolved.content.swimlanes.values()),
        ...resolved.content.isolatedRegions.flatMap((r) => astItems(r.content.swimlanes.values())),
    ];
}

/** Engine C: `[start, end]` in weeks for every placed item with an id. */
function engineCWeeks(laid: Laid): Record<string, [number, number]> {
    const sched = scheduleRoadmap(laid.file, laid.resolved);
    const weeks = (d: Date): number =>
        round(laid.calendar.workingIndexOf(sched.startDate, d) / laid.perWeek);
    const out: Record<string, [number, number]> = {};
    for (const node of placedAstItems(laid.resolved)) {
        const s = sched.byNode.get(node);
        if (node.name && s) out[node.name] = [weeks(s.start), weeks(s.end)];
    }
    return out;
}

/** The example table matches engine A, and engine A matches engine C. */
function expectTable(laid: Laid, table: Record<string, [number, number]>): void {
    const a = engineAWeeks(laid);
    const picked: Record<string, [number, number]> = {};
    for (const id of Object.keys(table)) picked[id] = a[id];
    expect(picked).toEqual(table);
    expect(a).toEqual(engineCWeeks(laid));
}

/** 1-based wave of every member item with an id. */
function memberWaves(resolved: ResolveResult): Map<string, number> {
    const plan = buildWavePlan(resolved);
    const out = new Map<string, number>();
    if (!plan) return out;
    for (const node of placedAstItems(resolved)) {
        const k = plan.memberWave(node);
        if (node.name && k !== undefined) out.set(node.name, k);
    }
    return out;
}

/**
 * The barrier theorem (§5.2) in logical px, plus the visual gutter (§8.4):
 * for waves j < k, every member of j ends at or before every member of k
 * starts, and their bars are at least 2 × ITEM_INSET_PX apart.
 */
function expectBarriers(laid: Laid): void {
    const waves = memberWaves(laid.resolved);
    const byId = itemsById(laid.model);
    const members = [...waves].map(([id, k]) => ({ k, it: byId.get(id) as PositionedItem }));
    for (const a of members) {
        for (const b of members) {
            if (a.k >= b.k) continue;
            expect(logicalEnd(a.it)).toBeLessThanOrEqual(logicalStart(b.it) + 1e-6);
            const visualGap = b.it.box.x - (a.it.box.x + a.it.box.width);
            expect(visualGap).toBeGreaterThanOrEqual(2 * ITEM_INSET_PX - 1e-6);
        }
    }
}

describe('layoutRoadmap — wave barriers (§11 worked examples, engine A = engine C)', () => {
    it('Example 1: three lanes, three waves (4 passes)', async () => {
        const laid = await lay(EXAMPLE_1);
        expectTable(laid, {
            'web-research': [0, 2],
            'api-spike': [0, 1],
            'data-audit': [0, 3],
            'web-build': [3, 6],
            'api-build': [3, 7],
            'data-build': [3, 5],
            'web-launch': [7, 8],
            'api-launch': [7, 8],
            'data-launch': [7, 9],
        });
        expect(laid.model.waveSolve).toEqual({ passes: 4, capped: false });
        expectBarriers(laid);
    });

    it('Example 2: a lane with no work in the middle wave', async () => {
        const laid = await lay(`nowline v1

roadmap gap-lane "Gap lane" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"
wave w3 "Wave 3"

swimlane platform
  item auth duration:2w wave:w1
  item sso duration:2w wave:w2
  item audit duration:1w wave:w3
swimlane mobile
  item offline duration:3w wave:w1
  item push duration:2w wave:w3
`);
        expectTable(laid, {
            auth: [0, 2],
            offline: [0, 3],
            sso: [3, 5],
            audit: [5, 6],
            push: [5, 7],
        });
        expectBarriers(laid);
    });

    it('Example 3: background work is not floored and never extends a wave', async () => {
        const laid = await lay(EXAMPLE_3);
        expectTable(laid, {
            schema: [0, 2],
            docs: [2, 4],
            migrate: [4, 6],
            oncall: [0, 6],
            'infra-prep': [0, 3],
            cutover: [3, 4],
        });
        expect(item(laid, 'docs').waveRole).toBe('background');
        expect(item(laid, 'oncall').waveRole).toBe('background');
        expect(item(laid, 'migrate').waveRole).toBe('member');
        expectBarriers(laid);
    });

    it('Example 4: parallel tracks in different waves', async () => {
        const laid = await lay(`nowline v1

roadmap split "Split parallel" start:2026-01-05 scale:1w

wave w1 "Foundations"
wave w2 "Features"

swimlane platform
  item kickoff-work duration:1w wave:w1
  parallel streams
    group api-track wave:w1
      item api-v2 duration:2w
      item api-docs duration:1w
    item sdk-update duration:2w wave:w2
  item integration duration:1w wave:w2
swimlane mobile
  item mobile-spike duration:5w wave:w1
`);
        expectTable(laid, {
            'kickoff-work': [0, 1],
            'api-v2': [1, 3],
            'api-docs': [3, 4],
            'sdk-update': [5, 7],
            integration: [7, 8],
            'mobile-spike': [0, 5],
        });
        // The block spans W1-W7: its lead wave is min(w1, w2) = w1.
        const streams = laid.model.swimlanes[0].children[1] as PositionedParallel;
        expect(streams.kind).toBe('parallel');
        expect(weeksAt(laid, streams.box.x)).toBe(1);
        expect(weeksAt(laid, streams.box.x + streams.box.width)).toBe(7);
        expectBarriers(laid);
    });

    it('Example 5: a group that spans waves, and inheritance from a group', async () => {
        const laid = await lay(EXAMPLE_5);
        expectTable(laid, {
            flows: [0, 2],
            ui: [4, 7],
            polish: [7, 8],
            'vendor-eval': [0, 4],
            integrate: [4, 6],
            certify: [6, 7],
        });
        expectBarriers(laid);
    });

    it('Example 6: a cross-lane after: inside one wave lengthens it', async () => {
        const laid = await lay(`nowline v1

roadmap same-wave "Same-wave dependency" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
swimlane frontend
  item mocks duration:1w wave:w1
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
`);
        expectTable(laid, {
            schema: [0, 2],
            mocks: [0, 1],
            forms: [2, 3],
            api: [3, 6],
            'wire-up': [6, 8],
        });
        expectBarriers(laid);
    });

    it('Example 7: forward references stay ignored across passes', async () => {
        const laid = await lay(`nowline v1

roadmap lane-order "Lane order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane frontend
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
`);
        expectTable(laid, {
            forms: [0, 1],
            schema: [0, 2],
            'wire-up': [2, 4],
            api: [2, 5],
        });
        expectBarriers(laid);
    });

    it('Example 8: after:<wave> on background work and milestones', async () => {
        const laid = await lay(EXAMPLE_8);
        expectTable(laid, {
            core: [0, 3],
            pricing: [0, 2],
            hardening: [3, 5],
            'press-kit': [3, 5],
            'launch-event': [5, 6],
        });
        expectBarriers(laid);
    });

    it('Example 9: an anchor and an inline date combine with the barrier by max', async () => {
        const laid = await lay(EXAMPLE_9.replace(' A2_PIN', ' after:2026-01-19'));
        expectTable(laid, {
            i1: [0, 4],
            a1: [0, 1],
            i2: [5, 7],
            a2: [4, 6],
        });
        expect(item(laid, 'a2').wavePinOverride).toBeUndefined();
        expectBarriers(laid);
    });

    it('Example 10: a before: deadline does not move the item', async () => {
        const laid = await lay(`nowline v1

roadmap deadline "Deadline vs barrier" start:2026-01-05 scale:1w calendar:full

anchor freeze "Code freeze" date:2026-02-16

wave w1 "Build"
wave w2 "Harden"

swimlane web
  item web-a duration:2w wave:w1
  item web-b duration:2w wave:w2 before:freeze
swimlane api
  item api-a duration:5w wave:w1
`);
        expectTable(laid, {
            'web-a': [0, 2],
            'api-a': [0, 5],
            'web-b': [5, 7],
        });
        // The barrier pushed web-b past the freeze: W6-W7 is painted red.
        const webB = item(laid, 'web-b');
        expect(webB.hasOverflow).toBe(true);
        expect(weeksAt(laid, webB.overflowBox?.x ?? 0)).toBe(6);
        expectBarriers(laid);
    });

    it('Example 11: a start floor opens a gap; a dated milestone stays pinned', async () => {
        const laid = await lay(EXAMPLE_11);
        expectTable(laid, {
            a1: [0, 2],
            b1: [0, 3],
            a2: [4, 9],
            b2: [4, 11],
        });
        expect(laid.model.waveSolve).toEqual({ passes: 2, capped: false });
        expect(weeksAt(laid, milestone(laid, 'exec-done').center.x)).toBe(10);
        expectBarriers(laid);
    });

    it('Example 12: an empty wave adds no delay', async () => {
        const laid = await lay(EXAMPLE_12);
        expectTable(laid, {
            a1: [0, 2],
            b1: [0, 1],
            a3: [2, 3],
            b3: [2, 4],
        });
        expectBarriers(laid);
    });

    it('Example 16: re-declared waves with a shared floor (2 passes)', async () => {
        const laid = await layIncludes(EXAMPLE_16, 'program.nowline');
        expectTable(laid, {
            kickoff: [0, 1],
            'web-design': [0, 2],
            'api-design': [0, 3],
            'web-build': [4, 7],
            'api-build': [4, 8],
            comms: [8, 10],
        });
        expect(laid.model.waveSolve).toEqual({ passes: 2, capped: false });
        // `done after:execute` sits on the closing boundary at W8.
        const done = milestone(laid, 'done');
        expect(weeksAt(laid, done.center.x)).toBe(8);
        expect(done.onWaveBoundary).toBe(true);
        // `comms after:execute` draws no dependency arrow.
        expect(laid.model.edges.filter((e) => e.fromId === 'execute')).toEqual([]);
        expectBarriers(laid);
    });

    it('Example 18: a vocabulary-only child does not participate', async () => {
        const laid = await layIncludes(
            {
                'people.nowline': [
                    'nowline v1',
                    '',
                    'person sam "Sam Chen"',
                    'team platform-team "Platform"',
                    '  person sam',
                    'label risky "Risky"',
                    '',
                ].join('\n'),
                'plan.nowline': [
                    'nowline v1',
                    '',
                    'include "./people.nowline"',
                    '',
                    'roadmap plan "Plan" start:2026-01-05 scale:1w',
                    '',
                    'wave w1 "Wave 1"',
                    'wave w2 "Wave 2"',
                    '',
                    'swimlane platform owner:platform-team',
                    '  item auth duration:2w wave:w1 owner:sam',
                    '  item sso duration:1w wave:w2 labels:risky',
                    '',
                ].join('\n'),
            },
            'plan.nowline',
        );
        expectTable(laid, { auth: [0, 2], sso: [2, 3] });
        expectBarriers(laid);
    });

    it('Example 19: an isolated region holds the barrier (3 passes)', async () => {
        const laid = await layIncludes(EXAMPLE_19, 'portfolio.nowline');
        expectTable(laid, {
            'pf-api': [0, 2],
            'ios-offline': [0, 4],
            'pf-scale': [4, 6],
            'ios-push': [4, 5],
        });
        expect(laid.model.waveSolve).toEqual({ passes: 3, capped: false });
        // The region items are members too.
        const regionItems = laneItems(laid.model.includes[0].nestedSwimlanes);
        expect(regionItems.map((it) => [it.id, it.waveRole])).toEqual([
            ['ios-offline', 'member'],
            ['ios-push', 'member'],
        ]);
        // Engines A, B and C agree that the domain ends at W6: 30 working
        // days, so Mon Feb 16.
        const { timeline } = laid.model;
        expect(laid.calendar.workingIndexOf(timeline.startDate, timeline.endDate)).toBe(
            6 * laid.perWeek,
        );
        expect(timeline.endDate.toISOString().slice(0, 10)).toBe('2026-02-16');
        expectBarriers(laid);
    });

    it('Example 19 standalone: the region file lays out on its own', async () => {
        const laid = await lay(EXAMPLE_19['ios.nowline']);
        expectTable(laid, { 'ios-offline': [0, 4], 'ios-push': [4, 5] });
    });
});

describe('layoutRoadmap — wave floors and gutters', () => {
    it('bars of different waves keep a 12 px gutter, across lanes and regions', async () => {
        const laid = await layIncludes(EXAMPLE_19, 'portfolio.nowline');
        // The region's w1 holder and the main lane's w2 item meet at W4.
        const ios = item(laid, 'ios-offline');
        const pfScale = item(laid, 'pf-scale');
        expect(pfScale.box.x - (ios.box.x + ios.box.width)).toBeCloseTo(2 * ITEM_INSET_PX, 6);
        // And inside the region: ios-push opens at the same barrier.
        const push = item(laid, 'ios-push');
        expect(push.box.x - (ios.box.x + ios.box.width)).toBeCloseTo(2 * ITEM_INSET_PX, 6);
        // Within one lane: data-audit (discover) to data-build (build).
        const one = await lay(EXAMPLE_1);
        const audit = item(one, 'data-audit');
        const build = item(one, 'data-build');
        expect(build.box.x - (audit.box.x + audit.box.width)).toBeCloseTo(2 * ITEM_INSET_PX, 6);
    });

    it('a region item resolves after:<wave> through the shared wave edges', async () => {
        const laid = await layIncludes(
            {
                ...EXAMPLE_19,
                'ios.nowline': `${EXAMPLE_19['ios.nowline']}swimlane ios-ops
  item ios-review duration:1w after:w1
`,
            },
            'portfolio.nowline',
        );
        // E_1 = W4 is held by the region's own ios-offline.
        expectTable(laid, { 'ios-review': [4, 5], 'pf-scale': [4, 6] });
        expect(item(laid, 'ios-review').waveRole).toBe('background');
    });

    it('lead floor: a titled group opens with its first piece of work (Example 5)', async () => {
        const laid = await lay(EXAMPLE_5);
        const group = laid.model.swimlanes[0].children[0] as PositionedGroup;
        expect(group.kind).toBe('group');
        expect(group.title).toBe('Checkout v2');
        // Lead wave w1: the box opens at W0 and spans the W4 boundary.
        expect(weeksAt(laid, group.box.x)).toBe(0);
        // The anonymous `group wave:w2` opens at S_2 = W4.
        const anon = laid.model.swimlanes[1].children[1] as PositionedGroup;
        expect(anon.kind).toBe('group');
        expect(weeksAt(laid, anon.box.x)).toBe(4);
    });

    it('lead floor: a container without a wave opens at its first child’s wave start', async () => {
        const laid = await lay(`nowline v1

roadmap lead "Lead floor" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:3w wave:w1
swimlane b
  item b0 duration:1w wave:w1
  group g "G"
    item g1 duration:1w wave:w2
swimlane c
  item c0 duration:1w
  parallel p "P"
    item p1 duration:1w wave:w2
    group
      item p2 duration:2w wave:w2
`);
        const g = laid.model.swimlanes[1].children[1] as PositionedGroup;
        const p = laid.model.swimlanes[2].children[1] as PositionedParallel;
        expect(g.kind).toBe('group');
        expect(p.kind).toBe('parallel');
        // Without the lead floor both boxes would open at W1, where their
        // lane's earlier work ends; S_2 = W3.
        expect(weeksAt(laid, g.box.x)).toBe(3);
        expect(weeksAt(laid, p.box.x)).toBe(3);
        const pTrackGroup = p.children[1] as PositionedGroup;
        expect(weeksAt(laid, pTrackGroup.box.x)).toBe(3);
        expectTable(laid, {
            a1: [0, 3],
            b0: [0, 1],
            g1: [3, 4],
            c0: [0, 1],
            p1: [3, 4],
            p2: [3, 5],
        });
    });

    it('floors reach the row packer, the lane tab collapse and a group track', async () => {
        const laid = await lay(`nowline v1

roadmap floors "Floors" start:2026-01-05 scale:1w calendar:full

anchor kick "Kick" date:2026-01-12

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:1w wave:w2 after:kick
swimlane b
  item b1 duration:3w wave:w1
swimlane c "Lane C"
  item c1 duration:1w wave:w2
swimlane d
  parallel q
    item q1 duration:1w wave:w1
    group "Late track"
      item q2 duration:1w wave:w2
`);
        expectTable(laid, {
            a1: [0, 2],
            a2: [3, 4],
            b1: [0, 3],
            c1: [3, 4],
            q1: [0, 1],
            q2: [3, 4],
        });
        // a2's `after:kick` alone would predict W1, inside a1's row; the
        // floored prediction (S_2 = W3) keeps it on a1's row.
        expect(item(laid, 'a2').box.y).toBe(item(laid, 'a1').box.y);
        // c1 opens at S_2, past the lane's title tab, so its row aligns
        // with the tab instead of dropping below it.
        const laneC = laid.model.swimlanes[2];
        expect(item(laid, 'c1').box.y).toBe(laneC.box.y + 10);
        // The parallel's lead wave is w1 (W0), but its group track opens
        // with its own first piece of work, at S_2.
        const q = laid.model.swimlanes[3].children[0] as PositionedParallel;
        expect(weeksAt(laid, q.box.x)).toBe(0);
        expect(weeksAt(laid, (q.children[1] as PositionedGroup).box.x)).toBe(3);
    });

    it('a floor past an explicit length: grows the window and places the wave exactly', async () => {
        const laid = await lay(`nowline v1

roadmap late "Late floor" start:2026-01-05 scale:1w calendar:full length:4w

wave w1 "Wave 1"
wave w2 "Later" after:2026-03-02

swimlane a
  item a1 duration:1w wave:w1
  item a2 duration:1w wave:w2
`);
        // length:4w is a minimum: the window runs to a2's end at W9.
        const { timeline } = laid.model;
        expect(timeline.endDate.toISOString().slice(0, 10)).toBe('2026-03-09');
        // S_2 is the floor date projected with the unclamped scale: W8.
        const a2 = item(laid, 'a2');
        expect(logicalStart(a2)).toBe(timeline.originX + 8 * 7 * timeline.pixelsPerDay);
        expectTable(laid, { a1: [0, 1], a2: [8, 9] });
    });

    it('an empty first wave adds no delay; with a floor it holds the next wave', async () => {
        const plain = await lay(`nowline v1

roadmap empty-first "Empty first" start:2026-01-05 scale:1w calendar:full

wave w0 "Placeholder"
wave w1 "Wave 1"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:1w wave:w1
`);
        expectTable(plain, { a1: [0, 2], a2: [2, 3] });
        expect(plain.model.waveSolve).toEqual({ passes: 2, capped: false });

        const floored = await lay(`nowline v1

roadmap empty-first "Empty first" start:2026-01-05 scale:1w calendar:full

wave w0 "Placeholder" after:2026-01-19
wave w1 "Wave 1"

swimlane a
  item a1 duration:2w wave:w1
  item a0 duration:1w
`);
        // S_1 = E_1 = W2 (empty, floored), so w1 opens at W2. The
        // background item is not floored but follows its lane.
        expectTable(floored, { a1: [2, 4], a0: [4, 5] });
    });

    it('nested isolated regions contribute nothing', async () => {
        const waveLines = ['wave w1 "Wave 1"', 'wave w2 "Wave 2"', ''];
        const laid = await layIncludes(
            {
                'deep.nowline': [
                    'nowline v1',
                    '',
                    'roadmap deep "Deep" start:2026-01-05 scale:1w',
                    '',
                    ...waveLines,
                    'swimlane deep',
                    '  item deep-long duration:9w wave:w1',
                    '',
                ].join('\n'),
                'mid.nowline': [
                    'nowline v1',
                    '',
                    'include "./deep.nowline" roadmap:isolate',
                    '',
                    'roadmap mid "Mid" start:2026-01-05 scale:1w',
                    '',
                    ...waveLines,
                    'swimlane mid',
                    '  item mid-a duration:3w wave:w1',
                    '',
                ].join('\n'),
                'root.nowline': [
                    'nowline v1',
                    '',
                    'include "./mid.nowline" roadmap:isolate',
                    '',
                    'roadmap root "Root" start:2026-01-05 scale:1w',
                    '',
                    ...waveLines,
                    'swimlane main',
                    '  item r1 duration:1w wave:w1',
                    '  item r2 duration:1w wave:w2',
                    '',
                ].join('\n'),
            },
            'root.nowline',
        );
        // w1 closes at mid-a's end (W3), not at deep-long's (W9).
        expectTable(laid, { r1: [0, 1], 'mid-a': [0, 3], r2: [3, 4] });
        expect(itemsById(laid.model).has('deep-long')).toBe(false);
    });

    it('divergence (d) stays pinned: a group track binding a parallel join adds its tail gutter', async () => {
        const laid = await lay(`nowline v1

roadmap tail "Tail gutter" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  parallel
    group g wave:w1
      item g1 duration:2w
    item p1 duration:1w wave:w1
  item next duration:1w wave:w1
swimlane b
  item b1 duration:1w wave:w1
  item b2 duration:1w wave:w2
`);
        const { timeline } = laid.model;
        const w = (weeks: number): number => timeline.originX + weeks * 5 * timeline.pixelsPerDay;
        // Engine A: the join is the group's end plus the 8 px tail gutter;
        // engine C would start `next` at W2 exactly.
        const next = item(laid, 'next');
        expect(logicalStart(next)).toBeCloseTo(w(2) + TRACK_BLOCK_TAIL_GUTTER_PX, 6);
        // The barrier is computed from engine A's own ends, so w2 opens
        // after `next` ends, gutter included, and still holds.
        const b2 = item(laid, 'b2');
        expect(logicalStart(b2)).toBeCloseTo(logicalEnd(next), 6);
        expect(logicalStart(b2)).toBeCloseTo(w(3) + TRACK_BLOCK_TAIL_GUTTER_PX, 6);
        expectBarriers(laid);
    });

    it('records the pin a floor moved (Example 9 pin variant)', async () => {
        const laid = await lay(EXAMPLE_9.replace(' A2_PIN', ' date:2026-01-19'));
        expectTable(laid, { a2: [4, 6] });
        expect(item(laid, 'a2').wavePinOverride).toEqual({
            wave: 'w2',
            key: 'date',
            pin: '2026-01-19',
            start: '2026-02-02',
        });
        // Nothing else was pinned.
        for (const it of allItems(laid.model)) {
            if (it.id !== 'a2') expect('wavePinOverride' in it).toBe(false);
        }
    });

    it('records a start: pin a floor moved, and not a pin the floor does not reach', async () => {
        const moved = await lay(EXAMPLE_9.replace(' A2_PIN', ' start:2026-01-26'));
        expect(item(moved, 'a2').wavePinOverride).toEqual({
            wave: 'w2',
            key: 'start',
            pin: '2026-01-26',
            start: '2026-02-02',
        });
        // A pin on or after the wave start keeps the item where it is.
        const kept = await lay(EXAMPLE_9.replace(' A2_PIN', ' date:2026-02-09'));
        expectTable(kept, { a2: [5, 7] });
        expect('wavePinOverride' in item(kept, 'a2')).toBe(false);
        const onStart = await lay(EXAMPLE_9.replace(' A2_PIN', ' date:2026-02-02'));
        expect('wavePinOverride' in item(onStart, 'a2')).toBe(false);
    });

    it('records no pin override when something other than the floor moved the pin', async () => {
        // w1 has no floor, so S_1 is the origin and can move nothing. p1's
        // `start:` pin (W1) is ignored on a direct parallel track (the track
        // opens at the parallel's start, W3), and x's `start:` pin (W1) is
        // pushed by its `after:` (W3). Both items start past their pins.
        // Engine C honors both pins, an existing divergence, so only engine
        // A is checked here.
        const laid = await lay(`nowline v1

roadmap pins "Pins" start:2026-01-05 scale:1w calendar:full

wave w1 "Build"

swimlane a
  item a0 duration:3w
  parallel
    item p1 duration:1w wave:w1 start:2026-01-12
    item p2 duration:1w wave:w1
swimlane b
  item x duration:1w wave:w1 start:2026-01-12 after:a0
`);
        expect(engineAWeeks(laid)).toEqual({ a0: [0, 3], p1: [3, 4], p2: [3, 4], x: [3, 4] });
        expect('wavePinOverride' in item(laid, 'p1')).toBe(false);
        expect('wavePinOverride' in item(laid, 'x')).toBe(false);
    });

    it('records no pin override when an after: pushed the item past the floor', async () => {
        // a2's `start:` pin (W2) is below w2's floor (W4), but its
        // `after:budget` (W5) wins in engine A (divergence (g)), so the
        // floor is not what a2 starts at and NL.W1001 would be false.
        const laid = await lay(EXAMPLE_9.replace(' A2_PIN', ' start:2026-01-19 after:budget'));
        expect(engineAWeeks(laid).a2).toEqual([5, 7]);
        expect('wavePinOverride' in item(laid, 'a2')).toBe(false);
    });

    it('hits the pass cap on input that breaks the order rule (Example 13)', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w2
  item a2 duration:1w wave:w1
  item a3 duration:1w wave:w1
`);
        expect(errorsOf(file).length).toBeGreaterThan(0);
        const model = layoutRoadmap(file, resolved);
        expect(model.waveSolve).toEqual({ passes: 3, capped: true });
    });
});

describe('layoutRoadmap — milestones and wave references', () => {
    it('a floating milestone bound by a wave sits exactly on the boundary (Example 8)', async () => {
        const laid = await lay(EXAMPLE_8);
        const core = item(laid, 'core');
        const alphaDone = milestone(laid, 'alpha-done');
        // E_alpha is core's logical end, not its inset visual edge.
        expect(alphaDone.center.x).toBe(logicalEnd(core));
        expect(weeksAt(laid, alphaDone.center.x)).toBe(3);
        expect(alphaDone.onWaveBoundary).toBe(true);
        expect(alphaDone.slackArrows).toBeUndefined();
        // ga is bound by launch-event: it sits at the bar's visual right
        // edge (6 px left of W6) and keeps its cut line.
        const ga = milestone(laid, 'ga');
        const launch = item(laid, 'launch-event');
        expect(ga.center.x).toBe(launch.box.x + launch.box.width);
        expect('onWaveBoundary' in ga).toBe(false);
        // beta is a non-binding predecessor of ga, but waves draw no
        // slack arrows.
        expect(ga.slackArrows).toBeUndefined();
        // after:<wave> draws no dependency arrow.
        expect(laid.model.edges.filter((e) => e.fromId === 'alpha' || e.fromId === 'beta')).toEqual(
            [],
        );
    });

    it('a wave as a non-binding predecessor draws no slack arrow; an item still does', async () => {
        const laid = await lay(`nowline v1

roadmap mix "Mixed predecessors" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:3w wave:w2
swimlane b
  item b1 duration:1w wave:w1
  item b2 duration:1w

milestone m "M" after:[w1, b2, a2]
`);
        const m = milestone(laid, 'm');
        const a2 = item(laid, 'a2');
        const b2 = item(laid, 'b2');
        expect(m.center.x).toBe(a2.box.x + a2.box.width);
        // b2 (an item) gets its arrow; w1 (a wave) does not.
        expect(m.slackArrows?.map((a) => a.x)).toEqual([b2.box.x + b2.box.width]);
    });

    it('a dated milestone overrun by a wave gets overrunByWave and no arrow (Example 11)', async () => {
        const laid = await lay(EXAMPLE_11);
        const m = milestone(laid, 'exec-done');
        expect(m.overrunByWave).toBe('execute');
        expect(m.isOverrun).toBe(true);
        expect(m.slackArrows).toBeUndefined();
        expect('onWaveBoundary' in m).toBe(false);
    });

    it('a dated milestone met by its wave is not overrun, and on a boundary', async () => {
        const laid = await lay(EXAMPLE_11.replace('date:2026-03-16', 'date:2026-03-23'));
        const m = milestone(laid, 'exec-done');
        expect(weeksAt(laid, m.center.x)).toBe(11);
        expect(m.isOverrun).toBe(false);
        expect('overrunByWave' in m).toBe(false);
        expect(m.onWaveBoundary).toBe(true);
    });

    it('an overrun milestone is never on a boundary, even on another wave’s edge', async () => {
        const laid = await lay(`nowline v1

roadmap edge "Edge" start:2026-01-05 scale:1w calendar:full

milestone m "M" date:2026-01-19 after:w2

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:2w wave:w2
`);
        // m sits at W2 = E_1 = S_2, but w2 runs to W4: it keeps its red
        // cut line.
        const m = milestone(laid, 'm');
        expect(weeksAt(laid, m.center.x)).toBe(2);
        expect(m.overrunByWave).toBe('w2');
        expect(m.isOverrun).toBe(true);
        expect('onWaveBoundary' in m).toBe(false);
    });

    it('a dated milestone overrun by a wave and an item: the item keeps its arrow and corridor', async () => {
        const laid = await lay(`nowline v1

roadmap both "Both" start:2026-01-05 scale:1w calendar:full

milestone m "M" date:2026-01-12 after:[w1, x]

wave w1 "Wave 1"

swimlane a
  item z duration:2w
  item x duration:1w
swimlane b
  item b1 duration:4w wave:w1
`);
        const m = milestone(laid, 'm');
        const x = item(laid, 'x');
        const z = item(laid, 'z');
        // w1 (W4) runs past the date and so does x (W3); w1 ends later.
        expect(m.overrunByWave).toBe('w1');
        expect(m.isOverrun).toBe(true);
        // The arrow comes from x, the latest item, never from the wave.
        expect(m.slackArrows?.map((a) => a.x)).toEqual([x.box.x + x.box.width]);
        // Its corridor (W1 to x's right edge, on x's row) bumped z, which
        // would sit in the arrow's path, to a lower row.
        expect(z.box.y).toBeGreaterThan(x.box.y);
    });

    it('a milestone at the origin is not on a boundary', async () => {
        const laid = await lay(`nowline v1

roadmap origin "Origin" start:2026-01-05 scale:1w calendar:full

milestone kickoff date:2026-01-05

wave w1 "Wave 1"

swimlane a
  item a1 duration:1w wave:w1
`);
        expect('onWaveBoundary' in milestone(laid, 'kickoff')).toBe(false);
    });
});

// --- Positioned waves (specs/waves.md §8.7) ---

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** The schedule fields of `model.waves`, dates as YYYY-MM-DD. */
function waveSpans(laid: Laid): Array<Record<string, unknown>> {
    const waves = laid.model.waves;
    expect(waves).toBeDefined();
    return (waves ?? []).map((w) => ({
        id: w.id,
        index: w.index,
        startDate: isoDay(w.startDate),
        endDate: isoDay(w.endDate),
        memberCount: w.memberCount,
        ...(w.heldBy !== undefined ? { heldBy: w.heldBy } : {}),
        ...(w.floorRef !== undefined ? { floorRef: w.floorRef } : {}),
    }));
}

/** Engine C's `RoadmapSchedule.waves`, in the same shape. */
function engineCWaveSpans(laid: Laid): Array<Record<string, unknown>> {
    const sched = scheduleRoadmap(laid.file, laid.resolved);
    expect(sched.waves).toBeDefined();
    return [...(sched.waves ?? new Map())].map(([id, w]) => ({
        id,
        index: w.index - 1,
        startDate: isoDay(w.start),
        endDate: isoDay(w.end),
        memberCount: w.memberCount,
        ...(w.heldBy !== undefined ? { heldBy: w.heldBy } : {}),
        ...(w.floorRef !== undefined ? { floorRef: w.floorRef } : {}),
    }));
}

/**
 * `model.waves` matches `expected` (a subset of fields per wave) and engine
 * C, and its x and dates agree through the timeline.
 */
function expectWaves(laid: Laid, expected: Array<Record<string, unknown>>): void {
    const spans = waveSpans(laid);
    expect(spans.length).toBe(expected.length);
    expected.forEach((e, i) => {
        expect(spans[i]).toMatchObject(e);
    });
    expect(spans).toEqual(engineCWaveSpans(laid));
    const { timeline } = laid.model;
    for (const w of laid.model.waves ?? []) {
        const days = (x: number): number => round((x - timeline.originX) / timeline.pixelsPerDay);
        expect(days(w.startX)).toBe(laid.calendar.workingIndexOf(timeline.startDate, w.startDate));
        expect(days(w.endX)).toBe(laid.calendar.workingIndexOf(timeline.startDate, w.endDate));
        expect(w.empty).toBe(w.memberCount === 0);
    }
}

describe('layoutRoadmap — positioned waves (engine A = engine C)', () => {
    it('Example 1: three tiled waves, each held by its latest member', async () => {
        const laid = await lay(EXAMPLE_1);
        expectWaves(laid, [
            { id: 'discover', index: 0, memberCount: 3, heldBy: 'data-audit' },
            { id: 'build', index: 1, memberCount: 3, heldBy: 'api-build' },
            { id: 'launch', index: 2, memberCount: 3, heldBy: 'data-launch' },
        ]);
        const waves = laid.model.waves ?? [];
        expect(waves.map((w) => w.title)).toEqual(['Discover', 'Build', 'Launch']);
        // Without floors the columns tile: each wave opens where the last ended.
        expect(waves[1].startX).toBe(waves[0].endX);
        expect(waves[2].startX).toBe(waves[1].endX);
        expect(waves[0].startX).toBe(laid.model.timeline.originX);
        for (const w of waves) {
            expect(w.empty).toBe(false);
            expect('floorRef' in w).toBe(false);
        }
    });

    it('Example 3: background work counts toward no wave', async () => {
        const laid = await lay(EXAMPLE_3);
        expectWaves(laid, [
            { id: 'w1', memberCount: 2, heldBy: 'infra-prep' },
            { id: 'w2', memberCount: 2, heldBy: 'migrate' },
        ]);
    });

    it('Example 9: the tooltip dates (Launch · 2026-02-02 – 2026-02-23 · held by i2)', async () => {
        const laid = await lay(EXAMPLE_9.replace(' A2_PIN', ' after:2026-01-19'));
        expectWaves(laid, [
            {
                id: 'w1',
                startDate: '2026-01-05',
                endDate: '2026-02-02',
                memberCount: 2,
                heldBy: 'i1',
            },
            {
                id: 'w2',
                startDate: '2026-02-02',
                endDate: '2026-02-23',
                memberCount: 2,
                heldBy: 'i2',
            },
        ]);
        expect(laid.model.waves?.[1].title).toBe('Launch');
    });

    it('Example 11: a gap, and the floor reference that opened it', async () => {
        const laid = await lay(EXAMPLE_11);
        expectWaves(laid, [
            {
                id: 'plan',
                startDate: '2026-01-05',
                endDate: '2026-01-26',
                memberCount: 2,
                heldBy: 'b1',
            },
            {
                id: 'execute',
                startDate: '2026-02-02',
                endDate: '2026-03-23',
                memberCount: 2,
                heldBy: 'b2',
                floorRef: 'fy-budget',
            },
        ]);
        const [plan, execute] = laid.model.waves ?? [];
        expect('floorRef' in plan).toBe(false);
        expect(execute.startX).toBeGreaterThan(plan.endX);
    });

    it('Example 12: an empty wave has zero width and no heldBy', async () => {
        const laid = await lay(EXAMPLE_12);
        expectWaves(laid, [
            { id: 'w1', memberCount: 2, heldBy: 'a1' },
            { id: 'w2', memberCount: 0 },
            { id: 'w3', memberCount: 2, heldBy: 'b3' },
        ]);
        const w2 = laid.model.waves?.[1];
        expect(w2?.empty).toBe(true);
        expect(w2?.title).toBe('Hardening (TBD)');
        expect(w2?.startX).toBe(w2?.endX);
        expect(w2 && 'heldBy' in w2).toBe(false);
    });

    it('Example 19: a region member holds w1 and counts once', async () => {
        const laid = await layIncludes(EXAMPLE_19, 'portfolio.nowline');
        expectWaves(laid, [
            { id: 'w1', memberCount: 2, heldBy: 'ios-offline' },
            { id: 'w2', memberCount: 2, heldBy: 'pf-scale' },
        ]);
    });

    it('a title-less wave uses its id, and the slack rerun counts no member twice', async () => {
        // `m` has a non-binding predecessor (a1 ends before b1), so a slack
        // corridor triggers the second swimlane pass after the barrier
        // settles. That rerun, and the kept region placement, floor
        // without accumulating.
        const laid = await lay(`nowline v1

roadmap rerun "Rerun" start:2026-01-05 scale:1w

wave w1
wave w2 "Second"

swimlane a
  item a1 duration:1w wave:w1
  item a2 duration:1w wave:w2
swimlane b
  item b1 duration:3w wave:w1
  item b2 duration:1w wave:w2
  item bg duration:1w

milestone m after:[a1, b1]
`);
        expect(milestone(laid, 'm').slackArrows?.length).toBe(1);
        expectWaves(laid, [
            { id: 'w1', memberCount: 2, heldBy: 'b1' },
            { id: 'w2', memberCount: 2 },
        ]);
        expect(laid.model.waves?.map((w) => w.title)).toEqual(['w1', 'Second']);
    });

    it('a floor on the previous wave’s end day is a tie: no gap, no floorRef', async () => {
        // At scale:2w the floor x (origin + 8 days * ppd) and E_1 (the sum
        // of the 3d and 5d bar widths) differ by an ulp; without the edge
        // tolerance the floor would win, open a phantom gap and set floorRef.
        for (const [d1, d2] of [
            ['3d', '5d'],
            ['5d', '3d'],
        ]) {
            const laid = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:2w calendar:full

wave w1 "One"
wave w2 "Two" after:2026-01-13

swimlane x
  item a1 duration:${d1} wave:w1
  item a2 duration:${d2} wave:w1
  item a3 duration:1w wave:w2
`);
            expectWaves(laid, [
                { id: 'w1', endDate: '2026-01-13', memberCount: 2, heldBy: 'a2' },
                { id: 'w2', startDate: '2026-01-13', memberCount: 1, heldBy: 'a3' },
            ]);
            const [w1, w2] = laid.model.waves ?? [];
            expect(w2.startX).toBe(w1.endX);
            expect('floorRef' in w2).toBe(false);
        }
    });
});

describe('layoutRoadmap — without waves', () => {
    it('a model without waves carries none of the wave keys', async () => {
        const files = {
            'child.nowline': [
                'nowline v1',
                '',
                'roadmap child "Child" start:2026-01-05 scale:1w',
                '',
                'swimlane c',
                '  item c1 duration:2w date:2026-01-12',
                '',
            ].join('\n'),
            'main.nowline': [
                'nowline v1',
                '',
                'include "./child.nowline" roadmap:isolate',
                '',
                'roadmap main "Main" start:2026-01-05 scale:1w',
                '',
                'anchor kickoff date:2026-01-12',
                '',
                'swimlane a',
                '  item a1 duration:2w',
                '  item a2 duration:1w date:2026-01-26',
                '  parallel',
                '    item p1 duration:1w',
                '    group',
                '      item p2 duration:2w',
                'swimlane b',
                '  item b1 duration:3w after:kickoff',
                '',
                'milestone m1 after:[a2, b1]',
                'milestone m2 date:2026-01-19 after:b1',
                '',
            ].join('\n'),
        };
        const laid = await layIncludes(files, 'main.nowline');
        expect('waveSolve' in laid.model).toBe(false);
        expect('waves' in laid.model).toBe(false);
        const items = allItems(laid.model);
        expect(items.length).toBe(6);
        for (const it of items) {
            expect('waveRole' in it).toBe(false);
            expect('wavePinOverride' in it).toBe(false);
        }
        expect(laid.model.milestones.length).toBe(2);
        for (const m of laid.model.milestones) {
            expect('onWaveBoundary' in m).toBe(false);
            expect('overrunByWave' in m).toBe(false);
        }
    });
});

// --- Property test: the barrier theorem on generated roadmaps ---
//
// A small seeded generator writes roadmaps that satisfy the order rules
// (specs/waves.md §6.3): in every lane, group and parallel-track flow the
// assigned waves never decrease, background items carry the running bound,
// and `after:` only targets earlier work (or earlier waves) whose bound a
// member's own wave can absorb. Each node tracks WV10's lower bound `lb`
// (start >= E_lb), so a member of wave k is only placed where lb <= k - 1.

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Generated {
    source: string;
    /** Every item id and its wave (0 for background). */
    waves: Map<string, number>;
}

function generateRoadmap(rand: () => number, index: number): Generated {
    const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
    const chance = (p: number): boolean => rand() < p;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

    const n = int(1, 4);
    const durations = ['1d', '3d', '1w', '2w', '3w', '4w'];
    const lines: string[] = [
        'nowline v1',
        '',
        `roadmap gen-${index} "Generated" start:2026-01-05 scale:1w`,
        '',
    ];
    for (let k = 1; k <= n; k++) lines.push(`wave w${k} "Wave ${k}"`);
    lines.push('');

    const waves = new Map<string, number>();
    // Earlier items, in placement order, with their lower bound.
    const placed: Array<{ id: string; lb: number }> = [];
    let nextId = 0;

    // `after:` refs whose bound stays within `maxLb`.
    const afterRefs = (maxLb: number): { refs: string[]; lb: number } => {
        const refs: string[] = [];
        let lb = 0;
        const count = chance(0.3) ? int(1, 2) : 0;
        for (let i = 0; i < count; i++) {
            if (chance(0.3) && maxLb >= 1) {
                const j = int(1, Math.min(n, maxLb));
                refs.push(`w${j}`);
                lb = Math.max(lb, j);
                continue;
            }
            const targets = placed.filter((p) => p.lb <= maxLb);
            if (targets.length === 0) continue;
            const t = pick(targets);
            if (refs.includes(t.id)) continue;
            refs.push(t.id);
            lb = Math.max(lb, t.lb);
        }
        return { refs, lb };
    };

    // One item; `inherited` is the container's wave (0: none). Returns lbE.
    const genItem = (indent: string, bound: number, inherited: number): number => {
        const id = `i${nextId++}`;
        let k = inherited;
        if (k === 0 && bound + 1 <= n && chance(0.75)) k = int(bound + 1, n);
        const maxLb = k > 0 ? k - 1 : n;
        const { refs, lb } = afterRefs(maxLb);
        const parts = [`${indent}item ${id} duration:${pick(durations)}`];
        if (k > 0 && inherited === 0) parts.push(`wave:w${k}`);
        if (refs.length === 1) parts.push(`after:${refs[0]}`);
        if (refs.length > 1) parts.push(`after:[${refs.join(', ')}]`);
        lines.push(parts.join(' '));
        const lbS = Math.max(bound, k > 0 ? k - 1 : 0, lb);
        waves.set(id, k);
        placed.push({ id, lb: lbS });
        return lbS;
    };

    // A flow of children (lane, group); returns its lbE.
    const genFlow = (indent: string, bound: number, inherited: number, depth: number): number => {
        let b = bound;
        const count = int(1, depth === 0 ? 5 : 3);
        for (let i = 0; i < count; i++) {
            const r = rand();
            if (depth < 2 && r < 0.12) b = genGroup(indent, b, inherited, depth);
            else if (depth < 2 && r < 0.24) b = genParallel(indent, b, inherited, depth);
            else b = genItem(indent, b, inherited);
        }
        return b;
    };

    const containerWave = (bound: number, inherited: number): number => {
        if (inherited > 0) return inherited;
        return bound + 1 <= n && chance(0.4) ? int(bound + 1, n) : 0;
    };

    const genGroup = (indent: string, bound: number, inherited: number, depth: number): number => {
        const k = containerWave(bound, inherited);
        const title = chance(0.5) ? ` "Group ${nextId}"` : '';
        lines.push(`${indent}group${title}${k > 0 && inherited === 0 ? ` wave:w${k}` : ''}`);
        return genFlow(`${indent}  `, Math.max(bound, k > 0 ? k - 1 : 0), k, depth + 1);
    };

    const genParallel = (
        indent: string,
        bound: number,
        inherited: number,
        depth: number,
    ): number => {
        const k = containerWave(bound, inherited);
        lines.push(`${indent}parallel${k > 0 && inherited === 0 ? ` wave:w${k}` : ''}`);
        const start = Math.max(bound, k > 0 ? k - 1 : 0);
        let end = start;
        const tracks = int(2, 3);
        for (let t = 0; t < tracks; t++) {
            const track = chance(0.3)
                ? genGroup(`${indent}  `, start, k, depth + 1)
                : genItem(`${indent}  `, start, k);
            end = Math.max(end, track);
        }
        return end;
    };

    const lanes = int(1, 4);
    for (let l = 0; l < lanes; l++) {
        lines.push(`swimlane lane${l}`);
        genFlow('  ', 0, 0, 0);
    }
    lines.push('');
    return { source: lines.join('\n'), waves };
}

describe('layoutRoadmap — barrier theorem on generated roadmaps', () => {
    it('every member of wave j ends before every member of a later wave starts', async () => {
        const rand = mulberry32(0x5eed);
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            expect(errorsOf(file), gen.source).toEqual([]);
            const model = layoutRoadmap(file, resolved);
            const n = resolved.content.waves?.size ?? 0;
            // Termination: the driver settles within n + 1 passes.
            expect(model.waveSolve?.capped, gen.source).toBe(false);
            expect(model.waveSolve?.passes ?? 0).toBeLessThanOrEqual(n + 1);
            const byId = itemsById(model);
            const members = [...gen.waves]
                .filter(([, k]) => k > 0)
                .map(([id, k]) => ({ id, k, it: byId.get(id) as PositionedItem }));
            for (const m of members) {
                expect(m.it, m.id).toBeDefined();
                expect(m.it.waveRole).toBe('member');
            }
            // For each wave pair, the latest end of the earlier wave is at
            // or before the earliest start of the later one.
            for (let j = 1; j <= n; j++) {
                const ends = members.filter((m) => m.k === j).map((m) => logicalEnd(m.it));
                if (ends.length === 0) continue;
                const latestEnd = Math.max(...ends);
                for (const later of members.filter((m) => m.k > j)) {
                    expect(
                        logicalStart(later.it),
                        `${later.id}\n${gen.source}`,
                    ).toBeGreaterThanOrEqual(latestEnd - 1e-6);
                }
            }
        }
    });
});

// Waves under the show view (m2p phase 4, decision 13; specs/working-calendar.md
// §7.3). `E_k` is the latest member's logical end, `S_{k+1} = max(E_k,
// forward(floor))` with the raw floor, and only item starts snap off a
// non-working day. Pixels are relative to `timeline.originX`, at 8 px a day
// under show (a week is 56 px) and 8 px a working day under hide (40 px).
describe('layoutRoadmap — waves under nonWorking show', () => {
    type Display = 'hide' | 'show';
    // The render-time display this phase adds to `LayoutOptions`.
    type DisplayOptions = LayoutOptions & { nonWorking?: Display };

    const fixture = (wave = '', extra = '') => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave a "A"
wave b "B"${wave}

swimlane s
  item x duration:1w wave:a
  item z duration:1w wave:b
swimlane t
  item y duration:3d wave:a
  item q duration:2d wave:b date:2026-01-07
${extra}`;

    /** `source` laid out with the file key (a config block) or the option. */
    async function layDisplay(source: string, key?: Display, option?: Display): Promise<Laid> {
        const keyed = key
            ? source.replace(
                  '\nroadmap ',
                  `\nconfig\n\ndefault roadmap non-working:${key}\n\nroadmap `,
              )
            : source;
        const { file, resolved } = await parseAndResolve(keyed);
        const options: DisplayOptions = option ? { nonWorking: option } : {};
        const model = layoutRoadmap(file, resolved, options);
        const config = resolveCalendar(file, resolved.config.calendar);
        return {
            file,
            resolved,
            model,
            perWeek: config.daysPerWeek,
            calendar: fromCalendarConfig(config),
        };
    }

    const left = (laid: Laid, id: string): number =>
        item(laid, id).box.x - laid.model.timeline.originX;
    const iso = (d: Date | undefined): string | undefined => d?.toISOString().slice(0, 10);
    const waveOf = (laid: Laid, index: number) => {
        const w = laid.model.waves?.[index];
        expect(w, `wave ${index}`).toBeDefined();
        return w as NonNullable<PositionedRoadmap['waves']>[number];
    };
    const pinned = { wave: 'b', key: 'date', pin: '2026-01-07', start: '2026-01-12' };

    it('show: E_a is 40, S_b is 40, z and q start at 62, the dates read as in hide', async () => {
        const laid = await layDisplay(fixture(), 'show');
        const o = laid.model.timeline.originX;
        expect(waveOf(laid, 0).endX - o).toBe(40);
        expect(waveOf(laid, 1).startX - o).toBe(40);
        expect(left(laid, 'z')).toBe(62);
        expect(left(laid, 'q')).toBe(62);
        expect(iso(waveOf(laid, 0).endDate)).toBe('2026-01-10');
        expect(iso(waveOf(laid, 1).startDate)).toBe('2026-01-12');
        expect(laid.model.waveSolve?.capped).toBe(false);
    });

    it('show: NL.W1001 for q reads the same as in hide', async () => {
        const laid = await layDisplay(fixture(), 'show');
        expect(item(laid, 'q').wavePinOverride).toEqual(pinned);
        expect(left(laid, 'q')).toBe(62);
    });

    it('hide: E_a is 40, S_b is 40, z and q start at 46 (guard)', async () => {
        const laid = await layDisplay(fixture());
        const o = laid.model.timeline.originX;
        expect(waveOf(laid, 0).endX - o).toBe(40);
        expect(waveOf(laid, 1).startX - o).toBe(40);
        expect(left(laid, 'z')).toBe(46);
        expect(left(laid, 'q')).toBe(46);
        expect(iso(waveOf(laid, 0).endDate)).toBe('2026-01-10');
        expect(iso(waveOf(laid, 1).startDate)).toBe('2026-01-12');
        expect(item(laid, 'q').wavePinOverride).toEqual(pinned);
    });

    it('a floor on Sunday Jan 11: S_b is 48 under show (40 under hide), z at 62', async () => {
        const floor = fixture(' after:2026-01-11');
        const show = await layDisplay(floor, 'show');
        expect(waveOf(show, 1).startX - show.model.timeline.originX).toBe(48);
        expect(left(show, 'z')).toBe(62);
        const hide = await layDisplay(floor);
        expect(waveOf(hide, 1).startX - hide.model.timeline.originX).toBe(40);
    });

    it('a floor on Monday Jan 12: S_b is 56 under show', async () => {
        const show = await layDisplay(fixture(' after:2026-01-12'), 'show');
        expect(waveOf(show, 1).startX - show.model.timeline.originX).toBe(56);
    });

    it('a Monday milestone is on the wave boundary under hide, not under show', async () => {
        const source = fixture('', '\nmilestone m "M" date:2026-01-12\n');
        const hide = await layDisplay(source);
        expect(milestone(hide, 'm').onWaveBoundary).toBe(true);
        const show = await layDisplay(source, 'show');
        expect(milestone(show, 'm').onWaveBoundary ?? false).toBe(false);
    });

    it('the option beats the file key for waves too', async () => {
        const laid = await layDisplay(fixture(), 'show', 'hide');
        expect(left(laid, 'z')).toBe(46);
    });
});
