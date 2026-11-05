// Save, the copy-PNG fallback and Export… write what the preview drew: the
// text and options of its last render (`resolvePreviewOptions`), or the same
// resolution when no preview is open. These tests take that resolution, as
// the preview makes it, through the kernel the export paths call.

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig } from '@nowline/config';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExportSettings } from '../src/export/cli-runner.js';
import type { ExportSource } from '../src/export/export-source.js';
import { _resetWasmInit, exportInProcess, initExportRuntime } from '../src/export/in-process.js';
import { type ResolveContext, resolvePreviewOptions } from '../src/preview/option-resolver.js';
import type { PreviewSettings } from '../src/preview/preview-panel.js';

const SETTINGS: PreviewSettings = {
    refreshOn: 'keystroke',
    debounceMs: 250,
    theme: 'auto',
    defaultFit: 'fitPage',
    showMinimap: true,
    locale: '',
    now: 'auto',
    timezone: '',
    nonWorking: 'file',
    strict: false,
    showLinks: true,
    width: 0,
    assetRoot: '',
};

const EXPORT_SETTINGS: ExportSettings = {
    cliPath: 'nowline',
    pdfPageSize: 'letter',
    pdfOrientation: 'auto',
    pdfMargin: '36pt',
    fontSans: '',
    fontMono: '',
    headlessFonts: false,
    pngScale: 1,
    msprojStart: '',
    width: 0,
};

const ROADMAP = `nowline v1

roadmap plan "Plan" start:2026-02-02 scale:1w

swimlane build "Build"
  item design "Design" duration:1w
  item ship "Ship" duration:2w
`;

let dir: string;

beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-export-'));
    // The kernel loads `resvg.wasm` from the extension's dist/; point it at
    // the package's copy so PNG renders without a build.
    const require = createRequire(import.meta.url);
    const wasm = path.join(path.dirname(require.resolve('@resvg/resvg-wasm')), 'index_bg.wasm');
    await fs.copyFile(wasm, path.join(dir, 'resvg.wasm'));
    initExportRuntime(dir);
});

afterAll(async () => {
    _resetWasmInit();
    await fs.rm(dir, { recursive: true, force: true });
});

function resolve(ctx: Partial<ResolveContext> & { settings?: Partial<PreviewSettings> }) {
    return resolvePreviewOptions({
        rc: {},
        vscodeLanguage: 'en',
        isDarkTheme: false,
        ...ctx,
        settings: { ...SETTINGS, ...ctx.settings },
    });
}

async function exportAs(
    format: 'svg' | 'png',
    source: Partial<ExportSource> & Pick<ExportSource, 'options'>,
): Promise<string | Uint8Array> {
    const { rendered } = await exportInProcess(
        { text: ROADMAP, sourcePath: path.join(dir, 'plan.nowline'), ...source },
        format,
        EXPORT_SETTINGS,
    );
    return rendered;
}

describe('export matches the preview: theme', () => {
    it('exports dark for an rc theme of dark, a setting of auto and a light editor', async () => {
        const options = resolve({ rc: { theme: 'dark' }, isDarkTheme: false });
        expect(options.theme).toBe('dark');

        const saved = await exportAs('svg', { options });
        const dark = await exportAs('svg', { options: resolve({ settings: { theme: 'dark' } }) });
        const light = await exportAs('svg', { options: resolve({}) });
        expect(saved).toBe(dark);
        expect(saved).not.toBe(light);
    });
});

describe('export matches the preview: the default now-line date', () => {
    // 11:00 UTC on Feb 9: already Feb 10 at +14:00, still Feb 8 at -12:00.
    const instant = new Date('2026-02-09T11:00:00Z');

    afterEach(() => {
        vi.useRealTimers();
    });

    function resolveAt(timezone: string) {
        vi.useFakeTimers({ now: instant, toFake: ['Date'] });
        try {
            return resolve({ settings: { timezone } });
        } finally {
            vi.useRealTimers();
        }
    }

    it('moves the export to the day a +14:00 timezone gives the preview', async () => {
        const options = resolveAt('+14:00');
        expect(options.today).toEqual(new Date(Date.UTC(2026, 1, 10)));

        const saved = await exportAs('svg', { options });
        const pinned = await exportAs('svg', {
            options: resolve({ settings: { now: '2026-02-10' } }),
        });
        const behind = await exportAs('svg', { options: resolveAt('-12:00') });
        expect(saved).toBe(pinned);
        expect(saved).not.toBe(behind);
    });
});

describe('export matches the preview: asset root', () => {
    it('finds a logo under the rc assetRoot in a PNG (Save, copy fallback)', async () => {
        const project = path.join(dir, 'project');
        const brand = path.join(project, 'brand');
        await fs.mkdir(path.join(project, 'plans'), { recursive: true });
        await fs.mkdir(brand, { recursive: true });
        await fs.writeFile(path.join(project, '.nowlinerc'), 'assetRoot: brand\n');
        await fs.writeFile(
            path.join(brand, 'logo.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10" fill="#c00"/></svg>',
        );
        const sourcePath = path.join(project, 'plans', 'plan.nowline');
        const text = ROADMAP.replace('scale:1w', 'scale:1w logo:"logo.svg"');

        const rc = await loadConfig(path.dirname(sourcePath));
        const options = resolve({ rc: rc.config, rcPath: rc.path });
        expect(options.assetRoot).toBe(brand);

        const fallback = await exportAs('png', { text, sourcePath, options });
        const fromSetting = await exportAs('png', {
            text,
            sourcePath,
            options: resolve({ settings: { assetRoot: brand } }),
        });
        const withoutLogo = await exportAs('png', { text, sourcePath, options: resolve({}) });
        expect(fallback).toEqual(fromSetting);
        expect(fallback).not.toEqual(withoutLogo);
    });
});

describe('export matches the preview: text', () => {
    it('saves the editor text, not the file on disk', async () => {
        const sourcePath = path.join(dir, 'edited.nowline');
        await fs.writeFile(sourcePath, ROADMAP.replace('"Plan"', '"On disk"'));
        const text = ROADMAP.replace('"Plan"', '"Unsaved"');

        const saved = await exportAs('svg', { text, sourcePath, options: resolve({}) });
        expect(saved).toContain('Unsaved');
        expect(saved).not.toContain('On disk');
    });

    it('exports an untitled document, which has no file', async () => {
        const saved = await exportAs('svg', { sourcePath: 'Untitled-1', options: resolve({}) });
        expect(saved).toContain('Plan');
    });
});
