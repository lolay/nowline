import { configDefaults, defineConfig } from 'vitest/config';

// Default (Node) config for `pnpm -r test` / `make test`. The cross-surface
// determinism gate (`determinism.*.test.ts`) is excluded here: it runs via
// `make determinism` in a single canonical environment so the multi-OS test
// matrix never needs a compiled binary or a browser.
export default defineConfig({
    test: {
        exclude: [...configDefaults.exclude, '**/determinism.*.test.ts'],
    },
});
