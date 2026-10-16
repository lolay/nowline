import * as path from 'node:path';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { NowlineFile } from '../../src/generated/ast.js';
import {
    isRoutedResolveDiagnostic,
    type ResolveDiagnostic,
    resolveIncludes,
} from '../../src/language/include-resolver.js';
import { getServices, parse } from '../helpers.js';

// Include rule 13 (specs/dsl.md): an included file's lexer and parser errors
// are reported in that file, at their line, as routed diagnostics.

function makeFs(files: Record<string, string>): (p: string) => Promise<string> {
    return async (absPath) => {
        const rel = path.relative('/root', absPath).split(path.sep).join('/');
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
}

async function parseAtPath(text: string, absPath: string): Promise<NowlineFile> {
    const { shared } = getServices();
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        text,
        URI.file(absPath),
    );
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return doc.parseResult.value;
}

// Platform-agnostic: `/root/x` on posix, `D:\\root\\x` on Windows.
const abs = (rel: string): string => path.resolve('/root', rel);

async function resolve(files: Record<string, string>) {
    const main = await parseAtPath(files['main.nowline'], abs('main.nowline'));
    return resolveIncludes(main, abs('main.nowline'), {
        services: getServices().Nowline,
        readFile: makeFs(files),
    });
}

function errors(diagnostics: ResolveDiagnostic[]): ResolveDiagnostic[] {
    return diagnostics.filter((d) => d.severity === 'error');
}

const MAIN = (include: string) =>
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

// The lexer error is on line 7 (0-based 6): the unterminated string.
const LEXER_CHILD = [
    'nowline v1',
    '',
    'roadmap child "Child" start:2026-01-05',
    '',
    'swimlane plugin "Plugin"',
    '  item alpha "Plugin alpha" duration:3w',
    'swimlane "unterminated',
    '',
].join('\n');

// The parser error is on line 6 (0-based 5): an item outside any swimlane.
const PARSER_CHILD = [
    'nowline v1',
    '',
    'roadmap child "Child" start:2026-01-05',
    '',
    'swimlane plugin "Plugin"',
    'item alpha "Plugin alpha" duration:3w',
    '',
].join('\n');

describe('include rule 13: an included file that fails to parse', () => {
    it('reports a lexer error in the child, at its line, as routed', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./child.nowline"'),
            'child.nowline': LEXER_CHILD,
        });
        const own = await parse(LEXER_CHILD, { validate: false });
        expect(errors(result.diagnostics)).toEqual([
            {
                severity: 'error',
                message: own.lexerErrors[0],
                sourcePath: abs('child.nowline'),
                line: 6,
                syntax: expect.objectContaining({ origin: 'lexer' }),
            },
        ]);
        expect(result.diagnostics.filter((d) => d.syntax).every(isRoutedResolveDiagnostic)).toBe(
            true,
        );
    });

    it('reports a parser error in the child, at its line', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./child.nowline"'),
            'child.nowline': PARSER_CHILD,
        });
        const own = await parse(PARSER_CHILD, { validate: false });
        expect(own.lexerErrors).toEqual([]);
        expect(errors(result.diagnostics)).toEqual([
            {
                severity: 'error',
                message: own.parserErrors[0],
                sourcePath: abs('child.nowline'),
                line: 5,
                syntax: expect.objectContaining({ origin: 'parser' }),
            },
        ]);
    });

    it('reports a parse error that ends the input without a line', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./child.nowline" roadmap:ignore'),
            'child.nowline': 'swimlane p "P"\n  item a duration:',
        });
        const [error] = errors(result.diagnostics);
        expect(error.syntax?.origin).toBe('parser');
        expect(error.sourcePath).toBe(abs('child.nowline'));
        expect(error.line === undefined || Number.isInteger(error.line)).toBe(true);
    });

    for (const options of ['roadmap:ignore', 'config:ignore roadmap:ignore', 'roadmap:isolate']) {
        it(`reports it under ${options}`, async () => {
            const result = await resolve({
                'main.nowline': MAIN(`include "./child.nowline" ${options}`),
                'child.nowline': LEXER_CHILD,
            });
            expect(
                errors(result.diagnostics).map((d) => [d.sourcePath, d.line, d.syntax?.origin]),
            ).toEqual([[abs('child.nowline'), 6, 'lexer']]);
        });
    }

    it('reports a style library that fails to parse', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./styles.nowline" roadmap:ignore'),
            'styles.nowline': 'config\n\nstyle s "S" ,\n',
        });
        expect(
            errors(result.diagnostics).map((d) => [d.sourcePath, d.line, d.syntax?.origin]),
        ).toEqual([[abs('styles.nowline'), 2, 'parser']]);
    });

    it('reports a grandchild at its own path', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./teams/a.nowline"'),
            'teams/a.nowline': 'include "./b.nowline"\n',
            'teams/b.nowline': 'swimlane p "P"\n  item a duration:1w\nswimlane "unterminated\n',
        });
        expect(errors(result.diagnostics).map((d) => [d.sourcePath, d.line])).toEqual([
            [abs('teams/b.nowline'), 2],
        ]);
    });

    it('reports a diamond-included file once', async () => {
        const result = await resolve({
            'main.nowline': [
                'include "./a.nowline"',
                'include "./b.nowline"',
                'roadmap r "R"',
                'swimlane s',
                '  item x duration:1w',
                '',
            ].join('\n'),
            'a.nowline': 'include "./shared.nowline"\n',
            'b.nowline': 'include "./shared.nowline"\n',
            'shared.nowline': 'person sam "Sam"\nperson ) "Bad"\n',
        });
        expect(errors(result.diagnostics).map((d) => d.sourcePath)).toEqual([
            abs('shared.nowline'),
        ]);
    });

    it('does not report the start: the parser lost as a start mismatch', async () => {
        // The unterminated title swallows `start:`.
        const child =
            'roadmap child "Child start:2026-01-05\nswimlane p "P"\n  item a duration:1w\n';
        const result = await resolve({
            'main.nowline': MAIN('include "./child.nowline"'),
            'child.nowline': child,
        });
        const found = errors(result.diagnostics);
        expect(found.length).toBeGreaterThan(0);
        expect(found.every((d) => d.syntax !== undefined)).toBe(true);
        expect(found.every(isRoutedResolveDiagnostic)).toBe(true);
    });

    it('does not report the roadmap the parser lost as an isolate error', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./child.nowline" roadmap:isolate'),
            // The misspelled keyword loses the roadmap declaration.
            'child.nowline': 'roadmapp child "Child" start:2026-01-05\nswimlane p "P"\n',
        });
        const found = errors(result.diagnostics);
        expect(found.length).toBeGreaterThan(0);
        expect(found.every((d) => d.syntax !== undefined)).toBe(true);
    });

    it("leaves the root file's own syntax errors to the validator", async () => {
        const result = await resolve({
            'main.nowline': `${MAIN('include "./child.nowline"')}swimlane "unterminated\n`,
            'child.nowline': 'person sam "Sam"\n',
        });
        expect(result.diagnostics.filter((d) => d.syntax)).toEqual([]);
    });

    it('reports nothing for a child that parses', async () => {
        const result = await resolve({
            'main.nowline': MAIN('include "./child.nowline"'),
            'child.nowline': LEXER_CHILD.replace('"unterminated', '"Terminated"'),
        });
        expect(errors(result.diagnostics)).toEqual([]);
    });
});
