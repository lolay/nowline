// Wave order rules (specs/waves.md §6.3): the G set. WV10 NL.E1103 with its
// reporting variants and cascade folding, WV11 NL.W1100 and WV12 NL.W1101,
// through the validator and through `evaluateWaveOrder` on a scope of lanes
// from more than one file.

import { AstUtils } from 'langium';
import { describe, expect, it } from 'vitest';
import { isSwimlaneDeclaration } from '../../src/generated/ast.js';
import { tr } from '../../src/i18n/index.js';
import {
    fileRefLookup,
    ownWaves,
    type WaveFinding,
    type WaveRefLookup,
} from '../../src/language/waves.js';
import { evaluateWaveOrder } from '../../src/language/waves-order.js';
import { parse } from '../helpers.js';
import {
    check,
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
    EXAMPLE_13,
    EXAMPLE_13_FIX_MOVE,
    EXAMPLE_13_FIX_PARALLEL,
    EXAMPLE_13_JOIN,
    EXAMPLE_14,
    EXAMPLE_15,
    EXAMPLE_18,
    EXAMPLE_20,
} from './wave-fixtures.js';

// Two waves; the first lane starts on line 8.
const HEAD = 'nowline v1\n\nroadmap r "R" start:2026-01-05 scale:1w\n\nwave w1\nwave w2\n\n';

function src(...lines: string[]): string {
    return `${HEAD}${lines.join('\n')}\n`;
}

// Three waves; the first lane starts on line 9.
function src3(...lines: string[]): string {
    return `${HEAD.replace('wave w2\n', 'wave w2\nwave w3\n')}${lines.join('\n')}\n`;
}

// The en-US `sequence` message, for the run of items after `ref`.
function sequenceMessage(
    items: string[],
    itemWave: string,
    ref: string,
    refWave: string,
    flow: string,
): string {
    const subject = `${items.length > 1 ? 'Items' : 'Item'} ${items.map((n) => `"${n}"`).join(', ')} (wave "${itemWave}") ${items.length > 1 ? 'come' : 'comes'}`;
    return `${subject} after ${ref} (wave "${refWave}") in ${flow}. Work in a lane or group runs in order, so it must also be ordered by wave: move ${ref} below "${items[items.length - 1]}", or change their waves.`;
}

