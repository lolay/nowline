import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { tr } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { examplesDir, packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('verbless render (requires `pnpm build`)', () => {
    it('writes <input-base>.svg to cwd by default', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([path.join(examplesDir, 'minimal.nowline')], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'minimal.svg');
            expect(existsSync(out)).toBe(true);
            const contents = await fs.readFile(out, 'utf-8');
            expect(contents.startsWith('<svg')).toBe(true);
        });
    });

    it('-o - writes SVG to stdout', async () => {
        const r = await runCliBuilt([path.join(examplesDir, 'minimal.nowline'), '-o', '-']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.startsWith('<svg')).toBe(true);
        expect(r.stdout).toContain('</svg>');
    });

    it('-o <file> overwrites existing files silently (no --force)', async () => {
        await withTempDir(async (dir) => {
            const output = path.join(dir, 'roadmap.svg');
            const first = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o',
                output,
            ]);
            expect(first.exitCode).toBe(0);
            const firstContents = await fs.readFile(output, 'utf-8');
            expect(firstContents.startsWith('<svg')).toBe(true);

            const second = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o',
                output,
            ]);
            expect(second.exitCode).toBe(0);
            const secondContents = await fs.readFile(output, 'utf-8');
            expect(secondContents.startsWith('<svg')).toBe(true);
        });
    });

    it('accepts stdin via `-` and writes ./roadmap.svg', async () => {
        const dsl = 'nowline v1\n\nroadmap r1 "R"\n\nswimlane a "A"\n  item x duration:1w\n';
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['-'], { stdin: dsl, cwd: dir });
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'roadmap.svg');
            expect(existsSync(out)).toBe(true);
            const contents = await fs.readFile(out, 'utf-8');
            expect(contents).toContain('data-layer="item"');
        });
    });

    it('-o - with stdin still goes to stdout', async () => {
        const dsl = 'nowline v1\n\nroadmap r1 "R"\n\nswimlane a "A"\n  item x duration:1w\n';
        const r = await runCliBuilt(['-', '-o', '-'], { stdin: dsl });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-layer="item"');
    });

    it('-f png renders a PNG file (m2c)', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [path.join(examplesDir, 'minimal.nowline'), '-f', 'png', '--headless'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'minimal.png');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('--now places the now-line in the output', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '--now', '2026-02-01', '-o', '-'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain('data-layer="nowline"');
            // m2d: pill label reads the short-form "now" rather than "Today".
            expect(r.stdout).toContain('>now<');
        });
    });

    it('--now - suppresses the now-line even though today is in range', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            // Use a length that comfortably contains "today" so we know the
            // suppression came from `--now -`, not a date-window cutoff.
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2020-01-01 length:520w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '--now', '-', '-o', '-'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(r.stdout).not.toContain('data-layer="nowline"');
        });
    });

    it('default (no --now) draws the now-line at today when in range', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2020-01-01 length:520w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '-o', '-'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain('data-layer="nowline"');
        });
    });

    it('produces deterministic output for the same input', async () => {
        const a = await runCliBuilt([path.join(examplesDir, 'minimal.nowline'), '-o', '-']);
        const b = await runCliBuilt([path.join(examplesDir, 'minimal.nowline'), '-o', '-']);
        expect(a.exitCode).toBe(0);
        expect(a.stdout).toBe(b.stdout);
    });

    it('--theme dark emits dark-theme marker', async () => {
        const light = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '--theme',
            'light',
            '-o',
            '-',
        ]);
        const dark = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '--theme',
            'dark',
            '-o',
            '-',
        ]);
        expect(light.stdout).toContain('data-theme="light"');
        expect(dark.stdout).toContain('data-theme="dark"');
        expect(light.stdout).not.toBe(dark.stdout);
    });

    it('--theme grayscale is accepted and emits grayscale marker', async () => {
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '--theme',
            'grayscale',
            '-o',
            '-',
        ]);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-theme="grayscale"');
    });

    it('--theme greyscale (UK alias) canonicalizes to the grayscale marker', async () => {
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '--theme',
            'greyscale',
            '-o',
            '-',
        ]);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-theme="grayscale"');
    });

    it('--theme auto is rejected with an error', async () => {
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '--theme',
            'auto',
            '-o',
            '-',
        ]);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr).toContain('Expected light, dark, or grayscale');
    });

    it('-f json emits the JSON AST (replaces the old `convert` verb)', async () => {
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '-f',
            'json',
            '-o',
            '-',
        ]);
        expect(r.exitCode).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.$nowlineSchema).toBe('1');
    });

    it('-o report -f pdf auto-adds the .pdf extension', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [
                    path.join(examplesDir, 'minimal.nowline'),
                    '-o',
                    'report',
                    '-f',
                    'pdf',
                    '--headless',
                ],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'report.pdf');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('-o report.svg writes SVG to that name', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [path.join(examplesDir, 'minimal.nowline'), '-o', 'report.svg'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'report.svg');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('-f infers from .pdf extension and writes a PDF', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(
                [path.join(examplesDir, 'minimal.nowline'), '-o', 'foo.pdf', '--headless'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'foo.pdf');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('-o foo.xml without -f msproj fails as ambiguous', async () => {
        const r = await runCliBuilt([path.join(examplesDir, 'minimal.nowline'), '-o', 'foo.xml']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/msproj|xml/i);
    });
});

describeBuilt('verbless render — locale precedence (two-chain model)', () => {
    // File declares `locale:fr-CA`. Operator passes `--locale en-US`. Per
    // the two-chain model, the rendered SVG must remain in French (file
    // wins for content) while operator-facing messages use en-US. Here we
    // verify the artifact half of the rule end-to-end.
    it('file `locale:fr-CA` wins over `--locale en-US` for rendered SVG', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'fr-sample.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1 locale:fr-CA',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt(
                [source, '--locale', 'en-US', '--now', '2026-02-01', '-o', '-'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            // The now-pill is the headline localized string. "maint." is
            // French for "maintenant" (the short-form "now") and proves
            // the file directive's `fr-CA` won over the operator's
            // `--locale en-US`. (We don't assert absence of literal
            // "now" because the "Powered by now|line" attribution
            // contains a literal English "now" in every locale.)
            expect(r.stdout).toContain('>maint.<');
        });
    });

    // The operator chain still acts as a fallback when the file declines
    // to set its own locale. Same `--locale en-US` here, but the file has
    // no directive, so the rendered SVG is en-US.
    it('--locale fr fallback applies when the file omits locale:', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'no-directive.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt(
                [source, '--locale', 'fr-CA', '--now', '2026-02-01', '-o', '-'],
                { cwd: dir },
            );
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain('>maint.<');
        });
    });

    // Verbose mode prints exactly one `nowline: locale=...` line on
    // stderr after parse, naming the source so an operator can see at a
    // glance which chain won.
    it('--verbose logs the content locale source on stderr (file directive)', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'fr-sample.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1 locale:fr-CA',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '--verbose', '-o', '-'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(r.stderr).toContain('nowline: locale=fr-CA (from file directive)');
        });
    });

    it('--verbose logs the content locale source on stderr (--locale fallback)', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'no-directive.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '--locale', 'fr-CA', '--verbose', '-o', '-'], {
                cwd: dir,
            });
            expect(r.exitCode).toBe(0);
            expect(r.stderr).toContain('nowline: locale=fr-CA (from --locale)');
        });
    });

    // The split-locale headline test: file declares `locale:fr-CA` and
    // contains a validator error, but the operator is on en-US. The
    // operator must see the diagnostic in English (operator chain wins
    // for stderr) while the rendered artifact, had it been valid, would
    // have been French. We run with a deliberately invalid roadmap to
    // exercise the diagnostic path.
    it('split-locale: operator sees en-US diagnostic even when file says fr-CA', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'bad-fr.nowline');
            // Anchor without `date:` — fires NL.E0500.
            await fs.writeFile(
                source,
                [
                    'nowline v1 locale:fr-CA',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                    'anchor launch "Launch"',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '--locale', 'en-US', '-o', '-'], {
                cwd: dir,
                env: { LC_ALL: '', LC_MESSAGES: '', LANG: '' },
            });
            expect(r.exitCode).not.toBe(0);
            expect(r.stderr).toMatch(/Anchor "launch" requires/);
            expect(r.stderr).not.toMatch(/L'ancre/);
        });
    });

    // Mirror of the above with the operator on fr — even when no file
    // directive is present, the operator's locale governs diagnostics.
    it('split-locale: operator sees fr diagnostic when --locale fr (no file directive)', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'bad-en.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                    'anchor launch "Launch"',
                    '',
                ].join('\n'),
            );
            const r = await runCliBuilt([source, '--locale', 'fr', '-o', '-'], {
                cwd: dir,
                env: { LC_ALL: '', LC_MESSAGES: '', LANG: '' },
            });
            expect(r.exitCode).not.toBe(0);
            expect(r.stderr).toMatch(/L'ancre/);
        });
    });

    it('--verbose logs the content locale source on stderr (default en-US)', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'no-directive.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "R" start:2026-01-01 length:26w',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );
            // No --locale, no env override. The verbose line should
            // report the `default` source, not pretend a flag was set.
            const r = await runCliBuilt([source, '--verbose', '-o', '-'], {
                cwd: dir,
                env: { LC_ALL: '', LC_MESSAGES: '', LANG: '' },
            });
            expect(r.exitCode).toBe(0);
            expect(r.stderr).toContain('nowline: locale=en-US (default)');
        });
    });
});

