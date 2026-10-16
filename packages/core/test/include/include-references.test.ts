// Unresolved references in included files (specs/dsl.md, Reference rule 1,
// NL.E0302). References never cross a file boundary, so an included file's
// `after:`, `before:` and `on:` are checked against its own ids, in that file,
// whatever the include mode. `roadmap:ignore` drops the content, so it stays
// silent.

import * as path from 'node:path';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { NowlineFile } from '../../src/generated/ast.js';
import { tr } from '../../src/i18n/index.js';
import {
    isRoutedResolveDiagnostic,
    type ResolveResult,
    resolveIncludes,
} from '../../src/language/include-resolver.js';
import { localizeResolveDiagnostic } from '../../src/language/waves-plan.js';
import { getServices, parse } from '../helpers.js';

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

/** `[code, file, 0-based line, message]` of every NL.E0302. */
function unresolved(result: ResolveResult): Array<[string, string, number | undefined, string]> {
    return result.diagnostics
        .filter((d) => d.code === 'NL.E0302')
        .map((d) => [d.code as string, path.basename(d.sourcePath), d.line, d.message]);
}

const message = (key: string, value: string): string => tr('en-US', 'NL.E0302', { key, value });

// The issue's repro: the child's `after:launch` names the parent's anchor.
const host = (mode: string) =>
    [
        'nowline v1',
        '',
        `include "./child.nowline" roadmap:${mode}`,
        '',
        'roadmap host "Host" start:2026-01-05',
        '',
        'anchor launch "Launch" date:2026-01-05',
        '',
        'swimlane core "Core"',
        '  item api "API" duration:3w after:launch',
        '',
    ].join('\n');

const child = [
    'nowline v1',
    '',
    'roadmap child "Child" start:2026-01-05',
    '',
    'anchor kickoff "Kickoff" date:2026-01-12',
    '',
    'swimlane plugin "Plugin"',
    '  item alpha "Plugin alpha" duration:3w after:launch',
    '',
].join('\n');

