import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '@nowline/mcp/server';
import type { ParsedArgs } from '../cli/args.js';

/**
 * `nowline --mcp` handler.
 *
 * Starts a Model Context Protocol stdio server sharing the same @nowline/mcp
 * server factory as `npx @nowline/mcp`. Runs until the process receives
 * SIGINT/SIGTERM or the client closes stdin.
 */
export async function mcpHandler({ args }: { args: ParsedArgs }): Promise<void> {
    const root = args.root ?? process.cwd();
    const server = createMcpServer({ allowedRoot: root });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Keep alive: the transport closes when stdin closes or the process is signalled.
    await new Promise<void>((resolve) => {
        transport.onclose = resolve;
    });
}
