import { configDefaults, defineConfig } from 'vitest/config';

// Default (Node) config for `pnpm -r test` / `make test`. Two leg families are
// excluded here because they need provisioning the multi-OS unit-test matrix
// deliberately skips:
//   - the cross-surface determinism gate (`determinism.*.test.ts`) — runs via
//     `make determinism[-browser]` in a single canonical environment;
//   - the MCP Apps preview e2e (`*.e2e.test.ts`) — needs a headless browser;
//     runs via `make mcp-app-e2e`.
export default defineConfig({
    test: {
        exclude: [...configDefaults.exclude, '**/determinism.*.test.ts', '**/*.e2e.test.ts'],
    },
});