describe('waves order: worked examples (specs/waves.md §11)', () => {
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
        ['Example 11 (the wave-deadline idiom)', EXAMPLE_11],
        ['Example 12', EXAMPLE_12],
        ['Example 13, fix: move a1 below a3', EXAMPLE_13_FIX_MOVE],
        ['Example 13, fix: a1 in a track beside a group', EXAMPLE_13_FIX_PARALLEL],
        ['Example 18', EXAMPLE_18],
    ];
    for (const [name, text] of clean) {
        it(`${name} has no diagnostics`, async () => {
            expect(await check(text)).toEqual([]);
        });
    }

    it('Example 7: two NL.W1101 forward-lane warnings', async () => {
        expect(await check(EXAMPLE_7)).toEqual([
            {
                line: 9,
                severity: 'warning',
                code: 'NL.W1101',
                message:
                    'after:schema on "forms" refers to "schema", which is in a later swimlane ("backend"). Layout places swimlanes in order and ignores references to work it has not placed yet, so it ignores this after:. Move swimlane "backend" above swimlane "frontend", or remove the after:.',
            },
            {
                line: 10,
                severity: 'warning',
                code: 'NL.W1101',
                message:
                    'after:api on "wire-up" refers to "api", which is in a later swimlane ("backend"). Layout places swimlanes in order and ignores references to work it has not placed yet, so it ignores this after:. Move swimlane "backend" above swimlane "frontend", or remove the after:.',
            },
        ]);
    });

    it('Example 13: one NL.E1103 sequence, with a3 folded into the run of a1', async () => {
        expect(await check(EXAMPLE_13)).toEqual([
            {
                line: 10,
                severity: 'error',
                code: 'NL.E1103',
                message:
                    'Items "a2", "a3" (wave "w1") come after "a1" (wave "w2") in swimlane "a". Work in a lane or group runs in order, so it must also be ordered by wave: move "a1" below "a3", or change their waves.',
            },
        ]);
    });

    it('Example 13, the non-fix: a3 after a block with a w2 track is NL.E1103 join', async () => {
        expect(await check(EXAMPLE_13_JOIN)).toEqual([
            {
                line: 12,
                severity: 'error',
                code: 'NL.E1103',
                message:
                    'Item "a3" (wave "w1") comes after the parallel block on line 9 in swimlane "a", and that block cannot end before its track "a1" (wave "w2") does. Move "a3" above the block or into a track of its own, or change one of their waves.',
            },
        ]);
    });

    it('Example 14: after: a later wave, after: its own wave, and an unmeetable before:', async () => {
        expect(await check(EXAMPLE_14)).toEqual([
            {
                line: 12,
                severity: 'error',
                code: 'NL.E1103',
                message:
                    'Item "b" (wave "w1") has after:a, but "a" is in later wave "w2". Wave "w2" cannot start until wave "w1" ends, so "b" could never start: move it to wave "w2" or later, or remove the after:.',
            },
            {
                line: 13,
                severity: 'error',
                code: 'NL.E1103',
                message:
                    'Item "c" (wave "w1") has after:w1, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move "c" to a later wave.',
            },
            {
                line: 16,
                severity: 'warning',
                code: 'NL.W1100',
                message:
                    'before:b on "d" can never be met: "d" is in wave "w2", which cannot start until "b" (wave "w1") has finished. The overrun will be painted.',
            },
        ]);
    });

    it('Example 15: a hidden chain through background work is NL.E1103 chain', async () => {
        expect(await check(EXAMPLE_15)).toEqual([
            {
                line: 13,
                severity: 'error',
                code: 'NL.E1103',
                message:
                    'Item "b1" (wave "w1") could never start: through a2 (wave "w2") → review → b1, it waits for work that cannot start until wave "w1" has ended. Move "b1" to a later wave, or break the chain.',
            },
        ]);
    });

    it('Example 20 gets no order diagnostic: a2 uses its container wave', async () => {
        const ds = await check(EXAMPLE_20);
        expect(ds.filter((d) => /^NL\.(E1103|W1100|W1101)$/.test(d.code ?? ''))).toEqual([]);
    });
});

