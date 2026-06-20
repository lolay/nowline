import { defineConfig } from 'vitest/config';

// The roundtrip suite for this package does not run under vite at all — it
// shells out to a Node subprocess (see test/worker-roundtrip.test.ts and
// test-support/) because vscode-languageserver v10's CJS entry can't be loaded
// through vite's transform under the browser condition. So this config is
// intentionally minimal; there is no vite-side resolution to configure.
export default defineConfig({
    test: {
        environment: 'node',
    },
});
