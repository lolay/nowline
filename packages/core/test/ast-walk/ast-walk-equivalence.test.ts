// `ast-walk.ts` against the copies it replaces (specs/core-ast-utilities.md
// §5): the same ids, in the same order, on the same nodes, over every sample,
// the wave worked examples and the inline fixtures. These tests go with the
// copies: m1.s2 deleted the validator's, m1.s3 deletes the wave rules'.

import type { AstNode } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    isConfigEntry,
    isDefaultDeclaration,
    isSwimlaneDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
} from '../../src/generated/ast.js';
import { declarations, firstDeclarations } from '../../src/language/ast-walk.js';
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

describe('ast-walk equivalence with the wave-rule copies', async () => {
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
