// `exportStaged` exports a roadmap a caller already staged
// (specs/surface-options.md §3.5): the same bytes as `exportDocument`, a
// throw when the stage's layout options differ from the render inputs, and
// no SVG render for the formats that do not use one.

import * as path from 'node:path';
import { createNowlineServices } from '@nowline/core';
import {
    type ExportFormat,
    exportDocument,
    exportStaged,
    type HostEnv,
    type RenderInputs,
    type StagedRoadmap,
} from '@nowline/export';
import { stageRoadmap } from '@nowline/renderer';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('/nowline-staged');
const SOURCE_PATH = path.join(ROOT, 'staged.nowline');
const SOURCE = `nowline v1

roadmap r "Platform 2026" logo:"./acme.svg" start:2026-01-05

swimlane a "A"
  item x duration:1w
  item y duration:2w
`;

// The sanitizer drops the script and the renderer warns once per render, so
// `onWarning` shows whether a format rendered the SVG.
const SCRIPTED_LOGO =
    '<svg viewBox="0 0 30 10"><script>x()</script><rect width="30" height="10"/></svg>';

const services = createNowlineServices();

function host(logo: string): HostEnv {
    return {
        readSource: async () => {
            throw new Error('no includes in this roadmap');
        },
        readAsset: async () => new TextEncoder().encode(logo),
        loadWasm: () => {
            throw new Error('these formats must not need the raster wasm');
        },
    };
}

const INPUTS: RenderInputs = {
    sourcePath: SOURCE_PATH,
    today: new Date(Date.UTC(2026, 0, 12)),
    locale: 'en-US',
    theme: 'light',
    width: 1200,
    nonWorking: 'show',
};

async function staged(inputs: RenderInputs, logo: string): Promise<StagedRoadmap> {
    const env = host(logo);
    const result = await stageRoadmap({
        source: SOURCE,
        sourcePath: inputs.sourcePath,
        services,
        readSource: env.readSource,
        assetResolver: async (ref) => ({ bytes: await env.readAsset(ref), mime: 'image/svg+xml' }),
        layout: inputs,
    });
    if (result.kind !== 'staged') throw new Error(`expected a staged roadmap, got ${result.kind}`);
    return result;
}

const LOGO = '<svg viewBox="0 0 30 10"><rect width="30" height="10"/></svg>';
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('exportStaged', () => {
    const formats: ExportFormat[] = ['svg', 'html', 'mermaid', 'msproj', 'json'];
    for (const format of formats) {
        it(`${format}: equals exportDocument for the same inputs`, async () => {
            const stage = await staged(INPUTS, LOGO);
            const fromStage = await exportStaged(stage, format, INPUTS, host(LOGO));
            const fromSource = await exportDocument(SOURCE, format, INPUTS, host(LOGO));
            expect(decode(fromStage)).toBe(decode(fromSource));
        });
    }

    const mismatches: [key: string, change: Partial<RenderInputs>][] = [
        ['theme', { theme: 'dark' }],
        ['today', { today: new Date(Date.UTC(2026, 0, 13)) }],
        ['today', { today: undefined }],
        ['width', { width: 1400 }],
        ['width', { width: undefined }],
        ['locale', { locale: 'fr-FR' }],
        ['nonWorking', { nonWorking: 'hide' }],
        ['nonWorking', { nonWorking: undefined }],
    ];
    for (const [key, change] of mismatches) {
        it(`throws when inputs.${key} differs from the stage's (${JSON.stringify(change)})`, async () => {
            const stage = await staged(INPUTS, LOGO);
            await expect(
                exportStaged(stage, 'svg', { ...INPUTS, ...change }, host(LOGO)),
            ).rejects.toThrow(
                `@nowline/export: the staged roadmap was laid out with a different ${key} than inputs.${key}.`,
            );
        });
    }

    it('accepts an equal today that is a different Date object', async () => {
        const stage = await staged(INPUTS, LOGO);
        const today = new Date(INPUTS.today?.getTime() ?? 0);
        const bytes = await exportStaged(stage, 'svg', { ...INPUTS, today }, host(LOGO));
        expect(decode(bytes)).toContain('data-layer="logo"');
    });

    it('ignores options that are not layout options', async () => {
        const stage = await staged(INPUTS, LOGO);
        const bytes = await exportStaged(
            stage,
            'svg',
            { ...INPUTS, noLinks: true, pngScale: 3 },
            host(LOGO),
        );
        expect(decode(bytes)).toContain('<svg');
    });

    const rendering: [format: ExportFormat, warnings: number][] = [
        ['svg', 1],
        ['html', 1],
        ['mermaid', 0],
        ['msproj', 0],
        ['xlsx', 0],
        ['json', 0],
    ];
    for (const [format, count] of rendering) {
        it(`${format}: ${count ? 'renders' : 'does not render'} the SVG`, async () => {
            const stage = await staged(INPUTS, SCRIPTED_LOGO);
            const warnings: string[] = [];
            await exportStaged(
                stage,
                format,
                { ...INPUTS, onWarning: (msg) => warnings.push(msg), onNotice: () => {} },
                host(SCRIPTED_LOGO),
            );
            expect(warnings).toHaveLength(count);
        });
    }
});
