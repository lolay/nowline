import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildRenderArgs } from '../src/cli.js';

// The Action adds `--non-working` only when the input is set, because a CLI
// older than the display option rejects an unknown flag. "Unset" is
// undefined, so a file's own `default roadmap non-working:` key still applies.

const BASE = {
    input: 'roadmap.nowline',
    output: 'roadmap.svg',
    format: 'svg',
    theme: 'light',
} as const;

describe('buildRenderArgs', () => {
    it('builds the legacy argument list when nonWorking is unset', () => {
        expect(buildRenderArgs(BASE)).toEqual([
            'roadmap.nowline',
            '-o',
            'roadmap.svg',
            '-f',
            'svg',
            '-t',
            'light',
        ]);
    });

    it('never mentions --non-working when it is unset', () => {
        expect(buildRenderArgs({ ...BASE, nonWorking: undefined })).not.toContain('--non-working');
    });

    it('appends --non-working show when set to show', () => {
        expect(buildRenderArgs({ ...BASE, nonWorking: 'show' })).toEqual([
            'roadmap.nowline',
            '-o',
            'roadmap.svg',
            '-f',
            'svg',
            '-t',
            'light',
            '--non-working',
            'show',
        ]);
    });

    it('appends --non-working hide when set to hide, so it overrides a file key', () => {
        const args = buildRenderArgs({ ...BASE, nonWorking: 'hide' });
        expect(args.slice(-2)).toEqual(['--non-working', 'hide']);
    });
});

// The same three assertions against the built CLI, when it is present: the
// arguments the Action builds produce the layer exactly as the plan says.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '..', '..', 'cli', 'dist', 'index.js');
const describeBuilt = existsSync(CLI) ? describe : describe.skip;

describeBuilt('buildRenderArgs against the built CLI', () => {
    const BODY = [
        'roadmap r "R" start:2026-01-05 scale:1w calendar:business',
        '',
        'swimlane a "A"',
        '  item w1 "W1" duration:1w',
        '  item w2 "W2" duration:1w',
        '',
    ].join('\n');
    const PLAIN = `nowline v1\n\n${BODY}`;
    const FILE_SHOW = `nowline v1\n\nconfig\n\ndefault roadmap non-working:show\n\n${BODY}`;
    const LAYER = 'data-layer="non-working"';

    async function render(source: string, nonWorking?: 'hide' | 'show'): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-action-cli-'));
        try {
            const input = path.join(dir, 'roadmap.nowline');
            const output = path.join(dir, 'roadmap.svg');
            await fs.writeFile(input, source, 'utf-8');
            const args = buildRenderArgs({
                input,
                output,
                format: 'svg',
                theme: 'light',
                nonWorking,
            });
            const run = spawnSync(process.execPath, [CLI, ...args, '--now', '-'], {
                encoding: 'utf-8',
            });
            expect(run.status, run.stderr).toBe(0);
            return await fs.readFile(output, 'utf-8');
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    }

    it('show adds the non-working layer', async () => {
        expect(await render(PLAIN, 'show')).toContain(LAYER);
    });

    it('a file key show with the input unset has the layer', async () => {
        expect(await render(FILE_SHOW)).toContain(LAYER);
    });

    it('a file key show with hide has no layer', async () => {
        expect(await render(FILE_SHOW, 'hide')).not.toContain(LAYER);
    });
});
