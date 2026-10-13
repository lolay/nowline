// `ast-walk.ts` against the copies it replaces (specs/core-ast-utilities.md
// §5): the same ids, in the same order, on the same nodes, over every sample,
// the wave worked examples and the inline fixtures. These tests go with the
// copies: m1.s2 deletes the validator's, m1.s3 the wave rules'.

import type { AstNode } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    type EntityProperty,
    isConfigEntry,
    isDefaultDeclaration,
    isSwimlaneDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
} from '../../src/generated/ast.js';
import {
    declarations,
    firstDeclarations,
    forEachDeclaredId,
    referenceableIds,
    trackChildren,
    visitProperties,
} from '../../src/language/ast-walk.js';
import {
    collectReferenceableIds,
    registerEntity,
    registerSwimlaneContent,
    registerTeam,
    visitPropertiesDeep,
} from '../../src/language/nowline-validator.js';
import { collectDeclarations, collectWaveHosts } from '../../src/language/waves.js';
import { parse } from '../helpers.js';
import { corpus, inlineFixtures, parseFile } from './corpus.js';

/** Stable text for a node, so a mismatch prints readably. */
function where(node: AstNode | undefined): string {
    if (!node) return 'undefined';
    const name = (node as { name?: string }).name;
    return `${node.$type}:${name ?? '-'}@${node.$cstNode?.offset ?? '?'}`;
}

function expectSameNodes(actual: readonly AstNode[], expected: readonly AstNode[]): void {
    expect(actual.map(where)).toEqual(expected.map(where));
    expect(actual.every((node, i) => node === expected[i])).toBe(true);
}

type Registered = { name: string | undefined; node: AstNode };

describe('ast-walk equivalence with the validator and wave-rule copies', async () => {
    const entries = corpus();
    const parsed = await Promise.all(
        entries.map(async (e) => ({ name: e.name, file: await parseFile(e.source) })),
    );

    it('covers every sample and the inline fixtures', () => {
        expect(parsed.length).toBeGreaterThan(80);
        // At least one sample of each walked shape, so an empty corpus cannot pass.
        const files = parsed.map((p) => p.file);
        expect(files.some((f) => f.roadmapEntries.some(isSwimlaneDeclaration))).toBe(true);
        expect(files.some((f) => f.roadmapEntries.some(isTeamDeclaration))).toBe(true);
        expect(files.some((f) => f.configEntries.length > 0)).toBe(true);
    });

    describe.each(parsed)('$name', ({ file }) => {
        it('forEachDeclaredId matches registerEntity for every entry', () => {
            for (const entry of file.roadmapEntries) {
                const actual: Registered[] = [];
                forEachDeclaredId(entry, (name, node) => actual.push({ name, node }));
                const expected: Registered[] = [];
                registerEntity(entry, (name, node) => expected.push({ name, node }));
                expect(actual.map((r) => r.name)).toEqual(expected.map((r) => r.name));
                expectSameNodes(
                    actual.map((r) => r.node),
                    expected.map((r) => r.node),
                );
            }
        });

        it('forEachDeclaredId matches registerTeam and registerSwimlaneContent', () => {
            for (const entry of file.roadmapEntries) {
                if (isTeamDeclaration(entry)) {
                    const expected: Registered[] = [];
                    registerTeam(entry, (name, node) => expected.push({ name, node }));
                    const actual: Registered[] = [];
                    forEachDeclaredId(entry, (name, node) => actual.push({ name, node }));
                    expect(actual.map((r) => r.name)).toEqual(expected.map((r) => r.name));
                    expectSameNodes(
                        actual.map((r) => r.node),
                        expected.map((r) => r.node),
                    );
                } else if (isSwimlaneDeclaration(entry)) {
                    const expected: Registered[] = [];
                    for (const child of entry.content) {
                        registerSwimlaneContent(child, (name, node) =>
                            expected.push({ name, node }),
                        );
                    }
                    const actual: Registered[] = [];
                    forEachDeclaredId(entry, (name, node) => actual.push({ name, node }));
                    // The entry itself comes first, then its content.
                    expect(actual[0].node).toBe(entry);
                    expect(actual.slice(1).map((r) => r.name)).toEqual(expected.map((r) => r.name));
                    expectSameNodes(
                        actual.slice(1).map((r) => r.node),
                        expected.map((r) => r.node),
                    );
                }
            }
        });

        it('visitProperties matches visitPropertiesDeep for every entry and the roadmap line', () => {
            const roots: AstNode[] = [...file.roadmapEntries];
            if (file.roadmapDecl) roots.push(file.roadmapDecl);
            for (const root of roots) {
                const actual: EntityProperty[] = [];
                visitProperties(root, (prop, owner) => {
                    actual.push(prop);
                    // The owner is the node whose own list holds the property.
                    expect((owner as { properties: EntityProperty[] }).properties).toContain(prop);
                });
                const expected: EntityProperty[] = [];
                visitPropertiesDeep(root, (prop) => expected.push(prop));
                expect(actual.length).toBe(expected.length);
                expect(actual.every((prop, i) => prop === expected[i])).toBe(true);
            }
        });

        it('referenceableIds matches collectReferenceableIds, in the same order', () => {
            expect([...referenceableIds(file)]).toEqual([...collectReferenceableIds(file)]);
        });

        it('firstDeclarations matches collectDeclarations: same ids, order and nodes', () => {
            const actual = firstDeclarations(file);
            const expected = collectDeclarations(file);
            expect([...actual.keys()]).toEqual([...expected.keys()]);
            expectSameNodes([...actual.values()], [...expected.values()]);
        });

        it('declarations with a filter matches collectWaveHosts', () => {
            // The wave-host filter: `default` lines but no other config entry, no
            // wave declaration. This is the caller-side filter spec §6 keeps.
            const actual = [...declarations(file, { config: true, roadmap: true })].filter(
                (node) =>
                    isConfigEntry(node)
                        ? isDefaultDeclaration(node)
                        : !isWaveDeclaration(node as AstNode),
            );
            expectSameNodes(actual, collectWaveHosts(file));
        });

        it('every walked declaration is reached through trackChildren and the entries alone', () => {
            // A walk that skipped a container would drop ids the copies register.
            const walked = new Set<AstNode>(declarations(file));
            const registered: AstNode[] = [];
            for (const entry of file.roadmapEntries) {
                registerEntity(entry, (_name, node) => registered.push(node));
            }
            for (const node of registered) expect(walked.has(node)).toBe(true);
            for (const entry of file.roadmapEntries) {
                if (isSwimlaneDeclaration(entry)) {
                    for (const child of trackChildren(entry)) expect(walked.has(child)).toBe(true);
                }
            }
        });
    });
});

// The parse outcome of each inline fixture is clean, so no equivalence above is
// vacuous because a fixture failed to parse.
describe('inline fixtures', () => {
    it('parse without lexer or parser errors', async () => {
        for (const { name, source } of inlineFixtures()) {
            const r = await parse(source, { validate: false });
            expect({ name, lexer: r.lexerErrors, parser: r.parserErrors }).toEqual({
                name,
                lexer: [],
                parser: [],
            });
        }
    });
});
