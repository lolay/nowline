// The one way to start the Nowline MCP server, shared by `npx @nowline/mcp`
// and `nowline --mcp`. Both entry points only parse their own flags and call
// startMcpServer, so `--root`, `--port` and the reported version mean the same
// thing in each (r1.f15: the CLI once built its own server without
// `rootConfigured`, so binary exports came back inline instead of saved).
//
// Spec: specs/mcp.md.

import { createServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { MCP_VERSION } from './generated/version.js';
import { createMcpHttpHandler } from './http.js';
import { expandRootPath } from './root-path.js';
import { createMcpServer, type McpServerOptions } from './server.js';

export interface StartMcpServerOptions {
    /**
     * `--root` as the user typed it. Expanded with {@link expandRootPath}; an
     * empty or blank value counts as absent (client roots, else cwd).
     */
    root?: string;
    /** `--port` as the user typed it. Absent: stdio. Present: Streamable HTTP on 127.0.0.1. */
    port?: string;
    /** `serverInfo.version`. Defaults to the @nowline/mcp package version. */
    version?: string;
    /** Called once the HTTP listener is up. Defaults to a line on stderr. */
    onListening?: (url: string) => void;
}

/** A `--port` value that isn't an integer from 1 to 65535. */
export class InvalidPortError extends Error {
    constructor(public readonly value: string) {
        super(`--port must be a number between 1 and 65535 (got ${value}).`);
        this.name = 'InvalidPortError';
    }
}

/** Parses `--port`, throwing {@link InvalidPortError} unless it is a whole number from 1 to 65535. */
export function parsePort(raw: string): number {
    const trimmed = raw.trim();
    const port = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new InvalidPortError(raw);
    }
    return port;
}

/** The {@link createMcpServer} options for a given `--root` and version. */
export function mcpServerOptions(root: string | undefined, version?: string): McpServerOptions {
    // Expand mcpb tokens (${HOME}, ~, env vars) so a literal default from the
    // .mcpb directory picker resolves to a real path.
    const allowedRoot = expandRootPath(root);
    return {
        allowedRoot,
        rootConfigured: allowedRoot !== undefined,
        version: version ?? MCP_VERSION,
    };
}

/**
 * Starts the server and resolves when it stops: for stdio, when the client
 * closes stdin; for HTTP, after SIGINT or SIGTERM closes the listener.
 * Rejects with {@link InvalidPortError} before binding anything when `port` is bad.
 */
export async function startMcpServer(opts: StartMcpServerOptions = {}): Promise<void> {
    const port = opts.port === undefined ? undefined : parsePort(opts.port);
    const serverOptions = mcpServerOptions(opts.root, opts.version);

    if (port === undefined) {
        const transport = new StdioServerTransport();
        const closed = new Promise<void>((resolve) => {
            // Set before connect: the SDK wraps an existing onclose rather than replacing it.
            transport.onclose = resolve;
        });
        await createMcpServer(serverOptions).connect(transport);
        await closed;
        return;
    }

    // Stateless Streamable HTTP: one server per request (see http.ts).
    const httpServer = createServer(createMcpHttpHandler(() => createMcpServer(serverOptions)));
    const onListening =
        opts.onListening ??
        ((url: string) =>
            process.stderr.write(`nowline-mcp: Streamable HTTP listening on ${url}\n`));

    await new Promise<void>((resolve, reject) => {
        const stop = () => httpServer.close();
        httpServer.once('error', reject);
        httpServer.once('close', () => {
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
            resolve();
        });
        httpServer.listen(port, '127.0.0.1', () => {
            process.on('SIGINT', stop);
            process.on('SIGTERM', stop);
            onListening(`http://127.0.0.1:${port}`);
        });
    });
}
