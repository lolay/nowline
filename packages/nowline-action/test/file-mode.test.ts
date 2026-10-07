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
