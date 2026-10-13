import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

const SAMPLE = 'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w\n';

/**
 * Writes `sample.nowline` and a `.nowlinerc` with `rc` into a temp dir, then
 * renders the sample to stdout with `extraArgs`. The rc sits next to the
 * input, so it is the nearest one the walk-up finds.
 */
async function renderWithRc(rc: string, extraArgs: string[] = []) {
    return withTempDir(async (dir) => {
        await fs.writeFile(path.join(dir, 'sample.nowline'), SAMPLE);
        await fs.writeFile(path.join(dir, '.nowlinerc'), rc);
        return runCliBuilt(['sample.nowline', '-o', '-', ...extraArgs], { cwd: dir });
    });
}

describeBuilt('.nowlinerc render keys (requires `pnpm build`)', () => {
    it('rc theme: dark renders dark with no -t', async () => {
        const r = await renderWithRc('theme: dark\n');
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-theme="dark"');
    });

    it('-t light overrides the rc theme', async () => {
        const r = await renderWithRc('theme: dark\n', ['-t', 'light']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-theme="light"');
    });

    it('rc theme: greyscale (UK alias) canonicalizes to grayscale', async () => {
        const r = await renderWithRc('{"theme": "Greyscale"}');
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-theme="grayscale"');
    });

    it('an invalid rc theme is an input error naming .nowlinerc', async () => {
        const r = await renderWithRc('theme: sepia\n');
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain(
            'invalid .nowlinerc theme "sepia". Expected light, dark, or grayscale.',
        );
    });

    it('a valid -t wins over an invalid rc theme', async () => {
        const r = await renderWithRc('theme: sepia\n', ['-t', 'dark']);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toContain('data-theme="dark"');
    });

    it('an invalid rc width is an input error naming .nowlinerc', async () => {
        const r = await renderWithRc('width: 100\n');
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid .nowlinerc width "100". Must be an integer ≥ 320.');
    });

    it('an invalid rc pdfOrientation is an input error naming .nowlinerc', async () => {
        const r = await renderWithRc('pdfOrientation: sideways\n');
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid .nowlinerc pdfOrientation "sideways".');
    });

    it('an invalid rc pdfMargin is an input error naming .nowlinerc', async () => {
        const r = await renderWithRc('pdfMargin: wide\n');
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid .nowlinerc pdfMargin "wide"');
    });
});

describeBuilt('.nowlinerc assetRoot (requires `pnpm build`)', () => {
    // The rc sits in the project root and the input one level down, so a
    // relative rc assetRoot must resolve against the rc file, not the input
    // directory or cwd.
    async function verboseRender(rc: string, extraArgs: string[] = []) {
        return withTempDir(async (dir) => {
            await fs.mkdir(path.join(dir, 'docs'));
            await fs.writeFile(path.join(dir, 'docs', 'sample.nowline'), SAMPLE);
            await fs.writeFile(path.join(dir, '.nowlinerc'), rc);
            return runCliBuilt(['sample.nowline', '--dry-run', '--verbose', ...extraArgs], {
                cwd: path.join(dir, 'docs'),
            });
        });
    }

    it('an rc assetRoot sets the asset root, relative to the rc file', async () => {
        const r = await verboseRender('assetRoot: brand\n');
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toMatch(
            /nowline: asset-root=\S*[\\/]nowline-cli-\w+[\\/]brand \(\.nowlinerc assetRoot\)/,
        );
    });

    it('--asset-root overrides the rc', async () => {
        const r = await verboseRender('assetRoot: brand\n', ['--asset-root', 'flag-assets']);
        expect(r.exitCode).toBe(0);
        expect(r.stderr).toMatch(
            /nowline: asset-root=\S*[\\/]docs[\\/]flag-assets \(--asset-root\)/,
        );
    });

    it('the logo renders from the rc assetRoot, and is missing without it', async () => {
        const LOGO_SRC =
            'nowline v1\n\nroadmap r "R" logo:"logo.svg"\n\nswimlane a "A"\n  item x duration:1w\n';
        const run = (rc: string | undefined, extraArgs: string[] = []) =>
            withTempDir(async (dir) => {
                await fs.mkdir(path.join(dir, 'docs'));
                await fs.mkdir(path.join(dir, 'brand'));
                await fs.writeFile(path.join(dir, 'docs', 'sample.nowline'), LOGO_SRC);
                await fs.writeFile(
                    path.join(dir, 'brand', 'logo.svg'),
                    '<svg width="40" height="20"><rect width="40" height="20" fill="#123456"/></svg>',
                );
                if (rc !== undefined) await fs.writeFile(path.join(dir, '.nowlinerc'), rc);
                return runCliBuilt(['sample.nowline', '-o', '-', ...extraArgs], {
                    cwd: path.join(dir, 'docs'),
                });
            });
        const withRc = await run('assetRoot: brand\n');
        expect(withRc.exitCode).toBe(0);
        expect(withRc.stdout).toContain('fill="#123456"');
        expect(withRc.stdout).toContain('viewBox="0 0 40 20"');

        const withoutRc = await run(undefined);
        expect(withoutRc.exitCode).toBe(0);
        expect(withoutRc.stdout).not.toContain('fill="#123456"');
        // Without the rc the logo is looked up beside the input, where it is
        // missing; --strict turns that into a failure.
        const strict = await run(undefined, ['--strict']);
        expect(strict.exitCode).not.toBe(0);
        expect(strict.stderr).toContain('logo.svg');
    });

    it('a non-string rc assetRoot is an input error naming .nowlinerc', async () => {
        const r = await renderWithRc('assetRoot: 42\n');
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid .nowlinerc assetRoot "42". Expected a directory path.');
    });
});
