// Streamable HTTP request handler shared by `npx @nowline/mcp --port` and
// `nowline --mcp --port`.
//
// The HTTP transport is stateless (no session IDs), so every request gets its
// own McpServer and transport. Sharing one pair across requests could deliver
// one HTTP client's messages to another, and since
// @modelcontextprotocol/server 2.3.0 the SDK throws on reuse.
//
// Binding 127.0.0.1 keeps other machines out but not a web page the user has
// open: by DNS rebinding, a page can send requests that reach this socket with
// its own name in Host and Origin. Stateless mode needs no `initialize`, so one
// such POST could call any tool. Every request is checked against the
// localhost names and the port this server listens on before the SDK sees it.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import {
    localhostAllowedHostnames,
    type McpServer,
    validateHostHeader,
    validateOriginHeader,
} from '@modelcontextprotocol/server';

const LOCALHOST_NAMES = localhostAllowedHostnames();

export function createMcpHttpHandler(
    createServer: () => McpServer,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
    return async (req, res) => {
        const rejection = localRequestRejection(req);
        if (rejection !== undefined) {
            res.writeHead(403, { 'Content-Type': 'application/json' }).end(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: rejection },
                    id: null,
                }),
            );
            return;
        }

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

/**
 * Why the request must be refused, or `undefined` when it may proceed.
 *
 * Host must name localhost, 127.0.0.1 or [::1] with this server's port. Origin
 * may be absent (MCP clients that aren't browsers don't send one); when present
 * it must be `http://` on one of those names and the same port.
 */
function localRequestRejection(req: IncomingMessage): string | undefined {
    const port = String(req.socket.localPort);

    const host = req.headers.host;
    const hostResult = validateHostHeader(host, LOCALHOST_NAMES);
    if (!hostResult.ok) return hostResult.message;
    if (effectivePort(`http://${host}`) !== port) return `Invalid Host: ${host}`;

    const origin = req.headers.origin;
    const originResult = validateOriginHeader(origin, LOCALHOST_NAMES);
    if (!originResult.ok) return originResult.message;
    if (origin) {
        const url = new URL(origin);
        if (url.protocol !== 'http:' || effectivePort(origin) !== port) {
            return `Invalid Origin: ${origin}`;
        }
    }
    return undefined;
}

function effectivePort(url: string): string {
    const parsed = new URL(url);
    return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
}
