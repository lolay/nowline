import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar colours style keys and enum values on its own, without
// the language server, so `header-position:` and `beside|above` have to be
// listed by hand (grammars/nowline.tmLanguage.json).
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

describe('TextMate: header-position', () => {
    it('captures header-position: as a style key, whole', () => {
        const m = styleKeyRegExp().exec('default roadmap header-position:above');
        expect(m?.[1]).toBe('header-position');
        expect(m?.[2]).toBe(':');
    });

    it('still captures the neighbouring style key header-height:', () => {
        expect(styleKeyRegExp().exec('default roadmap header-height:lg')?.[1]).toBe(
            'header-height',
        );
    });

    it('captures beside and above as enum constants', () => {
        const re = enumRegExp();
        expect('header-position:beside'.match(re)?.[0]).toBe('beside');
        expect('header-position:above'.match(re)?.[0]).toBe('above');
    });
});
