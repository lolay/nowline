// Wave validation rules (specs/waves.md §6): the declaration rules (S:
// WV1-WV4) and the property rules (P: WV5-WV9), plus the validator wiring
// that keeps every other check quiet about wave keys (§6.2 "No duplicate
// diagnostics"). The order rules (G: WV10-WV12) are covered separately.

import { describe, expect, it } from 'vitest';
import type { GroupBlock, ParallelBlock, SwimlaneDeclaration } from '../../src/generated/ast.js';
import { isSwimlaneDeclaration } from '../../src/generated/ast.js';
import {
    assignWaves,
    effectiveWave,
    fileRefLookup,
    leadWave,
    ownWaves,
    waveFloorDate,
    waveIndexMap,
} from '../../src/language/waves.js';
import { parse } from '../helpers.js';
import {
    check,
    type Diag,
    diags,
    EXAMPLE_1,
    EXAMPLE_2,
    EXAMPLE_3,
    EXAMPLE_4,
    EXAMPLE_5,
    EXAMPLE_6,
    EXAMPLE_7,
    EXAMPLE_8,
    EXAMPLE_9,
    EXAMPLE_10,
    EXAMPLE_11,
    EXAMPLE_12,
    EXAMPLE_18,
    EXAMPLE_20,
    EXAMPLE_21,
} from './wave-fixtures.js';

function errors(ds: Diag[]): Diag[] {
    return ds.filter((d) => d.severity === 'error');
}

function codes(ds: Diag[]): string[] {
    return ds.map((d) => d.code ?? d.message);
}

const HEAD = 'nowline v1\n\nroadmap r "R" start:2026-01-05 scale:1w\n\n';

const W0702_TAIL =
    'is ignored: this roadmap declares no waves. Declare waves with "wave <id>" to use it, or remove the property.';

describe('waves: worked examples (specs/waves.md §11)', () => {
    const clean: Array<[string, string]> = [
        ['Example 1', EXAMPLE_1],
        ['Example 2', EXAMPLE_2],
        ['Example 3', EXAMPLE_3],
        ['Example 4', EXAMPLE_4],
        ['Example 5', EXAMPLE_5],
        ['Example 6', EXAMPLE_6],
        ['Example 8', EXAMPLE_8],
        ['Example 9', EXAMPLE_9],
        ['Example 10', EXAMPLE_10],
        ['Example 11', EXAMPLE_11],
        ['Example 12', EXAMPLE_12],
        ['Example 18', EXAMPLE_18],
    ];
    for (const [name, src] of clean) {
        it(`${name} validates with no diagnostics`, async () => {
            expect(await check(src)).toEqual([]);
        });
    }

    it('Example 7 has no errors (its NL.W1101 warnings belong to the order rules)', async () => {
        expect(errors(await check(EXAMPLE_7))).toEqual([]);
    });

    it('Example 20 reports exactly the declaration and assignment errors', async () => {
        const ds = await check(EXAMPLE_20);
        expect(ds).toEqual([
            {
                line: 7,
                severity: 'error',
                code: 'NL.E1100',
                message:
                    'Wave "Wave 2" needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".',
            },
            {
                line: 8,
                severity: 'error',
                code: 'NL.E1105',
                message:
                    '"before:" is not allowed on wave "w2". A wave\'s end comes from its items; to give a wave a deadline, add a dated milestone: milestone w2-due date:<YYYY-MM-DD> after:w2.',
            },
            {
                line: 9,
                severity: 'error',
                code: 'NL.E1106',
                message:
                    'Wave "w3" has after:a1, but "a1" is an item. A wave\'s after: accepts only anchors, dated milestones, or one ISO date; to make a wave wait for work, put that work in an earlier wave.',
            },
            {
                line: 11,
                severity: 'error',
                code: 'NL.E1104',
                message:
                    '"wave:" is not allowed on swimlane "a": a swimlane spans every wave. Put wave: on its items, or wrap them in "group wave:w1".',
            },
            {
                line: 14,
                severity: 'error',
                code: 'NL.E1102',
                message:
                    'Item "a2" has wave:w2, but its enclosing group "g" has wave:w1. A container\'s wave applies to everything inside it; remove one of the two wave: properties.',
            },
            {
                line: 15,
                severity: 'error',
                code: 'NL.E1101',
                message:
                    'Wave "w9" is not declared. Declared waves: w1, w2, w3, w4. Add "wave w9" above the first swimlane that uses it.',
            },
            {
                line: 16,
                severity: 'error',
                code: 'NL.E1101',
                message:
                    '"wave:" takes exactly one wave id; an item belongs to at most one wave. Got "[w1, w2]".',
            },
            {
                line: 17,
                severity: 'error',
                code: 'NL.E1101',
                message:
                    'Wave "w4" is used before its declaration on line 19. Declare waves above the swimlanes that use them.',
            },
            {
                line: 21,
                severity: 'error',
                code: 'NL.E1104',
                message:
                    '"wave:" is not allowed on milestone "m". To place a milestone at the end of a wave, use after:w1.',
            },
        ]);
    });

    it('Example 21: a v1 file with stray wave: keys gets NL.W0702 instead of NL.W0700', async () => {
        const ds = await check(EXAMPLE_21);
        expect(ds).toEqual([
            {
                line: 5,
                severity: 'warning',
                code: 'NL.W0702',
                message: `"wave:" on "default item" ${W0702_TAIL}`,
            },
            {
                line: 9,
                severity: 'warning',
                code: 'NL.W0702',
                message: `"wave:" on swimlane "a" ${W0702_TAIL}`,
            },
            {
                line: 10,
                severity: 'warning',
                code: 'NL.W0702',
                message: `"wave:" on item "a1" ${W0702_TAIL}`,
            },
        ]);
    });
});

