import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('--init integration', () => {
    it('--init with no name writes ./roadmap.nowline', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['--init'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const target = path.join(dir, 'roadmap.nowline');
            expect(existsSync(target)).toBe(true);
            const contents = await fs.readFile(target, 'utf-8');
            expect(contents).toMatch(/^roadmap\s+\w+/m);
        });
    });

    it('--init my-project writes ./my-project.nowline (auto-appends .nowline)', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['--init', 'my-project'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const target = path.join(dir, 'my-project.nowline');
            expect(existsSync(target)).toBe(true);
            const contents = await fs.readFile(target, 'utf-8');
            expect(contents).toMatch(/"my-project"/);
        });
    });

    it('--init my-project.nowline accepts the literal extension', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['--init', 'my-project.nowline'], { cwd: dir });
            expect(r.exitCode).toBe(0);
            const target = path.join(dir, 'my-project.nowline');
            expect(existsSync(target)).toBe(true);
        });
    });

    it('--init my-project.txt rejects non-.nowline extensions', async () => {
        await withTempDir(async (dir) => {
            const r = await runCliBuilt(['--init', 'my-project.txt'], { cwd: dir });
            expect(r.exitCode).toBe(2);
            expect(r.stderr).toMatch(/\.nowline|extension|init/i);
        });
    });

    it('--init silently overwrites existing files', async () => {
        await withTempDir(async (dir) => {
            const first = await runCliBuilt(['--init', 'my-plan'], { cwd: dir });
            expect(first.exitCode).toBe(0);
            const second = await runCliBuilt(['--init', 'my-plan'], { cwd: dir });
            expect(second.exitCode).toBe(0);
        });
    });
});
