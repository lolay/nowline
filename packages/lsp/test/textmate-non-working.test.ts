import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar colours the roadmap style keys and their enum values on
// its own, without the language server, so `non-working:` and `hide|show` have
// to be listed by hand (grammars/nowline.tmLanguage.json).
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        keywords: { patterns: { match: string; captures?: unknown }[] };
        properties: { patterns: { name?: string; match: string; captures?: unknown }[] };
    };
};

const patterns = grammar.repository.properties.patterns;

// The line-start declaration keyword is the first keyword pattern (the wave
// test indexes it by position too); the property keys are the first property
// pattern.
const declarationKeyword = new RegExp(grammar.repository.keywords.patterns[0].match);
const propertyKey = new RegExp(grammar.repository.properties.patterns[0].match, 'g');

function styleKeyRegExp(): RegExp {
    const found = patterns.find((p) =>
        JSON.stringify(p.captures ?? {}).includes('entity.other.attribute-name.style.nowline'),
    );
    expect(found?.match).toBeDefined();
    return new RegExp(found?.match ?? '');
}

function enumRegExp(): RegExp {
    const found = patterns.find((p) => p.name === 'constant.language.enum.nowline');
    expect(found?.match).toBeDefined();
    return new RegExp(found?.match ?? '');
}

describe('TextMate: non-working', () => {
    it('captures non-working: as a style key, whole', () => {
        const m = styleKeyRegExp().exec('default roadmap non-working:show');
        expect(m?.[1]).toBe('non-working');
        expect(m?.[2]).toBe(':');
    });

    it('still captures the neighbouring style key minor-grid:', () => {
        expect(styleKeyRegExp().exec('default roadmap minor-grid:true')?.[1]).toBe('minor-grid');
    });

    it('captures show and hide as enum constants', () => {
        const re = enumRegExp();
        expect('non-working:show'.match(re)?.[0]).toBe('show');
        expect('non-working:hide'.match(re)?.[0]).toBe('hide');
    });

    // m2p phase 5b: the calendar declaration keywords and their property keys.
    describe('declaration keywords', () => {
        it('captures non-working at the start of a line', () => {
            const m = declarationKeyword.exec(
                'non-working thanksgiving "Thanksgiving" date:2026-11-26',
            );
            expect(m?.[1]).toBe('non-working');
        });

        it('captures an indented working', () => {
            const m = declarationKeyword.exec('  working crunch date:2026-01-10');
            expect(m?.[1]).toBe('working');
        });

        it('captures neither inside a longer word, as an id, as a value, or bare', () => {
            for (const line of [
                'non-working-team',
                'working-group',
                'item working',
                'after:working',
                'non-working:show',
                'working',
            ]) {
                expect(declarationKeyword.exec(line), line).toBeNull();
            }
        });
    });

    describe('property keys', () => {
        const keysIn = (line: string) => [...line.matchAll(propertyKey)].map((m) => m[1]);

        it('captures every in a recurring declaration', () => {
            expect(keysIn('non-working w every:[sat, sun]')).toContain('every');
        });

        it('captures end in a range declaration', () => {
            expect(keysIn('start:2026-01-01 end:2026-01-02')).toEqual(['start', 'end']);
        });
    });
});
