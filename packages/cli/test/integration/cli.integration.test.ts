import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runCliBuilt, packageRoot, examplesDir, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);

const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('integration (requires `pnpm build`)', () => {
    it('`version` prints a semver string and exits 0', async () => {
        const r = await runCliBuilt(['version']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });

    it('`validate` exits 0 on the minimal example', async () => {
        const r = await runCliBuilt(['validate', path.join(examplesDir, 'minimal.nowline')]);
        expect(r.exitCode).toBe(0);
    });

    it('`validate` exits 1 on a broken file', async () => {
        const r = await runCliBuilt(['validate', '-'], {
            stdin: 'roadmap r\nswimlane s\n  item x\n',
        });
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toMatch(/error:/);
    });

    it('`validate` exits 2 on a missing file', async () => {
        const r = await runCliBuilt(['validate', '/this/path/does/not/exist.nowline']);
        expect(r.exitCode).toBe(2);
    });

    it('`convert` emits JSON for a .nowline input', async () => {
        const r = await runCliBuilt([
            'convert',
            path.join(examplesDir, 'minimal.nowline'),
            '-f',
            'json',
        ]);
        expect(r.exitCode).toBe(0);
        const parsed = JSON.parse(r.stdout);
        expect(parsed.$nowlineSchema).toBe('1');
    });

    it('`init` writes a file and refuses to overwrite without --force', async () => {
        await withTempDir(async (dir) => {
            const first = await runCliBuilt(['init', '--name', 'My Plan'], { cwd: dir });
            expect(first.exitCode).toBe(0);
            const filePath = path.join(dir, 'my-plan.nowline');
            expect(existsSync(filePath)).toBe(true);
            const contents = await fs.readFile(filePath, 'utf-8');
            expect(contents).toMatch(/roadmap minimal "My Plan"/);

            const second = await runCliBuilt(['init', '--name', 'My Plan'], { cwd: dir });
            expect(second.exitCode).toBe(3);

            const third = await runCliBuilt(['init', '--name', 'My Plan', '--force'], { cwd: dir });
            expect(third.exitCode).toBe(0);
        });
    });
});
