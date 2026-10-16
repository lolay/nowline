import { defineConfig } from 'vitest/config';

// Review gallery browser leg. Runs `test/review-gallery.e2e.test.ts` in Node and
// drives a headless Chromium (launched directly via Playwright) over a fixture
// gallery served by scripts/gallery/serve.mjs. Kept out of the default config
// (so `make test` never needs a browser). Run via `make gallery-e2e`.
export default defineConfig({
    test: {
        include: ['test/review-gallery.e2e.test.ts'],
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
});