describe('NL.E0302 in included files', () => {
    it('the validator codes its own unresolved reference NL.E0302', async () => {
        const r = await parse(child);
        const diag = r.diagnostics.find((d) => d.message === message('after', 'launch'));
        expect(diag?.data).toEqual({ code: 'NL.E0302', args: [{ key: 'after', value: 'launch' }] });
    });

    it.each(['isolate', 'merge'])(
        'roadmap:%s reports the child reference in the child file',
        async (mode) => {
            const result = await resolveAt({ 'host.nowline': host(mode), 'child.nowline': child });
            expect(unresolved(result)).toEqual([
                ['NL.E0302', 'child.nowline', 7, message('after', 'launch')],
            ]);
            const [d] = result.diagnostics.filter((x) => x.code === 'NL.E0302');
            expect(d.severity).toBe('error');
            expect(d.sourcePath).toBe(abs('child.nowline'));
            expect(d.args).toEqual([{ key: 'after', value: 'launch' }]);
            // Consumers report it like a validator diagnostic (exit 1), localized.
            expect(isRoutedResolveDiagnostic(d)).toBe(true);
            expect(localizeResolveDiagnostic('fr', d)).toBe(
                tr('fr', 'NL.E0302', { key: 'after', value: 'launch' }),
            );
        },
    );

    it('carries the range the validator reports for the same reference', async () => {
        const validated = (await parse(child)).diagnostics.find(
            (d) => d.message === message('after', 'launch'),
        );
        const result = await resolveAt({ 'host.nowline': host('merge'), 'child.nowline': child });
        const [d] = result.diagnostics.filter((x) => x.code === 'NL.E0302');
        // `after:launch`, 0-based: line 7, characters 40 to 52.
        expect(d.range).toEqual({
            start: { line: 7, character: 40 },
            end: { line: 7, character: 52 },
        });
        expect(d.range).toEqual(validated?.range);
        expect(d.line).toBe(d.range?.start.line);
    });

    it('roadmap:ignore drops the child content and stays silent', async () => {
        const result = await resolveAt({ 'host.nowline': host('ignore'), 'child.nowline': child });
        expect(result.diagnostics).toEqual([]);
    });

    it('a child that resolves its own references is silent in every mode', async () => {
        const own = child.replace('after:launch', 'after:kickoff');
        for (const mode of ['merge', 'isolate', 'ignore']) {
            const result = await resolveAt({ 'host.nowline': host(mode), 'child.nowline': own });
            expect(result.diagnostics).toEqual([]);
        }
    });

    it('reports an id declared nowhere, and before: and on:, under merge', async () => {
        const result = await resolveAt({
            'host.nowline': host('merge'),
            'child.nowline': [
                'roadmap child "Child" start:2026-01-05',
                'swimlane plugin "Plugin"',
                '  item alpha duration:3w after:[kickoff, ghost] before:launch',
                'footnote f "Note" on:api',
                '',
            ].join('\n'),
        });
        expect(unresolved(result)).toEqual([
            ['NL.E0302', 'child.nowline', 2, message('after', 'kickoff')],
            ['NL.E0302', 'child.nowline', 2, message('after', 'ghost')],
            ['NL.E0302', 'child.nowline', 2, message('before', 'launch')],
            ['NL.E0302', 'child.nowline', 3, message('on', 'api')],
        ]);
    });

    it('a merged child cannot name a sibling include’s id', async () => {
        const result = await resolveAt({
            'host.nowline': [
                'include "./a.nowline"',
                'include "./b.nowline"',
                'roadmap host "Host"',
                'swimlane core',
                '  item api duration:1w',
                '',
            ].join('\n'),
            'a.nowline': 'swimlane a\n  item a1 duration:1w\n',
            'b.nowline': 'swimlane b\n  item b1 duration:1w after:a1\n',
        });
        expect(unresolved(result)).toEqual([['NL.E0302', 'b.nowline', 1, message('after', 'a1')]]);
    });

    it('checks a grandchild, and skips one reached only through roadmap:ignore', async () => {
        const result = await resolveAt({
            'host.nowline': [
                'include "./mid.nowline"',
                'roadmap host "Host"',
                'swimlane core',
                '  item api duration:1w',
                '',
            ].join('\n'),
            'mid.nowline': [
                'include "./deep.nowline"',
                'include "./styles.nowline" roadmap:ignore',
                'swimlane mid',
                '  item m1 duration:1w after:d1',
                '',
            ].join('\n'),
            'deep.nowline': 'swimlane deep\n  item d1 duration:1w after:m1\n',
            'styles.nowline': 'swimlane unused\n  item s1 duration:1w after:nowhere\n',
        });
        // mid names deep's d1 and deep names mid's m1: each is its own file's error.
        expect(unresolved(result)).toEqual([
            ['NL.E0302', 'mid.nowline', 3, message('after', 'd1')],
            ['NL.E0302', 'deep.nowline', 1, message('after', 'm1')],
        ]);
    });

    it('a diamond-included file is reported once', async () => {
        const result = await resolveAt({
            'host.nowline': [
                'include "./a.nowline"',
                'include "./b.nowline"',
                'roadmap host "Host"',
                'swimlane core',
                '  item api duration:1w',
                '',
            ].join('\n'),
            'a.nowline': 'include "./d.nowline"\n',
            'b.nowline': 'include "./d.nowline"\n',
            'd.nowline': 'swimlane d\n  item d1 duration:1w after:api\n',
        });
        expect(unresolved(result)).toEqual([['NL.E0302', 'd.nowline', 1, message('after', 'api')]]);
    });

    it('a child that failed to parse is not checked', async () => {
        const result = await resolveAt({
            'host.nowline': host('merge'),
            'child.nowline': `${child}swimlane "unterminated\n`,
        });
        expect(unresolved(result)).toEqual([]);
    });
});
