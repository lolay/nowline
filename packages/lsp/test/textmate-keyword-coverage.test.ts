import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar colours keywords on its own, without the language
// server, so every word has to be listed by hand (grammars/nowline.tmLanguage.json).
// These tests catch a word that the Langium grammar or the validator accepts
// but the TextMate grammar forgot.
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        directive: { patterns: { match: string }[] };
        keywords: { patterns: { match: string }[] };
        properties: { patterns: { name?: string; match: string; captures?: unknown }[] };
    };
};

const langium = readFileSync(
    new URL('../../core/src/language/nowline.langium', import.meta.url),
    'utf8',
);

const patterns = grammar.repository.properties.patterns;

function enumRegExp(): RegExp {
    const found = patterns.find((p) => p.name === 'constant.language.enum.nowline');
    expect(found?.match).toBeDefined();
    return new RegExp(found?.match ?? '');
}

describe('TextMate: keyword coverage', () => {
    it('colours every word keyword in the Langium grammar', () => {
        const words = [...new Set([...langium.matchAll(/'([a-z][a-z-]*)'/g)].map((m) => m[1]))];
        expect(words).toContain('wave');

        const directive = new RegExp(grammar.repository.directive.patterns[0].match);
        const [lineStart, general] = grammar.repository.keywords.patterns.map(
            (p) => new RegExp(p.match),
        );
        const missing = words.filter(
            (word) =>
                !directive.test(`${word} v1`) &&
                !lineStart.test(`${word} x`) &&
                !general.test(`${word} x`),
        );
        expect(missing).toEqual([]);
    });

    it('captures the timeline-position values as enum constants', () => {
        const re = enumRegExp();
        for (const value of ['top', 'bottom', 'both']) {
            expect(`key:${value}`.match(re)?.[0], value).toBe(value);
        }
    });
});
