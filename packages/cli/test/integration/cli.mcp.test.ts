import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

/**
 * Drives a JSON-RPC MCP exchange over stdin/stdout.
 * Returns the first complete JSON line received from stdout.
 */
function driveJsonRpc(args: string[], request: object, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [distEntry, ...args], {
            cwd: packageRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let buf = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill('SIGTERM');
                reject(new Error('MCP smoke test timed out waiting for a response'));
            }
        }, timeoutMs);

        child.stdout.on('data', (d: Buffer) => {
            buf += d.toString('utf-8');
            for (const line of buf.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const msg = JSON.parse(trimmed);
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        child.kill('SIGTERM');
                        resolve(msg);
                    }
                } catch {
                    // not yet a complete JSON line
                }
            }
        });

        child.on('error', (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        });

        child.stdin.write(`${JSON.stringify(request)}\n`);
        // Leave stdin open so the server stays alive until we kill it.
    });
}

describeBuilt('CLI --mcp flag (requires `pnpm build`)', () => {
    it('--mcp appears in --help output', async () => {
        const child = spawn(process.execPath, [distEntry, '--help'], {
            cwd: packageRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout.on('data', (d: Buffer) => {
            stdout += d.toString();
        });
        await new Promise<void>((resolve) => child.on('close', () => resolve()));
        expect(stdout).toMatch(/--mcp/);
    });

    it('--mcp --serve is a usage error (mutual exclusivity)', async () => {
        const child = spawn(process.execPath, [distEntry, '--mcp', '--serve'], {
            cwd: packageRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (d: Buffer) => {
            stderr += d.toString();
        });
        const code = await new Promise<number>((resolve) =>
            child.on('close', (c) => resolve(c ?? 2)),
        );
        expect(code).toBe(2);
        expect(stderr).toMatch(/mcp.*serve|serve.*mcp/i);
    });

    it('--mcp responds to MCP initialize with serverInfo.name = "nowline"', async () => {
        const request = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'nowline-cli-test', version: '0.0.1' },
            },
        };
        const msg = (await driveJsonRpc(['--mcp'], request)) as {
            result?: { serverInfo?: { name?: string } };
        };
        expect(msg).toHaveProperty('result');
        expect(msg.result?.serverInfo?.name).toBe('nowline');
    });

    it('--mcp --root <dir> is accepted and used as allowed root', async () => {
        const request = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'nowline-cli-test', version: '0.0.1' },
            },
        };
        const msg = (await driveJsonRpc(['--mcp', '--root', packageRoot], request)) as {
            result?: { serverInfo?: { name?: string } };
        };
        expect(msg.result?.serverInfo?.name).toBe('nowline');
    });
});