// Wave-rule include diagnostics (specs/waves.md §6.1) are validation
// diagnostics: file and 1-based line, localized, in the one JSON document,
// exit 1. Uncoded include errors keep exit 3 and their message.
describeBuilt('render: include diagnostics', () => {
    const NO_LOCALE_ENV = { LC_ALL: '', LC_MESSAGES: '', LANG: '' };

    // The include is on line 3; the parent declares waves w1 and w2.
    const parent = (include: string) =>
        [
            'nowline v1',
            '',
            include,
            '',
            'roadmap r "R" start:2026-01-05',
            '',
            'wave w1 "One"',
            'wave w2 "Two"',
            '',
            'swimlane a "A"',
            '  item x duration:1w wave:w1',
            '',
        ].join('\n');
    const childWithWaves = (lane: string[], config: string[] = []) =>
        [...config, 'wave w1 "One"', 'wave w2 "Two"', '', ...lane, ''].join('\n');
    const childNoneArgs = {
        reason: 'child-none' as const,
        path: './child.nowline',
        parent: ['w1', 'w2'],
    };

    async function writeFiles(dir: string, files: Record<string, string>): Promise<void> {
        for (const [name, text] of Object.entries(files)) {
            const file = path.join(dir, name);
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, text);
        }
    }

    it('a parent with waves including a child without them fails with NL.E0202 (exit 1)', async () => {
        await withTempDir(async (dir) => {
            await writeFiles(dir, {
                'parent.nowline': parent('include "./child.nowline"'),
                'child.nowline': 'swimlane c "C"\n  item y duration:1w\n',
            });
            const r = await runCliBuilt(['parent.nowline', '-o', '-'], {
                cwd: dir,
                env: NO_LOCALE_ENV,
            });
            expect(r.exitCode).toBe(1);
            expect(r.stdout).toBe('');
            expect(r.stderr).toContain(
                `parent.nowline:3:1 error: ${tr('en-US', 'NL.E0202', childNoneArgs)}`,
            );
            expect(r.stderr).not.toContain('export failed');
        });
    });

    it('--diagnostic-format json reports NL.E0202 in the one document', async () => {
        await withTempDir(async (dir) => {
            await writeFiles(dir, {
                'parent.nowline': parent('include "./child.nowline"'),
                'child.nowline': 'swimlane c "C"\n  item y duration:1w\n',
            });
            const r = await runCliBuilt(
                ['parent.nowline', '-o', '-', '--diagnostic-format', 'json'],
                { cwd: dir, env: NO_LOCALE_ENV },
            );
            expect(r.exitCode).toBe(1);
            const doc = JSON.parse(r.stderr);
            expect(doc.$nowlineDiagnostics).toBe('1');
            expect(doc.diagnostics).toEqual([
                {
                    file: 'parent.nowline',
                    line: 3,
                    column: 1,
                    severity: 'error',
                    code: 'NL.E0202',
                    message: tr('en-US', 'NL.E0202', childNoneArgs),
                    // The span covers the include line.
                    span: {
                        start: { line: 3, column: 1 },
                        end: { line: 3, column: 'include "./child.nowline"'.length + 1 },
                    },
                },
            ]);
        });
    });

    it('--locale fr localizes NL.E0202', async () => {
        await withTempDir(async (dir) => {
            await writeFiles(dir, {
                'parent.nowline': parent('include "./child.nowline"'),
                'child.nowline': 'swimlane c "C"\n  item y duration:1w\n',
            });
            const r = await runCliBuilt(['parent.nowline', '-o', '-', '--locale', 'fr'], {
                cwd: dir,
                env: NO_LOCALE_ENV,
            });
            expect(r.exitCode).toBe(1);
            const fr = tr('fr', 'NL.E0202', childNoneArgs);
            expect(fr).not.toBe(tr('en-US', 'NL.E0202', childNoneArgs));
            expect(r.stderr).toContain(`parent.nowline:3:1 error: ${fr}`);
        });
    });

    it('reports NL.E1101 in a child at the child path and line', async () => {
        await withTempDir(async (dir) => {
            await writeFiles(dir, {
                'parent.nowline': parent('include "./teams/child.nowline"'),
                'teams/child.nowline': childWithWaves([
                    'swimlane c "C"',
                    '  item y duration:1w wave:w9',
                ]),
            });
            const r = await runCliBuilt(['parent.nowline', '-o', '-'], {
                cwd: dir,
                env: NO_LOCALE_ENV,
            });
            expect(r.exitCode).toBe(1);
            const message = tr('en-US', 'NL.E1101', {
                reason: 'unknown',
                value: 'w9',
                declared: ['w1', 'w2'],
            });
            expect(r.stderr).toContain(
                `${path.join('teams', 'child.nowline')}:5:3 error: ${message}`,
            );
        });
    });

    it('WV8 in a child is a validation error (exit 1, not 3)', async () => {
        await withTempDir(async (dir) => {
            await writeFiles(dir, {
                'parent.nowline': parent('include "./child.nowline"'),
                'child.nowline': childWithWaves(
                    ['swimlane c "C"', '  item y duration:1w wave:w1'],
                    ['config', 'default item wave:w1', ''],
                ),
            });
            const r = await runCliBuilt(['parent.nowline', '-o', '-'], {
                cwd: dir,
                env: NO_LOCALE_ENV,
            });
            expect(r.exitCode).toBe(1);
            expect(r.stderr).toContain(
                'child.nowline:2:1 error: "wave" cannot be set on "default item".',
            );
        });
    });

    it('merges validator and resolver warnings into one JSON document (exit 0)', async () => {
        await withTempDir(async (dir) => {
            // No waves anywhere: `wave:` is ignored with NL.W0702, from the
            // validator in the parent and from the resolver in the child.
            await writeFiles(dir, {
                'parent.nowline': [
                    'include "./child.nowline"',
                    'roadmap r "R" start:2026-01-05',
                    'swimlane a "A"',
                    '  item x duration:1w wave:w1',
                    '',
                ].join('\n'),
                'child.nowline': 'swimlane c "C"\n  item y duration:1w wave:w1\n',
            });
            const r = await runCliBuilt(
                ['parent.nowline', '-o', '-', '--diagnostic-format', 'json'],
                { cwd: dir, env: NO_LOCALE_ENV },
            );
            expect(r.exitCode).toBe(0);
            expect(r.stdout.startsWith('<svg')).toBe(true);
            const doc = JSON.parse(r.stderr);
            expect(
                doc.diagnostics.map((d: { file: string; line: number; code: string }) => [
                    d.file,
                    d.line,
                    d.code,
                ]),
            ).toEqual([
                ['parent.nowline', 4, 'NL.W0702'],
                ['child.nowline', 2, 'NL.W0702'],
            ]);
        });
    });

    it('text mode keeps warnings quiet on a successful run', async () => {
        await withTempDir(async (dir) => {
            await writeFiles(dir, {
                'parent.nowline':
                    'include "./child.nowline"\nroadmap r "R"\nswimlane a "A"\n  item x duration:1w\n',
                'child.nowline': 'swimlane c "C"\n  item y duration:1w wave:w1\n',
            });
            const r = await runCliBuilt(['parent.nowline', '-o', '-'], {
                cwd: dir,
                env: NO_LOCALE_ENV,
            });
            expect(r.exitCode).toBe(0);
            expect(r.stderr).toBe('');
        });
    });

    it('REGRESSION: a missing include keeps exit 3 and the same message', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'parent.nowline');
            await fs.writeFile(
                source,
                'include "./missing.nowline"\nroadmap r "R"\nswimlane a "A"\n  item x duration:1w\n',
            );
            for (const extra of [[], ['--diagnostic-format', 'json']]) {
                const r = await runCliBuilt([source, '-o', '-', ...extra], {
                    cwd: dir,
                    env: NO_LOCALE_ENV,
                });
                expect(r.exitCode).toBe(3);
                expect(r.stdout).toBe('');
                // Captured from the CLI before wave diagnostics were routed.
                expect(r.stderr).toBe(
                    `nowline: svg export failed: @nowline/export: include error in ${source}: ` +
                        `Could not read include "./missing.nowline": ENOENT: no such file or directory, open '${path.join(dir, 'missing.nowline')}'\n`,
                );
            }
        });
    });

    it('REGRESSION: JSON mode reports validator warnings before a missing-include failure', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'parent.nowline');
            await fs.writeFile(
                source,
                'include "./missing.nowline"\nroadmap r "R"\nswimlane a "A"\n  item x duration:1w sizee:l\n',
            );
            const args = [source, '-o', '-', '--diagnostic-format', 'json'];
            // Reference: the same parent with the include present reports
            // only the validator's warnings document.
            await fs.writeFile(path.join(dir, 'missing.nowline'), 'swimlane c "C"\n');
            const ok = await runCliBuilt(args, { cwd: dir, env: NO_LOCALE_ENV });
            expect(ok.exitCode).toBe(0);
            expect(JSON.parse(ok.stderr).diagnostics.map((d: { code: string }) => d.code)).toEqual([
                'NL.W0700',
            ]);
            await fs.rm(path.join(dir, 'missing.nowline'));
            const r = await runCliBuilt(args, { cwd: dir, env: NO_LOCALE_ENV });
            expect(r.exitCode).toBe(3);
            expect(r.stderr).toBe(
                `${ok.stderr}nowline: svg export failed: @nowline/export: include error in ${source}: ` +
                    `Could not read include "./missing.nowline": ENOENT: no such file or directory, open '${path.join(dir, 'missing.nowline')}'\n`,
            );
        });
    });

    // An option error raised after validation still follows the warnings
    // document, and --verbose's locale line still follows it, with or
    // without includes (the resolver runs during validation).
    for (const withInclude of [false, true]) {
        it(`JSON warnings precede later option errors and the locale line (include: ${withInclude})`, async () => {
            await withTempDir(async (dir) => {
                await writeFiles(dir, {
                    'parent.nowline': [
                        ...(withInclude ? ['include "./child.nowline"'] : []),
                        'roadmap r "R" start:2026-01-05',
                        'swimlane a "A"',
                        '  item x duration:1w sizee:l',
                        '',
                    ].join('\n'),
                    'child.nowline': 'swimlane c "C"\n  item y duration:1w\n',
                });
                const base = ['parent.nowline', '-o', '-', '--diagnostic-format', 'json'];
                const ok = await runCliBuilt(base, { cwd: dir, env: NO_LOCALE_ENV });
                expect(ok.exitCode).toBe(0);
                expect(ok.stderr.startsWith('{')).toBe(true);

                const margin = await runCliBuilt([...base, '--margin', 'bogus'], {
                    cwd: dir,
                    env: NO_LOCALE_ENV,
                });
                expect(margin.exitCode).toBe(2);
                expect(margin.stderr.startsWith(ok.stderr)).toBe(true);
                expect(margin.stderr.slice(ok.stderr.length)).toMatch(
                    /^nowline: invalid --margin "bogus": [^\n]*\n$/,
                );

                const verbose = await runCliBuilt([...base, '--verbose'], {
                    cwd: dir,
                    env: NO_LOCALE_ENV,
                });
                expect(verbose.exitCode).toBe(0);
                expect(verbose.stderr).toBe(
                    `nowline: format=svg (resolved)\n${ok.stderr}nowline: locale=en-US (default)\n`,
                );
            });
        });
    }

    // The committed renderer snapshots predate waves; the CLI writes the same
    // bytes plus a trailing newline, for a plain file and one with includes.
    for (const name of ['minimal', 'isolate-include']) {
        it(`${name}: a file with no waves renders byte-identically`, async () => {
            const snapshot = await fs.readFile(
                path.join(
                    packageRoot,
                    '..',
                    'integration-tests',
                    'test',
                    '__snapshots__',
                    `${name}.svg`,
                ),
                'utf-8',
            );
            const input = path.join(examplesDir, `${name}.nowline`);
            const r = await runCliBuilt([input, '-o', '-', '--now', '2026-02-09']);
            expect(r.exitCode).toBe(0);
            expect(r.stderr).toBe('');
            expect(r.stdout).toBe(`${snapshot}\n`);
            const json = await runCliBuilt([input, '-o', '-', '--diagnostic-format', 'json']);
            expect(json.exitCode).toBe(0);
            expect(json.stderr).toBe('');
        });
    }
});

