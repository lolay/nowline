// Include policies (specs/dsl.md, Include rules 14 and 15) and the coded
// include errors every caller sees: an unreadable include, a cycle and a
// chain past MAX_INCLUDE_DEPTH.

import * as path from 'node:path';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { NowlineFile } from '../../src/generated/ast.js';
import {
    type IncludePolicy,
    MAX_INCLUDE_DEPTH,
    type ResolveDiagnostic,
    resolveIncludes,
} from '../../src/language/include-resolver.js';
import { getServices } from '../helpers.js';

const ROOT = path.resolve('/root');
const abs = (rel: string): string => path.resolve(ROOT, rel);

/** Fixture reader keyed by `/`-separated paths under ROOT; records every read. */
function fixtureFs(files: Record<string, string>) {
    const reads: string[] = [];
    const readFile = async (p: string): Promise<string> => {
        const rel = path.relative(ROOT, p).split(path.sep).join('/');
        reads.push(rel);
        if (!(rel in files)) {
            throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), {
                code: 'ENOENT',
            });
        }
        return files[rel];
    };
    return { readFile, reads };
}

async function parseAt(text: string, absPath: string): Promise<NowlineFile> {
    const { shared } = getServices();
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        text,
        URI.file(absPath),
    );
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return doc.parseResult.value;
}

async function resolveWith(
    files: Record<string, string>,
    options: { main?: string; policy?: IncludePolicy } = {},
) {
    const main = options.main ?? 'main.nowline';
    const { readFile, reads } = fixtureFs(files);
    const root = await parseAt(files[main], abs(main));
    const result = await resolveIncludes(root, abs(main), {
        services: getServices().Nowline,
        readFile,
        includePolicy: options.policy,
    });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    return { result, errors, reads };
}

const brief = (d: ResolveDiagnostic) => ({
    code: d.code,
    file: path.relative(ROOT, d.sourcePath).split(path.sep).join('/'),
    range: d.range,
    message: d.message,
});

const ROADMAP = 'roadmap r "R"\nswimlane s\n  item x duration:1w\n';

