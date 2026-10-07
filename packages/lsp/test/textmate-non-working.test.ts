import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar colours the roadmap style keys and their enum values on
// its own, without the language server, so `non-working:` and `hide|show` have
// to be listed by hand (grammars/nowline.tmLanguage.json).
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        properties: { patterns: { name?: string; match: string; captures?: unknown }[] };
    };
};

const patterns = grammar.repository.properties.patterns;

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
});
