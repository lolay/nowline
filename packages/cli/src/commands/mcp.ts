import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '@nowline/mcp/server';
import type { ParsedArgs } from '../cli/args.js';

/**
 * `nowline --mcp` handler.
 *
 * Starts a Model Context Protocol server sharing the same @nowline/mcp
 * server factory as `npx @nowline/mcp`.
 *
 * Transport selection:
 *   stdio (default)  — when --port is absent.
 *   Streamable HTTP  — when --port <N> is supplied; listens on localhost:<N>.
 *
 * Runs until the process receives SIGINT/SIGTERM or the client closes stdin.
 */
export async function mcpHandler({ args }: { args: ParsedArgs }): Promise<void> {
    const root = args.root ?? process.cwd();
    const server = createMcpServer({ allowedRoot: root });

    const portStr = args.port;
    if (portStr !== undefined) {
        const port = parseInt(portStr, 10);
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
            throw new Error(
                `nowline: --port must be a number between 1 and 65535 (got ${portStr}).`,
            );
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await server.connect(transport);

        const httpServer = createServer(async (req, res) => {
            await transport.handleRequest(req, res);
        });

        await new Promise<void>((resolve) => {
            httpServer.listen(port, '127.0.0.1', () => {
                process.stderr.write(
                    `nowline: MCP Streamable HTTP listening on http://127.0.0.1:${port}\n`,
                );
            });
            httpServer.on('close', resolve);
            process.on('SIGINT', () => httpServer.close());
            process.on('SIGTERM', () => httpServer.close());
        });
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        await new Promise<void>((resolve) => {
            transport.onclose = resolve;
        });
    }
}
