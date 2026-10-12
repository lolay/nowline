// The VS Code extension ships static snippets next to the language server's
// completions. The extension has no Vitest suite, so the snippet choice lists
// are validated here, where the parse + validate services already live: every
// `scale:` and `status:` choice must be a value the validator accepts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAndValidate, validationErrors } from './helpers.js';

const SNIPPETS = fileURLToPath(
    new URL('../../vscode-extension/snippets/nowline.json', import.meta.url),
);

/** `key:${N|a,b,c|}` choice placeholders across every snippet body. */
function choiceLists(): { key: string; choices: string[] }[] {
    const snippets = JSON.parse(readFileSync(SNIPPETS, 'utf-8')) as Record<
        string,
        { body: string[] }
    >;
    const out: { key: string; choices: string[] }[] = [];
    for (const { body } of Object.values(snippets)) {
        for (const m of body.join('\n').matchAll(/([a-z][a-z-]*):\$\{\d+\|([^|}]+)\|\}/g)) {
            out.push({ key: m[1], choices: m[2].split(',') });
        }
    }
    return out;
}

const SOURCE_FOR: Record<string, (value: string) => string> = {
    scale: (v) =>
        `nowline v1\n\nroadmap demo "Demo" start:2026-01-05 scale:${v}\n\nswimlane s\n  item a duration:1w\n`,
    status: (v) =>
        `nowline v1\n\nroadmap demo "Demo" start:2026-01-05 scale:1w\n\nswimlane s\n  item a duration:1w status:${v}\n`,
};

describe('VS Code snippets', () => {
    const lists = choiceLists();

    it('only offers choice lists for keys this test knows how to check', () => {
        // `size:` choices are placeholders for author-declared sizes (there are
        // no built-in sizes), so they cannot be validated in isolation.
        for (const { key } of lists) {
            expect(['scale', 'status', 'size'], key).toContain(key);
        }
        expect(lists.some((l) => l.key === 'scale')).toBe(true);
        expect(lists.some((l) => l.key === 'status')).toBe(true);
    });

    it('offers only valid `scale:` and `status:` values', async () => {
        for (const { key, choices } of lists) {
            const source = SOURCE_FOR[key];
            if (!source) continue;
            for (const choice of choices) {
                expect(await validationErrors(source(choice)), `${key}:${choice}`).toEqual([]);
            }
        }
    });
});

describe('VS Code snippets: working calendar declarations', () => {
    const snippets = JSON.parse(readFileSync(SNIPPETS, 'utf-8')) as Record<
        string,
        { prefix: string; body: string[] }
    >;

    /** The snippet body with each `${N:default}` placeholder at its default and `$0` removed. */
    function expand(prefix: string): string {
        const found = Object.values(snippets).find((s) => s.prefix === prefix);
        expect(found, `snippet with prefix ${prefix}`).toBeDefined();
        return found!.body
            .join('\n')
            .replace(/\$\{\d+:([^}]*)\}/g, '$1')
            .replace(/\$0/g, '');
    }

    // The roadmap carries one swimlane: a file with none is itself an error.
    const inConfig = (line: string) =>
        `nowline v1\n\nconfig\n\n${line}\n\nroadmap r "R" start:2026-01-05\n\nswimlane s\n  item a duration:1w\n`;

    it('expands non-working to the documented declaration', () => {
        expect(expand('non-working')).toBe(
            'non-working id "Title" start:2026-11-26 end:2026-11-27',
        );
    });

    it('expands working to the documented declaration', () => {
        expect(expand('working')).toBe('working id "Title" date:2026-01-10');
    });

    it('validates both snippets at their defaults with no diagnostics', async () => {
        for (const prefix of ['non-working', 'working']) {
            const diagnostics = await parseAndValidate(inConfig(expand(prefix)));
            expect(
                diagnostics.map((d) => d.message),
                prefix,
            ).toEqual([]);
        }
    });
});