/** A rooted policy whose `realPath` maps the given symlinks and checks existence. */
function rooted(files: Record<string, string>, links: Record<string, string> = {}): IncludePolicy {
    return {
        kind: 'rooted',
        root: ROOT,
        realPath: async (p) => {
            const rel = path.relative(ROOT, p).split(path.sep).join('/');
            if (rel in links) return path.resolve(ROOT, links[rel]);
            if (rel in files) return p;
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
    };
}

describe('coded include errors', () => {
    it('reports an unreadable include as NL.E0203 at the path on the include line', async () => {
        const { errors } = await resolveWith({
            'main.nowline': `include "./nope.nowline"\n${ROADMAP}`,
        });
        expect(errors.map(brief)).toEqual([
            {
                code: 'NL.E0203',
                file: 'main.nowline',
                range: { start: { line: 0, character: 8 }, end: { line: 0, character: 24 } },
                message: 'Cannot read include "./nope.nowline": file not found.',
            },
        ]);
        // No OS text, so no absolute path, reaches the message.
        expect(errors[0].args).toEqual([{ reason: 'not-found', path: './nope.nowline' }]);
    });

    it('names a directory and a permission error without the OS message', async () => {
        const root = await parseAt(`include "./d.nowline"\n${ROADMAP}`, abs('main.nowline'));
        for (const [code, reason] of [
            ['EISDIR', 'it is a directory'],
            ['EACCES', 'permission denied'],
        ]) {
            const result = await resolveIncludes(root, abs('main.nowline'), {
                services: getServices().Nowline,
                readFile: async () => {
                    throw Object.assign(new Error(`${code}: /secret/path`), { code });
                },
            });
            expect(result.diagnostics.map((d) => d.message)).toEqual([
                `Cannot read include "./d.nowline": ${reason}.`,
            ]);
        }
    });

    it('refuses a file that is not .nowline before reading it', async () => {
        const { errors, reads } = await resolveWith({
            'main.nowline': `include "./secret.txt"\n${ROADMAP}`,
            'secret.txt': 'secret-token-abc123\n',
        });
        expect(errors.map((d) => d.message)).toEqual([
            'Cannot read include "./secret.txt": only .nowline files can be included.',
        ]);
        expect(reads).toEqual([]);
    });

    it('catches a cycle on the closing include line, before reading the file again', async () => {
        const { errors, reads } = await resolveWith({
            'main.nowline': `include "./a.nowline"\n${ROADMAP}`,
            'a.nowline': 'include "./b.nowline"\n',
            'b.nowline': 'include "./a.nowline"\nperson p "P"\n',
        });
        expect(errors.map(brief)).toEqual([
            {
                code: 'NL.E0204',
                file: 'b.nowline',
                range: { start: { line: 0, character: 8 }, end: { line: 0, character: 21 } },
                message:
                    'Circular include: "./a.nowline" is already being included (a.nowline → b.nowline → a.nowline).',
            },
        ]);
        expect(reads).toEqual(['a.nowline', 'b.nowline']);
    });

    it('reports a file that includes itself', async () => {
        const { errors } = await resolveWith({
            'main.nowline': `include "./main.nowline"\n${ROADMAP}`,
        });
        expect(errors.map((d) => d.code)).toEqual(['NL.E0204']);
    });

    it(`stops a chain deeper than ${MAX_INCLUDE_DEPTH} includes with NL.E0210`, async () => {
        const files: Record<string, string> = {
            'main.nowline': `include "./f1.nowline"\n${ROADMAP}`,
        };
        for (let i = 1; i <= MAX_INCLUDE_DEPTH + 5; i++) {
            files[`f${i}.nowline`] = `include "./f${i + 1}.nowline"\n`;
        }
        const { errors, reads } = await resolveWith(files);
        expect(errors.map(brief)).toEqual([
            {
                code: 'NL.E0210',
                file: `f${MAX_INCLUDE_DEPTH}.nowline`,
                range: { start: { line: 0, character: 8 }, end: { line: 0, character: 23 } },
                message: `Include "./f${MAX_INCLUDE_DEPTH + 1}.nowline" is more than ${MAX_INCLUDE_DEPTH} includes deep. Flatten the include chain.`,
            },
        ]);
        expect(reads).toHaveLength(MAX_INCLUDE_DEPTH);
    });

    it('allows a chain exactly MAX_INCLUDE_DEPTH deep', async () => {
        const files: Record<string, string> = {
            'main.nowline': `include "./f1.nowline"\n${ROADMAP}`,
        };
        for (let i = 1; i < MAX_INCLUDE_DEPTH; i++) {
            files[`f${i}.nowline`] = `include "./f${i + 1}.nowline"\n`;
        }
        files[`f${MAX_INCLUDE_DEPTH}.nowline`] = 'person p "P"\n';
        const { errors, result } = await resolveWith(files);
        expect(errors).toEqual([]);
        expect(result.content.persons.has('p')).toBe(true);
    });

    it('does not compare waves with an include that failed (no NL.E0202)', async () => {
        const waves = 'roadmap r "R"\nwave w1\nwave w2\nswimlane s\n  item x duration:1w wave:w1\n';
        const unreadable = await resolveWith({
            'main.nowline': `include "./nope.nowline"\n${waves}`,
        });
        expect(unreadable.errors.map((d) => d.code)).toEqual(['NL.E0203']);
        const disabled = await resolveWith(
            {
                'main.nowline': `include "./c.nowline"\n${waves}`,
                'c.nowline': 'swimlane c\n  item y duration:1w\n',
            },
            { policy: { kind: 'disabled' } },
        );
        expect(disabled.result.diagnostics.map((d) => d.code)).toEqual(['NL.E0209']);
    });
});

describe('includePolicy: disabled', () => {
    it('reports every include as NL.E0209 and reads nothing', async () => {
        const { errors, reads } = await resolveWith(
            {
                'main.nowline': `include "./a.nowline"\ninclude "/etc/b.nowline" roadmap:isolate\n${ROADMAP}`,
                'a.nowline': 'person p "P"\n',
            },
            { policy: { kind: 'disabled' } },
        );
        expect(errors.map(brief)).toEqual([
            {
                code: 'NL.E0209',
                file: 'main.nowline',
                range: { start: { line: 0, character: 8 }, end: { line: 0, character: 21 } },
                message: 'Includes are not supported in this context: "./a.nowline" was not read.',
            },
            {
                code: 'NL.E0209',
                file: 'main.nowline',
                range: { start: { line: 1, character: 8 }, end: { line: 1, character: 24 } },
                message:
                    'Includes are not supported in this context: "/etc/b.nowline" was not read.',
            },
        ]);
        expect(reads).toEqual([]);
    });
});

describe('includePolicy: rooted', () => {
    it('resolves includes at any depth inside the root, naming each file by its real path', async () => {
        const files = {
            'main.nowline': `include "./teams/a.nowline"\n${ROADMAP}`,
            'teams/a.nowline': 'include "../shared.nowline"\nperson a "A"\n',
            'shared.nowline': 'person s "S"\nswimlane broken\n  item y wave:',
        };
        const { result, reads } = await resolveWith(files, { policy: rooted(files) });
        expect(reads).toEqual(['teams/a.nowline', 'shared.nowline']);
        expect(result.content.persons.has('a')).toBe(true);
        // The included file's own errors point into it.
        const syntax = result.diagnostics.filter((d) => d.syntax);
        expect(syntax.length).toBeGreaterThan(0);
        expect(syntax.every((d) => d.sourcePath === abs('shared.nowline'))).toBe(true);
    });

    it('refuses an absolute path, even one inside the root, and reads nothing', async () => {
        const files = {
            'main.nowline': `include "${abs('a.nowline').split(path.sep).join('/')}"\n${ROADMAP}`,
            'a.nowline': 'person p "P"\n',
        };
        const { errors, reads } = await resolveWith(files, { policy: rooted(files) });
        expect(errors.map((d) => [d.code, d.args])).toEqual([
            [
                'NL.E0208',
                [{ reason: 'absolute', path: abs('a.nowline').split(path.sep).join('/') }],
            ],
        ]);
        expect(reads).toEqual([]);
    });

    it('refuses a `..` that leaves the root, without touching the disk', async () => {
        const files = {
            'main.nowline': `include "../inc/secret.nowline"\n${ROADMAP}`,
        };
        let realPathCalls = 0;
        const { errors, reads } = await resolveWith(files, {
            policy: {
                kind: 'rooted',
                root: ROOT,
                realPath: async (p) => {
                    realPathCalls++;
                    return p;
                },
            },
        });
        expect(errors.map(brief)).toEqual([
            {
                code: 'NL.E0208',
                file: 'main.nowline',
                range: { start: { line: 0, character: 8 }, end: { line: 0, character: 31 } },
                message: 'Include "../inc/secret.nowline" resolves outside the include root.',
            },
        ]);
        expect(reads).toEqual([]);
        expect(realPathCalls).toBe(0);
    });

    it('refuses a symlink that leaves the root, at any depth', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\n${ROADMAP}`,
            'a.nowline': 'include "./link.nowline"\n',
            'link.nowline': '',
        };
        const { errors, reads } = await resolveWith(files, {
            policy: rooted(files, { 'link.nowline': '../outside/secret.nowline' }),
        });
        expect(errors.map(brief)).toEqual([
            {
                code: 'NL.E0208',
                file: 'a.nowline',
                range: { start: { line: 0, character: 8 }, end: { line: 0, character: 24 } },
                message:
                    'Include "./link.nowline" resolves outside the include root through a symbolic link.',
            },
        ]);
        expect(reads).toEqual(['a.nowline']);
    });

    it('treats two spellings of one file as one file (duplicate)', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\ninclude "./alias.nowline"\n${ROADMAP}`,
            'a.nowline': 'person p "P"\n',
            'alias.nowline': '',
        };
        const { errors } = await resolveWith(files, {
            policy: rooted(files, { 'alias.nowline': 'a.nowline' }),
        });
        expect(errors.map((d) => d.code)).toEqual(['NL.E0205']);
    });

    it('reports a missing file inside the root as NL.E0203', async () => {
        const files = { 'main.nowline': `include "./nope.nowline"\n${ROADMAP}` };
        const { errors, reads } = await resolveWith(files, { policy: rooted(files) });
        expect(errors.map((d) => d.message)).toEqual([
            'Cannot read include "./nope.nowline": file not found.',
        ]);
        expect(reads).toEqual([]);
    });
});
