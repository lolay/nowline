import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { runCliBuilt, packageRoot, examplesDir, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('--dry-run integration (replaces validate verb)', () => {
    it('exits 0 on a valid file and writes nothing', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                '--dry-run',
                path.join(examplesDir, 'minimal.nowline'),
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(existsSync(path.join(dir, 'minimal.svg'))).toBe(false);
        });
    });

    it('-n short alias works the same way', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt([
                '-n',
                path.join(examplesDir, 'minimal.nowline'),
            ], { cwd: dir });
            expect(r.exitCode).toBe(0);
            expect(existsSync(path.join(dir, 'minimal.svg'))).toBe(false);
        });
    });

    it('exits 1 on a broken file', async () => {
        const r = await runCliBuilt(['--dry-run', '-'], {
            stdin: 'roadmap r\nswimlane s\n  item x\n',
        });
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toMatch(/error:/);
    });

    it('exits 2 on a missing file', async () => {
        const r = await runCliBuilt(['--dry-run', '/this/path/does/not/exist.nowline']);
        expect(r.exitCode).toBe(2);
    });

    it('--dry-run --serve is a usage error', async () => {
        const r = await runCliBuilt([
            '--dry-run', '--serve',
            path.join(examplesDir, 'minimal.nowline'),
        ]);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/dry-run.*serve|serve.*dry-run/i);
    });
});