// The render-time non-working display (specs/working-calendar.md §4.2; m2p
// phase 4). Precedence: --non-working, then the file's
// `default roadmap non-working:` key, then hide. "Unset" is undefined, so the
// file key still applies when the flag is omitted.
describeBuilt('render: --non-working', () => {
    const BODY = [
        'roadmap r "R" start:2026-01-05 scale:1w calendar:business',
        '',
        'swimlane a "A"',
        '  item w1 "W1" duration:1w',
        '  item w2 "W2" duration:1w',
        '',
    ].join('\n');
    const PLAIN = `nowline v1\n\n${BODY}`;
    const FILE_SHOW = `nowline v1\n\nconfig\n\ndefault roadmap non-working:show\n\n${BODY}`;
    const LAYER = 'data-layer="non-working"';

    it('--non-working show adds the non-working layer', async () => {
        const r = await runCliBuilt(['-', '-o', '-', '--now', '-', '--non-working', 'show'], {
            stdin: PLAIN,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain(LAYER);
    });

    it('a file key show with no flag has the layer', async () => {
        const r = await runCliBuilt(['-', '-o', '-', '--now', '-'], { stdin: FILE_SHOW });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain(LAYER);
    });

    it('a file key show with --non-working hide has no layer', async () => {
        const r = await runCliBuilt(['-', '-o', '-', '--now', '-', '--non-working', 'hide'], {
            stdin: FILE_SHOW,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).not.toContain(LAYER);
    });

    it('an invalid value fails with exit 2 and names the accepted values', async () => {
        const r = await runCliBuilt(['-', '-o', '-', '--non-working', 'maybe'], { stdin: PLAIN });
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain(
            'nowline: invalid --non-working "maybe". Expected hide or show.',
        );
        expect(r.stdout).toBe('');
    });

    it('an empty value is unset, so the file key still applies', async () => {
        const r = await runCliBuilt(['-', '-o', '-', '--now', '-', '--non-working', ''], {
            stdin: FILE_SHOW,
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain(LAYER);
    });
});
