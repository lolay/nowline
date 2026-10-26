// `--include-root` and `--no-includes` (specs/cli.md § Include policy), and a
// missing include from stdin, the way a hosted validator runs the CLI:
// `nowline - --dry-run --format=json` with the source on stdin and an
// unrelated working directory.

import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const describeBuilt = existsSync(distEntry) ? describe : describe.skip;

const NO_LOCALE_ENV = { LC_ALL: '', LC_MESSAGES: '', LANG: '' };
const DRY_JSON = ['-', '--dry-run', '--format=json'];
const ROADMAP = 'roadmap r "R"\n\nswimlane s\n  item a duration:1w\n';

interface Diagnostic {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
}

async function writeFiles(dir: string, files: Record<string, string>): Promise<void> {
    for (const [rel, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await fs.writeFile(path.join(dir, rel), text);
    }
}

/**
 * A temp tree: `root/` (the include root), `cwd/` (the working directory,
 * which must not matter) and `outside/secret.nowline`, whose first token is
 * a secret that must never reach a diagnostic.
 */
async function withTree(
    files: Record<string, string>,
    fn: (dirs: { root: string; cwd: string; outside: string }) => Promise<void>,
): Promise<void> {
    await withTempDir(async (dir) => {
        const root = path.join(dir, 'root');
        const cwd = path.join(dir, 'cwd');
        const outside = path.join(dir, 'outside');
        await writeFiles(dir, {
            'outside/secret.nowline': 'secret-token-abc123\n',
            'cwd/secret.nowline': 'secret-token-abc123\n',
            ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`root/${k}`, v])),
        });
        await fn({ root, cwd, outside });
    });
}

async function run(args: string[], stdin: string, cwd: string) {
    const r = await runCliBuilt(args, { cwd, stdin, env: NO_LOCALE_ENV });
    const diagnostics: Diagnostic[] = r.stderr ? JSON.parse(r.stderr).diagnostics : [];
    expect(r.stderr).not.toContain('secret-token-abc123');
    return { ...r, diagnostics };
}

const brief = (d: Diagnostic) => [d.file, d.line, d.column, d.code];

