import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from '../../src/lsp-protocol.js';
import { locate, parseDocument, services } from '../helpers.js';

// The `non-working` and `working` declarations across the LSP surface
// (specs/working-calendar.md §4, §10 Examples B and D; specs/ide.md; m2p phase 5b).

// Example B: a holiday inside a bar.
const exampleB = `nowline v1

config

non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27

roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d after:checkout
`;

// Example D: a working exception, and a recurring closure.
const exampleD = `nowline v1

config

working crunch "Crunch Saturday" date:2026-01-10
non-working closed "Closed" every:[thu, fri]

roadmap r "R" start:2026-01-05 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
`;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Position `delta` characters into the first match of `needle`. */
function at(source: string, needle: string, delta = 0) {
    const p = locate(source, needle);
    return { line: p.line, character: p.character + delta };
}

async function completionItems(source: string) {
    const doc = await parseDocument(source);
    const list = await services().Nowline.lsp.CompletionProvider!.getCompletion(doc, {
        textDocument: { uri: doc.uri.toString() },
        position: {
            line: source.split('\n').length - 1,
            character: source.split('\n').pop()!.length,
        },
    });
    return list?.items ?? [];
}

const enumMembers = (items: { kind?: number; label: string }[]) =>
    items.filter((i) => i.kind === CompletionItemKind.EnumMember).map((i) => i.label);

async function hoverText(source: string, position: { line: number; character: number }) {
    const doc = await parseDocument(source);
    const hover = await services().Nowline.lsp.HoverProvider!.getHoverContent(doc, {
        textDocument: { uri: doc.uri.toString() },
        position,
    });
    return hover ? (hover.contents as { value: string }).value : undefined;
}

describe('calendar declarations: completion', () => {
    it('offers non-working and working on a blank line after config', async () => {
        const items = await completionItems('nowline v1\n\nconfig\n\n');
        const labels = items.map((i) => i.label);
        expect(labels).toContain('non-working');
        expect(labels).toContain('working');
    });

    it('offers exactly the seven weekdays after every:', async () => {
        const items = await completionItems('nowline v1\n\nconfig\n\nnon-working w "W" every:');
        expect(enumMembers(items)).toEqual(WEEKDAYS);
        const detail = new Set(
            items.filter((i) => i.kind === CompletionItemKind.EnumMember).map((i) => i.detail),
        );
        expect([...detail]).toEqual(['weekday']);
    });

    it('offers exactly the seven weekdays after every:[mon, ', async () => {
        const items = await completionItems(
            'nowline v1\n\nconfig\n\nnon-working w "W" every:[mon, ',
        );
        expect(enumMembers(items)).toEqual(WEEKDAYS);
    });

    it('offers exactly hide and show after default roadmap non-working:', async () => {
        const items = await completionItems('nowline v1\n\nconfig\n\ndefault roadmap non-working:');
        expect(enumMembers(items)).toEqual(['hide', 'show']);
        const detail = new Set(
            items.filter((i) => i.kind === CompletionItemKind.EnumMember).map((i) => i.detail),
        );
        expect([...detail]).toEqual(['non-working display']);
    });

    it('does not offer weekdays or hide and show after an unrelated key', async () => {
        const items = await completionItems(
            'nowline v1\n\nroadmap r "R" start:2026-01-05 scale:1w\n\nswimlane a "A"\n  item x "X" duration:',
        );
        const members = enumMembers(items);
        expect(members).not.toContain('hide');
        expect(members).not.toContain('mon');
    });
});

describe('calendar declarations: hover', () => {
    it('shows the kind, id, title and range on a non-working declaration', async () => {
        const text = await hoverText(exampleB, at(exampleB, 'thanksgiving', 3));
        expect(text).toBe(
            [
                '**non-working `thanksgiving`**',
                '_Thanksgiving_',
                '',
                '- `start:` 2026-11-26',
                '- `end:` 2026-11-27',
            ].join('\n'),
        );
    });

    it('shows a working declaration and its date', async () => {
        const text = await hoverText(exampleD, at(exampleD, 'crunch', 2));
        expect(text?.startsWith('**working `crunch`**')).toBe(true);
        expect(text).toContain('- `date:` 2026-01-10');
    });

    it('renders every: as a comma-separated weekday list', async () => {
        const text = await hoverText(exampleD, at(exampleD, 'closed', 2));
        expect(text).toContain('- `every:` thu, fri');
    });

    it('keeps the item hover unchanged: no every, start or end lines', async () => {
        const text = await hoverText(exampleB, at(exampleB, 'checkout', 2));
        expect(text).toBe(['**item `checkout`**', '_Checkout_', '', '- `duration:` 1w'].join('\n'));
    });
});

describe('calendar declarations: no reference leakage', () => {
    it('does not offer the declaration id after after:', async () => {
        const source = exampleB.replace('after:checkout\n', 'after:');
        const items = await completionItems(source.slice(0, source.indexOf('after:') + 6));
        expect(items.map((i) => i.label)).not.toContain('thanksgiving');
    });

    it('returns nothing from go-to-definition on the declaration name', async () => {
        const doc = await parseDocument(exampleB);
        const links = await services().Nowline.lsp.DefinitionProvider!.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: at(exampleB, 'thanksgiving', 3),
        });
        expect(links ?? []).toEqual([]);
    });

    it('finds no references to the declaration id', async () => {
        const doc = await parseDocument(exampleB);
        const refs = await services().Nowline.lsp.ReferencesProvider!.findReferences(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: at(exampleB, 'thanksgiving', 3),
            context: { includeDeclaration: true },
        });
        expect(refs ?? []).toEqual([]);
    });

    it('offers no rename on the declaration name', async () => {
        const doc = await parseDocument(exampleB);
        const provider = services().Nowline.lsp.RenameProvider!;
        const position = at(exampleB, 'thanksgiving', 3);
        expect(
            await provider.prepareRename(doc, {
                textDocument: { uri: doc.uri.toString() },
                position,
            }),
        ).toBeUndefined();
        expect(
            await provider.rename(doc, {
                textDocument: { uri: doc.uri.toString() },
                position,
                newName: 'turkey-day',
            }),
        ).toBeUndefined();
    });
});
