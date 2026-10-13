import { defineConfig } from 'vitest/config';

// Unit tests cover the extension's pure modules (no `vscode` import), so they
// run in plain Node; the smoke scripts under scripts/ cover the host wiring.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
    },
});