describeBuilt('include policy (requires `pnpm build`)', () => {
    it('reports a missing include from stdin as exit 1 with NL.E0203 on the include', async () => {
        await withTree({}, async ({ cwd }) => {
            const r = await run(
                DRY_JSON,
                `nowline v1\n\ninclude "./nope.nowline"\n\n${ROADMAP}`,
                cwd,
            );
            expect(r.exitCode).toBe(1);
            expect(r.diagnostics).toEqual([
                {
                    file: '<stdin>',
                    line: 3,
                    column: 9,
                    severity: 'error',
                    code: 'NL.E0203',
                    message: 'Cannot read include "./nope.nowline": file not found.',
                    span: { start: { line: 3, column: 9 }, end: { line: 3, column: 25 } },
                },
            ]);
        });
    });

    describe('--no-includes', () => {
        it('reports every include as NL.E0209 and reads nothing', async () => {
            await withTree({}, async ({ cwd }) => {
                // Both targets exist and would fail to parse if read.
                const r = await run(
                    [...DRY_JSON, '--no-includes'],
                    `include "./secret.nowline"\ninclude "../outside/secret.nowline"\n${ROADMAP}`,
                    cwd,
                );
                expect(r.exitCode).toBe(1);
                expect(r.diagnostics.map(brief)).toEqual([
                    ['<stdin>', 1, 9, 'NL.E0209'],
                    ['<stdin>', 2, 9, 'NL.E0209'],
                ]);
                expect(r.diagnostics[0].message).toBe(
                    'Includes are not supported in this context: "./secret.nowline" was not read.',
                );
            });
        });

        it('leaves a source without includes alone', async () => {
            await withTree({}, async ({ cwd }) => {
                const r = await run([...DRY_JSON, '--no-includes'], ROADMAP, cwd);
                expect(r.exitCode).toBe(0);
                expect(r.stderr).toBe('');
            });
        });
    });

    describe('--include-root', () => {
        const files = {
            'teams/web.nowline': 'include "../shared.nowline"\n\nperson ana "Ana"\n',
            // NL.E0302 in the included file: its diagnostic names this file.
            'shared.nowline': 'swimlane shared\n  item b duration:1w after:nowhere\n',
        };

        it('resolves a stdin input against the root at any depth, naming files relative to it', async () => {
            await withTree(files, async ({ root, cwd }) => {
                const r = await run(
                    [...DRY_JSON, '--include-root', root],
                    `include "./teams/web.nowline"\n${ROADMAP}`,
                    cwd,
                );
                expect(r.exitCode).toBe(1);
                expect(r.diagnostics.map(brief)).toEqual([['shared.nowline', 2, 22, 'NL.E0302']]);
            });
        });

        it('takes a root relative to the working directory', async () => {
            await withTree({ 'teams/web.nowline': 'person ana "Ana"\n' }, async ({ root }) => {
                const r = await run(
                    [...DRY_JSON, '--include-root', 'root'],
                    `include "./teams/web.nowline"\n${ROADMAP}`,
                    path.dirname(root),
                );
                expect(r.exitCode).toBe(0);
            });
        });

        it('names a file input’s includes relative to the root too', async () => {
            await withTree(
                { ...files, 'main.nowline': `include "./teams/web.nowline"\n${ROADMAP}` },
                async ({ root, cwd }) => {
                    const r = await run(
                        [
                            path.join(root, 'main.nowline'),
                            '--dry-run',
                            '--format=json',
                            '--include-root',
                            root,
                        ],
                        '',
                        cwd,
                    );
                    expect(r.exitCode).toBe(1);
                    expect(r.diagnostics.map(brief)).toEqual([
                        ['shared.nowline', 2, 22, 'NL.E0302'],
                    ]);
                },
            );
        });

        it('refuses an absolute path', async () => {
            await withTree(files, async ({ root, cwd, outside }) => {
                const secret = path.join(outside, 'secret.nowline').split(path.sep).join('/');
                const r = await run(
                    [...DRY_JSON, '--include-root', root],
                    `include "${secret}"\n${ROADMAP}`,
                    cwd,
                );
                expect(r.exitCode).toBe(1);
                expect(r.diagnostics.map(brief)).toEqual([['<stdin>', 1, 9, 'NL.E0208']]);
                expect(r.diagnostics[0].message).toContain('is an absolute path');
            });
        });

        it('refuses a `..` that leaves the root, at any depth', async () => {
            await withTree(
                { 'teams/web.nowline': 'include "../../outside/secret.nowline"\n' },
                async ({ root, cwd }) => {
                    const r = await run(
                        [...DRY_JSON, '--include-root', root],
                        `include "./teams/web.nowline"\n${ROADMAP}`,
                        cwd,
                    );
                    expect(r.exitCode).toBe(1);
                    expect(r.diagnostics.map(brief)).toEqual([
                        ['teams/web.nowline'.split('/').join(path.sep), 1, 9, 'NL.E0208'],
                    ]);
                    expect(r.diagnostics[0].message).toBe(
                        'Include "../../outside/secret.nowline" resolves outside the include root.',
                    );
                },
            );
        });

        it('does not resolve a stdin include against the working directory', async () => {
            await withTree(files, async ({ root, cwd }) => {
                // cwd/secret.nowline exists; root/secret.nowline does not.
                const r = await run(
                    [...DRY_JSON, '--include-root', root],
                    `include "./secret.nowline"\n${ROADMAP}`,
                    cwd,
                );
                expect(r.exitCode).toBe(1);
                expect(r.diagnostics.map(brief)).toEqual([['<stdin>', 1, 9, 'NL.E0203']]);
            });
        });

        it('refuses a symlink that leaves the root', async () => {
            await withTree(files, async ({ root, cwd, outside }) => {
                // A junction needs no privilege on Windows; elsewhere the type is ignored.
                await fs.symlink(outside, path.join(root, 'linked'), 'junction');
                const r = await run(
                    [...DRY_JSON, '--include-root', root],
                    `include "./linked/secret.nowline"\n${ROADMAP}`,
                    cwd,
                );
                expect(r.exitCode).toBe(1);
                expect(r.diagnostics.map(brief)).toEqual([['<stdin>', 1, 9, 'NL.E0208']]);
                expect(r.diagnostics[0].message).toContain('through a symbolic link');
            });
        });

        it('follows a symlink that stays inside the root', async () => {
            await withTree(files, async ({ root, cwd }) => {
                await fs.symlink(path.join(root, 'teams'), path.join(root, 'alias'), 'junction');
                const r = await run(
                    [...DRY_JSON, '--include-root', root],
                    `include "./alias/web.nowline"\n${ROADMAP}`,
                    cwd,
                );
                // The diagnostic names the real file, inside the root.
                expect(r.diagnostics.map(brief)).toEqual([['shared.nowline', 2, 22, 'NL.E0302']]);
            });
        });

        it('is a usage error when the root is missing or not a directory', async () => {
            await withTree(files, async ({ root, cwd }) => {
                for (const bad of [path.join(root, 'nope'), path.join(root, 'shared.nowline')]) {
                    const r = await runCliBuilt([...DRY_JSON, '--include-root', bad], {
                        cwd,
                        stdin: ROADMAP,
                        env: NO_LOCALE_ENV,
                    });
                    expect(r.exitCode).toBe(2);
                    expect(r.stderr).toBe(
                        `nowline: invalid --include-root "${bad}". Expected an existing directory.\n`,
                    );
                }
            });
        });
    });

    it('rejects --no-includes with --include-root', async () => {
        await withTree({}, async ({ root, cwd }) => {
            const r = await runCliBuilt([...DRY_JSON, '--no-includes', '--include-root', root], {
                cwd,
                stdin: ROADMAP,
                env: NO_LOCALE_ENV,
            });
            expect(r.exitCode).toBe(2);
            expect(r.stderr).toBe(
                'nowline: --no-includes and --include-root are mutually exclusive.\n',
            );
        });
    });
});
