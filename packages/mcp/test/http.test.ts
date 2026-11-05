// Streamable HTTP transport tests for @nowline/mcp.
//
// The stdio and in-memory suites can't catch transport-lifetime bugs: a
// stateless HTTP server sees one request per JSON-RPC message, so reusing a
// server or transport across requests only fails from the second request on.

import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpHttpHandler } from '../src/http.js';
import { createMcpServer } from '../src/server.js';

let httpServer: Server;
let url: URL;
let port: number;

beforeAll(async () => {
    httpServer = createServer(createMcpHttpHandler(() => createMcpServer()));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    ({ port } = httpServer.address() as AddressInfo);
    url = new URL(`http://127.0.0.1:${port}/`);
});

afterAll(async () => {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

async function connectClient(): Promise<Client> {
    const client = new Client({ name: 'http-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url));
    return client;
}

describe('createMcpHttpHandler', () => {
    it('serves more than one request from the same client', async () => {
        const client = await connectClient();
        try {
            const first = await client.listTools();
            const second = await client.listTools();
            expect(first.tools.length).toBeGreaterThan(0);
            expect(second.tools.map((t) => t.name)).toEqual(first.tools.map((t) => t.name));
        } finally {
            await client.close();
        }
    });

    it('serves concurrent clients independently', async () => {
        const clients = await Promise.all([connectClient(), connectClient(), connectClient()]);
        try {
            const results = await Promise.all(clients.map((c) => c.listTools()));
            for (const result of results) {
                expect(result.tools.length).toBeGreaterThan(0);
            }
        } finally {
            await Promise.all(clients.map((c) => c.close()));
        }
    });
});

interface RawResponse {
    status: number;
    body: string;
}

// fetch() forbids setting Host, so the header checks go through node:http.
function postToolsList(headers: Record<string, string>): Promise<RawResponse> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    return new Promise((resolve, reject) => {
        const req = request(
            {
                host: '127.0.0.1',
                port,
                method: 'POST',
                path: '/',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                    ...headers,
                },
            },
            (res) => {
                let text = '';
                res.setEncoding('utf-8');
                res.on('data', (chunk: string) => {
                    text += chunk;
                });
                res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
            },
        );
        req.on('error', reject);
        req.end(body);
    });
}

describe('createMcpHttpHandler Host and Origin checks', () => {
    it.each([
        ['127.0.0.1', () => `127.0.0.1:${port}`],
        ['localhost', () => `localhost:${port}`],
        ['[::1]', () => `[::1]:${port}`],
    ])('serves a request with Host %s and the listening port', async (_name, host) => {
        const res = await postToolsList({ Host: host() });
        expect(res.status).toBe(200);
        expect(res.body).toContain('"tools"');
    });

    it('serves a request with a localhost Origin on the listening port', async () => {
        const res = await postToolsList({
            Host: `localhost:${port}`,
            Origin: `http://localhost:${port}`,
        });
        expect(res.status).toBe(200);
        expect(res.body).toContain('"tools"');
    });

    it.each([
        ['a foreign name', () => `rebind.example:${port}`],
        ['a foreign name without a port', () => 'rebind.example'],
        ['localhost on another port', () => `localhost:${port + 1}`],
    ])('refuses a request whose Host is %s', async (_name, host) => {
        const res = await postToolsList({ Host: host() });
        expect(res.status).toBe(403);
        expect(res.body).not.toContain('"tools"');
    });

    it.each([
        ['a foreign site', () => 'http://rebind.example'],
        ['localhost on another port', () => `http://localhost:${port + 1}`],
        ['https on localhost', () => `https://localhost:${port}`],
        ['the opaque null origin', () => 'null'],
    ])('refuses a request whose Origin is %s', async (_name, origin) => {
        const res = await postToolsList({ Host: `127.0.0.1:${port}`, Origin: origin() });
        expect(res.status).toBe(403);
        expect(res.body).not.toContain('"tools"');
    });
});
