import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(testRoot);
const harnessPath = join(testRoot, 'worker-roundtrip.harness.mjs');
const registerHook = join(packageRoot, 'test-support/register.mjs');

describe('@nowline/lsp-worker (in-process roundtrip)', () => {
    it('passes the node harness', () => {
        execFileSync(
            process.execPath,
            ['--conditions=browser', '--import', registerHook, '--test', harnessPath],
            {
                cwd: packageRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        expect(true).toBe(true);
    });
});
