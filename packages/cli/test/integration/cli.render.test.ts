import { describe, it, expect } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runCliBuilt, packageRoot, examplesDir, withTempDir } from '../helpers.js';

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
