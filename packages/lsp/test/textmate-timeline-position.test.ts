import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar colours style keys and enum values on its own, without
// the language server, so `timeline-position:` and `top|bottom|both` have to be
// listed by hand (grammars/nowline.tmLanguage.json). The values are coloured
// only right after `timeline-position:`: `top` and `bottom` are ordinary ids
// (`swimlane top`, `after:bottom`), so the global enum pattern leaves them out.
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        properties: { patterns: Pattern[] };
    };
};

interface Pattern {
    name?: string;
    match: string;
    captures?: Record<string, { name: string }>;
}

const patterns = grammar.repository.properties.patterns;

function timelinePositionRegExp(): RegExp {
    const found = patterns.find((p) => p.match.includes('(timeline-position)'));
    expect(found?.captures?.['1']?.name).toBe('entity.other.attribute-name.style.nowline');
    expect(found?.captures?.['3']?.name).toBe('constant.language.enum.nowline');
    return new RegExp(found?.match ?? '');
}

function enumRegExp(): RegExp {
    const found = patterns.find((p) => p.name === 'constant.language.enum.nowline');
    expect(found?.match).toBeDefined();
    return new RegExp(found?.match ?? '', 'g');
}

describe('TextMate: timeline-position', () => {
    it('captures the key, the colon and each value', () => {
        const re = timelinePositionRegExp();
        for (const value of ['top', 'bottom', 'both']) {
            const m = re.exec(`default roadmap timeline-position:${value}`);
            expect(m?.[1]).toBe('timeline-position');
            expect(m?.[2]).toBe(':');
            expect(m?.[3]).toBe(value);
        }
    });

    it('captures a value after a space, as in an indented style block', () => {
        expect(timelinePositionRegExp().exec('  timeline-position: top')?.[3]).toBe('top');
    });

    it('still colours the key when the value is not one of the three', () => {
        const m = timelinePositionRegExp().exec('default roadmap timeline-position:middle');
        expect(m?.[1]).toBe('timeline-position');
        expect(m?.[3]).toBeUndefined();
    });

    it('does not colour a hyphenated key or value', () => {
        const re = timelinePositionRegExp();
        expect(re.exec('style s foo-timeline-position:top')).toBeNull();
        expect(re.exec('default roadmap timeline-position:top-ish')?.[3]).toBeUndefined();
    });

    it('is the only properties pattern that matches the key', () => {
        const owners = patterns.filter((p) =>
            new RegExp(p.match).test('default roadmap timeline-position:top'),
        );
        expect(owners.map((p) => p.match)).toEqual([timelinePositionRegExp().source]);
    });

    it('does not colour top, bottom or both as enum values elsewhere', () => {
        for (const line of [
            'swimlane top',
            'item bottom duration:1w',
            'item a after:top before:bottom',
            'anchor both date:2026-01-05',
        ]) {
            const values = [...line.matchAll(enumRegExp())].map((m) => m[0]);
            expect(values, line).toEqual([]);
        }
    });
});
