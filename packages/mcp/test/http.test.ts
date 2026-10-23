// Streamable HTTP transport tests for @nowline/mcp.
//
// The stdio and in-memory suites can't catch transport-lifetime bugs: a
// stateless HTTP server sees one request per JSON-RPC message, so reusing a
// server or transport across requests only fails from the second request on.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpHttpHandler } from '../src/http.js';
import { createMcpServer } from '../src/server.js';

let httpServer: Server;
let url: URL;

beforeAll(async () => {
    httpServer = createServer(createMcpHttpHandler(() => createMcpServer()));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
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
