import { describe, it, expect } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runCliBuilt, packageRoot, examplesDir, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('`render` integration (requires `pnpm build`)', () => {
    it('prints SVG to stdout for the minimal example', async () => {
        const r = await runCliBuilt([
            'render',
            path.join(examplesDir, 'minimal.nowline'),
        ]);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.startsWith('<svg')).toBe(true);
        expect(r.stdout).toContain('</svg>');
    });

    it('-o writes SVG to a file and refuses to overwrite without --force', async () => {
        await withTempDir(async (dir) => {
            const output = path.join(dir, 'roadmap.svg');
            const first = await runCliBuilt([
                'render',
                path.join(examplesDir, 'minimal.nowline'),
                '-o', output,
            ]);
            expect(first.exitCode).toBe(0);
            const contents = await fs.readFile(output, 'utf-8');
            expect(contents.startsWith('<svg')).toBe(true);

            const second = await runCliBuilt([
                'render',
                path.join(examplesDir, 'minimal.nowline'),
                '-o', output,
            ]);
            expect(second.exitCode).toBe(3);
            expect(second.stderr).toMatch(/overwrite/i);

            const force = await runCliBuilt([
                'render',
                path.join(examplesDir, 'minimal.nowline'),
                '-o', output,
                '--force',
            ]);
            expect(force.exitCode).toBe(0);
        });
    });

    it('accepts stdin via `-`', async () => {
        const dsl = 'nowline v1\n\nroadmap r1 "R"\n\nswimlane a "A"\n  item x duration:1w\n';
        const r = await runCliBuilt(['render', '-'], { stdin: dsl });
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-layer="item"');
    });

    it('rejects unsupported -f png with a helpful message', async () => {
        const r = await runCliBuilt([
            'render',
            path.join(examplesDir, 'minimal.nowline'),
            '-f', 'png',
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/m2c|svg/i);
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
            const r = await runCliBuilt(['render', source, '--today', '2026-02-01']);
            expect(r.exitCode).toBe(0);
            expect(r.stdout).toContain('data-layer="nowline"');
            expect(r.stdout).toContain('Today');
        });
    });

    it('produces deterministic output for the same input', async () => {
        const a = await runCliBuilt(['render', path.join(examplesDir, 'minimal.nowline')]);
        const b = await runCliBuilt(['render', path.join(examplesDir, 'minimal.nowline')]);
        expect(a.exitCode).toBe(0);
        expect(a.stdout).toBe(b.stdout);
    });

    it('--theme dark emits dark-theme marker', async () => {
        const light = await runCliBuilt([
            'render',
            path.join(examplesDir, 'minimal.nowline'),
            '--theme', 'light',
        ]);
        const dark = await runCliBuilt([
            'render',
            path.join(examplesDir, 'minimal.nowline'),
            '--theme', 'dark',
        ]);
        expect(light.stdout).toContain('data-theme="light"');
        expect(dark.stdout).toContain('data-theme="dark"');
        expect(light.stdout).not.toBe(dark.stdout);
    });
});