describe('waves order: WV10 NL.E1103 variants', () => {
    it('sequence: in a group flow, named by the group', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  group g "G"',
                '    item a1 duration:1w wave:w2',
                '    item a2 duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                11,
                'NL.E1103',
                'Item "a2" (wave "w1") comes after "a1" (wave "w2") in group "g". Work in a lane or group runs in order, so it must also be ordered by wave: move "a1" below "a2", or change their waves.',
            ],
        ]);
    });

    it('sequence: the run follows the flow through a parallel block and past it', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a1 duration:1w wave:w2',
                '  parallel',
                '    item a2 duration:1w wave:w1',
                '    item a3 duration:1w wave:w1',
                '  item a4 duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split('. ')[0]])).toEqual([
            [
                11,
                'NL.E1103',
                'Items "a2", "a3", "a4" (wave "w1") come after "a1" (wave "w2") in swimlane "s"',
            ],
        ]);
        expect(ds[0].message).toContain('move "a1" below "a4"');
    });

    it('sequence: three waves in reverse, each item after its nearest later-wave predecessor', async () => {
        const ds = await check(
            src3(
                'swimlane a',
                '  item a1 duration:1w wave:w3',
                '  item a2 duration:1w wave:w2',
                '  item a3 duration:1w wave:w1',
            ),
        );
        // a3 is never listed under a2's wave, and moving a1 alone would
        // leave it after a2.
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [11, 'NL.E1103', sequenceMessage(['a2'], 'w2', '"a1"', 'w3', 'swimlane "a"')],
            [12, 'NL.E1103', sequenceMessage(['a3'], 'w1', '"a2"', 'w2', 'swimlane "a"')],
        ]);
    });

    it('sequence: items of different waves after one predecessor get one run per wave', async () => {
        const ds = await check(
            src3(
                'swimlane a',
                '  item a1 duration:1w wave:w3',
                '  item a2 duration:1w wave:w1',
                '  item a3 duration:1w wave:w2',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [11, 'NL.E1103', sequenceMessage(['a2'], 'w1', '"a1"', 'w3', 'swimlane "a"')],
            [12, 'NL.E1103', sequenceMessage(['a3'], 'w2', '"a1"', 'w3', 'swimlane "a"')],
        ]);
    });

    it('sequence: parallel tracks in different waves after one predecessor', async () => {
        const ds = await check(
            src3(
                'swimlane a',
                '  item a1 duration:1w wave:w3',
                '  parallel',
                '    item a2 duration:1w wave:w1',
                '    item a3 duration:1w wave:w2',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [12, 'NL.E1103', sequenceMessage(['a2'], 'w1', '"a1"', 'w3', 'swimlane "a"')],
            [13, 'NL.E1103', sequenceMessage(['a3'], 'w2', '"a1"', 'w3', 'swimlane "a"')],
        ]);
    });

    it('sequence: a run keeps its wave when a later-wave item interrupts it', async () => {
        const ds = await check(
            src3(
                'swimlane a',
                '  item a1 duration:1w wave:w3',
                '  item a2 duration:1w wave:w1',
                '  item a3 duration:1w wave:w1',
                '  item a4 duration:1w wave:w2',
                '  item a5 duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [11, 'NL.E1103', sequenceMessage(['a2', 'a3'], 'w1', '"a1"', 'w3', 'swimlane "a"')],
            [13, 'NL.E1103', sequenceMessage(['a4'], 'w2', '"a1"', 'w3', 'swimlane "a"')],
            [14, 'NL.E1103', sequenceMessage(['a5'], 'w1', '"a4"', 'w2', 'swimlane "a"')],
        ]);
    });

    it('sequence: an unnamed group with a wave is named by position', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a0 duration:1w wave:w1',
                '  group wave:w2',
                '    item a1 duration:1w',
                '    item a2 duration:1w',
                '  item a3 duration:1w wave:w1',
                '  item a4 duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                13,
                'NL.E1103',
                sequenceMessage(['a3', 'a4'], 'w1', 'the group on line 10', 'w2', 'swimlane "s"'),
            ],
        ]);
    });

    it('sequence: an unnamed parallel with a wave is named by position', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  parallel wave:w2',
                '    item p1 duration:1w',
                '    item p2 duration:1w',
                '  item a duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                12,
                'NL.E1103',
                sequenceMessage(['a'], 'w1', 'the parallel block on line 9', 'w2', 'swimlane "s"'),
            ],
        ]);
    });

    it('a group without a wave of its own spans waves: it is explained as a chain', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  group g "G"',
                '    item a1 duration:1w wave:w1',
                '    item a2 duration:1w wave:w2',
                '  item b duration:1w wave:w1',
                'swimlane t',
                '  item c duration:1w wave:w1 after:g',
            ),
        );
        // Neither message claims a wave for g.
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                12,
                'NL.E1103',
                'Item "b" (wave "w1") could never start: through a2 (wave "w2") → g → b, it waits for work that cannot start until wave "w1" has ended. Move "b" to a later wave, or break the chain.',
            ],
            [
                14,
                'NL.E1103',
                'Item "c" (wave "w1") could never start: through a2 (wave "w2") → g → c, it waits for work that cannot start until wave "w1" has ended. Move "c" to a later wave, or break the chain.',
            ],
        ]);
    });

    it('cascade: a violation reached only through an explained one is folded', async () => {
        const ds = await check(
            src(
                'swimlane a',
                '  item a1 duration:1w wave:w2',
                '  item a2 duration:1w wave:w1',
                'swimlane b',
                '  item b1 duration:1w wave:w1 after:a2',
            ),
        );
        // b1 sits in another lane, so it is folded but not listed.
        expect(ds.map((d) => [d.line, d.code, d.message.split('. ')[0]])).toEqual([
            [10, 'NL.E1103', 'Item "a2" (wave "w1") comes after "a1" (wave "w2") in swimlane "a"'],
        ]);
    });

    it('a cause of its own is reported even after an explained violation', async () => {
        // c follows the violating b, but its after:w1 is a second root cause.
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w2',
                '  item b duration:1w wave:w1',
                '  item c duration:1w wave:w1 after:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split(' ')[0]])).toEqual([
            [10, 'NL.E1103', 'Item'],
            [11, 'NL.E1103', 'Item'],
        ]);
        expect(ds[1].message).toMatch(/^Item "c" \(wave "w1"\) has after:w1, but work cannot wait/);
    });

    it('join: a named block and a group track', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  parallel streams',
                '    group api-track wave:w2',
                '      item api-v2 duration:2w',
                '    item sdk duration:2w wave:w1',
                '  item integration duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                13,
                'NL.E1103',
                'Item "integration" (wave "w1") comes after parallel "streams" in swimlane "s", and that block cannot end before its track "api-track" (wave "w2") does. Move "integration" above the block or into a track of its own, or change one of their waves.',
            ],
        ]);
    });

    it('join: a block with no id or title is named by position', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item lead duration:1w wave:w1',
                '  parallel',
                '    item p1 duration:2w wave:w2',
                '    item p2 duration:1w wave:w1',
                '  item tail duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code])).toEqual([[13, 'NL.E1103']]);
        expect(ds[0].message).toMatch(
            /^Item "tail" \(wave "w1"\) comes after the parallel block on line 10 in swimlane "s", and that block cannot end before its track "p1" \(wave "w2"\) does\./,
        );
    });

    it('join: tracks of two waves after the block get one report per wave', async () => {
        const ds = await check(
            src3(
                'swimlane s',
                '  parallel streams',
                '    item hi duration:2w wave:w3',
                '    item lo duration:1w wave:w1',
                '  parallel next',
                '    item a duration:1w wave:w1',
                '    item b duration:1w wave:w2',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split(', and')[0]])).toEqual([
            [14, 'NL.E1103', 'Item "a" (wave "w1") comes after parallel "streams" in swimlane "s"'],
            [15, 'NL.E1103', 'Item "b" (wave "w2") comes after parallel "streams" in swimlane "s"'],
        ]);
    });

    it('after-item: container form on a named group, reported once', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w2',
                'swimlane t',
                '  group g after:a',
                '    item b duration:1w wave:w1',
                '    item c duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                11,
                'NL.E1103',
                'Group "g" has after:a, but "a" is in later wave "w2". Wave "w2" cannot start until wave "w1" ends, so "b" (wave "w1") inside it could never start: move "b" to wave "w2" or later, or remove the after:.',
            ],
        ]);
    });

    it('after-item: container form on an unnamed parallel is named by line', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w2',
                'swimlane t',
                '  parallel after:a',
                '    item b duration:1w wave:w1',
                '    item c duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split('. ')[0]])).toEqual([
            [
                11,
                'NL.E1103',
                'The parallel block on line 11 has after:a, but "a" is in later wave "w2"',
            ],
        ]);
    });

    it('after-wave: container form on a named parallel, reported once', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  parallel p wave:w1 after:w1',
                '    item a duration:1w',
                '    item b duration:1w',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                9,
                'NL.E1103',
                'Parallel "p" (wave "w1") has after:w1, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move the parallel to a later wave.',
            ],
        ]);
    });

    it('after-wave: container form on an unnamed group is named by line', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  group wave:w2 after:w2',
                '    item a duration:1w',
                '    item b duration:1w',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                9,
                'NL.E1103',
                'The group on line 9 (wave "w2") has after:w2, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move the group to a later wave.',
            ],
        ]);
    });

    it('after-wave: on a container without a wave of its own, the item form', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  group g after:w1',
                '    item a1 duration:1w wave:w1',
                '    item a2 duration:1w wave:w2',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                9,
                'NL.E1103',
                'Item "a1" (wave "w1") has after:w1, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move "a1" to a later wave.',
            ],
        ]);
    });

    it('after: an earlier wave or same-wave work is fine', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1',
                '  item b duration:1w wave:w2 after:w1',
                'swimlane t',
                '  item c duration:1w wave:w1 after:a',
                '  item d duration:1w after:w2',
            ),
        );
        expect(ds).toEqual([]);
    });

    it('a date: pin replaces the flow, so it does not order the item', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w2',
                '  item b duration:1w wave:w1 date:2026-01-05',
            ),
        );
        expect(ds).toEqual([]);
    });

    it('cyclic after: input terminates and leaves the cycle to the cycle check', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1 after:c',
                '  item b duration:1w wave:w2 after:a',
                '  item c duration:1w wave:w1 after:b',
            ),
        );
        // a's after:c closes the cycle: no NL.W1101 for it. c's after:b is a
        // real ordering error of its own.
        expect(ds.map((d) => [d.line, d.code ?? d.message.split(':')[0]])).toEqual([
            [3, 'Circular dependency detected'],
            [11, 'NL.E1103'],
        ]);
    });
});

