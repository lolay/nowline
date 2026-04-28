import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { runCliBuilt, packageRoot } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

describeBuilt('CLI basics (requires `pnpm build`)', () => {
    it('bare invocation prints help and exits 0', async () => {
        const r = await runCliBuilt([]);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toMatch(/USAGE/);
        expect(r.stdout).toMatch(/nowline <input>/);
    });

    it('--help prints help and exits 0', async () => {
        const r = await runCliBuilt(['--help']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toMatch(/USAGE/);
    });

    it('-h is a short alias for --help', async () => {
        const r = await runCliBuilt(['-h']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toMatch(/USAGE/);
    });

    it('--version prints a semver and exits 0', async () => {
        const r = await runCliBuilt(['--version']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });

    it('-V is a short alias for --version', async () => {
        const r = await runCliBuilt(['-V']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });

    it('-v --quiet is a usage error', async () => {
        const r = await runCliBuilt(['-v', '-q', 'roadmap.nowline']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/verbose.*quiet|quiet.*verbose/i);
    });

    it('--serve --init is a usage error', async () => {
        const r = await runCliBuilt(['--serve', '--init']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/serve.*init|init.*serve/i);
    });

    it('--no-input flag (no positional) exits 2 with a missing-input message', async () => {
        const r = await runCliBuilt(['-f', 'svg']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/input|positional/i);
    });
});
