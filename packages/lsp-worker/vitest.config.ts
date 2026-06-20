import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

function browserEntry(pkgName: string): string {
    const entry = require.resolve(pkgName);
    return join(dirname(entry), '..', 'browser', 'main.js');
}

const browserShims: Record<string, string> = {
    'vscode-jsonrpc/browser': browserEntry('vscode-jsonrpc'),
    'vscode-languageserver-protocol/browser': browserEntry('vscode-languageserver-protocol'),
    'vscode-languageserver/browser': browserEntry('vscode-languageserver'),
};

function vscodeBrowserShimPlugin() {
    return {
        name: 'vscode-lsp-browser-shim',
        enforce: 'pre' as const,
        resolveId(source: string) {
            return browserShims[source] ?? null;
        },
    };
}

export default defineConfig({
    plugins: [vscodeBrowserShimPlugin()],
    test: {
        environment: 'node',
    },
});
