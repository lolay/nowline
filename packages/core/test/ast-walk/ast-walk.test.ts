import type { AstNode } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    isSwimlaneDeclaration,
    isTeamDeclaration,
    type NowlineFile,
    type SwimlaneDeclaration,
    type TeamDeclaration,
} from '../../src/generated/ast.js';
import {
    declarations,
    firstDeclarations,
    forEachDeclaredId,
    referenceableIds,
    trackChildren,
    trackNodes,
    visitProperties,
} from '../../src/language/ast-walk.js';
import { parse } from '../helpers.js';

const SOURCE = [
    'nowline v1',
    '',
    'config',
    '',
    'style hot',
    '  fg: red',
    '',
    'default item shadow:subtle',
    '',
    'roadmap plan "Plan" start:2026-01-05',
    '',
    'person ann "Ann"',
    '',
    'team eng "Engineering" size:big',
    '  description "All of engineering."',
    '  team plat "Platform" size:small',
    '    person ann',
    '    team infra "Infra"',
    '  team mobile "Mobile"',
    '',
    'anchor kick date:2026-01-05',
    '',
    'swimlane web "Web" owner:plat',
    '  description "Web lane."',
    '  item a "A" duration:1w',
    '    description "About A."',
    '  group g1 "G1" style:hot',
    '    description "Group note."',
    '    item b "B" duration:1w',
    '    parallel p1 "P1"',
    '      item c "C" duration:1w',
    '      group g2 "G2"',
    '        description "Inner note."',
    '        item d "D" duration:1w',
    '  item "Untitled" duration:1w',
    '  parallel p2',
    '    item f "F" duration:1w',
    '',
    'swimlane ops "Ops"',
    '  item a "A again" duration:1w',
    '',
    'milestone ship "Ship" date:2026-03-01',
    '',
].join('\n');

async function load(source: string = SOURCE): Promise<NowlineFile> {
    const r = await parse(source, { validate: false });
    expect(r.lexerErrors).toEqual([]);
    expect(r.parserErrors).toEqual([]);
    return r.ast;
}

/** `name`, else `"title"`, else the node type: enough to tell nodes apart in a diff. */
function label(node: AstNode | undefined): string {
    if (!node) return '(none)';
    const named = node as { name?: string; title?: string };
    return named.name ?? (named.title ? `"${named.title}"` : node.$type);
}

function lane(file: NowlineFile, name: string): SwimlaneDeclaration {
    const found = file.roadmapEntries.find((e) => isSwimlaneDeclaration(e) && e.name === name);
    if (!found || !isSwimlaneDeclaration(found)) throw new Error(`no swimlane ${name}`);
    return found;
}

function team(file: NowlineFile, name: string): TeamDeclaration {
    const found = file.roadmapEntries.find((e) => isTeamDeclaration(e) && e.name === name);
    if (!found || !isTeamDeclaration(found)) throw new Error(`no team ${name}`);
    return found;
}

describe('trackChildren', () => {
    it('returns the content of a swimlane in source order without description lines', async () => {
        const file = await load();
        expect(trackChildren(lane(file, 'web')).map(label)).toEqual([
            'a',
            'g1',
            '"Untitled"',
            'p2',
        ]);
    });

    it('skips description lines inside a group and a parallel', async () => {
        const file = await load();
        const [, g1] = trackChildren(lane(file, 'web'));
        if (g1.$type !== 'GroupBlock') throw new Error('expected a group');
        expect(trackChildren(g1).map(label)).toEqual(['b', 'p1']);
        const [, p1] = trackChildren(g1);
        if (p1.$type !== 'ParallelBlock') throw new Error('expected a parallel');
        expect(trackChildren(p1).map(label)).toEqual(['c', 'g2']);
    });

    it('returns an empty list for a swimlane without content', async () => {
        const file = await load('roadmap r\nswimlane empty\n');
        expect(trackChildren(lane(file, 'empty'))).toEqual([]);
    });
});

describe('trackNodes', () => {
    it('visits every track node pre-order, groups in parallels in groups included', async () => {
        const file = await load();
        const lanes = file.roadmapEntries.filter(isSwimlaneDeclaration);
        expect([...trackNodes(lanes)].map(label)).toEqual([
            'a',
            'g1',
            'b',
            'p1',
            'c',
            'g2',
            'd',
            '"Untitled"',
            'p2',
            'f',
            'a',
        ]);
    });

    it('accepts any iterable of swimlanes and visits nothing for none', async () => {
        const file = await load();
        expect([...trackNodes([])]).toEqual([]);
        expect([...trackNodes([lane(file, 'ops')])].map((n) => n.$type)).toEqual([
            'ItemDeclaration',
        ]);
    });
});

