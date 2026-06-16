import { defineConfig } from 'vitest/config';

// MCP Apps preview-widget regression leg. Runs `test/mcp-app-preview.e2e.test.ts`
// in Node and drives a headless Chromium (launched directly via Playwright, not
// @vitest/browser) so a mock host can own a sandboxed iframe and play AppBridge.
// Kept out of the default config (so `make test` never needs a browser). Run via
// `make mcp-app-e2e`, which builds @nowline/mcp and installs Chromium first.
export default defineConfig({
    test: {
        include: ['test/mcp-app-preview.e2e.test.ts'],
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
});
