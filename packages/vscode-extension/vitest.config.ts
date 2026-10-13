import { defineConfig } from 'vitest/config';

// Unit tests for the extension's pure modules (no `vscode` import). Anything
// that needs the editor API stays in the smoke scripts.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
    },
});
