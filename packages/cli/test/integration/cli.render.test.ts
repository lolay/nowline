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
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '-o', '-',
        ]);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.startsWith('<svg')).toBe(true);
        expect(r.stdout).toContain('</svg>');
    });

    it('-o <file> overwrites existing files silently (no --force)', async () => {
        await withTempDir(async (dir) => {
            const output = path.join(dir, 'roadmap.svg');
            const first = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o', output,
            ]);
            expect(first.exitCode).toBe(0);
            const firstContents = await fs.readFile(output, 'utf-8');
            expect(firstContents.startsWith('<svg')).toBe(true);

            const second = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o', output,
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
            const r = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-f', 'png',
                '--headless',
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'minimal.png');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('--today places the now-line in the output', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            await fs.writeFile(source, [
                'nowline v1',
                '',
                'roadmap r1 "R" start:2026-01-01 length:26w',
                '',
                'swimlane a "A"',
                '  item x duration:1w',
                '',
            ].join('\n'));
            const r = await runCliBuilt([source, '--today', '2026-02-01', '-o', '-'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain('data-layer="nowline"');
            expect(r.stdout).toContain('Today');
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
            '--theme', 'light',
            '-o', '-',
        ]);
        const dark = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '--theme', 'dark',
            '-o', '-',
        ]);
        expect(light.stdout).toContain('data-theme="light"');
        expect(dark.stdout).toContain('data-theme="dark"');
        expect(light.stdout).not.toBe(dark.stdout);
    });

    it('-f json emits the JSON AST (replaces the old `convert` verb)', async () => {
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '-f', 'json',
            '-o', '-',
        ]);
        expect(r.exitCode).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.$nowlineSchema).toBe('1');
    });

    it('-o report -f pdf auto-adds the .pdf extension', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o', 'report',
                '-f', 'pdf',
                '--headless',
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'report.pdf');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('-o report.svg writes SVG to that name', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o', 'report.svg',
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'report.svg');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('-f infers from .pdf extension and writes a PDF', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                path.join(examplesDir, 'minimal.nowline'),
                '-o', 'foo.pdf',
                '--headless',
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const out = path.join(dir, 'foo.pdf');
            expect(existsSync(out)).toBe(true);
        });
    });

    it('-o foo.xml without -f msproj fails as ambiguous', async () => {
        const r = await runCliBuilt([
            path.join(examplesDir, 'minimal.nowline'),
            '-o', 'foo.xml',
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/msproj|xml/i);
    });
});
