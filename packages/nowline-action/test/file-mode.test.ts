import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderArgs } from '../src/cli.js';

const calls: RenderArgs[] = [];

vi.mock('../src/cli.js', () => ({
    ensureCli: vi.fn(async () => '0.0.0-test'),
    renderOnce: vi.fn(async (args: RenderArgs) => {
        calls.push(args);
    }),
}));

import { runFileMode } from '../src/file-mode.js';
import type { ActionInputs } from '../src/inputs.js';

const BASE: ActionInputs = {
    mode: 'file',
    input: 'roadmap.nowline',
    output: 'roadmap.svg',
    files: '**/*.md',
    outputDir: '.nowline/',
    format: 'svg',
    theme: 'light',
    extraArgs: [],
};

describe('runFileMode: non-working', () => {
    beforeEach(() => {
        calls.length = 0;
    });

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

describe('runFileMode: now and args', () => {
    beforeEach(() => {
        calls.length = 0;
    });

    it('passes now and extra args through to the CLI call', async () => {
        await runFileMode({ ...BASE, now: '-', extraArgs: ['--width', '1200'] });
        expect(calls).toHaveLength(1);
        expect(calls[0].now).toBe('-');
        expect(calls[0].extraArgs).toEqual(['--width', '1200']);
        expect(calls[0].input).toBe('roadmap.nowline');
        expect(calls[0].output).toBe('roadmap.svg');
    });

    it('leaves now undefined when the input is unset', async () => {
        await runFileMode(BASE);
        expect(calls[0].now).toBeUndefined();
    });
});
