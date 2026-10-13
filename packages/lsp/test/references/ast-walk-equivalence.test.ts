// `declarations` and `visitProperties` from `@nowline/core/internal` against
// the LSP's own walks in `ast-utils.ts` (specs/core-ast-utilities.md §5): the
// same entities and properties, owners and order, over every sample and a few
// inline fixtures. The test goes with the copies, which m1.s4 replaces.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type EntityProperty,
    isConfigEntry,
    isStyleDeclaration,
    isSymbolDeclaration,
    type NowlineFile,
} from '@nowline/core';
import { visitProperties as coreVisitProperties, declarations } from '@nowline/core/internal';
import type { AstNode } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    buildEntityIndex,
    collectNamedEntities,
    visitAllProperties,
    visitProperties,
} from '../../src/references/ast-utils.js';
import { parseDocument } from '../helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function nowlineFilesUnder(dir: string, recursive: boolean): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir).sort()) {
        const abs = path.join(dir, name);
        if (statSync(abs).isDirectory()) {
            if (recursive) out.push(...nowlineFilesUnder(abs, true));
        } else if (name.endsWith('.nowline')) {
            out.push(abs);
        }
    }
    return out;
}

// The files the G1 gate renders: `examples/**` and `tests/*.nowline`.
const samples = [
    ...nowlineFilesUnder(path.join(REPO_ROOT, 'examples'), true),
    ...nowlineFilesUnder(path.join(REPO_ROOT, 'tests'), false),
].map((abs) => ({ name: path.relative(REPO_ROOT, abs), source: readFileSync(abs, 'utf8') }));

const inline = [
    { name: 'empty file', source: '' },
    {
        name: 'duplicate ids and nested teams',
        source: [
            'roadmap r',
            'person ann "Ann"',
            'person ann "Ann again"',
            'team eng "Engineering" size:big',
            '  team plat "Platform" size:small',
            '    person ann',
            '    team infra "Infra"',
            'swimlane s owner:plat',
            '  item x duration:1w',
            '  item x duration:2w',
            '',
        ].join('\n'),
    },
    {
        name: 'group in parallel in group, config and descriptions',
        source: [
            'config',
            '',
            'style hot',
            '  fg: red',
            '',
            'symbol star unicode:"x"',
            '',
            'default item shadow:subtle',
            '',
            'roadmap r start:2026-01-05',
            'swimlane s',
            '  description "Lane note."',
            '  group outer "Outer" style:hot',
            '    description "Group note."',
            '    item a duration:1w',
            '    parallel mid',
            '      item b duration:1w',
            '      group inner',
            '        item c duration:1w',
            '        item "Untitled" duration:1w',
            '  item d duration:1w',
            '',
        ].join('\n'),
    },
];

async function fileOf(source: string): Promise<NowlineFile> {
    return (await parseDocument(source)).parseResult.value;
}

function where(node: AstNode): string {
    return `${node.$type}:${(node as { name?: string }).name ?? '-'}@${node.$cstNode?.offset ?? '?'}`;
}

function expectSameNodes(actual: readonly AstNode[], expected: readonly AstNode[]): void {
    expect(actual.map(where)).toEqual(expected.map(where));
    expect(actual.every((node, i) => node === expected[i])).toBe(true);
}

// The LSP's caller-side filter (spec §6): named `style` and `symbol` config
// entries, then every named roadmap declaration. Nothing else is navigable.
function namedEntities(file: NowlineFile): AstNode[] {
    return [...declarations(file, { config: true })].filter((node) =>
        isConfigEntry(node)
            ? (isStyleDeclaration(node) || isSymbolDeclaration(node)) && Boolean(node.name)
            : Boolean((node as { name?: string }).name),
    );
}

describe('core/internal walks match the LSP copies', () => {
    it('covers the samples', () => {
        expect(samples.length).toBeGreaterThan(50);
    });

    describe.each([...samples, ...inline])('$name', ({ source }) => {
        it('declarations with a filter matches collectNamedEntities', async () => {
            const file = await fileOf(source);
            expectSameNodes(namedEntities(file), collectNamedEntities(file));
        });

        it('first named declaration per id matches buildEntityIndex', async () => {
            const file = await fileOf(source);
            const expected = new Map<string, AstNode>();
            for (const node of namedEntities(file)) {
                const id = (node as { name: string }).name;
                if (!expected.has(id)) expected.set(id, node);
            }
            const actual = buildEntityIndex(file);
            expect([...actual.keys()]).toEqual([...expected.keys()]);
            expectSameNodes([...actual.values()], [...expected.values()]);
        });

        it('core visitProperties matches the LSP visitProperties, owners included', async () => {
            const file = await fileOf(source);
            for (const entry of file.roadmapEntries) {
                const actual: [EntityProperty, AstNode][] = [];
                coreVisitProperties(entry, (prop, owner) => actual.push([prop, owner]));
                const expected: [EntityProperty, AstNode][] = [];
                visitProperties(entry, (prop, owner) => expected.push([prop, owner]));
                expect(actual.map(([p, o]) => `${where(o)} ${p.key}`)).toEqual(
                    expected.map(([p, o]) => `${where(o)} ${p.key}`),
                );
                expect(
                    actual.every(([p, o], i) => p === expected[i][0] && o === expected[i][1]),
                ).toBe(true);
            }
        });

        it('visitAllProperties sees the roadmap line then every entry, as core does', async () => {
            const file = await fileOf(source);
            const actual: EntityProperty[] = [];
            visitAllProperties(file, (prop) => actual.push(prop));
            const expected: EntityProperty[] = [];
            if (file.roadmapDecl) {
                coreVisitProperties(file.roadmapDecl, (prop) => expected.push(prop));
            }
            for (const entry of file.roadmapEntries) {
                coreVisitProperties(entry, (prop) => expected.push(prop));
            }
            expect(actual.length).toBe(expected.length);
            expect(actual.every((prop, i) => prop === expected[i])).toBe(true);
        });
    });
});
