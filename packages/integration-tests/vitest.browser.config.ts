import { promises as fs } from 'node:fs';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import {
    canonicalFonts,
    emptyManifest,
    findFixture,
    fixtureSourcePath,
    loadManifest,
    loadResvgWasm,
    saveManifest,
} from './determinism/node-surface.js';

// Headless-browser leg (surface (c)) of the cross-surface determinism gate.
// Runs `test/determinism.browser.test.ts` inside Chromium via Playwright and
// asserts the kernel-in-browser bytes match the canonical Node bytes for clean
// cells (and the recorded `browser` override for the deferred-ICU cells).
//
// Kept separate from the default config (so `make test` never needs a browser)
// and from the Node-leg config. Run via `make determinism-browser`. The custom
// commands below run on the Node side and feed the browser the *same* canonical
// inputs (source, bundled fonts, resvg wasm) the Node leg uses, plus the
// update-mode writeback that records browser goldens.

function toB64(bytes: Uint8Array): string {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

export default defineConfig({
    optimizeDeps: {
        // resvg-wasm ships ESM; let Vite serve it as-is rather than esbuild
        // pre-bundling it (which trips on the embedded wasm reference). The
        // kernel feeds the wasm bytes explicitly via HostEnv.loadWasm.
        exclude: ['@resvg/resvg-wasm'],
    },
    test: {
        include: ['test/determinism.browser.test.ts'],
        testTimeout: 60_000,
        hookTimeout: 300_000,
        // Surfaced to the browser test via `inject('detUpdate')` — process.env
        // is not available in the browser context.
        provide: { detUpdate: process.env.UPDATE_DETERMINISM_GOLDENS === '1' },
        browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
            // No DOM assertions here — we run the kernel and hash bytes — so a
            // screenshot on failure adds nothing but flake surface.
            screenshotFailures: false,
            commands: {
                async detFonts() {
                    const f = await canonicalFonts();
                    return {
                        sansName: f.sans.name,
                        monoName: f.mono.name,
                        sansB64: toB64(f.sans.bytes),
                        monoB64: toB64(f.mono.bytes),
                    };
                },
                async detWasm() {
                    return toB64(new Uint8Array(await loadResvgWasm()));
                },
                async detSource(_ctx: unknown, fixtureId: string) {
                    return fs.readFile(fixtureSourcePath(findFixture(fixtureId)), 'utf-8');
                },
                async detRecordBrowser(
                    _ctx: unknown,
                    entries: { key: string; hash: string; node: string; icu: boolean }[],
                ) {
                    const manifest = (await loadManifest()) ?? emptyManifest();
                    for (const { key, hash, node, icu } of entries) {
                        const cell = manifest.cells[key];
                        if (!cell) continue; // Node leg must populate the cell first.
                        // Record a browser override only for a real ICU-driven
                        // divergence; clean cells must equal Node (no override),
                        // mirroring the `cli` override policy.
                        if (icu && hash !== node) cell.browser = hash;
                        else cell.browser = undefined;
                    }
                    await saveManifest(manifest);
                },
            },
        },
    },
});
