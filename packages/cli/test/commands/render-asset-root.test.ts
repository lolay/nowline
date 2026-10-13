import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { HostEnv } from '@nowline/export';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { renderHandler } from '../../src/commands/render.js';
import { CliError, ExitCode } from '../../src/io/exit-codes.js';
import { withTempDir } from '../helpers.js';

// Capture the host the CLI hands the export kernel, so a test can ask it to
// read an asset and see which directory it resolves against. The real
// implementation still runs.
const hosts = vi.hoisted(() => [] as HostEnv[]);

vi.mock('@nowline/export', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/export')>();
    return {
        ...actual,
        exportDocument: (...args: Parameters<typeof actual.exportDocument>) => {
            hosts.push(args[3]);
            return actual.exportDocument(...args);
        },
    };
});

const SAMPLE = 'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w\n';

afterEach(() => {
    hosts.length = 0;
});

/**
 * Lay out a project: `<dir>/.nowlinerc`, the roadmap in `<dir>/roadmaps/`, and
 * a marker file in each directory an asset root could name. Renders from
 * `<dir>` and returns what the kernel's host reads for `marker.txt`, which
 * names the directory it resolved to.
 */
async function assetRootUsed(options: {
    rc?: string;
    flags?: (dir: string) => string[];
}): Promise<string> {
    let used = '';
    await withTempDir(async (dir) => {
        for (const sub of ['roadmaps', 'assets', 'flagged']) {
            await fs.mkdir(path.join(dir, sub), { recursive: true });
            await fs.writeFile(path.join(dir, sub, 'marker.txt'), sub);
        }
        await fs.writeFile(path.join(dir, 'roadmaps', 'sample.nowline'), SAMPLE);
        if (options.rc !== undefined) {
            await fs.writeFile(path.join(dir, '.nowlinerc'), options.rc);
        }
        const flags = options.flags?.(dir) ?? [];
        const args = parseArgv([path.join('roadmaps', 'sample.nowline'), '--dry-run', ...flags]);
        await renderHandler({ args, cwd: dir });
        const bytes = await hosts[0].readAsset('marker.txt');
        used = new TextDecoder().decode(bytes);
    });
    return used;
}

describe('render: rc assetRoot', () => {
    it('reads from the input directory when neither the flag nor the rc sets it', async () => {
        expect(await assetRootUsed({ rc: 'theme: dark\n' })).toBe('roadmaps');
    });

    it('resolves a relative rc value against the .nowlinerc directory', async () => {
        // The rc is in <dir>, the input in <dir>/roadmaps, `assets` is <dir>/assets.
        expect(await assetRootUsed({ rc: 'assetRoot: assets\n' })).toBe('assets');
    });

    it('accepts an absolute rc value', async () => {
        await withTempDir(async (dir) => {
            await fs.mkdir(path.join(dir, 'abs'), { recursive: true });
            await fs.writeFile(path.join(dir, 'abs', 'marker.txt'), 'abs');
            await fs.writeFile(path.join(dir, 'sample.nowline'), SAMPLE);
            await fs.writeFile(
                path.join(dir, '.nowlinerc'),
                `assetRoot: ${JSON.stringify(path.join(dir, 'abs'))}\n`,
            );
            const args = parseArgv(['sample.nowline', '--dry-run']);
            await renderHandler({ args, cwd: dir });
            const bytes = await hosts[0].readAsset('marker.txt');
            expect(new TextDecoder().decode(bytes)).toBe('abs');
        });
    });

    it('lets --asset-root override the rc value', async () => {
        const used = await assetRootUsed({
            rc: 'assetRoot: assets\n',
            flags: (dir) => ['--asset-root', path.join(dir, 'flagged')],
        });
        expect(used).toBe('flagged');
    });

    it('resolves a relative --asset-root against the working directory, not the rc', async () => {
        const used = await assetRootUsed({
            rc: 'assetRoot: assets\n',
            flags: (dir) => [
                '--asset-root',
                path.relative(process.cwd(), path.join(dir, 'flagged')),
            ],
        });
        expect(used).toBe('flagged');
    });

    it('lets a valid flag hide a bad rc value', async () => {
        const used = await assetRootUsed({
            rc: 'assetRoot: 5\n',
            flags: (dir) => ['--asset-root', path.join(dir, 'flagged')],
        });
        expect(used).toBe('flagged');
    });

    it('rejects a non-string rc value as a usage error naming the key', async () => {
        const failure = await assetRootUsed({ rc: 'assetRoot: 5\n' }).then(
            () => undefined,
            (err: unknown) => err,
        );
        expect(failure).toBeInstanceOf(CliError);
        expect((failure as CliError).exitCode).toBe(ExitCode.InputError);
        expect((failure as CliError).message).toBe(
            'nowline: invalid .nowlinerc assetRoot "5". Must be a directory path.',
        );
    });
});