describe('waves order: WV11 NL.W1100', () => {
    it('before: a wave: warns when the entity is in that wave or a later one', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w2 before:w2',
                'swimlane t',
                '  item b duration:1w wave:w1 before:w2',
                '  item c duration:1w wave:w1 before:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                9,
                'NL.W1100',
                'before:w2 on "a" can never be met: "a" is in wave "w2", which cannot finish before wave "w2" starts. The overrun will be painted.',
            ],
            [
                12,
                'NL.W1100',
                'before:w1 on "c" can never be met: "c" is in wave "w1", which cannot finish before wave "w1" starts. The overrun will be painted.',
            ],
        ]);
    });

    it('before: earlier work: compares the latest wave of the entity with the earliest of the target', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1',
                'swimlane t',
                '  group g before:a',
                '    item g1 duration:1w wave:w1',
                '    item g2 duration:1w wave:w2',
                '  item ok duration:1w wave:w2 before:g',
            ),
        );
        // g reaches w2, after a's w1; ok (w2) is after g's earliest wave (w1).
        expect(ds.map((d) => [d.line, d.code, d.message.split(':')[0]])).toEqual([
            [11, 'NL.W1100', 'before'],
            [14, 'NL.W1100', 'before'],
        ]);
        expect(ds[0].message).toBe(
            'before:a on "g" can never be met: "g" is in wave "w2", which cannot start until "a" (wave "w1") has finished. The overrun will be painted.',
        );
    });

    it('skips background subtrees, dates, anchors and same-wave targets', async () => {
        const ds = await check(
            'nowline v1\n\nroadmap r "R" start:2026-01-05 scale:1w\n\n' +
                'anchor freeze date:2026-03-02\n\nwave w1\nwave w2\n\n' +
                'swimlane s\n' +
                '  item a duration:1w wave:w1\n' +
                '  item bg duration:1w before:a\n' +
                '  group bgg before:a\n    item x duration:1w\n' +
                '  item b duration:1w wave:w2 before:freeze\n' +
                '  item c duration:1w wave:w2 before:2026-06-01\n' +
                'swimlane t\n' +
                '  item d duration:1w wave:w1 before:a\n',
        );
        expect(ds).toEqual([]);
    });
});

