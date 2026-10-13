import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

const NO_LOCALE_ENV = { LC_ALL: '', LC_MESSAGES: '', LANG: '' };

// `labels:` has no MS Project equivalent, so the msproj export prints its
// lossy summary to stderr.
const LOSSY =
    'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w labels:[release]\n';

// `sizee:` is an unknown property (NL.W0700 warning); `y` has neither
// `size:` nor `duration:` (an error), so text mode prints both.
const WARN_AND_ERROR =
    'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w sizee:l\n  item y\n';

// Warnings only: the run succeeds.
const WARN_ONLY = 'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w sizee:l\n';

async function run(source: string, args: string[], rc?: string) {
    return withTempDir(async (dir) => {
        await fs.writeFile(path.join(dir, 'in.nowline'), source);
        if (rc !== undefined) await fs.writeFile(path.join(dir, '.nowlinerc'), rc);
        return runCliBuilt(['in.nowline', ...args], { cwd: dir, env: NO_LOCALE_ENV });
    });
}

describeBuilt('-q / --quiet (requires `pnpm build`)', () => {
    it('the msproj lossy summary prints normally and not under -q', async () => {
        const normal = await run(LOSSY, ['-f', 'msproj', '-o', '-']);
        expect(normal.exitCode).toBe(0);
        expect(normal.stderr).toContain('nowline: msproj export dropped');

        const quiet = await run(LOSSY, ['-f', 'msproj', '-o', '-', '-q']);
        expect(quiet.exitCode).toBe(0);
        expect(quiet.stderr).toBe('');
        expect(quiet.stdout).toBe(normal.stdout);
    });

    it('a failing text-mode run drops warnings but keeps errors and the exit code', async () => {
        const normal = await run(WARN_AND_ERROR, ['-o', '-']);
        expect(normal.exitCode).toBe(1);
        expect(normal.stderr).toContain('warning:');
        expect(normal.stderr).toContain('error:');

        const quiet = await run(WARN_AND_ERROR, ['-o', '-', '--quiet']);
        expect(quiet.exitCode).toBe(1);
        expect(quiet.stderr).not.toContain('warning:');
        expect(quiet.stderr).not.toContain('Unknown property');
        expect(quiet.stderr).toContain('in.nowline:7:3 error:');
    });

    it('--diagnostic-format json still prints warnings under -q', async () => {
        const normal = await run(WARN_ONLY, ['-o', '-', '--diagnostic-format', 'json']);
        const quiet = await run(WARN_ONLY, ['-o', '-', '--diagnostic-format', 'json', '-q']);
        expect(quiet.exitCode).toBe(0);
        expect(quiet.stderr).toBe(normal.stderr);
        expect(JSON.parse(quiet.stderr).diagnostics.map((d: { code: string }) => d.code)).toEqual([
            'NL.W0700',
        ]);
    });

    it('--dry-run --format=json still prints its diagnostics document under -q', async () => {
        const quiet = await run(WARN_ONLY, ['--dry-run', '--format=json', '-q']);
        expect(quiet.exitCode).toBe(0);
        expect(JSON.parse(quiet.stderr).$nowlineDiagnostics).toBe('1');
    });

    it('usage errors still print under -q', async () => {
        const r = await run(WARN_ONLY, ['-q', '--width', '10']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid --width "10"');
    });

    it('a .nowlinerc quiet key is ignored: logging is per invocation', async () => {
        const r = await run(LOSSY, ['-f', 'msproj', '-o', '-'], '{"quiet": true}');
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toContain('nowline: msproj export dropped');
    });
});
