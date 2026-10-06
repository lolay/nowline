// Wave diagnostics (NL.E1100-E1106, NL.W1100/W1101, NL.W0702, NL.E0202,
// NL.W0701, NL.W1001/W1002, NL.I1006/I1007, and the NL.E0411 rewrite).
// en-US strings are asserted verbatim against specs/waves.md section 6.4 and
// the worked examples; fr is asserted structurally (every variant renders,
// and it follows the U+00A0 punctuation convention of messages.fr.ts).

import { describe, expect, it } from 'vitest';
import { ALL_CODES, type MessageCode } from '../../src/i18n/codes.js';
import { type MessageArgs, tr } from '../../src/i18n/index.js';
import type { FlowRef, WaveKind } from '../../src/i18n/wave-message-types.js';

const en = <K extends MessageCode>(code: K, ...args: MessageArgs<K>) => tr('en-US', code, ...args);
const fr = <K extends MessageCode>(code: K, ...args: MessageArgs<K>) => tr('fr', code, ...args);

const swimlaneA: FlowRef = { kind: 'swimlane', name: 'a' };

describe('wave codes are registered', () => {
    const waveCodes: MessageCode[] = [
        'NL.E0202',
        'NL.W0701',
        'NL.W0702',
        'NL.E1100',
        'NL.E1101',
        'NL.E1102',
        'NL.E1103',
        'NL.E1104',
        'NL.E1105',
        'NL.E1106',
        'NL.W1001',
        'NL.W1002',
        'NL.W1100',
        'NL.W1101',
        'NL.I1006',
        'NL.I1007',
    ];
    it('lists every wave code in ALL_CODES', () => {
        for (const code of waveCodes) expect(ALL_CODES).toContain(code);
    });
});

describe('NL.E1100', () => {
    it('labels the wave by title', () => {
        expect(en('NL.E1100', { title: 'Wave 2', line: 7 })).toBe(
            'Wave "Wave 2" needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".',
        );
    });
    it('labels the wave by line when it has no title', () => {
        expect(en('NL.E1100', { line: 7 })).toBe(
            'Wave on line 7 needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".',
        );
    });
});

describe('NL.E1101', () => {
    it('list', () => {
        expect(en('NL.E1101', { reason: 'list', value: '[w1, w2]' })).toBe(
            '"wave:" takes exactly one wave id; an item belongs to at most one wave. Got "[w1, w2]".',
        );
    });
    it('unknown, no suggestion', () => {
        expect(
            en('NL.E1101', {
                reason: 'unknown',
                value: 'w9',
                declared: ['w1', 'w2', 'w3', 'w4'],
            }),
        ).toBe(
            'Wave "w9" is not declared. Declared waves: w1, w2, w3, w4. Add "wave w9" above the first swimlane that uses it.',
        );
    });
    it('unknown with a titled and an untitled suggestion', () => {
        expect(
            en('NL.E1101', {
                reason: 'unknown',
                value: 'bild',
                declared: ['build'],
                suggestion: { id: 'build', title: 'Build' },
            }),
        ).toMatch(/uses it\. Did you mean wave:build \("Build"\)\?$/);
        expect(
            en('NL.E1101', {
                reason: 'unknown',
                value: 'bild',
                declared: ['build'],
                suggestion: { id: 'build' },
            }),
        ).toMatch(/uses it\. Did you mean wave:build\?$/);
    });
    it('unknown with no declared waves renders none', () => {
        expect(en('NL.E1101', { reason: 'unknown', value: 'w1', declared: [] })).toContain(
            'Declared waves: none.',
        );
    });
    it('forward', () => {
        expect(en('NL.E1101', { reason: 'forward', value: 'w4', line: 19 })).toBe(
            'Wave "w4" is used before its declaration on line 19. Declare waves above the swimlanes that use them.',
        );
    });
    it('not-a-wave renders the kind with an article', () => {
        expect(en('NL.E1101', { reason: 'not-a-wave', value: 'a1', kind: 'item' })).toBe(
            '"wave:" must name a wave, but "a1" is an item.',
        );
        expect(
            en('NL.E1101', {
                reason: 'not-a-wave',
                value: 'gate',
                kind: 'floating-milestone',
                suggestion: { id: 'w1' },
            }),
        ).toBe(
            '"wave:" must name a wave, but "gate" is a milestone without a date. Did you mean wave:w1?',
        );
    });
});

describe('NL.E1102', () => {
    it('Example 20 line 14', () => {
        expect(
            en('NL.E1102', {
                entity: { kind: 'item', name: 'a2' },
                wave: 'w2',
                container: { kind: 'group', name: 'g' },
                containerWave: 'w1',
            }),
        ).toBe(
            'Item "a2" has wave:w2, but its enclosing group "g" has wave:w1. A container\'s wave applies to everything inside it; remove one of the two wave: properties.',
        );
    });
    it('names unnamed containers by line', () => {
        expect(
            en('NL.E1102', {
                entity: { kind: 'group', name: '', line: 4 },
                wave: 'w2',
                container: { kind: 'parallel', name: '', line: 3 },
                containerWave: 'w1',
            }),
        ).toMatch(
            /^The group on line 4 has wave:w2, but its enclosing parallel block on line 3 has wave:w1\./,
        );
    });
});

