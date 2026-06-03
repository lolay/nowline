import { defineConfig } from 'vitest/config';

// Node legs of the cross-surface determinism gate (kernel-in-Node goldens +
// compiled-CLI-binary equality). Run via `make determinism`. Kept separate from
// the default config so `make test` stays binary-free across the OS matrix.
export default defineConfig({
    test: {
        include: ['test/determinism.node.test.ts'],
        // PNG raster + PDF embed + CLI subprocess spawns per cell; give the
        // single up-front beforeAll room on a cold CI runner.
        testTimeout: 30_000,
        hookTimeout: 300_000,
    },
});