describe('waves: declaration rules (set S)', () => {
    it('WV1 NL.E1100: a wave without an id, by title', async () => {
        const ds = await check(`${HEAD}wave "Build"\n\nswimlane s\n  item a duration:1w\n`);
        expect(ds).toEqual([
            {
                line: 5,
                severity: 'error',
                code: 'NL.E1100',
                message:
                    'Wave "Build" needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".',
            },
        ]);
    });

    it('WV1 NL.E1100: a wave with neither id nor title is named by line', async () => {
        const ds = await check(`${HEAD}wave\nswimlane s\n  item a duration:1w\n`);
        expect(codes(ds)).toEqual(['NL.E1100']);
        expect(ds[0].message).toMatch(/^Wave on line 5 needs an explicit identifier/);
    });

    it('WV1: a wave with neither id nor title gets only NL.E1100', async () => {
        // NL.E1105 and NL.E1106 would have to name it "<unnamed>".
        const ds = await check(
            `${HEAD}wave before:x after:s\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(codes(ds)).toEqual(['NL.E1100']);
    });

    it('WV1: a title-only wave is not in the wave list and gives no wave semantics', async () => {
        const r = await parse(`${HEAD}wave "Build"\n\nswimlane s\n  item a duration:1w wave:x\n`);
        expect(ownWaves(r.ast)).toEqual([]);
        // The file declares no valid wave, so the stray key is NL.W0702.
        expect(codes(diags(r.diagnostics))).toEqual(['NL.E1100', 'NL.W0702']);
    });

    it('WV2 NL.E0300: wave ids share the id namespace', async () => {
        const ds = await check(
            `${HEAD}wave w1\nwave w1 "Again"\n\nswimlane s\n  item w1 duration:1w\n`,
        );
        expect(ds.map((d) => [d.line, d.code])).toEqual([
            [6, 'NL.E0300'],
            [9, 'NL.E0300'],
        ]);
    });

    it('WV3 NL.E1105: before: on a wave is its only diagnostic', async () => {
        // `x` resolves to nothing: still no "does not resolve", no NL.E0411 for
        // a date, and no cycle.
        for (const value of ['x', '2026-03-02']) {
            const ds = await check(
                `${HEAD}wave w2 before:${value}\n\nswimlane s\n  item a duration:1w\n`,
            );
            expect(ds).toEqual([
                {
                    line: 5,
                    severity: 'error',
                    code: 'NL.E1105',
                    message:
                        '"before:" is not allowed on wave "w2". A wave\'s end comes from its items; to give a wave a deadline, add a dated milestone: milestone w2-due date:<YYYY-MM-DD> after:w2.',
                },
            ]);
        }
    });

    it('WV3 NL.E1105: every other banned key, with no NL.W0700 or value errors', async () => {
        const keys = [
            'date:2026-03-02',
            'start:2026-03-02',
            'length:3w',
            'duration:2w',
            'size:nope',
            'capacity:2',
            'remaining:50%',
            'wave:w1',
        ];
        const ds = await check(
            `${HEAD}wave w1\nwave w2 ${keys.join(' ')}\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(ds.map((d) => [d.line, d.code])).toEqual(keys.map(() => [6, 'NL.E1105']));
        expect(ds.map((d) => d.message)).toEqual(
            keys.map(
                (k) =>
                    `"${k.split(':')[0]}:" is not allowed on wave "w2". A wave's span comes from its items; only after: (an anchor, a dated milestone, or one ISO date) can hold back a wave's start.`,
            ),
        );
    });

    it('WV3: universal keys are accepted and other unknown keys stay NL.W0700', async () => {
        const ds = await check(
            `${HEAD}label l\nwave w1 "W1" labels:[l] link:"https://example.com" owner:sam\n\nswimlane s\n  item a duration:1w wave:w1\n`,
        );
        expect(codes(ds)).toEqual(['NL.W0700']);
    });

    it('WV4 NL.E1106: after: must name an anchor, a dated milestone or a date', async () => {
        const src =
            `${HEAD}anchor kickoff date:2026-01-12\n` +
            `milestone gate date:2026-02-02\n` +
            `milestone floaty after:a\n` +
            `wave w0\n` +
            `wave w1 after:[kickoff, gate, 2026-01-19]\n` +
            `wave w2 after:a\n` +
            `wave w3 after:floaty\n` +
            `wave w4 after:w0\n` +
            `wave w5 after:s\n\n` +
            `swimlane s\n  item a duration:1w\n`;
        const ds = await check(src);
        expect(ds.map((d) => [d.line, d.code])).toEqual([
            [10, 'NL.E1106'],
            [11, 'NL.E1106'],
            [12, 'NL.E1106'],
            [13, 'NL.E1106'],
        ]);
        expect(ds.map((d) => d.message.split('. ')[0])).toEqual([
            'Wave "w2" has after:a, but "a" is an item',
            'Wave "w3" has after:floaty, but "floaty" is a milestone without a date',
            'Wave "w4" has after:w0, but "w0" is a wave',
            'Wave "w5" has after:s, but "s" is a swimlane',
        ]);
    });

    it('WV4: an after: element that resolves to nothing gets only "does not resolve"', async () => {
        const ds = await check(`${HEAD}wave w2 after:nope\n\nswimlane s\n  item a duration:1w\n`);
        expect(ds).toEqual([
            {
                line: 5,
                severity: 'error',
                message:
                    'after: reference "nope" does not resolve to any declared entity in this file.',
            },
        ]);
    });

    it('the wave-deadline idiom is not a cycle', async () => {
        const ds = await check(
            `${HEAD}wave w1\nwave w2 after:gate\n\nswimlane s\n  item a duration:1w wave:w1\n  item b duration:1w wave:w2\n\nmilestone gate date:2026-03-02 after:w2\n`,
        );
        expect(ds).toEqual([]);
    });

    it('a cycle through other entities is still reported next to a wave', async () => {
        const ds = await check(
            `${HEAD}wave w1\n\nswimlane s\n  item a duration:1w after:b\n  item b duration:1w after:a\n`,
        );
        expect(ds.map((d) => d.message)).toEqual([
            expect.stringMatching(/^Circular dependency detected/),
        ]);
    });
});

describe('waves: property rules (set P)', () => {
    it('an item with no wave in a roadmap with waves has no diagnostic', async () => {
        const ds = await check(
            `${HEAD}wave w1\n\nswimlane s\n  item a duration:1w wave:w1\n  item bg duration:1w\n`,
        );
        expect(ds).toEqual([]);
    });

    it('WV5 NL.E1104: wave: only on item, group and parallel', async () => {
        const src =
            `nowline v1\n\nroadmap r "R" start:2026-01-05 wave:w1\n\n` +
            `wave w1\n` +
            `anchor k date:2026-01-12 wave:w1\n` +
            `label l wave:w1\n` +
            `size med effort:1w wave:w1\n` +
            `status st wave:w1\n` +
            `person p "P" wave:w1\n` +
            `team t\n  team t2 wave:w1\n` +
            `footnote f on:a wave:w1\n\n` +
            `swimlane s\n  item a duration:1w wave:w1\n  group g wave:w1\n    item b duration:1w\n` +
            `  parallel wave:w1\n    item c duration:1w\n    item d duration:1w\n`;
        const ds = await check(src);
        expect(ds.map((d) => [d.line, d.code, d.message.split(';')[0]])).toEqual([
            [3, 'NL.E1104', '"wave:" is not allowed on roadmap "r"'],
            [6, 'NL.E1104', '"wave:" is not allowed on anchor "k"'],
            [7, 'NL.E1104', '"wave:" is not allowed on label "l"'],
            [8, 'NL.E1104', '"wave:" is not allowed on size "med"'],
            [9, 'NL.E1104', '"wave:" is not allowed on status "st"'],
            [10, 'NL.E1104', '"wave:" is not allowed on person "p"'],
            [12, 'NL.E1104', '"wave:" is not allowed on team "t2"'],
            [13, 'NL.E1104', '"wave:" is not allowed on footnote "f"'],
        ]);
        expect(ds[0].message).toBe(
            '"wave:" is not allowed on roadmap "r"; only item, group, and parallel can belong to a wave.',
        );
    });

    it('WV5: an entity with neither id nor title gets NL.E0301, not NL.E1104', async () => {
        const ds = await check(
            `${HEAD}wave w1\nanchor date:2026-01-12 wave:w1\n\nswimlane s\n  item a duration:1w\n\n` +
                `milestone wave:w1 after:a\n`,
        );
        expect(ds.map((d) => [d.line, d.code])).toEqual([
            [6, 'NL.E0301'],
            [11, 'NL.E0301'],
        ]);
        expect(ds.some((d) => d.message.includes('<unnamed>'))).toBe(false);
    });

    it('WV6 NL.E1101: a one-element list is the same as a scalar', async () => {
        const ds = await check(`${HEAD}wave w1\n\nswimlane s\n  item a duration:1w wave:[w1]\n`);
        expect(ds).toEqual([]);
    });

    it('WV6 NL.E1101: an undeclared wave suggests a unique close id', async () => {
        const ds = await check(
            `${HEAD}wave discover "Discover"\nwave build "Build"\n\nswimlane s\n  item a duration:1w wave:buld\n`,
        );
        expect(ds).toEqual([
            {
                line: 9,
                severity: 'error',
                code: 'NL.E1101',
                message:
                    'Wave "buld" is not declared. Declared waves: discover, build. Add "wave buld" above the first swimlane that uses it. Did you mean wave:build ("Build")?',
            },
        ]);
    });

    it('WV6 NL.E1101: an undeclared wave that matches a title suggests that wave', async () => {
        const ds = await check(
            `${HEAD}wave w1 "Discovery"\nwave w2 "Build"\n\nswimlane s\n  item a duration:1w wave:discovery\n`,
        );
        expect(ds.map((d) => d.message)).toEqual([
            'Wave "discovery" is not declared. Declared waves: w1, w2. Add "wave discovery" above the first swimlane that uses it. Did you mean wave:w1 ("Discovery")?',
        ]);
    });

    it('WV6 NL.E1101: an id that names something other than a wave', async () => {
        const ds = await check(
            `${HEAD}wave w1\n\nswimlane s\n  item api duration:1w\n  item b duration:1w wave:api\n`,
        );
        expect(ds).toEqual([
            {
                line: 9,
                severity: 'error',
                code: 'NL.E1101',
                message: '"wave:" must name a wave, but "api" is an item.',
            },
        ]);
    });

    it('WV6 NL.E1101: a wave declared below the referencing entry', async () => {
        const ds = await check(
            `${HEAD}wave w1\n\nswimlane s\n  group wave:w2\n    item a duration:1w\n\nwave w2\n`,
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                8,
                'NL.E1101',
                'Wave "w2" is used before its declaration on line 11. Declare waves above the swimlanes that use them.',
            ],
        ]);
    });

    it('WV7 NL.E1102: a descendant may repeat its container wave but not change it', async () => {
        const ds = await check(
            `${HEAD}wave w1\nwave w2\n\nswimlane s\n` +
                `  group g wave:w1\n    item a duration:1w wave:w1\n    item b duration:1w wave:w2\n` +
                `  parallel wave:w2\n    item c duration:1w wave:w1\n    item d duration:1w\n`,
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split('. ')[0]])).toEqual([
            [11, 'NL.E1102', 'Item "b" has wave:w2, but its enclosing group "g" has wave:w1'],
            [
                13,
                'NL.E1102',
                'Item "c" has wave:w1, but its enclosing parallel block on line 12 has wave:w2',
            ],
        ]);
    });

    it('WV7: a conflict is reported once, on the outermost disagreement', async () => {
        const ds = await check(
            `${HEAD}wave w1\nwave w2\n\nswimlane s\n` +
                `  group g wave:w1\n    group h wave:w2\n      item a duration:1w wave:w2\n`,
        );
        expect(ds.map((d) => [d.line, d.code])).toEqual([[10, 'NL.E1102']]);
        expect(ds[0].message).toMatch(/^Group "h" has wave:w2, but its enclosing group "g"/);
    });

    it('WV7: an invalid container wave imposes nothing (cascade control)', async () => {
        const ds = await check(
            `${HEAD}wave w1\n\nswimlane s\n  group g wave:nope\n    item a duration:1w wave:w1\n`,
        );
        expect(ds.map((d) => [d.line, d.code])).toEqual([[8, 'NL.E1101']]);
    });

    it('WV8: wave on a default line is the rule-23 error when the roadmap has waves', async () => {
        const ds = await check(
            `nowline v1\n\nconfig\n\ndefault item wave:w1\ndefault group wave:[w1, w2]\n\n` +
                `roadmap r "R" start:2026-01-05\n\nwave w1\nwave w2\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(ds).toEqual([
            {
                line: 5,
                severity: 'error',
                message:
                    '"wave" cannot be set on "default item". Identity-defining, sizing, sequencing, reference, and prose properties must be explicit on each entity.',
            },
            {
                line: 6,
                severity: 'error',
                message:
                    '"wave" cannot be set on "default group". Identity-defining, sizing, sequencing, reference, and prose properties must be explicit on each entity.',
            },
        ]);
    });

    it('WV9 NL.W0702: with no waves, each wave: key gets exactly one warning', async () => {
        const ds = await check(
            `nowline v1\n\nconfig\n\ndefault group wave:[a, b]\n\n` +
                `roadmap r "R" start:2026-01-05 wave:a\n\n` +
                `anchor k date:2026-01-12 wave:a\n\n` +
                `swimlane s\n  group g wave:a\n    item a1 duration:1w wave:[a, b]\n` +
                `  parallel wave:b\n    item c duration:1w\n    item d duration:1w\n\n` +
                `milestone m after:a1 wave:a\n`,
        );
        expect(ds.map((d) => [d.line, d.severity, d.code, d.message])).toEqual([
            [5, 'warning', 'NL.W0702', `"wave:" on "default group" ${W0702_TAIL}`],
            [7, 'warning', 'NL.W0702', `"wave:" on roadmap "r" ${W0702_TAIL}`],
            [9, 'warning', 'NL.W0702', `"wave:" on anchor "k" ${W0702_TAIL}`],
            [12, 'warning', 'NL.W0702', `"wave:" on group "g" ${W0702_TAIL}`],
            [13, 'warning', 'NL.W0702', `"wave:" on item "a1" ${W0702_TAIL}`],
            [14, 'warning', 'NL.W0702', `"wave:" on the parallel block on line 14 ${W0702_TAIL}`],
            [18, 'warning', 'NL.W0702', `"wave:" on milestone "m" ${W0702_TAIL}`],
        ]);
    });
});

describe('waves: repeated wave: keys', () => {
    it('WV9: with no waves, every repeated key gets its own NL.W0702', async () => {
        const ds = await check(`${HEAD}swimlane s\n  item a duration:1w wave:x wave:y\n`);
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [6, 'NL.W0702', `"wave:" on item "a" ${W0702_TAIL}`],
            [6, 'NL.W0702', `"wave:" on item "a" ${W0702_TAIL}`],
        ]);
    });

    it('WV6 NL.E1101: a second wave: key on an item is a list; the first key applies', async () => {
        const src = `${HEAD}wave w1\nwave w2\n\nswimlane s\n  item a duration:1w wave:w1 wave:w2\n`;
        const ds = await check(src);
        expect(ds).toEqual([
            {
                line: 9,
                severity: 'error',
                code: 'NL.E1101',
                message:
                    '"wave:" takes exactly one wave id; an item belongs to at most one wave. Got "[w1, w2]".',
            },
        ]);
        const r = await parse(src);
        const lane = r.ast.roadmapEntries.find((e) => e.name === 's') as SwimlaneDeclaration;
        expect(effectiveWave(lane.content[0], waveIndexMap(r.ast))).toBe(1);
    });

    it('WV6/WV7: the first key is still checked when a later key repeats it', async () => {
        const ds = await check(
            `${HEAD}wave w1\nwave w2\n\nswimlane s\n  group g wave:w1\n    item a duration:1w wave:w2 wave:w1\n`,
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split('. ')[0]])).toEqual([
            [10, 'NL.E1102', 'Item "a" has wave:w2, but its enclosing group "g" has wave:w1'],
            [
                10,
                'NL.E1101',
                '"wave:" takes exactly one wave id; an item belongs to at most one wave',
            ],
        ]);
    });

    it('WV5 and WV8: each repeated key on a swimlane or default line is reported', async () => {
        const ds = await check(
            `nowline v1\n\nconfig\n\ndefault item wave:w1 wave:w2\n\n` +
                `roadmap r "R" start:2026-01-05\n\nwave w1\nwave w2\n\n` +
                `swimlane s wave:w1 wave:w2\n  item a duration:1w\n`,
        );
        expect(ds.map((d) => [d.line, d.code ?? d.message.split('.')[0]])).toEqual([
            [5, '"wave" cannot be set on "default item"'],
            [5, '"wave" cannot be set on "default item"'],
            [12, 'NL.E1104'],
            [12, 'NL.E1104'],
        ]);
    });
});

describe('waves: helpers', () => {
    const src =
        `${HEAD}anchor budget date:2026-02-02\n` +
        `milestone gate date:2026-02-16\n` +
        `milestone floaty after:x\n` +
        `wave w1 "One" after:[budget, 2026-01-26]\n` +
        `wave w2 after:[budget, gate, floaty, x, 2026-02-09]\n` +
        `wave w3\n` +
        `wave\n\n` +
        `swimlane s\n` +
        `  item x duration:1w\n` +
        `  group g wave:w2\n    item a duration:1w\n    item b duration:1w wave:w3\n` +
        `  group h\n    item c duration:1w\n    item e duration:1w wave:w1\n` +
        `  group k\n    item m duration:1w wave:w3\n` +
        `  parallel p\n    item n duration:1w wave:w3\n    item o duration:1w wave:w2\n` +
        `  parallel q\n    item t duration:1w wave:w3\n    item u duration:1w\n` +
        `  item bad duration:1w wave:nope\n`;

    it('ownWaves and waveIndexMap list the valid waves in order', async () => {
        const r = await parse(src);
        expect(ownWaves(r.ast).map((w) => w.name)).toEqual(['w1', 'w2', 'w3']);
        expect([...waveIndexMap(r.ast)]).toEqual([
            ['w1', 1],
            ['w2', 2],
            ['w3', 3],
        ]);
    });

    it('effectiveWave inherits, lets the container win, and drops invalid values', async () => {
        const r = await parse(src);
        const ids = waveIndexMap(r.ast);
        const lane = r.ast.roadmapEntries.find((e) => e.name === 's') as SwimlaneDeclaration;
        const byName = new Map<string, unknown>();
        const walk = (nodes: readonly { name?: string; content?: unknown[] }[]) => {
            for (const n of nodes) {
                if (n.name) byName.set(n.name, n);
                if (n.content) walk(n.content as { name?: string }[]);
            }
        };
        walk(lane.content as { name?: string }[]);
        const ew = (name: string) => effectiveWave(byName.get(name) as GroupBlock, ids);
        expect(ew('x')).toBeUndefined();
        expect(ew('g')).toBe(2);
        expect(ew('a')).toBe(2);
        expect(ew('b')).toBe(2); // WV7 conflict: the container's wave wins
        expect(ew('h')).toBeUndefined();
        expect(ew('e')).toBe(1);
        expect(ew('bad')).toBeUndefined();

        const lw = (name: string) => leadWave(byName.get(name) as GroupBlock | ParallelBlock, ids);
        expect(lw('g')).toBe(2);
        expect(lw('h')).toBeUndefined(); // first child is background
        expect(lw('k')).toBe(3);
        expect(lw('p')).toBe(2); // min over tracks
        expect(lw('q')).toBeUndefined(); // a background track
        expect(lw('x')).toBeUndefined();
    });

    it('assignWaves agrees with effectiveWave and leadWave on every node', async () => {
        const r = await parse(src);
        const ids = waveIndexMap(r.ast);
        const lanes = r.ast.roadmapEntries.filter(isSwimlaneDeclaration);
        const { waveOf, leadOf } = assignWaves(lanes, ids);
        let count = 0;
        const walk = (nodes: readonly (GroupBlock | ParallelBlock)[]) => {
            for (const n of nodes) {
                if (n.$type === 'DescriptionDirective') continue;
                count++;
                expect(waveOf.get(n)).toBe(effectiveWave(n, ids));
                expect(leadOf.get(n)).toBe(leadWave(n, ids));
                if (n.content) walk(n.content as (GroupBlock | ParallelBlock)[]);
            }
        };
        for (const lane of lanes) walk(lane.content as (GroupBlock | ParallelBlock)[]);
        expect(count).toBe(16);
    });

    it('waveFloorDate takes the latest valid element and names it', async () => {
        const r = await parse(src);
        const lookup = fileRefLookup(r.ast);
        const [w1, w2, w3] = ownWaves(r.ast);
        expect(waveFloorDate(w1, lookup)).toEqual({ date: '2026-02-02', ref: 'budget' });
        expect(waveFloorDate(w2, lookup)).toEqual({ date: '2026-02-16', ref: 'gate' });
        expect(waveFloorDate(w3, lookup)).toBeNull();
    });
});