describe('declarations', () => {
    it('visits entries pre-order with nested teams and track content, by default', async () => {
        const file = await load();
        expect([...declarations(file)].map(label)).toEqual([
            'ann',
            'eng',
            'plat',
            'infra',
            'mobile',
            'kick',
            'web',
            'a',
            'g1',
            'b',
            'p1',
            'c',
            'g2',
            'd',
            '"Untitled"',
            'p2',
            'f',
            'ops',
            'a',
            'ship',
        ]);
    });

    it('does not visit person references inside a team', async () => {
        const file = await load();
        const ofType = [...declarations(file)].filter((n) => n.$type === 'PersonDeclaration');
        expect(ofType.map(label)).toEqual(['ann']);
    });

    it('visits the roadmap line first with roadmap: true', async () => {
        const file = await load();
        const [first, second] = declarations(file, { roadmap: true });
        expect(first.$type).toBe('RoadmapDeclaration');
        expect(label(second)).toBe('ann');
    });

    it('visits the config entries before the roadmap with config: true', async () => {
        const file = await load();
        const types = [...declarations(file, { config: true, roadmap: true })]
            .slice(0, 4)
            .map((n) => n.$type);
        expect(types).toEqual([
            'StyleDeclaration',
            'DefaultDeclaration',
            'RoadmapDeclaration',
            'PersonDeclaration',
        ]);
    });

    it('visits config entries without the roadmap line with config: true alone', async () => {
        const file = await load();
        const types = [...declarations(file, { config: true })].slice(0, 3).map((n) => n.$type);
        expect(types).toEqual(['StyleDeclaration', 'DefaultDeclaration', 'PersonDeclaration']);
    });

    it('yields nothing for an empty file', async () => {
        const file = await load('');
        expect([...declarations(file, { config: true, roadmap: true })]).toEqual([]);
    });
});

describe('visitProperties', () => {
    function collect(node: AstNode): string[] {
        const seen: string[] = [];
        visitProperties(node, (prop, owner) => seen.push(`${label(owner)}:${prop.key}`));
        return seen;
    }

    it('visits a swimlane and everything under it with each property owner', async () => {
        const file = await load();
        expect(collect(lane(file, 'web'))).toEqual([
            'web:owner',
            'a:duration',
            'g1:style',
            'b:duration',
            'c:duration',
            'd:duration',
            '"Untitled":duration',
            'f:duration',
        ]);
    });

    it('visits a team and its nested teams', async () => {
        const file = await load();
        expect(collect(team(file, 'eng'))).toEqual(['eng:size', 'plat:size']);
    });

    it('visits only the node itself when it has nothing nested', async () => {
        const file = await load();
        const [a] = trackChildren(lane(file, 'ops'));
        expect(collect(a)).toEqual(['a:duration']);
    });

    it('visits a group and everything under it', async () => {
        const file = await load();
        const [, g1] = trackChildren(lane(file, 'web'));
        expect(collect(g1)).toEqual(['g1:style', 'b:duration', 'c:duration', 'd:duration']);
    });
});

describe('forEachDeclaredId', () => {
    function ids(entry: Parameters<typeof forEachDeclaredId>[0]): (string | undefined)[] {
        const seen: (string | undefined)[] = [];
        forEachDeclaredId(entry, (name) => seen.push(name));
        return seen;
    }

    it('registers a swimlane and its track content in source order, unnamed ones as undefined', async () => {
        const file = await load();
        expect(ids(lane(file, 'web'))).toEqual([
            'web',
            'a',
            'g1',
            'b',
            'p1',
            'c',
            'g2',
            'd',
            undefined,
            'p2',
            'f',
        ]);
    });

    it('registers a team and its nested teams but not person references', async () => {
        const file = await load();
        expect(ids(team(file, 'eng'))).toEqual(['eng', 'plat', 'infra', 'mobile']);
    });

    it('registers a plain entry once, with the entry as the node', async () => {
        const file = await load();
        const seen: [string | undefined, AstNode][] = [];
        const [ann] = file.roadmapEntries;
        forEachDeclaredId(ann, (name, node) => seen.push([name, node]));
        expect(seen).toHaveLength(1);
        expect(seen[0][0]).toBe('ann');
        expect(seen[0][1]).toBe(ann);
    });
});

describe('referenceableIds and firstDeclarations', () => {
    it('lists the roadmap id and every declared id once', async () => {
        const file = await load();
        expect([...referenceableIds(file)]).toEqual([
            'plan',
            'ann',
            'eng',
            'plat',
            'infra',
            'mobile',
            'kick',
            'web',
            'a',
            'g1',
            'b',
            'p1',
            'c',
            'g2',
            'd',
            'p2',
            'f',
            'ops',
            'ship',
        ]);
    });

    it('maps each id to its first declaration', async () => {
        const file = await load();
        const first = firstDeclarations(file);
        expect([...first.keys()]).toEqual([...referenceableIds(file)]);
        const webA = [...trackNodes([lane(file, 'web')])].find((n) => label(n) === 'a');
        expect(first.get('a')).toBe(webA);
        expect(first.get('plan')?.$type).toBe('RoadmapDeclaration');
    });

    it('is empty for a file with no roadmap', async () => {
        const file = await load('');
        expect(referenceableIds(file).size).toBe(0);
        expect(firstDeclarations(file).size).toBe(0);
    });
});
