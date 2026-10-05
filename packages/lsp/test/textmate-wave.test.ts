import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar is the source of truth for editor highlighting
// (grammars/nowline.tmLanguage.json); the extension copy is generated.
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        keywords: { patterns: { match: string }[] };
        properties: { patterns: { match: string }[] };
    };
};

const waveKeyword = new RegExp(grammar.repository.keywords.patterns[0].match);
const generalKeyword = new RegExp(grammar.repository.keywords.patterns[1].match);
const propertyKey = new RegExp(grammar.repository.properties.patterns[0].match);

describe('TextMate: wave', () => {
    it('colours the declaration keyword at the start of a line', () => {
        expect(waveKeyword.test('wave build "Build"')).toBe(true);
        expect(waveKeyword.test('  wave build "Build"')).toBe(true);
    });

    it('does not colour wave as a keyword elsewhere', () => {
        for (const line of ['  item wave', 'wave-1', 'after:wave', 'wave:build', 'wave']) {
            expect(waveKeyword.test(line)).toBe(false);
        }
        expect(generalKeyword.test('after:wave wave')).toBe(false);
    });

    it('colours wave: as a property key', () => {
        expect(propertyKey.exec('item a "A" wave:build')?.[1]).toBe('wave');
        expect(propertyKey.exec('after:wave')?.[1]).toBe('after');
    });
});
