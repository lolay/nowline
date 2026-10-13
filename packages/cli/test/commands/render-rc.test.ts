import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { LayoutOptions } from '@nowline/layout';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { renderHandler } from '../../src/commands/render.js';
import { withTempDir } from '../helpers.js';

// Record what the export kernel hands to layout and what the CLI hands to the
// kernel, without changing either: the real implementations still run.
const layoutCalls = vi.hoisted(() => [] as LayoutOptions[]);
const exportCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@nowline/layout', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/layout')>();
    return {
        ...actual,
        layoutRoadmap: (...args: Parameters<typeof actual.layoutRoadmap>) => {
            layoutCalls.push(args[2] as LayoutOptions);
            return actual.layoutRoadmap(...args);
        },
    };
});

vi.mock('@nowline/export', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/export')>();
    return {
        ...actual,
        exportStaged: (...args: Parameters<typeof actual.exportStaged>) => {
            exportCalls.push(args[2] as unknown as Record<string, unknown>);
            return actual.exportStaged(...args);
        },
    };
});

const SAMPLE = 'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w\n';

async function dryRunWithRc(rc: string, flags: string[] = []): Promise<void> {
    await withTempDir(async (dir) => {
        await fs.writeFile(path.join(dir, 'sample.nowline'), SAMPLE);
        await fs.writeFile(path.join(dir, '.nowlinerc'), rc);
        const args = parseArgv(['sample.nowline', '--dry-run', '--now', '-', ...flags]);
        await renderHandler({ args, cwd: dir });
    });
}

afterEach(() => {
    layoutCalls.length = 0;
    exportCalls.length = 0;
});

describe('render: .nowlinerc reaches LayoutOptions', () => {
    it('rc width and theme reach layout when no flag is given', async () => {
        await dryRunWithRc('theme: dark\nwidth: 1600\n');
        expect(layoutCalls).toHaveLength(1);
        expect(layoutCalls[0]).toMatchObject({ theme: 'dark', width: 1600 });
    });

    it('--width and -t override the rc', async () => {
        await dryRunWithRc('theme: dark\nwidth: 1600\n', ['--width', '900', '-t', 'light']);
        expect(layoutCalls[0]).toMatchObject({ theme: 'light', width: 900 });
    });

    it('no rc width and no flag leaves width unset', async () => {
        await dryRunWithRc('theme: dark\n');
        expect(layoutCalls[0].width).toBeUndefined();
    });

    it('rc pdfPageSize, pdfOrientation and a bare-number pdfMargin reach the export kernel', async () => {
        await dryRunWithRc('pdfPageSize: a4\npdfOrientation: Landscape\npdfMargin: 36\n');
        expect(exportCalls[0]).toMatchObject({
            pageSize: { kind: 'preset', name: 'a4' },
            orientation: 'landscape',
            marginPt: 36,
        });
    });

    it('--page-size and --orientation override the rc', async () => {
        await dryRunWithRc('pdfPageSize: a4\npdfOrientation: landscape\n', [
            '--page-size',
            'letter',
            '--orientation',
            'portrait',
        ]);
        expect(exportCalls[0]).toMatchObject({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'portrait',
        });
    });
});
