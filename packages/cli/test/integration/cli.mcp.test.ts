import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
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

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const probe = createServer();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as AddressInfo;
            probe.close(() => resolve(port));
        });
    });
}

/** Starts `nowline --mcp --port <port>` and resolves once it is listening. */
function startHttpMcp(port: number, timeoutMs = 10000): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [distEntry, '--mcp', '--port', String(port)], {
            cwd: packageRoot,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`--mcp --port did not start listening: ${stderr}`));
        }, timeoutMs);
        child.stderr?.on('data', (d: Buffer) => {
            stderr += d.toString();
            if (stderr.includes('listening')) {
                clearTimeout(timer);
                resolve(child);
            }
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

function postToolsList(port: number, host: string): Promise<number> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    return new Promise((resolve, reject) => {
        const req = request(
            {
                host: '127.0.0.1',
                port,
                method: 'POST',
                path: '/',
                headers: {
                    Host: host,
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                },
            },
            (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode ?? 0));
            },
        );
        req.on('error', reject);
        req.end(body);
    });
}

describeBuilt('CLI --mcp flag (requires `pnpm build`)', () => {
    it('--mcp --port refuses a foreign Host and serves localhost', async () => {
        const port = await freePort();
        const child = await startHttpMcp(port);
        try {
            expect(await postToolsList(port, `rebind.example:${port}`)).toBe(403);
            expect(await postToolsList(port, `127.0.0.1:${port}`)).toBe(200);
        } finally {
            child.kill('SIGTERM');
        }
    });

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
