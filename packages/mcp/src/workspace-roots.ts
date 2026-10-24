// Where the server's file tools resolve paths.
//
// An explicit root (`--root`, or `allowedRoot` from an embedder) always wins
// and the client is never asked. Without one, the server asks a client that
// advertises the MCP `roots` capability for its roots, because a harness may
// start the server somewhere other than the project (a plugin cache, the app
// bundle). A client without roots, an empty or non-`file://` list, or a failed
// `roots/list` falls back to `process.cwd()`.
//
// Multiple roots: every root is allowed, and relative paths resolve against
// the first. The answer is cached until the client sends
// `notifications/roots/list_changed`.
//
// Spec: specs/mcp.md "Shared tool contract".

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/server';

export interface WorkspaceRoots {
    /** Relative paths resolve against this root; `list` and default export output use it. */
    readonly primary: string;
    /** Every root a path may land in. Always contains `primary`. */
    readonly allowed: readonly string[];
}

/** Bounds a `roots/list` round trip so a client that never answers can't hang a tool call. */
const LIST_ROOTS_TIMEOUT_MS = 5_000;

export function staticRoots(root: string): WorkspaceRoots {
    const abs = path.resolve(root);
    return { primary: abs, allowed: [abs] };
}

/**
 * Converts a `roots/list` result to filesystem roots. Non-`file://` and
 * malformed URIs are skipped; duplicates collapse. Returns `undefined` when
 * nothing usable remains.
 */
export function rootsFromUris(uris: readonly string[]): WorkspaceRoots | undefined {
    const paths: string[] = [];
    for (const uri of uris) {
        let abs: string;
        try {
            if (!uri.startsWith('file:')) continue;
            abs = path.resolve(fileURLToPath(uri));
        } catch {
            continue;
        }
        if (!paths.includes(abs)) paths.push(abs);
    }
    return paths.length > 0 ? { primary: paths[0], allowed: paths } : undefined;
}

/**
 * Returns a function yielding the current roots for `server`. With
 * `configuredRoot` set the result is fixed; otherwise it follows the client's
 * roots as described above. Never rejects.
 */
export function createWorkspaceRoots(
    server: McpServer,
    configuredRoot: string | undefined,
): () => Promise<WorkspaceRoots> {
    if (configuredRoot !== undefined) {
        const fixed = staticRoots(configuredRoot);
        return async () => fixed;
    }

    let cached: Promise<WorkspaceRoots> | undefined;
    server.server.setNotificationHandler('notifications/roots/list_changed', () => {
        cached = undefined;
    });

    async function fetchRoots(): Promise<WorkspaceRoots> {
        const fallback = staticRoots(process.cwd());
        if (!server.server.getClientCapabilities()?.roots) return fallback;
        try {
            const { roots } = await server.server.listRoots(undefined, {
                timeout: LIST_ROOTS_TIMEOUT_MS,
            });
            return rootsFromUris(roots.map((r) => r.uri)) ?? fallback;
        } catch {
            return fallback;
        }
    }

    return () => {
        cached ??= fetchRoots();
        return cached;
    };
}

/** Whether the absolute path `abs` is one of the allowed roots or inside one. */
export function isInsideRoots(abs: string, roots: WorkspaceRoots): boolean {
    return roots.allowed.some((root) => {
        const prefix = root.endsWith(path.sep) ? root : root + path.sep;
        return abs === root || abs.startsWith(prefix);
    });
}
