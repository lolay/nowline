// stageRoadmap: one result kind per outcome (specs/surface-options.md §3.3),
// with in-memory source and asset fakes and no file system.

import type { NowlineFile } from '@nowline/core';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { type AssetResolver, type StageInputs, stageRoadmap } from '../src/index.js';
import { getServices } from './helpers.js';

const MAIN = '/workspace/main.nowline';

/** `readSource` over an in-memory map of absolute paths; a missing path rejects. */
function memorySources(files: Record<string, string>): StageInputs['readSource'] {
    return async (absPath) => {
        const text = files[absPath];
        if (text === undefined) throw new Error('boom');
        return text;
    };
}

/** `AssetResolver` over an in-memory map of refs; a missing ref rejects. */
function memoryAssets(assets: Record<string, string>): AssetResolver {
    return async (ref) => {
        const text = assets[ref];
        if (text === undefined) throw new Error('ENOENT');
        return { bytes: new TextEncoder().encode(text), mime: 'image/svg+xml' };
    };
}

function stage(source: string, overrides: Partial<StageInputs> = {}) {
    return stageRoadmap({
        source,
        sourcePath: MAIN,
        services: getServices(),
        readSource: memorySources({}),
        layout: { theme: 'light', today: new Date(Date.UTC(2026, 1, 9)) },
        ...overrides,
    });
}

// The include is on line 3; the parent declares waves w1 and w2, so a child
// without waves fails include rule 12 (NL.E0202, a routed diagnostic).
const WAVE_PARENT = `nowline v1

include "./other.nowline"

roadmap r "R" start:2026-01-05
wave w1
wave w2
swimlane eng "Engineering"
  item solo duration:1w wave:w1
`;
const CHILD_WITHOUT_WAVES = 'swimlane c "C"\n  item y duration:1w\n';

const LOGO_ROADMAP = `nowline v1

roadmap r "Platform 2026" logo:"./acme.svg" start:2026-01-05

swimlane a "A"
  item x duration:1w
`;

describe('stageRoadmap', () => {
    it('returns invalid with the validator diagnostics when the file has errors', async (): Promise<void> => {
        const result = await stage(
            'nowline v1\n\nroadmap r "R" start:2026-01-05\n\nswimlane a "A"\n  item x duration:1w\n  item x duration:1w\n',
        );
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') return;
        expect(result.diagnostics.some((d) => d.origin === 'validation')).toBe(true);
        expect(result.document.parseResult.value.$type).toBe('NowlineFile');
    });

    it('returns invalid on a parser error', async (): Promise<void> => {
        const result = await stage('nowline v1\n\nroadmap r "R" start:\n');
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') return;
        expect(result.diagnostics.some((d) => d.origin === 'parser')).toBe(true);
    });

    it('lets the first uncoded include error hide the routed ones', async (): Promise<void> => {
        const result = await stage(
            WAVE_PARENT.replace(
                'include "./other.nowline"',
                'include "./other.nowline"\ninclude "./missing.nowline"',
            ),
            { readSource: memorySources({ '/workspace/other.nowline': CHILD_WITHOUT_WAVES }) },
        );
        expect(result.kind).toBe('include-error');
        if (result.kind !== 'include-error') return;
        expect(result.legacy?.message).toBe('Could not read include "./missing.nowline": boom');
        expect(result.routed).toEqual([]);
        // The hidden routed error is still in the full resolver list.
        expect(result.resolved.diagnostics.map((d) => d.code)).toContain('NL.E0202');
    });

    it('returns the routed errors alone when no uncoded include error occurs', async (): Promise<void> => {
        const result = await stage(WAVE_PARENT, {
            readSource: memorySources({ '/workspace/other.nowline': CHILD_WITHOUT_WAVES }),
        });
        expect(result.kind).toBe('include-error');
        if (result.kind !== 'include-error') return;
        expect(result.legacy).toBeUndefined();
        expect(result.routed.map((d) => [d.code, d.severity, d.line])).toEqual([
            ['NL.E0202', 'error', 2],
        ]);
    });

    it('leaves a tolerated include error out of the precedence', async (): Promise<void> => {
        const result = await stage(WAVE_PARENT.replace(/wave:w1|wave w[12]\n/g, ''), {
            isToleratedIncludeError: (d) => d.message.includes('boom'),
        });
        expect(result.kind).toBe('staged');
        if (result.kind !== 'staged') return;
        expect(result.resolved.diagnostics.map((d) => d.message)).toEqual([
            'Could not read include "./other.nowline": boom',
        ]);
    });

    it('warns on a missing logo and lays out without it', async (): Promise<void> => {
        const result = await stage(LOGO_ROADMAP, { assetResolver: memoryAssets({}) });
        expect(result.kind).toBe('staged');
        if (result.kind !== 'staged') return;
        expect(result.warnings).toEqual(['logo file not found: ./acme.svg (ENOENT)']);
        expect(result.logo).toBeUndefined();
        expect(result.model.header.logo).toBeUndefined();
    });

    it('lays out a logo as absent, silently, without an asset resolver', async (): Promise<void> => {
        const result = await stage(LOGO_ROADMAP);
        expect(result.kind).toBe('staged');
        if (result.kind !== 'staged') return;
        expect(result.warnings).toEqual([]);
        expect(result.model.header.logo).toBeUndefined();
    });

    it('stages a valid roadmap with its logo, includes and layout options', async (): Promise<void> => {
        const result = await stage(
            LOGO_ROADMAP.replace('roadmap r', 'include "./lane.nowline"\n\nroadmap r'),
            {
                readSource: memorySources({
                    '/workspace/lane.nowline': 'swimlane b "B"\n  item y duration:2w\n',
                }),
                assetResolver: memoryAssets({ './acme.svg': '<svg viewBox="0 0 30 10"/>' }),
                layout: { theme: 'dark', width: 1200 },
            },
        );
        expect(result.kind).toBe('staged');
        if (result.kind !== 'staged') return;
        expect(result.warnings).toEqual([]);
        expect(result.routed).toEqual([]);
        expect(result.logo?.ref).toBe('./acme.svg');
        expect(result.logo?.dimensions).toEqual({ width: 30, height: 10 });
        expect(result.model.header.logo?.box).toBeDefined();
        expect(result.model.theme).toBe('dark');
        expect(result.resolved.processedFiles.has('/workspace/lane.nowline')).toBe(true);
        expect(result.ast).toBe(result.document.parseResult.value);
    });

    it('reuses a document the caller already built', async (): Promise<void> => {
        const { shared } = getServices();
        const document = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
            LOGO_ROADMAP,
            URI.parse('memory:///caller-built.nowline'),
        );
        await shared.workspace.DocumentBuilder.build([document], { validation: true });
        const result = await stage(LOGO_ROADMAP, { document });
        expect(result.kind).toBe('staged');
        expect(result.document).toBe(document);
    });
});
