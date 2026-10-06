import { describe, expect, it } from 'vitest';
import { CompletionItemKind, SymbolKind } from '../../src/lsp-protocol.js';
import { locate, parseDocument, services } from '../helpers.js';

// Waves across the LSP surface (specs/waves.md §10, specs/ide.md).
const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"
  description "Ship the core"
wave launch "Launch" labels:[risky]

swimlane backend "Backend"
  item api "API" duration:2w wave:build
  group g "Group G" wave:build
    item inner "Inner" duration:1w
  item later "Later" duration:1w after:build
  item idle "Idle" duration:1w

milestone done "Done" after:build

footnote note "Note" on:build
`;

// `wave wave "W"`: the wave is named after the keyword.
const keywordNamed = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

wave wave "W"

swimlane backend "Backend"
  item api "API" duration:2w wave:wave
  item next "Next" duration:1w after:wave
`;

const noWaves = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

swimlane backend "Backend"
  item api "API" duration:2w
`;

/** Position `delta` characters into the `occurrence`-th match of `needle`. */
function at(source: string, needle: string, delta = 0, occurrence = 0) {
    const p = locate(source, needle, occurrence);
    return { line: p.line, character: p.character + delta };
}

const BUILD_DECL = { line: 5, character: 5 };

async function hoverText(source: string, position: { line: number; character: number }) {
    const doc = await parseDocument(source);
    const hover = await services().Nowline.lsp.HoverProvider!.getHoverContent(doc, {
        textDocument: { uri: doc.uri.toString() },
        position,
    });
    return hover ? (hover.contents as { value: string }).value : undefined;
}

// Non-keyword completion labels at the end of `source`.
async function completionLabels(source: string): Promise<string[]> {
    const doc = await parseDocument(source);
    const list = await services().Nowline.lsp.CompletionProvider!.getCompletion(doc, {
        textDocument: { uri: doc.uri.toString() },
        position: {
            line: source.split('\n').length - 1,
            character: source.split('\n').pop()!.length,
        },
    });
    return (list?.items ?? [])
        .filter((i) => i.kind !== CompletionItemKind.Keyword)
        .map((i) => i.label);
}

describe('waves: definition', () => {
    for (const [label, needle, delta] of [
        ['wave:build', 'wave:build', 5],
        ['after:build', 'after:build', 6],
        ['footnote on:build', 'on:build', 3],
    ] as const) {
        it(`jumps from ${label} to the wave name`, async () => {
            const doc = await parseDocument(sample);
            const links = await services().Nowline.lsp.DefinitionProvider!.getDefinition(doc, {
                textDocument: { uri: doc.uri.toString() },
                position: at(sample, needle, delta),
            });
            expect(links).toHaveLength(1);
            expect(links![0].targetSelectionRange.start).toEqual(BUILD_DECL);
        });
    }

    it('targets the name, not the keyword, in `wave wave`', async () => {
        const doc = await parseDocument(keywordNamed);
        const links = await services().Nowline.lsp.DefinitionProvider!.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: at(keywordNamed, 'wave:wave', 5),
        });
        expect(links).toHaveLength(1);
        expect(links![0].targetSelectionRange.start).toEqual({ line: 4, character: 5 });
        expect(links![0].targetSelectionRange.end).toEqual({ line: 4, character: 9 });
    });
});

describe('waves: references', () => {
    const expected = [
        BUILD_DECL,
        at(sample, 'wave:build', 5, 0),
        at(sample, 'wave:build', 5, 1),
        at(sample, 'after:build', 6, 0), // item later
        at(sample, 'after:build', 6, 1), // milestone done
        at(sample, 'on:build', 3),
    ];
    for (const [label, position] of [
        ['the declaration', BUILD_DECL],
        ['wave:build', at(sample, 'wave:build', 5)],
        ['after:build', at(sample, 'after:build', 6, 1)],
        ['on:build', at(sample, 'on:build', 3)],
    ] as const) {
        it(`finds every reference from ${label}`, async () => {
            const doc = await parseDocument(sample);
            const refs = await services().Nowline.lsp.ReferencesProvider!.findReferences(doc, {
                textDocument: { uri: doc.uri.toString() },
                position,
                context: { includeDeclaration: true },
            });
            const starts = refs.map((r) => r.range.start);
            expect(starts).toHaveLength(expected.length);
            expect(starts).toEqual(expect.arrayContaining(expected));
        });
    }
});

describe('waves: rename', () => {
    for (const [label, position] of [
        ['the declaration', BUILD_DECL],
        ['wave:build', at(sample, 'wave:build', 5)],
        ['after:build', at(sample, 'after:build', 6, 1)],
        ['on:build', at(sample, 'on:build', 3)],
    ] as const) {
        it(`renames the wave and its references from ${label}`, async () => {
            const doc = await parseDocument(sample);
            const edit = await services().Nowline.lsp.RenameProvider!.rename(doc, {
                textDocument: { uri: doc.uri.toString() },
                position,
                newName: 'construct',
            });
            const edits = edit?.changes?.[doc.uri.toString()] ?? [];
            expect(edits).toHaveLength(6);
            expect(edits.every((e) => e.newText === 'construct')).toBe(true);
            expect(edits.map((e) => e.range.start)).toContainEqual(BUILD_DECL);
        });
    }

    it('renames only the name token of `wave wave`, never the keyword', async () => {
        const doc = await parseDocument(keywordNamed);
        const provider = services().Nowline.lsp.RenameProvider!;
        for (const position of [
            { line: 4, character: 5 },
            at(keywordNamed, 'wave:wave', 5),
            at(keywordNamed, 'after:wave', 6),
        ]) {
            const edit = await provider.rename(doc, {
                textDocument: { uri: doc.uri.toString() },
                position,
                newName: 'w1',
            });
            const edits = edit?.changes?.[doc.uri.toString()] ?? [];
            const starts = edits.map((e) => e.range.start);
            expect(starts).toHaveLength(3);
            expect(starts).toEqual(
                expect.arrayContaining([
                    { line: 4, character: 5 },
                    at(keywordNamed, 'wave:wave', 5),
                    at(keywordNamed, 'after:wave', 6),
                ]),
            );
            expect(starts).not.toContainEqual({ line: 4, character: 0 });
        }
        // The keyword itself is not a rename target.
        const range = await provider.prepareRename(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: 4, character: 1 },
        });
        expect(range).toBeUndefined();
    });
});

describe('waves: completion', () => {
    const header = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

wave discover "Discover"
wave build "Build"
wave launch "Launch"

swimlane backend "Backend"
  item api "API" duration:2w
`;

    it('lists only the declared waves, in order, after `wave:`', async () => {
        const labels = await completionLabels(`${header}  item next "Next" wave:`);
        // Langium's keyword completion also offers the value-position keywords
        // (`person`, `wave`); every non-keyword proposal is a declared wave.
        expect(labels).toEqual(['discover', 'build', 'launch']);
    });

    for (const key of ['after', 'before', 'on']) {
        it(`includes waves after \`${key}:\``, async () => {
            const labels = await completionLabels(`${header}  item next "Next" ${key}:`);
            expect(labels).toEqual(expect.arrayContaining(['discover', 'build', 'launch', 'api']));
        });
    }
});

