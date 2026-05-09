#!/usr/bin/env node
// Smoke test: spawn the bundled LSP server, send an LSP `initialize` request
// over stdio, and confirm it responds with capabilities. Exits non-zero on
// failure so CI / pre-commit can catch a broken bundle.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, '..', 'dist', 'server.cjs');

if (!existsSync(serverPath)) {
    console.error(`server bundle not found: ${serverPath}`);
    console.error('run `pnpm --filter ./packages/vscode-extension build` first');
    process.exit(1);
}

const child = spawn(process.execPath, [serverPath, '--stdio'], {
    stdio: ['pipe', 'pipe', 'inherit'],
});

let stdout = '';
let resolved = false;

child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
    const match = stdout.match(/Content-Length: (\d+)\r\n\r\n/);
    if (!match) return;
    const headerEnd = stdout.indexOf('\r\n\r\n') + 4;
    const length = Number(match[1]);
    if (stdout.length < headerEnd + length) return;
    const body = stdout.slice(headerEnd, headerEnd + length);
    const message = JSON.parse(body);
    if (message.id === 1 && message.result?.capabilities) {
        resolved = true;
        console.log('initialize ok — server reports capabilities');
        child.kill();
        process.exit(0);
    }
});

child.on('exit', (code) => {
    if (resolved) return;
    console.error(`server exited (${code}) before responding to initialize`);
    process.exit(code ?? 1);
});

const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null,
    },
};
const payload = JSON.stringify(initialize);
child.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);

setTimeout(() => {
    if (!resolved) {
        console.error('timed out waiting for initialize response');
        child.kill();
        process.exit(2);
    }
}, 10_000);
