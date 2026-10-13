import { describe, expect, it } from 'vitest';
import {
    buildEntityIndex,
    collectNamedEntities,
    entityKind,
    propKey,
    visitAllProperties,
} from '../../src/references/ast-utils.js';
import { parseDocument } from '../helpers.js';

describe('entityKind', () => {
    it('labels a NonWorkingDeclaration as non-working, not nonworking', async () => {
        const doc = await parseDocument('config\n\nnon-working h date:2026-12-25\n\nroadmap r\n');
        const [entry] = doc.parseResult.value.configEntries;
        expect(entry.$type).toBe('NonWorkingDeclaration');
        expect(entityKind(entry)).toBe('non-working');
    });

    it('labels a WorkingDeclaration as working', async () => {
        const doc = await parseDocument('config\n\nworking h date:2026-12-25\n\nroadmap r\n');
        const [entry] = doc.parseResult.value.configEntries;
        expect(entry.$type).toBe('WorkingDeclaration');
        expect(entityKind(entry)).toBe('working');
    });

    it('keeps lowercasing the other declaration types', async () => {
        const doc = await parseDocument('config\n\nsymbol star unicode:"x"\n\nroadmap r\n');
        const [entry] = doc.parseResult.value.configEntries;
        expect(entityKind(entry)).toBe('symbol');
    });
});

describe('collectNamedEntities', () => {
    const source = [
        'config',
        '',
        'style hot "Hot"',
        'symbol star unicode:"x"',
        'non-working hol date:2026-12-25',
        '',
        'roadmap r "R"',
        '',
        'person ann "Ann"',
        'team eng "Engineering"',
        '  team plat "Platform"',
        '    team infra "Infra"',
        '  person ann',
        'swimlane s "S"',
        '  item a "A"',
        '  group g "G"',
        '    description "prose"',
        '    item b "B"',
        '    parallel p',
        '      item c "C"',
        '  item d "D"',
        'milestone m "M" date:2026-03-01',
        '',
    ].join('\n');

    it('lists style and symbol first, then entries pre-order, skipping calendar declarations and the roadmap line', async () => {
        const doc = await parseDocument(source);
        const names = collectNamedEntities(doc.parseResult.value).map((e) => e.name);
        expect(names).toEqual([
            'hot',
            'star',
            'ann',
            'eng',
            'plat',
            'infra',
            's',
            'a',
            'g',
            'b',
            'p',
            'c',
            'd',
            'm',
        ]);
    });

    it('indexes the first declaration of a duplicated id', async () => {
        const doc = await parseDocument('roadmap r\n\nperson ann "One"\nperson ann "Two"\n');
        const entity = buildEntityIndex(doc.parseResult.value).get('ann');
        expect(entity?.title).toBe('One');
    });
});

describe('visitAllProperties', () => {
    it('visits the roadmap line, then each entry and its nested content, with owners', async () => {
        const doc = await parseDocument(
            [
                'roadmap r start:2026-01-05',
                '',
                'team eng "E" size:big',
                '  team plat "P" size:small',
                'swimlane s owner:eng',
                '  group g status:done',
                '    item a size:big',
                '',
            ].join('\n'),
        );
        const seen: string[] = [];
        visitAllProperties(doc.parseResult.value, (prop, owner) => {
            seen.push(`${owner.$type}:${propKey(prop)}`);
        });
        expect(seen).toEqual([
            'RoadmapDeclaration:start',
            'TeamDeclaration:size',
            'TeamDeclaration:size',
            'SwimlaneDeclaration:owner',
            'GroupBlock:status',
            'ItemDeclaration:size',
        ]);
    });
});
