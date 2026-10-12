import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The TextMate grammar colours style enum values on its own, without the
// language server, so `timeline-position`'s `top|bottom|both` have to be listed
// by hand (grammars/nowline.tmLanguage.json).
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        properties: { patterns: { name?: string; match: string }[] };
    };
};

function enumRegExp(): RegExp {
    const found = grammar.repository.properties.patterns.find(
        (p) => p.name === 'constant.language.enum.nowline',
    );
    expect(found?.match).toBeDefined();
    return new RegExp(found?.match ?? '');
}

describe('TextMate: timeline-position values', () => {
    it.each(['top', 'bottom', 'both'])('captures %s as an enum constant', (value) => {
        expect(`timeline-position:${value}`.match(enumRegExp())?.[0]).toBe(value);
    });

    it('does not capture them inside a longer word', () => {
        for (const line of ['item topline', 'item bottom-up', 'after:both-teams']) {
            expect(line.match(enumRegExp()), line).toBeNull();
        }
    });
});
