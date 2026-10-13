// `trackNodes` from `@nowline/core/internal` against layout's `collectItems`
// (specs/core-ast-utilities.md §5): the same items under the same keys, in the
// same order, over every sample and a few inline fixtures. The test goes with
// `collectItems`, which m1.s3 replaces.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ItemDeclaration, isItemDeclaration } from '@nowline/core';
import { trackNodes } from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { collectItems } from '../src/layout.js';
import { parseAndResolve } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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
];

const inline: Record<string, string> = {
    'duplicate ids': 'roadmap r\nswimlane s\n  item x duration:1w\n  item x duration:2w\n',
    'unnamed items': 'roadmap r\nswimlane s\n  item "One" duration:1w\n  item "Two" duration:1w\n',
    'group in parallel in group': [
        'roadmap r',
        'swimlane s',
        '  description "Lane note."',
        '  group outer "Outer"',
        '    description "Group note."',
        '    item a duration:1w',
        '    parallel mid',
        '      item b duration:1w',
        '      group inner',
        '        item c duration:1w',
        '        item "Untitled" duration:1w',
        '  item d duration:1w',
        'swimlane t',
        '  item a "A again" duration:1w',
        '',
    ].join('\n'),
};

/** `key => offset` per entry, in map order. */
function entriesOf(items: Map<string, ItemDeclaration>): string[] {
    return [...items].map(([key, item]) => `${key} => ${item.$cstNode?.offset}`);
}

// Layout's handle for an id-less item (`syntheticItemKey` in layout.ts), so the
// keys compare as well as the walk.
function syntheticKey(item: ItemDeclaration): string {
    const start = item.$cstNode?.range.start;
    return `#item@${start ? start.line + 1 : 0}:${start ? start.character + 1 : 0}`;
}

/** What `trackNodes` gives collectItems' callers: items by id, a later duplicate wins. */
function expectedItems(lanes: Parameters<typeof trackNodes>[0]): Map<string, ItemDeclaration> {
    const out = new Map<string, ItemDeclaration>();
    for (const node of trackNodes(lanes)) {
        if (isItemDeclaration(node)) out.set(node.name ?? syntheticKey(node), node);
    }
    return out;
}

async function lanesOf(source: string, absPath?: string) {
    const { resolved } = await parseAndResolve(
        source,
        absPath,
        absPath ? (p) => readFile(p, 'utf8') : undefined,
    );
    return [...resolved.content.swimlanes.values()];
}

describe('trackNodes matches layout collectItems', () => {
    it('covers the samples', () => {
        expect(samples.length).toBeGreaterThan(50);
    });

    it.each(samples.map((abs) => [path.relative(REPO_ROOT, abs), abs]))(
        '%s',
        async (_name, abs) => {
            const lanes = await lanesOf(readFileSync(abs, 'utf8'), abs);
            const actual = collectItems(lanes);
            const expected = expectedItems(lanes);
            expect(entriesOf(actual)).toEqual(entriesOf(expected));
            expect(
                [...actual.values()].every((item, i) => item === [...expected.values()][i]),
            ).toBe(true);
        },
    );

    it.each(Object.entries(inline))('inline: %s', async (_name, source) => {
        const lanes = await lanesOf(source);
        const actual = collectItems(lanes);
        const expected = expectedItems(lanes);
        expect(entriesOf(actual)).toEqual(entriesOf(expected));
        expect([...actual.values()].every((item, i) => item === [...expected.values()][i])).toBe(
            true,
        );
    });
});
