// The export kernel's include-error contract (specs/waves.md §6.1).
//
// Include errors without a code keep the plain `Error` the kernel always
// threw. Wave-rule errors from the resolver travel on `IncludeResolveError`
// with every resolver diagnostic, and wave-rule warnings reach the host
// through `onResolveDiagnostics` on success.

import * as path from 'node:path';
import { type ResolveDiagnostic, tr } from '@nowline/core';
import { exportDocument, type HostEnv, IncludeResolveError } from '@nowline/export';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('/nowline-kernel');
const at = (rel: string): string => path.join(ROOT, rel);

function host(files: Record<string, string>): HostEnv {
    return {
        readSource: async (absPath) => {
            const rel = path.relative(ROOT, absPath);
            const text = files[rel];
            if (text === undefined) throw new Error(`ENOENT: ${absPath}`);
            return text;
        },
        readAsset: async () => {
            throw new Error('no assets');
        },
        loadWasm: () => {
            throw new Error('svg export must not need the raster wasm');
        },
    };
}

async function exportSvg(
    files: Record<string, string>,
    onResolveDiagnostics?: (d: ResolveDiagnostic[]) => void,
): Promise<Uint8Array> {
    return exportDocument(
        files['program.nowline'],
        'svg',
        {
            sourcePath: at('program.nowline'),
            today: new Date(Date.UTC(2026, 0, 5)),
            locale: 'en-US',
            theme: 'light',
            onResolveDiagnostics,
        },
        host(files),
    );
}

async function thrown(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (err) {
        return err;
    }
    throw new Error('expected the export to throw');
}

const WAVES = 'wave w1\nwave w2\n';
const lane = (name: string, wave?: string): string =>
    `swimlane ${name}\n  item ${name}-x duration:1w${wave ? ` wave:${wave}` : ''}\n`;

describe('export kernel: include diagnostics', () => {
    it('an uncoded include error stays a plain Error with the same message', async () => {
        const err = await thrown(
            exportSvg({
                'program.nowline': `include "./missing.nowline"\nroadmap r "R"\n${lane('a')}`,
            }),
        );
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(IncludeResolveError);
        expect((err as Error).message).toBe(
            `@nowline/export: include error in ${at('program.nowline')}: Could not read include "./missing.nowline": ENOENT: ${at('missing.nowline')}`,
        );
    });

    it('a wave-rule error throws IncludeResolveError carrying the diagnostics', async () => {
        const files = {
            'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${WAVES}${lane('a', 'w1')}`,
            'c.nowline': lane('c'),
        };
        const err = await thrown(exportSvg(files));
        expect(err).toBeInstanceOf(IncludeResolveError);
        const e = err as IncludeResolveError;
        expect(e.name).toBe('IncludeResolveError');
        const message = tr('en-US', 'NL.E0202', {
            reason: 'child-none',
            path: './c.nowline',
            parent: ['w1', 'w2'],
        });
        expect(e.message).toBe(
            `@nowline/export: include error in ${at('program.nowline')}: ${message}`,
        );
        expect(e.diagnostics.map((d) => [d.code, d.severity, d.sourcePath, d.line])).toEqual([
            ['NL.E0202', 'error', at('program.nowline'), 0],
        ]);
    });

    it('carries the uncoded wave-rule error (WV8) on IncludeResolveError', async () => {
        const err = await thrown(
            exportSvg({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${WAVES}${lane('a', 'w1')}`,
                'c.nowline': `config\ndefault item wave:w1\n${WAVES}${lane('c', 'w1')}`,
            }),
        );
        expect(err).toBeInstanceOf(IncludeResolveError);
        const [d] = (err as IncludeResolveError).diagnostics;
        expect([d.code, d.rule, d.sourcePath, d.line]).toEqual([
            undefined,
            'wave',
            at('c.nowline'),
            1,
        ]);
    });

    it('an uncoded include error wins over a wave-rule error', async () => {
        const err = await thrown(
            exportSvg({
                'program.nowline': `include "./c.nowline"\ninclude "./missing.nowline"\nroadmap r "R"\n${WAVES}${lane('a', 'w1')}`,
                'c.nowline': lane('c'),
            }),
        );
        expect(err).not.toBeInstanceOf(IncludeResolveError);
        expect((err as Error).message).toContain('Could not read include "./missing.nowline"');
    });

    it('reports wave-rule warnings through onResolveDiagnostics and still exports', async () => {
        const seen: ResolveDiagnostic[][] = [];
        const bytes = await exportSvg(
            {
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\nwave w1 "One"\nwave w2\n${lane('a', 'w1')}`,
                'c.nowline': `wave w1 "Uno"\nwave w2\n${lane('c', 'w1')}`,
            },
            (d) => seen.push(d),
        );
        expect(bytes.byteLength).toBeGreaterThan(0);
        expect(seen).toHaveLength(1);
        expect(seen[0].map((d) => [d.code, d.severity, d.line])).toEqual([
            ['NL.W0701', 'warning', 0],
        ]);
    });

    it('passes no diagnostics for a file without includes', async () => {
        const seen: ResolveDiagnostic[][] = [];
        await exportSvg({ 'program.nowline': `roadmap r "R"\n${lane('a')}` }, (d) => seen.push(d));
        expect(seen).toEqual([[]]);
    });
});
