// Cross-surface export-determinism gate — Node legs.
//
// Surface (b): the @nowline/export kernel run in Node — the canonical bytes.
// Surface (a): the compiled `bun compile` CLI binary — what users actually run.
//
// For every fixture × format this asserts:
//   1. kernel-in-Node bytes == the checked-in golden (`node` hash) — the
//      toolchain-version regression detector.
//   2. the live ICU-dependence detector agrees with the stored `icu` flag, so
//      the known-divergent classification can never silently rot.
//   3. compiled CLI binary == kernel-in-Node (the v1 lock), EXCEPT cells that
//      carry a recorded `cli` override (today: every `pdf`, where Bun's zlib
//      and Node's zlib emit different PDFKit FlateDecode bytes). Those assert
//      against the pinned `cli` value so the known divergence stays honest and
//      any *new* drift turns the gate red. The binary is built by `make compile
//      TARGET=local`; when absent (no binary on this machine) this leg skips.
//
// This file is excluded from the default `pnpm -r test` gate (see
// vitest.config.ts) and runs via `make determinism` in a single canonical
// environment (Linux, Node from .nvmrc), so the multi-OS test matrix is
// untouched. The headless-browser leg (surface (c)) lives in
// `determinism.browser.test.ts`.
//
// Regenerate goldens deliberately (toolchain bump) with `make determinism-update`
// (UPDATE_DETERMINISM_GOLDENS=1).

import { beforeAll, describe, expect, it } from 'vitest';
import { cliBinaryPath, hashCli } from '../determinism/cli-surface.js';
import {
    detectIcu,
    emptyManifest,
    hashNode,
    loadManifest,
    saveManifest,
} from '../determinism/node-surface.js';
import {
    cellKey,
    type DeterminismManifest,
    FIXTURES,
    GATE_LOCALE,
    GATE_PNG_SCALE,
    GATE_TODAY,
    isUpdateMode,
    NODE_FORMATS,
} from '../determinism/spec.js';

const update = isUpdateMode(process.env);
const binary = cliBinaryPath();

interface Computed {
    node: string;
    icu: boolean;
    cli?: string;
}

const computed = new Map<string, Computed>();
let manifest: DeterminismManifest;

beforeAll(async () => {
    const existing = await loadManifest();

    for (const fixture of FIXTURES) {
        for (const format of NODE_FORMATS) {
            const key = cellKey(fixture.id, format);
            const node = await hashNode(fixture, format);
            const icu = await detectIcu(fixture, format);
            const cell: Computed = { node, icu };
            if (binary) cell.cli = await hashCli(binary, fixture, format);
            computed.set(key, cell);
        }
    }

    if (update) {
        const base = existing ?? emptyManifest();
        const cells = { ...base.cells };
        for (const [key, cell] of computed) {
            const prev = cells[key];
            // Browser golden: keep only while still ICU-divergent (the browser
            // leg owns writing it; a cell that flipped clean drops the stale one).
            const browser = cell.icu && prev?.browser ? { browser: prev.browser } : {};
            // CLI override: record only a binary↔Node divergence we actually
            // observed. With no local binary, preserve whatever was recorded.
            let cli: { cli?: string } = {};
            if (binary) {
                cli = cell.cli && cell.cli !== cell.node ? { cli: cell.cli } : {};
            } else if (prev?.cli) {
                cli = { cli: prev.cli };
            }
            cells[key] = { node: cell.node, icu: cell.icu, ...cli, ...browser };
        }
        manifest = { ...emptyManifest(), cells };
        await saveManifest(manifest);
    } else {
        if (!existing) {
            throw new Error(
                'determinism: hashes.json is missing. Generate it deliberately with ' +
                    '`make determinism-update` (UPDATE_DETERMINISM_GOLDENS=1).',
            );
        }
        manifest = existing;
    }

    // Legible summary for the gate log / report.
    const divergent = Object.entries(manifest.cells)
        .filter(([, c]) => c.cli)
        .map(([k]) => k);
    if (divergent.length > 0) {
        console.log(
            `determinism: ${divergent.length} known binary↔Node-divergent cell(s): ${divergent.join(', ')}`,
        );
    }
}, 240_000);

describe('determinism manifest', () => {
    it('pins the canonical render inputs', () => {
        expect(manifest.today).toBe(GATE_TODAY);
        expect(manifest.locale).toBe(GATE_LOCALE);
        expect(manifest.pngScale).toBe(GATE_PNG_SCALE);
    });

    it('has a golden for every fixture × format cell', () => {
        const expected = FIXTURES.flatMap((f) => NODE_FORMATS.map((fmt) => cellKey(f.id, fmt)));
        for (const key of expected) {
            expect(manifest.cells[key], `missing golden for ${key}`).toBeDefined();
        }
    });
});

describe('kernel-in-Node matches the golden', () => {
    for (const fixture of FIXTURES) {
        for (const format of NODE_FORMATS) {
            const key = cellKey(fixture.id, format);
            it(key, () => {
                const cell = computed.get(key);
                expect(cell, `not computed: ${key}`).toBeDefined();
                expect(cell?.node).toBe(manifest.cells[key]?.node);
            });
        }
    }
});

describe('ICU-divergence classification is current', () => {
    for (const fixture of FIXTURES) {
        for (const format of NODE_FORMATS) {
            const key = cellKey(fixture.id, format);
            it(key, () => {
                const cell = computed.get(key);
                expect(cell?.icu).toBe(manifest.cells[key]?.icu);
            });
        }
    }
});

describe.skipIf(!binary)('compiled CLI binary vs the kernel', () => {
    for (const fixture of FIXTURES) {
        for (const format of NODE_FORMATS) {
            const key = cellKey(fixture.id, format);
            it(key, () => {
                const cell = computed.get(key);
                const golden = manifest.cells[key];
                expect(cell?.cli, `no CLI hash for ${key}`).toBeDefined();
                if (golden?.cli) {
                    // Known runtime divergence (PDF zlib): pinned to its own
                    // recorded value, and it must still actually diverge from
                    // Node — otherwise the fix landed and the override is stale.
                    expect(cell?.cli, `${key}: binary drifted from its pinned value`).toBe(
                        golden.cli,
                    );
                    expect(
                        cell?.cli,
                        `${key}: binary now matches Node — drop the cli override and re-baseline`,
                    ).not.toBe(cell?.node);
                } else {
                    // The lock: binary is byte-identical to the kernel.
                    expect(cell?.cli).toBe(cell?.node);
                    expect(cell?.cli).toBe(golden?.node);
                }
            });
        }
    }
});