describe('waves: document symbols', () => {
    it('lists waves as Struct symbols with their titles', async () => {
        const doc = await parseDocument(sample);
        const [roadmap] = await services().Nowline.lsp.DocumentSymbolProvider!.getSymbols(doc, {
            textDocument: { uri: doc.uri.toString() },
        });
        const waves = roadmap.children!.filter((c) => c.kind === SymbolKind.Struct);
        expect(waves.map((w) => [w.name, w.detail])).toEqual([
            ['discover', 'Discover'],
            ['build', 'Build'],
            ['launch', 'Launch'],
        ]);
        expect(waves[1].selectionRange.start).toEqual(BUILD_DECL);
    });

    it('selects the name, not the keyword, for `wave wave`', async () => {
        const doc = await parseDocument(keywordNamed);
        const [roadmap] = await services().Nowline.lsp.DocumentSymbolProvider!.getSymbols(doc, {
            textDocument: { uri: doc.uri.toString() },
        });
        const wave = roadmap.children!.find((c) => c.kind === SymbolKind.Struct);
        expect(wave?.name).toBe('wave');
        expect(wave?.selectionRange.start).toEqual({ line: 4, character: 5 });
    });
});

describe('waves: hover', () => {
    it('shows position, title, description and member count on a wave', async () => {
        const text = await hoverText(sample, BUILD_DECL);
        expect(text).toBeDefined();
        expect(text).toContain('wave `build`');
        expect(text).toContain('wave 2 of 3');
        expect(text).toContain('_Build_');
        expect(text).toContain('Ship the core');
        // api (own wave) + inner (inherited from the group).
        expect(text).toContain('2 members');
    });

    it('puts the wave lines in their own paragraph', async () => {
        const text = await hoverText(sample, BUILD_DECL);
        expect(text).toMatch(/^\*\*wave `build`\*\*\n_Build_\n\nwave 2 of 3\n/);
    });

    it('shows a wave’s labels in its hover only', async () => {
        const launch = await hoverText(sample, at(sample, 'wave launch', 5));
        expect(launch).toContain('labels: risky');
        const build = await hoverText(sample, BUILD_DECL);
        expect(build).not.toContain('labels:');
        const item = await hoverText(sample, at(sample, 'item api', 5));
        expect(item).not.toContain('labels:');
    });

    it('shows the same summary from a wave reference', async () => {
        const text = await hoverText(sample, at(sample, 'on:build', 3));
        expect(text).toContain('wave 2 of 3');
        expect(text).toContain('2 members');
    });

    it('does not offer the keyword as a declaration', async () => {
        const text = await hoverText(keywordNamed, { line: 4, character: 1 });
        expect(text).toBeUndefined();
    });

    it('shows an item’s own wave', async () => {
        const text = await hoverText(sample, at(sample, 'item api', 5));
        expect(text).toContain('wave "build"');
        expect(text).not.toContain('inherited');
    });

    it('shows an inherited wave with its container', async () => {
        const text = await hoverText(sample, at(sample, 'item inner', 5));
        expect(text).toContain('wave "build" (inherited from group "g")');
    });

    it('shows background for an item without a wave', async () => {
        const text = await hoverText(sample, at(sample, 'item idle', 5));
        expect(text).toContain('background (no wave)');
    });

    it('adds nothing to item hovers when the roadmap has no waves', async () => {
        const text = await hoverText(noWaves, at(noWaves, 'item api', 5));
        expect(text).toBe('**item `api`**\n_API_\n\n- `duration:` 2w');
    });
});
