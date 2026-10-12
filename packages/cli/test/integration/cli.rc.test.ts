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
