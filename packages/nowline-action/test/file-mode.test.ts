import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderArgs } from '../src/cli.js';

const calls = vi.hoisted(() => [] as RenderArgs[]);

vi.mock('../src/cli.js', () => ({
    ensureCli: vi.fn(async () => '0.0.0-test'),
    renderOnce: vi.fn(async (args: RenderArgs) => {
        calls.push(args);
        await fs.writeFile(args.output, `<!-- mock ${args.format}/${args.theme} -->\n`, 'utf-8');
    }),
}));

import { runFileMode } from '../src/file-mode.js';
import type { ActionInputs } from '../src/inputs.js';
import { buildOutputs } from '../src/outputs.js';

const BASE: ActionInputs = {
    mode: 'file',
    input: 'roadmap.nowline',
    output: 'roadmap.svg',
    files: '**/*.md',
    outputDir: '.nowline/',
    format: 'svg',
    theme: 'light',
};

let workdir: string;
let originalCwd: string;

beforeEach(async () => {
    calls.length = 0;
    originalCwd = process.cwd();
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-action-file-test-'));
    process.chdir(workdir);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(workdir, { recursive: true, force: true });
});

describe('runFileMode: non-working', () => {
    it('passes nonWorking through to the CLI call when set', async () => {
        await runFileMode({ ...BASE, nonWorking: 'show' });
        expect(calls).toHaveLength(1);
        expect(calls[0].nonWorking).toBe('show');
    });

    it('leaves nonWorking undefined when the input is unset', async () => {
        await runFileMode(BASE);
        expect(calls).toHaveLength(1);
        expect(calls[0].nonWorking).toBeUndefined();
    });
});

describe('runFileMode: changed-files', () => {
    it('lists the output when it did not exist before', async () => {
        const result = await runFileMode(BASE);

        expect(result).toEqual({ rendered: 1, failed: 0, changedFiles: ['roadmap.svg'] });
        expect(buildOutputs(result).changed).toBe('true');
        expect(await fs.readFile('roadmap.svg', 'utf-8')).toBe('<!-- mock svg/light -->\n');
    });

    it('lists nothing on a second identical render', async () => {
        await runFileMode(BASE);
        const result = await runFileMode(BASE);

        expect(result).toEqual({ rendered: 1, failed: 0, changedFiles: [] });
        expect(buildOutputs(result)['changed-files']).toBe('');
        expect(buildOutputs(result).changed).toBe('false');
    });

    it('does not rewrite an unchanged output', async () => {
        await runFileMode(BASE);
        const past = new Date('2020-01-01T00:00:00Z');
        await fs.utimes('roadmap.svg', past, past);

        await runFileMode(BASE);

        expect((await fs.stat('roadmap.svg')).mtime.getTime()).toBe(past.getTime());
    });

    it('overwrites and lists an output whose bytes differ', async () => {
        await fs.writeFile('roadmap.svg', 'stale', 'utf-8');

        const result = await runFileMode(BASE);

        expect(result.changedFiles).toEqual(['roadmap.svg']);
        expect(await fs.readFile('roadmap.svg', 'utf-8')).toBe('<!-- mock svg/light -->\n');
    });

    it('leaves the existing output untouched when the render fails', async () => {
        const { renderOnce } = await import('../src/cli.js');
        vi.mocked(renderOnce).mockRejectedValueOnce(new Error('boom'));
        await fs.writeFile('roadmap.svg', 'previous', 'utf-8');

        const result = await runFileMode(BASE);

        expect(result).toEqual({ rendered: 0, failed: 1, changedFiles: [] });
        expect(await fs.readFile('roadmap.svg', 'utf-8')).toBe('previous');
    });
});
