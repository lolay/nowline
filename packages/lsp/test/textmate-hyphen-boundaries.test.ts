import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Nowline identifiers and keys are kebab-case, so `\b` is the wrong boundary:
// it treats `-` as a word break and lets `team` match inside `platform-team`
// or `text:` inside `foo-text:`. The keyword, key and enum patterns use
// `(?<![\w-])` / `(?![\w-])` instead (grammars/nowline.tmLanguage.json).
const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as {
    repository: {
        keywords: { patterns: Pattern[] };
        properties: { patterns: Pattern[] };
    };
};

interface Pattern {
    name?: string;
    match: string;
    captures?: Record<string, { name: string }>;
}

function byName(patterns: Pattern[], name: string): string {
    const found = patterns.find((p) => p.name === name);
    expect(found?.match, name).toBeDefined();
    return found?.match ?? '';
}

function byCaptureScope(patterns: Pattern[], scope: string): string {
    const found = patterns.find((p) => p.captures?.['1']?.name === scope);
    expect(found?.match, scope).toBeDefined();
    return found?.match ?? '';
}

/** Every capture-1 (or whole match, when there is no group) the pattern finds in `line`. */
function hits(source: string, line: string): string[] {
    return [...line.matchAll(new RegExp(source, 'g'))].map((m) => m[1] ?? m[0]);
}

const { keywords, properties } = grammar.repository;
const keyword = byName(keywords.patterns, 'keyword.control.nowline');
const propertyKey = byCaptureScope(properties.patterns, 'entity.other.attribute-name.nowline');
const includeMode = byCaptureScope(
    properties.patterns,
    'entity.other.attribute-name.include-mode.nowline',
);
const styleKey = byCaptureScope(properties.patterns, 'entity.other.attribute-name.style.nowline');
const enumValue = byName(properties.patterns, 'constant.language.enum.nowline');

describe('TextMate: hyphenated words are not split at the hyphen', () => {
    it('does not colour a keyword inside a hyphenated identifier', () => {
        expect(hits(keyword, 'item platform-team "Platform"')).toEqual(['item']);
        expect(hits(keyword, 'swimlane web-team')).toEqual(['swimlane']);
        expect(hits(keyword, 'item foo-item')).toEqual(['item']);
        expect(hits(keyword, 'team-a')).toEqual([]);
        expect(hits(keyword, 'item non-working-team')).toEqual(['item']);
    });

    it('still colours real keywords', () => {
        expect(hits(keyword, 'team web "Web"')).toEqual(['team']);
        expect(hits(keyword, '  default item status:done')).toEqual(['default', 'item']);
    });

    it('does not colour the tail of an unknown hyphenated key', () => {
        expect(hits(styleKey, 'style s foo-text:red')).toEqual([]);
        expect(hits(styleKey, 'style s my-icon:shield')).toEqual([]);
        expect(hits(propertyKey, 'item a foo-owner:sam')).toEqual([]);
        expect(hits(propertyKey, 'item a pre-wave:build')).toEqual([]);
        expect(hits(includeMode, 'include "x" foo-config:merge')).toEqual([]);
    });

    it('still colours real keys, hyphenated ones whole', () => {
        expect(hits(styleKey, 'style s text:red capacity-icon:none')).toEqual([
            'text',
            'capacity-icon',
        ]);
        expect(hits(styleKey, 'default roadmap non-working:show')).toEqual(['non-working']);
        expect(hits(propertyKey, 'config label-every:2 days-per-week:5')).toEqual([
            'label-every',
            'days-per-week',
        ]);
        expect(hits(includeMode, 'include "x" config:merge')).toEqual(['config']);
    });

    it('does not colour an enum value inside a hyphenated word', () => {
        expect(hits(enumValue, 'style s weight:x-light')).toEqual([]);
        expect(hits(enumValue, 'item a size:xl-plus')).toEqual([]);
        expect(hits(enumValue, 'style s weight:light border:dashed')).toEqual(['light', 'dashed']);
    });
});
