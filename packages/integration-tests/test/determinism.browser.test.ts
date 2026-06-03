// Cross-surface export-determinism gate — headless-browser leg (surface (c)).
//
// Runs the @nowline/export kernel inside Chromium (Playwright) and, for each
// browser-eligible fixture × {json, svg, png}, asserts:
//   - a clean cell (no `browser` override) is byte-identical to the canonical
//     Node bytes (`golden.node`) — full cross-engine identity, the strong win;
//   - an ICU-divergent cell carries a pinned `browser` override and the live
//     bytes still match it (and still differ from Node) — the deferred
//     Intl/CLDR date-label leak, kept honest rather than green-by-omission.
//
// Inputs (source, bundled fonts, resvg wasm) come from the Node side via custom
// commands (vitest.browser.config.ts) so they are byte-identical to the Node
// leg's. Run via `make determinism-browser`; regenerate the browser overrides
// with `make determinism-update` (which runs the Node leg first so node/icu are
// current before this leg records `browser`).

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { commands } from 'vitest/browser';
import { hashBrowser } from '../determinism/browser-surface.js';
import manifestJson from '../determinism/hashes.json';
import {
    BROWSER_FORMATS,
    cellKey,
    type DeterminismManifest,
    FIXTURES,
} from '../determinism/spec.js';

declare module 'vitest' {
    interface ProvidedContext {
        /** True when regenerating goldens (UPDATE_DETERMINISM_GOLDENS=1). */
        detUpdate: boolean;
    }
}

const manifest = manifestJson as unknown as DeterminismManifest;
const update = inject('detUpdate');

const cells = FIXTURES.filter((f) => f.browser).flatMap((fixture) =>
    BROWSER_FORMATS.map((format) => ({ fixture, format, key: cellKey(fixture.id, format) })),
);

const computed = new Map<string, string>();

beforeAll(async () => {
    for (const { fixture, format, key } of cells) {
        computed.set(key, await hashBrowser(fixture, format));
    }

    if (update) {
        await commands.detRecordBrowser(
            cells.map(({ key }) => ({
                key,
                hash: computed.get(key) ?? '',
                node: manifest.cells[key]?.node ?? '',
                icu: manifest.cells[key]?.icu ?? false,
            })),
        );

        const overrides = cells
            .map(({ key }) => key)
            .filter((key) => {
                const c = manifest.cells[key];
                return c?.icu && computed.get(key) !== c.node;
            });
        console.log(
            overrides.length > 0
                ? `determinism(browser): ${overrides.length} ICU-divergent browser override(s): ${overrides.join(', ')}`
                : 'determinism(browser): no browser divergence — every cell matches Node byte-for-byte',
        );
    }
}, 300_000);

describe('kernel-in-browser vs the canonical Node bytes', () => {
    for (const { key } of cells) {
        it(key, () => {
            const got = computed.get(key);
            expect(got, `not computed: ${key}`).toBeDefined();
            const golden = manifest.cells[key];
            expect(golden, `missing golden for ${key} — run the Node leg first`).toBeDefined();

            // Update pass: bytes were recorded above; skip the stale-manifest
            // comparison (the import reflects the manifest as of file load).
            if (update) return;

            if (golden?.browser) {
                // Known ICU divergence: pinned to its own value, must be an
                // ICU cell, and must still actually differ from Node (else the
                // self-contained-formatter fix landed → drop the override).
                expect(golden.icu, `${key}: browser override on a non-ICU cell`).toBe(true);
                expect(
                    golden.browser,
                    `${key}: browser override equals node — stale, re-baseline`,
                ).not.toBe(golden.node);
                expect(got, `${key}: browser drifted from its pinned override`).toBe(
                    golden.browser,
                );
            } else {
                // The lock: browser bytes equal the canonical Node bytes.
                expect(got, `${key}: browser diverged from canonical Node bytes`).toBe(
                    golden?.node,
                );
            }
        });
    }
});
