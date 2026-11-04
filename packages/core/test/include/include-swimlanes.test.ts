// At least one swimlane in the merged result (specs/dsl.md, Structural rule
// 6, NL.E0004). A file whose swimlanes all come from includes (lolay/nowline
// #235) is valid: the validator defers the rule to `resolveIncludes`, which
// counts merged swimlanes and isolated regions' swimlanes.

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
    main = 'parent.nowline',
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

const E0004 = tr('en-US', 'NL.E0004');

const codes = (diagnostics: ReadonlyArray<{ code?: unknown; data?: unknown }>): unknown[] =>
    diagnostics.map((d) => d.code ?? (d.data as { code?: unknown } | undefined)?.code);

// The issue's repro.
const child = [
    'nowline v1',
    '',
    'roadmap child "Child" start:2026-11-02',
    '',
    'swimlane a "A"',
    '  item x "X" duration:1w',
    '',
].join('\n');

const parent = (options: string, include = './child.nowline') =>
    [
        'nowline v1',
        '',
        `include "${include}"${options ? ` ${options}` : ''}`,
        '',
        'roadmap parent "Parent" start:2026-11-02',
        '',
    ].join('\n');

describe('NL.E0004 across includes', () => {
    it('the validator still reports a file with no swimlane and no includes', async () => {
        const r = await parse('nowline v1\n\nroadmap r "R"\n');
        expect(codes(r.diagnostics)).toContain('NL.E0004');
    });

    it('the validator still reports a file whose only includes are roadmap:ignore', async () => {
        const r = await parse(parent('roadmap:ignore'));
        expect(codes(r.diagnostics)).toContain('NL.E0004');
    });

    it.each([
        ['merge (default)', ''],
        ['merge', 'roadmap:merge'],
        ['isolate', 'config:isolate roadmap:isolate'],
    ])('the validator defers a file with a roadmap:%s include', async (_name, options) => {
        const r = await parse(parent(options));
        expect(codes(r.diagnostics)).not.toContain('NL.E0004');
    });

    it.each([
        ['merge (default)', ''],
        ['isolate', 'config:isolate roadmap:isolate'],
    ])('a roadmap:%s include that holds the only swimlane is valid', async (_name, options) => {
        const result = await resolveAt({
            'parent.nowline': parent(options),
            'child.nowline': child,
        });
        expect(result.diagnostics).toEqual([]);
    });

    it('counts a swimlane in an isolated region nested in an isolated region', async () => {
        const result = await resolveAt({
            'parent.nowline': parent('roadmap:isolate', './middle.nowline'),
            'middle.nowline': [
                'nowline v1',
                '',
                'include "./child.nowline" roadmap:isolate',
                '',
                'roadmap middle "Middle" start:2026-11-02',
                '',
            ].join('\n'),
            'child.nowline': child,
        });
        expect(result.diagnostics).toEqual([]);
    });

    it.each([
        ['merge (default)', ''],
        ['isolate', 'roadmap:isolate'],
    ])(
        'reports a roadmap:%s include that adds no swimlane, at the roadmap',
        async (_name, options) => {
            const result = await resolveAt({
                'parent.nowline': parent(options),
                'child.nowline': 'nowline v1\n\nroadmap child "Child" start:2026-11-02\n',
            });
            expect(result.diagnostics).toHaveLength(1);
            const [d] = result.diagnostics;
            expect(d).toMatchObject({
                severity: 'error',
                code: 'NL.E0004',
                message: E0004,
                sourcePath: abs('parent.nowline'),
                line: 4,
            });
            // The validator reports it on the whole `roadmap` declaration.
            expect(d.range?.start).toEqual({ line: 4, character: 0 });
            expect(isRoutedResolveDiagnostic(d)).toBe(true);
        },
    );

    it('stays silent when an include could not be read', async () => {
        const result = await resolveAt({ 'parent.nowline': parent('') });
        expect(codes(result.diagnostics)).toEqual(['NL.E0203']);
    });

    it('the parent own swimlane is enough, whatever the include holds', async () => {
        const result = await resolveAt({
            'parent.nowline': `${parent('')}\nswimlane p "P"\n  item y duration:1w\n`,
            'child.nowline': 'nowline v1\n\nroadmap child "Child" start:2026-11-02\n',
        });
        expect(result.diagnostics).toEqual([]);
    });
});
