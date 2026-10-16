// Syntax errors in included files (specs/dsl.md, Include rule 13). An
// included file is parsed with `validation:false`, so the resolver reports
// its lexer and parser errors itself, in that file at their position, in
// every include mode, as routed diagnostics (exit 1 in the CLI).

import * as path from 'node:path';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { NowlineFile } from '../../src/generated/ast.js';
import {
    isRoutedResolveDiagnostic,
    type ResolveResult,
    resolveIncludes,
} from '../../src/language/include-resolver.js';
import { getServices } from '../helpers.js';

const abs = (rel: string): string => path.resolve('/root', rel);

function makeFs(files: Record<string, string>): (p: string) => Promise<string> {
    return async (p) => {
        const rel = path.relative('/root', p).split(path.sep).join('/');
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
}

async function resolveAt(
    files: Record<string, string>,
    main = 'host.nowline',
): Promise<ResolveResult> {
    const { Nowline, shared } = getServices();
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        files[main],
        URI.file(abs(main)),
    );
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return resolveIncludes(doc.parseResult.value, abs(main), {
        services: Nowline,
        readFile: makeFs(files),
    });
}

/** `[rule, file, 0-based line, 0-based column]` of every syntax diagnostic. */
function syntax(
    result: ResolveResult,
): Array<[string, string, number | undefined, number | undefined]> {
    return result.diagnostics
        .filter((d) => d.rule === 'lex-error' || d.rule === 'parse-error')
        .map((d) => [d.rule as string, path.basename(d.sourcePath), d.line, d.column]);
}

const host = (include: string) =>
    [
        'nowline v1',
        '',
        include,
        '',
        'roadmap host "Host" start:2026-01-05',
        '',
        'swimlane core "Core"',
        '  item api "API" duration:3w',
        '',
    ].join('\n');

const childWith = (last: string) =>
    [
        'nowline v1',
        '',
        'roadmap child "Child" start:2026-01-05',
        '',
        'swimlane plugin "Plugin"',
        '  item alpha "Plugin alpha" duration:3w',
        last,
        '',
    ].join('\n');

// The issue's repro: an unterminated string on line 7, column 10.
const lexChild = childWith('swimlane "unterminated');
// A second `roadmap` after a swimlane: the parser stops at line 7, column 1.
const parseChild = childWith('roadmap again "Again"');

describe('include: syntax errors in an included file', () => {
    for (const mode of ['merge', 'isolate', 'ignore']) {
        it(`roadmap:${mode} reports a lexer error in the child at its position`, async () => {
            const result = await resolveAt({
                'host.nowline': host(`include "./child.nowline" roadmap:${mode}`),
                'child.nowline': lexChild,
            });
            expect(syntax(result)).toEqual([['lex-error', 'child.nowline', 6, 9]]);
            const diag = result.diagnostics.find((d) => d.rule === 'lex-error')!;
            expect(diag.severity).toBe('error');
            expect(diag.message).toContain('unexpected character');
            expect(isRoutedResolveDiagnostic(diag)).toBe(true);
        });
    }

    it('config:ignore roadmap:ignore still reports it', async () => {
        const result = await resolveAt({
            'host.nowline': host('include "./child.nowline" config:ignore roadmap:ignore'),
            'child.nowline': lexChild,
        });
        expect(syntax(result)).toEqual([['lex-error', 'child.nowline', 6, 9]]);
    });

    it('reports a parser error in the child at its position', async () => {
        const result = await resolveAt({
            'host.nowline': host('include "./child.nowline"'),
            'child.nowline': parseChild,
        });
        expect(syntax(result)).toEqual([['parse-error', 'child.nowline', 6, 0]]);
    });

    it("reports a grandchild's error in the grandchild", async () => {
        const result = await resolveAt({
            'host.nowline': host('include "./mid.nowline"'),
            'mid.nowline': 'nowline v1\n\ninclude "./child.nowline"\n',
            'child.nowline': lexChild,
        });
        expect(syntax(result)).toEqual([['lex-error', 'child.nowline', 6, 9]]);
    });

    it('reports a file reached by two includes once', async () => {
        const result = await resolveAt({
            'host.nowline': [
                'nowline v1',
                '',
                'include "./a.nowline"',
                'include "./b.nowline"',
                '',
            ].join('\n'),
            'a.nowline': 'nowline v1\n\ninclude "./child.nowline"\n',
            'b.nowline': 'nowline v1\n\ninclude "./child.nowline" roadmap:ignore\n',
            'child.nowline': lexChild,
        });
        expect(syntax(result)).toEqual([['lex-error', 'child.nowline', 6, 9]]);
    });

    it('a clean child reports none', async () => {
        const result = await resolveAt({
            'host.nowline': host('include "./child.nowline"'),
            'child.nowline': childWith(''),
        });
        expect(syntax(result)).toEqual([]);
    });
});