describe('NL.E1103', () => {
    it('sequence, plural (Example 13)', () => {
        expect(
            en('NL.E1103', {
                reason: 'sequence',
                items: ['a2', 'a3'],
                itemWave: 'w1',
                ref: 'a1',
                refWave: 'w2',
                flow: swimlaneA,
                last: 'a3',
            }),
        ).toBe(
            'Items "a2", "a3" (wave "w1") come after "a1" (wave "w2") in swimlane "a". Work in a lane or group runs in order, so it must also be ordered by wave: move "a1" below "a3", or change their waves.',
        );
    });
    it('sequence, singular', () => {
        expect(
            en('NL.E1103', {
                reason: 'sequence',
                items: ['a2'],
                itemWave: 'w1',
                ref: 'a1',
                refWave: 'w2',
                flow: { kind: 'group', name: 'g' },
                last: 'a2',
            }),
        ).toBe(
            'Item "a2" (wave "w1") comes after "a1" (wave "w2") in group "g". Work in a lane or group runs in order, so it must also be ordered by wave: move "a1" below "a2", or change their waves.',
        );
    });
    it('sequence, after an unnamed group or parallel named by position', () => {
        expect(
            en('NL.E1103', {
                reason: 'sequence',
                items: ['a3', 'a4'],
                itemWave: 'w1',
                ref: { kind: 'group-block', line: 11 },
                refWave: 'w2',
                flow: { kind: 'swimlane', name: 's' },
                last: 'a4',
            }),
        ).toBe(
            'Items "a3", "a4" (wave "w1") come after the group on line 11 (wave "w2") in swimlane "s". Work in a lane or group runs in order, so it must also be ordered by wave: move the group on line 11 below "a4", or change their waves.',
        );
        expect(
            fr('NL.E1103', {
                reason: 'sequence',
                items: ['a'],
                itemWave: 'w1',
                ref: { kind: 'parallel-block', line: 9 },
                refWave: 'w2',
                flow: { kind: 'swimlane', name: 's' },
                last: 'a',
            }),
        ).toMatch(
            /après le bloc parallèle à la ligne 9 \(vague .*déplacez le bloc parallèle à la ligne 9 sous /,
        );
    });
    it('join, with an unnamed parallel block', () => {
        expect(
            en('NL.E1103', {
                reason: 'join',
                name: 'a3',
                wave: 'w1',
                block: { kind: 'parallel-block', line: 8 },
                flow: swimlaneA,
                track: 'a2',
                trackWave: 'w2',
            }),
        ).toBe(
            'Item "a3" (wave "w1") comes after the parallel block on line 8 in swimlane "a", and that block cannot end before its track "a2" (wave "w2") does. Move "a3" above the block or into a track of its own, or change one of their waves.',
        );
    });
    it('after-item (Example 14 line 12)', () => {
        expect(
            en('NL.E1103', {
                reason: 'after-item',
                name: 'b',
                wave: 'w1',
                refId: 'a',
                ref: 'a',
                refWave: 'w2',
            }),
        ).toBe(
            'Item "b" (wave "w1") has after:a, but "a" is in later wave "w2". Wave "w2" cannot start until wave "w1" ends, so "b" could never start: move it to wave "w2" or later, or remove the after:.',
        );
    });
    it('after-item, container form', () => {
        expect(
            en('NL.E1103', {
                reason: 'after-item',
                name: 'b',
                wave: 'w1',
                refId: 'a',
                ref: 'a',
                refWave: 'w2',
                container: { kind: 'group', name: 'g' },
            }),
        ).toBe(
            'Group "g" has after:a, but "a" is in later wave "w2". Wave "w2" cannot start until wave "w1" ends, so "b" (wave "w1") inside it could never start: move "b" to wave "w2" or later, or remove the after:.',
        );
    });
    it('after-wave (Example 14 line 13)', () => {
        expect(en('NL.E1103', { reason: 'after-wave', name: 'c', wave: 'w1', refId: 'w1' })).toBe(
            'Item "c" (wave "w1") has after:w1, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move "c" to a later wave.',
        );
    });
    it('after-wave, container form', () => {
        expect(
            en('NL.E1103', {
                reason: 'after-wave',
                name: 'c',
                wave: 'w1',
                refId: 'w1',
                container: { kind: 'parallel', name: 'p' },
            }),
        ).toBe(
            'Parallel "p" (wave "w1") has after:w1, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move the parallel to a later wave.',
        );
    });
    it('after-item and after-wave name an unnamed container by line', () => {
        expect(
            en('NL.E1103', {
                reason: 'after-item',
                name: 'b',
                wave: 'w1',
                refId: 'a',
                ref: 'a',
                refWave: 'w2',
                container: { kind: 'group', name: '', line: 5 },
            }),
        ).toMatch(/^The group on line 5 has after:a, but "a" is in later wave "w2"\./);
        expect(
            en('NL.E1103', {
                reason: 'after-wave',
                name: 'c',
                wave: 'w1',
                refId: 'w1',
                container: { kind: 'parallel', name: '', line: 7 },
            }),
        ).toMatch(/^The parallel block on line 7 \(wave "w1"\) has after:w1,/);
        expect(
            fr('NL.E1103', {
                reason: 'after-wave',
                name: 'c',
                wave: 'w1',
                refId: 'w1',
                container: { kind: 'parallel', name: '', line: 7 },
            }),
        ).toMatch(/^Le bloc parallèle à la ligne 7 \(vague/);
    });
    it('chain (Example 15)', () => {
        expect(
            en('NL.E1103', {
                reason: 'chain',
                name: 'b1',
                wave: 'w1',
                chain: ['a2 (wave "w2")', 'review', 'b1'],
            }),
        ).toBe(
            'Item "b1" (wave "w1") could never start: through a2 (wave "w2") → review → b1, it waits for work that cannot start until wave "w1" has ended. Move "b1" to a later wave, or break the chain.',
        );
    });
});

describe('NL.E1104', () => {
    it('swimlane (Example 20 line 11)', () => {
        expect(en('NL.E1104', { reason: 'swimlane', name: 'a', value: 'w1' })).toBe(
            '"wave:" is not allowed on swimlane "a": a swimlane spans every wave. Put wave: on its items, or wrap them in "group wave:w1".',
        );
    });
    it('milestone (Example 20 line 21)', () => {
        expect(en('NL.E1104', { reason: 'milestone', name: 'm', value: 'w1' })).toBe(
            '"wave:" is not allowed on milestone "m". To place a milestone at the end of a wave, use after:w1.',
        );
    });
    it('other renders the plain noun', () => {
        const nouns: Array<[WaveKind, string]> = [
            ['anchor', 'anchor'],
            ['footnote', 'footnote'],
            ['roadmap', 'roadmap'],
            ['person', 'person'],
            ['team', 'team'],
            ['label', 'label'],
            ['size', 'size'],
            ['status', 'status'],
            ['wave', 'wave'],
        ];
        for (const [type, noun] of nouns) {
            expect(en('NL.E1104', { reason: 'other', type, name: 'x' })).toBe(
                `"wave:" is not allowed on ${noun} "x"; only item, group, and parallel can belong to a wave.`,
            );
        }
    });
});

describe('NL.E1105', () => {
    it('before (Example 20 line 8)', () => {
        expect(en('NL.E1105', { reason: 'before', name: 'w2' })).toBe(
            '"before:" is not allowed on wave "w2". A wave\'s end comes from its items; to give a wave a deadline, add a dated milestone: milestone w2-due date:<YYYY-MM-DD> after:w2.',
        );
    });
    it('other', () => {
        expect(en('NL.E1105', { reason: 'other', key: 'duration', name: 'w2' })).toBe(
            '"duration:" is not allowed on wave "w2". A wave\'s span comes from its items; only after: (an anchor, a dated milestone, or one ISO date) can hold back a wave\'s start.',
        );
    });
});

describe('NL.E1106', () => {
    it('Example 20 line 9', () => {
        expect(en('NL.E1106', { name: 'w3', ref: 'a1', kind: 'item' })).toBe(
            'Wave "w3" has after:a1, but "a1" is an item. A wave\'s after: accepts only anchors, dated milestones, or one ISO date; to make a wave wait for work, put that work in an earlier wave.',
        );
    });
    it('renders every kind with an article', () => {
        const kinds: Record<WaveKind, string> = {
            item: 'an item',
            group: 'a group',
            parallel: 'a parallel block',
            swimlane: 'a swimlane',
            anchor: 'an anchor',
            milestone: 'a milestone',
            'floating-milestone': 'a milestone without a date',
            wave: 'a wave',
            label: 'a label',
            size: 'a size',
            status: 'a status',
            person: 'a person',
            team: 'a team',
            footnote: 'a footnote',
            roadmap: 'the roadmap',
            style: 'a style',
            symbol: 'a symbol',
        };
        for (const [kind, text] of Object.entries(kinds)) {
            expect(en('NL.E1106', { name: 'w', ref: 'x', kind: kind as WaveKind })).toContain(
                `but "x" is ${text}. A wave's after:`,
            );
        }
    });
});

describe('NL.W1100', () => {
    it('item (Example 14 line 16)', () => {
        expect(
            en('NL.W1100', { reason: 'item', ref: 'b', name: 'd', wave: 'w2', refWave: 'w1' }),
        ).toBe(
            'before:b on "d" can never be met: "d" is in wave "w2", which cannot start until "b" (wave "w1") has finished. The overrun will be painted.',
        );
    });
    it('wave', () => {
        expect(en('NL.W1100', { reason: 'wave', ref: 'w1', name: 'd', wave: 'w2' })).toBe(
            'before:w1 on "d" can never be met: "d" is in wave "w2", which cannot finish before wave "w1" starts. The overrun will be painted.',
        );
    });
    it('an unnamed group or parallel owner is named by position', () => {
        expect(
            en('NL.W1100', {
                reason: 'item',
                ref: 'a',
                name: '',
                kind: 'group',
                line: 10,
                wave: 'w2',
                refWave: 'w1',
            }),
        ).toBe(
            'before:a on the group on line 10 can never be met: the group on line 10 is in wave "w2", which cannot start until "a" (wave "w1") has finished. The overrun will be painted.',
        );
        expect(
            en('NL.W1100', {
                reason: 'wave',
                ref: 'w1',
                name: '',
                kind: 'parallel',
                line: 3,
                wave: 'w2',
            }),
        ).toBe(
            'before:w1 on the parallel block on line 3 can never be met: the parallel block on line 3 is in wave "w2", which cannot finish before wave "w1" starts. The overrun will be painted.',
        );
        expect(
            fr('NL.W1100', {
                reason: 'wave',
                ref: 'w1',
                name: '',
                kind: 'parallel',
                line: 3,
                wave: 'w2',
            }),
        ).toBe(
            'before:w1 sur le bloc parallèle à la ligne 3 ne peut jamais être respecté\u00A0: le bloc parallèle à la ligne 3 est dans la vague \u00AB\u00A0w2\u00A0\u00BB, qui ne peut pas se terminer avant le début de la vague \u00AB\u00A0w1\u00A0\u00BB. Le dépassement sera peint.',
        );
    });
});

describe('NL.W1101', () => {
    it('forward-lane (Example 7)', () => {
        expect(
            en('NL.W1101', {
                reason: 'forward-lane',
                key: 'after',
                ref: 'schema',
                name: 'forms',
                lane: 'backend',
                ownLane: 'frontend',
            }),
        ).toBe(
            'after:schema on "forms" refers to "schema", which is in a later swimlane ("backend"). Layout places swimlanes in order and ignores references to work it has not placed yet, so it ignores this after:. Move swimlane "backend" above swimlane "frontend", or remove the after:.',
        );
    });
    it('forward-flow', () => {
        expect(
            en('NL.W1101', {
                reason: 'forward-flow',
                key: 'before',
                ref: 'b',
                name: 'a',
                flow: { kind: 'group-block', line: 5 },
            }),
        ).toBe(
            'before:b on "a" refers to "b", which comes later in the group on line 5. Layout ignores references to work it has not placed yet, so it ignores this before:. Move "b" above "a", or remove the before:.',
        );
    });
    it('ancestor', () => {
        expect(en('NL.W1101', { reason: 'ancestor', key: 'after', ref: 'g', name: 'a' })).toBe(
            'after:g on "a" refers to "g", which contains it. Layout ignores references to an enclosing group or parallel, so it ignores this after:. Remove the after:.',
        );
    });
    it('ancestor (fr)', () => {
        expect(fr('NL.W1101', { reason: 'ancestor', key: 'before', ref: 'p', name: 'b' })).toBe(
            'before:p sur \u00AB\u00A0b\u00A0\u00BB référence \u00AB\u00A0p\u00A0\u00BB, qui le contient. La mise en page ignore les références à un groupe ou un bloc parallèle englobant, elle ignore donc ce before:. Retirez le before:.',
        );
    });
    it('an unnamed group or parallel owner is named by position', () => {
        expect(
            en('NL.W1101', {
                reason: 'forward-flow',
                key: 'after',
                ref: 'z',
                name: '',
                kind: 'parallel',
                line: 12,
                flow: swimlaneA,
            }),
        ).toBe(
            'after:z on the parallel block on line 12 refers to "z", which comes later in swimlane "a". Layout ignores references to work it has not placed yet, so it ignores this after:. Move "z" above the parallel block on line 12, or remove the after:.',
        );
        expect(
            en('NL.W1101', {
                reason: 'ancestor',
                key: 'after',
                ref: 'p',
                name: '',
                kind: 'group',
                line: 4,
            }),
        ).toMatch(/^after:p on the group on line 4 refers to "p", which contains it\./);
        expect(
            fr('NL.W1101', {
                reason: 'forward-flow',
                key: 'after',
                ref: 'z',
                name: '',
                kind: 'group',
                line: 4,
                flow: swimlaneA,
            }),
        ).toContain('Déplacez \u00AB\u00A0z\u00A0\u00BB au-dessus du groupe à la ligne 4,');
        expect(
            fr('NL.W1101', {
                reason: 'forward-flow',
                key: 'after',
                ref: 'z',
                name: 'y',
                flow: swimlaneA,
            }),
        ).toContain('Déplacez \u00AB\u00A0z\u00A0\u00BB au-dessus de \u00AB\u00A0y\u00A0\u00BB,');
        expect(
            fr('NL.W1101', {
                reason: 'floating-milestone',
                key: 'after',
                ref: 'm',
                name: '',
                kind: 'parallel',
                line: 6,
            }),
        ).toMatch(/^after:m sur le bloc parallèle à la ligne 6 référence le jalon/);
    });
    it('floating-milestone', () => {
        expect(
            en('NL.W1101', { reason: 'floating-milestone', key: 'after', ref: 'm', name: 'a' }),
        ).toBe(
            'after:m on "a" refers to milestone "m", which has no date. Floating milestones are placed after all work, so layout ignores this after:. Reference the milestone\'s predecessors or a wave instead.',
        );
    });
});

describe('NL.W0702 (Example 21)', () => {
    const tail =
        ' is ignored: this roadmap declares no waves. Declare waves with "wave <id>" to use it, or remove the property.';
    it('renders the target', () => {
        expect(en('NL.W0702', { target: { kind: 'item', name: 'a1' } })).toBe(
            `"wave:" on item "a1"${tail}`,
        );
        expect(en('NL.W0702', { target: { kind: 'swimlane', name: 'a' } })).toBe(
            `"wave:" on swimlane "a"${tail}`,
        );
        expect(en('NL.W0702', { target: { kind: 'default', entityType: 'item' } })).toBe(
            `"wave:" on "default item"${tail}`,
        );
        expect(en('NL.W0702', { target: { kind: 'parallel', name: '', line: 14 } })).toBe(
            `"wave:" on the parallel block on line 14${tail}`,
        );
        expect(en('NL.W0702', { target: { kind: 'group', name: '', line: 3 } })).toBe(
            `"wave:" on the group on line 3${tail}`,
        );
    });
});

describe('NL.E0202 (Example 17)', () => {
    it('mismatch', () => {
        expect(
            en('NL.E0202', {
                reason: 'mismatch',
                path: './teams/legacy.nowline',
                child: ['discover', 'build'],
                parent: ['discover', 'build', 'launch'],
            }),
        ).toBe(
            'Included "./teams/legacy.nowline" declares waves [discover, build], but this file\'s waves are [discover, build, launch]. Every included roadmap must declare the same waves in the same order: copy this file\'s wave lines into "./teams/legacy.nowline".',
        );
    });
    it('child-none', () => {
        expect(
            en('NL.E0202', {
                reason: 'child-none',
                path: './teams/ops.nowline',
                parent: ['discover', 'build', 'launch'],
            }),
        ).toBe(
            'Included "./teams/ops.nowline" declares no waves, but this file\'s waves are [discover, build, launch]. Copy this file\'s wave lines into "./teams/ops.nowline" so its work joins the waves.',
        );
    });
    it('parent-none', () => {
        expect(
            en('NL.E0202', { reason: 'parent-none', path: './x.nowline', child: ['a', 'b'] }),
        ).toBe(
            'Included "./x.nowline" declares waves [a, b], but this file declares none. Declare the same waves here so the barriers apply to the whole roadmap.',
        );
    });
    it('floor', () => {
        expect(
            en('NL.E0202', {
                reason: 'floor',
                id: 'launch',
                path: './teams/infra.nowline',
                childFloor: '2026-03-09',
                parentFloor: '2026-03-02',
            }),
        ).toBe(
            'Wave "launch" in "./teams/infra.nowline" opens no earlier than 2026-03-09, but this file\'s wave "launch" opens no earlier than 2026-03-02. A wave must have the same start floor in every included roadmap.',
        );
    });
    it('a missing child floor reads grammatically', () => {
        expect(
            en('NL.E0202', {
                reason: 'floor',
                id: 'launch',
                path: './p',
                childFloor: null,
                parentFloor: '2026-03-02',
            }),
        ).toBe(
            'Wave "launch" in "./p" has no start floor, but this file\'s wave "launch" opens no earlier than 2026-03-02. A wave must have the same start floor in every included roadmap.',
        );
    });
    it('a missing parent floor reads grammatically', () => {
        expect(
            en('NL.E0202', {
                reason: 'floor',
                id: 'launch',
                path: './p',
                childFloor: '2026-03-09',
                parentFloor: null,
            }),
        ).toBe(
            'Wave "launch" in "./p" opens no earlier than 2026-03-09, but this file\'s wave "launch" has no start floor. A wave must have the same start floor in every included roadmap.',
        );
    });
});

describe('NL.W0701 (Example 17)', () => {
    it('renders the differing fields', () => {
        expect(
            en('NL.W0701', {
                id: 'discover',
                path: './teams/web.nowline',
                fields: [{ field: 'title', there: 'Discovery', here: 'Discover' }],
            }),
        ).toBe(
            'Wave "discover" in "./teams/web.nowline" differs from this file\'s definition (title "Discovery" there, "Discover" here); this file\'s definition is used.',
        );
    });
    it('joins several fields and renders an empty value as none', () => {
        const msg = en('NL.W0701', {
            id: 'w',
            path: './p',
            fields: [
                { field: 'style', there: '', here: 'accent' },
                { field: 'link', there: 'https://a', here: '' },
            ],
        });
        expect(msg).toContain(
            '(style none there, "accent" here; link "https://a" there, none here)',
        );
    });
});

describe('NL.W1001 / NL.W1002 (Example 9)', () => {
    it('W1001', () => {
        expect(
            en('NL.W1001', {
                name: 'a2',
                pin: '2026-01-19',
                key: 'date',
                wave: 'w2',
                start: '2026-02-02',
            }),
        ).toBe(
            'Item "a2" is pinned to 2026-01-19 (date:), but wave "w2" cannot start until 2026-02-02; the item starts at the wave start.',
        );
    });
    it('W1002', () => {
        expect(en('NL.W1002', { passes: 12 })).toBe(
            'Wave barriers did not settle after 12 layout passes, so the drawn schedule may not respect the wave order. The roadmap probably has an ordering conflict that validation did not catch.',
        );
    });
});

describe('NL.I1006 / NL.I1007', () => {
    it('one (Example 12)', () => {
        expect(en('NL.I1006', { reason: 'one', name: 'w2' })).toBe(
            'Wave "w2" has no items, so it spans no time; it is drawn as a marker in the wave strip and listed in the wave legend.',
        );
    });
    it('many', () => {
        expect(en('NL.I1006', { reason: 'many', names: ['w2', 'w3'] })).toBe(
            'Waves "w2", "w3" have no items, so they span no time; they are drawn as markers in the wave strip and listed in the wave legend.',
        );
    });
    it('all', () => {
        expect(en('NL.I1006', { reason: 'all', names: ['w1', 'w2'] })).toBe(
            'None of the declared waves ("w1", "w2") has items yet. The wave strip shows a placeholder until work is assigned with wave:<id>.',
        );
    });
    it('truncates names after five', () => {
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        expect(en('NL.I1006', { reason: 'many', names })).toContain(
            'Waves "a", "b", "c", "d", "e" and 2 more have no items',
        );
        expect(en('NL.I1006', { reason: 'all', names })).toContain(
            '("a", "b", "c", "d", "e" and 2 more)',
        );
        // exactly five is not truncated
        expect(en('NL.I1006', { reason: 'many', names: names.slice(0, 5) })).toContain(
            '"d", "e" have no items',
        );
    });
    it('I1007 (Example 11)', () => {
        expect(
            en('NL.I1007', {
                name: 'exec-done',
                date: '2026-03-16',
                wave: 'execute',
                end: '2026-03-23',
            }),
        ).toBe('Milestone "exec-done" (2026-03-16) is overrun: wave "execute" ends 2026-03-23.');
    });
});

describe('NL.E0411', () => {
    it('allows a wave after: and still names the disallowed type', () => {
        const msg = en('NL.E0411', { key: 'after', type: 'milestone' });
        expect(msg).toBe(
            'Inline date in "after:" is not allowed on milestone. Allowed only on item, parallel, and group, and on a wave\'s after:; for a milestone use "date:" instead.',
        );
        expect(msg).toMatch(/not allowed on milestone/i);
        expect(fr('NL.E0411', { key: 'after', type: 'milestone' })).toContain(
            "et sur le \u00AB\u00A0after:\u00A0\u00BB d'une vague",
        );
    });
});

describe('fr bundle', () => {
    const sample = (): Array<[MessageCode, string, string]> => {
        const out: Array<[MessageCode, string, string]> = [];
        const push = <K extends MessageCode>(code: K, ...args: MessageArgs<K>) =>
            out.push([code, fr(code, ...args), en(code, ...args)]);
        const flows: FlowRef[] = [
            swimlaneA,
            { kind: 'group', name: 'g' },
            { kind: 'parallel', name: 'p' },
            { kind: 'parallel-block', line: 3 },
            { kind: 'group-block', line: 4 },
        ];
        const kinds: WaveKind[] = [
            'item',
            'group',
            'parallel',
            'swimlane',
            'anchor',
            'milestone',
            'floating-milestone',
            'wave',
            'label',
            'size',
            'status',
            'person',
            'team',
            'footnote',
            'roadmap',
            'style',
            'symbol',
        ];
        push('NL.E1100', { title: 'Wave 2', line: 7 });
        push('NL.E1100', { line: 7 });
        push('NL.E1101', { reason: 'list', value: '[w1, w2]' });
        push('NL.E1101', { reason: 'unknown', value: 'w9', declared: ['w1'] });
        push('NL.E1101', { reason: 'unknown', value: 'w9', declared: [] });
        push('NL.E1101', {
            reason: 'unknown',
            value: 'bild',
            declared: ['build'],
            suggestion: { id: 'build', title: 'Build' },
        });
        push('NL.E1101', {
            reason: 'unknown',
            value: 'bild',
            declared: ['build'],
            suggestion: { id: 'build' },
        });
        push('NL.E1101', { reason: 'forward', value: 'w4', line: 19 });
        for (const kind of kinds) {
            push('NL.E1101', {
                reason: 'not-a-wave',
                value: 'x',
                kind,
                suggestion: { id: 'w1', title: 'One' },
            });
            push('NL.E1104', { reason: 'other', type: kind, name: 'x' });
            push('NL.E1106', { name: 'w', ref: 'x', kind });
        }
        for (const kind of ['item', 'group', 'parallel'] as const) {
            push('NL.E1102', {
                entity: { kind, name: 'e' },
                wave: 'w2',
                container: { kind: 'group', name: 'g' },
                containerWave: 'w1',
            });
            push('NL.E1102', {
                entity: { kind, name: '', line: 2 },
                wave: 'w2',
                container: { kind: 'parallel', name: '', line: 1 },
                containerWave: 'w1',
            });
        }
        for (const flow of flows) {
            push('NL.E1103', {
                reason: 'sequence',
                items: ['a2'],
                itemWave: 'w1',
                ref: 'a1',
                refWave: 'w2',
                flow,
                last: 'a2',
            });
            push('NL.E1103', {
                reason: 'sequence',
                items: ['a2', 'a3'],
                itemWave: 'w1',
                ref: 'a1',
                refWave: 'w2',
                flow,
                last: 'a3',
            });
            for (const ref of [
                { kind: 'group-block' as const, line: 5 },
                { kind: 'parallel-block' as const, line: 6 },
            ]) {
                push('NL.E1103', {
                    reason: 'sequence',
                    items: ['a2'],
                    itemWave: 'w1',
                    ref,
                    refWave: 'w2',
                    flow,
                    last: 'a2',
                });
            }
            push('NL.E1103', {
                reason: 'join',
                name: 'a3',
                wave: 'w1',
                block: flow,
                flow,
                track: 'a2',
                trackWave: 'w2',
            });
            push('NL.W1101', {
                reason: 'forward-flow',
                key: 'after',
                ref: 'b',
                name: 'a',
                flow,
            });
        }
        for (const container of [
            undefined,
            { kind: 'group' as const, name: 'g' },
            { kind: 'parallel' as const, name: 'p' },
            { kind: 'group' as const, name: '', line: 3 },
            { kind: 'parallel' as const, name: '', line: 4 },
        ]) {
            push('NL.E1103', {
                reason: 'after-item',
                name: 'b',
                wave: 'w1',
                refId: 'a',
                ref: 'a',
                refWave: 'w2',
                container,
            });
            push('NL.E1103', {
                reason: 'after-wave',
                name: 'c',
                wave: 'w1',
                refId: 'w1',
                container,
            });
        }
        push('NL.E1103', {
            reason: 'chain',
            name: 'b1',
            wave: 'w1',
            chain: ['a2 (wave "w2")', 'review', 'b1'],
        });
        push('NL.E1104', { reason: 'swimlane', name: 'a', value: 'w1' });
        push('NL.E1104', { reason: 'milestone', name: 'm', value: 'w1' });
        push('NL.E1105', { reason: 'before', name: 'w2' });
        push('NL.E1105', { reason: 'other', key: 'duration', name: 'w2' });
        push('NL.W1100', { reason: 'item', ref: 'b', name: 'd', wave: 'w2', refWave: 'w1' });
        push('NL.W1100', { reason: 'wave', ref: 'w1', name: 'd', wave: 'w2' });
        for (const key of ['after', 'before'] as const) {
            push('NL.W1101', {
                reason: 'forward-lane',
                key,
                ref: 's',
                name: 'f',
                lane: 'backend',
                ownLane: 'frontend',
            });
            push('NL.W1101', { reason: 'floating-milestone', key, ref: 'm', name: 'a' });
            push('NL.W1101', { reason: 'ancestor', key, ref: 'g', name: 'a' });
            push('NL.W1101', {
                reason: 'ancestor',
                key,
                ref: 'g',
                name: '',
                kind: 'group',
                line: 4,
            });
        }
        push('NL.W1100', {
            reason: 'item',
            ref: 'b',
            name: '',
            kind: 'group',
            line: 2,
            wave: 'w2',
            refWave: 'w1',
        });
        push('NL.W1100', {
            reason: 'wave',
            ref: 'w1',
            name: '',
            kind: 'parallel',
            line: 3,
            wave: 'w2',
        });
        for (const kind of [
            'item',
            'group',
            'parallel',
            'swimlane',
            'milestone',
            'anchor',
            'footnote',
            'roadmap',
            'person',
            'team',
            'label',
            'size',
            'status',
        ] as const) {
            push('NL.W0702', { target: { kind, name: 'x' } });
        }
        push('NL.W0702', { target: { kind: 'default', entityType: 'item' } });
        push('NL.W0702', { target: { kind: 'parallel', name: '', line: 4 } });
        push('NL.W0702', { target: { kind: 'anchor', name: '', line: 4 } });
        push('NL.E0202', { reason: 'mismatch', path: './p', child: ['a'], parent: ['a', 'b'] });
        push('NL.E0202', { reason: 'child-none', path: './p', parent: ['a'] });
        push('NL.E0202', { reason: 'parent-none', path: './p', child: ['a'] });
        push('NL.E0202', {
            reason: 'floor',
            id: 'w',
            path: './p',
            childFloor: '2026-03-09',
            parentFloor: null,
        });
        push('NL.E0202', {
            reason: 'floor',
            id: 'w',
            path: './p',
            childFloor: null,
            parentFloor: '2026-03-02',
        });
        push('NL.W0701', {
            id: 'w',
            path: './p',
            fields: [
                { field: 'title', there: 'A', here: 'B' },
                { field: 'style', there: '', here: 'x' },
                { field: 'labels', there: 'l', here: '' },
                { field: 'link', there: 'u', here: 'v' },
                { field: 'description', there: 'd', here: 'e' },
            ],
        });
        push('NL.W1001', {
            name: 'a2',
            pin: '2026-01-19',
            key: 'date',
            wave: 'w2',
            start: '2026-02-02',
        });
        push('NL.W1001', {
            name: 'a2',
            pin: '2026-01-19',
            key: 'start',
            wave: 'w2',
            start: '2026-02-02',
        });
        push('NL.W1002', { passes: 12 });
        push('NL.I1006', { reason: 'one', name: 'w2' });
        push('NL.I1006', { reason: 'many', names: ['w2', 'w3'] });
        push('NL.I1006', { reason: 'many', names: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
        push('NL.I1006', { reason: 'all', names: ['w1', 'w2'] });
        push('NL.I1006', { reason: 'all', names: ['a', 'b', 'c', 'd', 'e', 'f'] });
        push('NL.I1007', {
            name: 'exec-done',
            date: '2026-03-16',
            wave: 'execute',
            end: '2026-03-23',
        });
        push('NL.E0411', { key: 'after', type: 'milestone' });
        return out;
    };

    it('renders a French string (not the en fallback, not the bare code) for every variant', () => {
        for (const [code, msg, english] of sample()) {
            expect(msg, code).not.toBe(code);
            expect(msg.length, code).toBeGreaterThan(20);
            expect(msg, code).not.toBe(english);
        }
    });

    it('covers every new wave code', () => {
        const seen = new Set(sample().map(([code]) => code));
        for (const code of ALL_CODES) {
            if (/^NL\.(E110\d|W110\d|W100[12]|I100[67]|E0202|W070[12])$/.test(code)) {
                expect(seen.has(code), code).toBe(true);
            }
        }
    });

    it('uses U+00A0 punctuation spacing and guillemets', () => {
        for (const [code, msg] of sample()) {
            // No breaking space before high punctuation or inside guillemets.
            expect(msg, `${code}: ${msg}`).not.toMatch(/ [:;?!»]/);
            expect(msg, `${code}: ${msg}`).not.toMatch(/[^ ][;?!]/);
            expect(msg, `${code}: ${msg}`).not.toMatch(/«(?! )/);
            expect(msg, `${code}: ${msg}`).not.toMatch(/[^ ]»/);
            expect(msg, `${code}: ${msg}`).not.toMatch(/undefined|\[object/);
        }
    });

    it('translates a representative message', () => {
        expect(fr('NL.E1101', { reason: 'forward', value: 'w4', line: 19 })).toBe(
            'La vague « w4 » est utilisée avant sa déclaration à la ligne 19. Déclarez les vagues au-dessus des swimlanes qui les utilisent.',
        );
        expect(
            fr('NL.I1007', { name: 'm', date: '2026-03-16', wave: 'w', end: '2026-03-23' }),
        ).toBe(
            'Le jalon « m » (2026-03-16) est dépassé : la vague « w » se termine le 2026-03-23.',
        );
    });

    it('truncates names after five', () => {
        expect(
            fr('NL.I1006', { reason: 'many', names: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
        ).toContain('« e » et 2 autres n');
    });

    it('fr-CA and fr-FR inherit the fr wave messages', () => {
        const args = { passes: 3 };
        expect(tr('fr-CA', 'NL.W1002', args)).toBe(fr('NL.W1002', args));
        expect(tr('fr-FR', 'NL.W1002', args)).toBe(fr('NL.W1002', args));
    });
});
