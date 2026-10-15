import {
    BUILTIN_CAPACITY_ICONS,
    BUILTIN_ICON_NAMES,
    BUILTIN_STATUSES,
    NON_WORKING_DISPLAYS,
    WEEKDAYS,
} from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from '../../src/lsp-protocol.js';
import { parseDocument, services } from '../helpers.js';

// Every closed value set the completion provider offers must be exactly core's
// table (packages/core/src/language/value-tables.ts), the one the validator
// checks against. Driven through the provider, so a local copy, a filter or a
// missed key in completion.ts fails here, not only a drifted re-export.
//
// Not offered today, so nothing to compare: the style enums
// (STYLE_PROP_ENUMS), colour names, calendar modes and include modes.

const ROADMAP = 'nowline v1\n\nroadmap r "R" start:2026-01-05 scale:1w\n\nswimlane s "S"\n';

const CASES: { key: string; expected: readonly string[]; source: string }[] = [
    { key: 'status', expected: BUILTIN_STATUSES, source: `${ROADMAP}  item a "A" status:` },
    { key: 'icon', expected: BUILTIN_ICON_NAMES, source: `${ROADMAP}  item a "A" icon:` },
    {
        key: 'capacity-icon',
        expected: BUILTIN_CAPACITY_ICONS,
        source: 'nowline v1\n\nconfig\n\ndefault item capacity-icon:',
    },
    {
        key: 'every',
        expected: WEEKDAYS,
        source: 'nowline v1\n\nconfig\n\nnon-working w "W" every:',
    },
    {
        key: 'non-working',
        expected: NON_WORKING_DISPLAYS,
        source: 'nowline v1\n\nconfig\n\ndefault roadmap non-working:',
    },
];

async function builtInValues(source: string): Promise<string[]> {
    const doc = await parseDocument(source);
    const lines = source.split('\n');
    const list = await services().Nowline.lsp.CompletionProvider!.getCompletion(doc, {
        textDocument: { uri: doc.uri.toString() },
        position: { line: lines.length - 1, character: lines.at(-1)!.length },
    });
    // The sources declare no labels, so every EnumMember is a built-in value.
    return (list?.items ?? [])
        .filter((item) => item.kind === CompletionItemKind.EnumMember)
        .map((item) => item.label);
}

describe('LSP completion: value sets match core', () => {
    it.each(CASES)('offers exactly the core table after $key:', async ({ expected, source }) => {
        expect(await builtInValues(source)).toEqual([...expected]);
    });
});
