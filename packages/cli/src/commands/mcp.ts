import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpHttpHandler } from '@nowline/mcp/http';
import { createMcpServer } from '@nowline/mcp/server';
import type { ParsedArgs } from '../cli/args.js';
import { createLog } from '../io/log.js';

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
    // Without --root the server follows the client's MCP roots, else cwd.
    const root = args.root;

    const portStr = args.port;
    if (portStr !== undefined) {
        const port = parseInt(portStr, 10);
        if (!Number.isFinite(port) || port < 1 || port > 65535) {
            throw new Error(
                `nowline: --port must be a number between 1 and 65535 (got ${portStr}).`,
            );
        }

        const httpServer = createServer(
            createMcpHttpHandler(() => createMcpServer({ allowedRoot: root })),
        );

        await new Promise<void>((resolve) => {
            httpServer.listen(port, '127.0.0.1', () => {
                createLog(args.logLevel).notice(
                    `nowline: MCP Streamable HTTP listening on http://127.0.0.1:${port}`,
                );
            });
            httpServer.on('close', resolve);
            process.on('SIGINT', () => httpServer.close());
            process.on('SIGTERM', () => httpServer.close());
        });
    } else {
        const transport = new StdioServerTransport();
        await createMcpServer({ allowedRoot: root }).connect(transport);
        await new Promise<void>((resolve) => {
            transport.onclose = resolve;
        });
    }
}
