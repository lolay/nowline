import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        // resvg-js boots a WASM module on first use; first-run import takes ~1s.
        testTimeout: 20_000,
    },
});