describe('waves order: WV12 NL.W1101', () => {
    it('forward-flow: a later item in the same group', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  group g',
                '    item a duration:1w wave:w1 after:b',
                '    item b duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                10,
                'NL.W1101',
                'after:b on "a" refers to "b", which comes later in group "g". Layout ignores references to work it has not placed yet, so it ignores this after:. Move "b" above "a", or remove the after:.',
            ],
        ]);
    });

    it('forward-flow: a before: on a later item in the lane; ancestor: an enclosing container', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1 before:b',
                '  item b duration:1w wave:w1',
                '  group g',
                '    item c duration:1w wave:w1 after:g',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message.split('. ')[0]])).toEqual([
            [9, 'NL.W1101', 'before:b on "a" refers to "b", which comes later in swimlane "s"'],
            // Layout registers a group's id only once its content is placed.
            [12, 'NL.W1101', 'after:g on "c" refers to "g", which contains it'],
        ]);
    });

    it('ancestor: after: or before: its own group or parallel, at any depth', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  parallel p',
                '    group g',
                '      item a duration:1w wave:w1 after:g',
                '      item b duration:1w wave:w1 before:p',
                '    item c duration:1w wave:w1',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                11,
                'NL.W1101',
                'after:g on "a" refers to "g", which contains it. Layout ignores references to an enclosing group or parallel, so it ignores this after:. Remove the after:.',
            ],
            [
                12,
                'NL.W1101',
                'before:p on "b" refers to "p", which contains it. Layout ignores references to an enclosing group or parallel, so it ignores this before:. Remove the before:.',
            ],
        ]);
    });

    it('an unnamed group or parallel owner is named by position', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1',
                '  group before:a',
                '    item g1 duration:1w wave:w2',
                '  parallel after:z',
                '    item p1 duration:1w wave:w2',
                '    item p2 duration:1w wave:w2',
                '  item z duration:1w wave:w2',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                10,
                'NL.W1100',
                'before:a on the group on line 10 can never be met: the group on line 10 is in wave "w2", which cannot start until "a" (wave "w1") has finished. The overrun will be painted.',
            ],
            [
                12,
                'NL.W1101',
                'after:z on the parallel block on line 12 refers to "z", which comes later in swimlane "s". Layout ignores references to work it has not placed yet, so it ignores this after:. Move "z" above the parallel block on line 12, or remove the after:.',
            ],
        ]);
    });

    it('floating-milestone: after: and before: a milestone without a date', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1',
                '  item b duration:1w wave:w2 after:m',
                '  item c duration:1w wave:w2 before:m',
                '',
                'milestone m "M" after:a',
                'milestone dated "D" date:2026-03-02',
                'swimlane t',
                '  item d duration:1w wave:w2 after:dated',
            ),
        );
        expect(ds.map((d) => [d.line, d.code, d.message])).toEqual([
            [
                10,
                'NL.W1101',
                'after:m on "b" refers to milestone "m", which has no date. Floating milestones are placed after all work, so layout ignores this after:. Reference the milestone\'s predecessors or a wave instead.',
            ],
            [
                11,
                'NL.W1101',
                'before:m on "c" refers to milestone "m", which has no date. Floating milestones are placed after all work, so layout ignores this before:. Reference the milestone\'s predecessors or a wave instead.',
            ],
        ]);
    });

    it('a forward reference that closes an explicit cycle is left to the cycle check', async () => {
        const ds = await check(
            src(
                'swimlane s',
                '  item a duration:1w wave:w1 after:m',
                '',
                'milestone m "M" after:a',
            ),
        );
        expect(ds.map((d) => d.message.split(':')[0])).toEqual(['Circular dependency detected']);
    });

    it('swimlane after:/before: are not checked', async () => {
        const ds = await check(
            src(
                'swimlane s after:t',
                '  item a duration:1w wave:w1',
                'swimlane t',
                '  item b duration:1w wave:w1',
            ),
        );
        expect(ds).toEqual([]);
    });

    it('a roadmap without waves gets no order diagnostics', async () => {
        const ds = await check(
            'nowline v1\n\nroadmap r "R" start:2026-01-05 scale:1w\n\n' +
                'swimlane s\n  item a duration:1w after:b before:m\n  item b duration:1w\n\n' +
                'milestone m "M" after:b\n',
        );
        expect(ds).toEqual([]);
    });
});

