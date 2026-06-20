import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'vitest';

const testRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(testRoot);
const harnessPath = join(testRoot, 'worker-roundtrip.harness.mjs');
const registerHook = join(packageRoot, 'test-support/register.mjs');

// The real assertions live in worker-roundtrip.harness.mjs and run under
// node:test in a subprocess: vscode-languageserver v10's CJS entry can't be
// loaded through vite/vitest under the browser condition, so we drive the
// roundtrip with a Node loader hook (test-support/register.mjs) that maps
// `vscode-languageserver` to an ESM-clean shim. This vitest case is a thin
// gate around that subprocess; on failure it re-throws the harness's captured
// stdout/stderr so the node:test assertion details surface in the report
// instead of an opaque "Command failed".
describe('@nowline/lsp-worker (in-process roundtrip)', () => {
    it('passes the node harness', () => {
        try {
            execFileSync(
                process.execPath,
                [
                    '--conditions=browser',
                    '--import',
                    pathToFileURL(registerHook).href,
                    '--test',
                    harnessPath,
                ],
                {
                    cwd: packageRoot,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
        } catch (err) {
            const e = err as { stdout?: string; stderr?: string; message?: string };
            const detail = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
            throw new Error(
                detail
                    ? `lsp-worker node harness failed:\n${detail}`
                    : (e.message ?? 'lsp-worker node harness failed'),
            );
        }
    });
});
