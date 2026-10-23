// Streamable HTTP request handler shared by `npx @nowline/mcp --port` and
// `nowline --mcp --port`.
//
// The HTTP transport is stateless (no session IDs), so every request gets its
// own McpServer and transport. Sharing one pair across requests could deliver
// one HTTP client's messages to another, and since
// @modelcontextprotocol/server 2.3.0 the SDK throws on reuse.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';

export function createMcpHttpHandler(
    createServer: () => McpServer,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
    return async (req, res) => {
        const server = createServer();
        const transport = new NodeStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
    };
}