describe('waves order: evaluateWaveOrder on a scope of lanes', () => {
    const WAVES = 'wave w1\nwave w2\n\n';
    const fileA = `nowline v1\n\nroadmap a "A" start:2026-01-05\n\n${WAVES}swimlane a\n  item x duration:1w wave:w1\n`;
    const fileB =
        `nowline v1\n\nroadmap b "B" start:2026-01-05\n\n${WAVES}` +
        `swimlane b\n` +
        `  item z duration:1w wave:w1 after:x\n` +
        `  item x duration:1w wave:w2\n` +
        `swimlane c\n` +
        `  item y duration:1w wave:w1 after:x\n`;

    async function scopeOf(...texts: string[]) {
        const files = await Promise.all(texts.map((t) => parse(t, { validate: false })));
        const lookups = files.map((f) => fileRefLookup(f.ast));
        return {
            files,
            scope: {
                lanes: files.flatMap((f) => f.ast.roadmapEntries.filter(isSwimlaneDeclaration)),
                // Merged ids: the last file that declares one wins.
                lookup: (id: string) => {
                    let found: ReturnType<WaveRefLookup>;
                    for (const l of lookups) found = l(id) ?? found;
                    return found;
                },
            },
            waves: ownWaves(files[0].ast),
        };
    }

    function render(f: WaveFinding): string {
        return 'code' in f ? tr('en-US', f.code, f.args as never) : f.message;
    }

    it('resolves a reused id to the last one placed before the reference', async () => {
        const { files, scope, waves } = await scopeOf(fileA, fileB);
        const findings = evaluateWaveOrder(scope, waves);
        // z reads x before B's x is placed: it resolves to A's x (w1), fine.
        // y reads x after B's x (w2) is placed: last writer wins.
        expect(findings.map((f) => ('code' in f ? f.code : ''))).toEqual(['NL.E1103']);
        expect(render(findings[0])).toBe(
            'Item "y" (wave "w1") has after:x, but "x" is in later wave "w2". Wave "w2" cannot start until wave "w1" ends, so "y" could never start: move it to wave "w2" or later, or remove the after:.',
        );
        expect(AstUtils.getDocument(findings[0].node).uri.toString()).toBe(
            files[1].ast.$document?.uri.toString(),
        );
    });

    it('on its own, the second file has no finding for z: its x is a forward reference', async () => {
        const { scope, waves } = await scopeOf(fileB);
        const findings = evaluateWaveOrder(scope, waves);
        expect(findings.map((f) => ('code' in f ? [f.code, f.args] : []))).toEqual([
            [
                'NL.W1101',
                {
                    reason: 'forward-flow',
                    key: 'after',
                    ref: 'x',
                    name: 'z',
                    flow: { kind: 'swimlane', name: 'b' },
                },
            ],
            [
                'NL.E1103',
                {
                    reason: 'after-item',
                    name: 'y',
                    wave: 'w1',
                    refId: 'x',
                    ref: 'x',
                    refWave: 'w2',
                },
            ],
        ]);
    });

    it('returns nothing when there are no waves', async () => {
        const { scope } = await scopeOf(fileB);
        expect(evaluateWaveOrder(scope, [])).toEqual([]);
    });
});
