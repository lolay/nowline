// Client roots (specs/mcp.md "Shared tool contract"): without --root, the
// server resolves paths against the roots a client advertises, follows
// notifications/roots/list_changed, and falls back to process.cwd() when the
// client has no roots.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';
import { rootsFromUris } from '../src/workspace-roots.js';

const MINIMAL = [
    'nowline v1',
    '',
    'roadmap r "Roots" start:2025-01-06 scale:1w',
    '',
    'swimlane lane "Lane"',
    '  item foo "Foo" duration:1w',
].join('\n');

let base: string;
let rootA: string;
let rootB: string;
let outside: string;

beforeAll(() => {
    base = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-roots-'));
    rootA = path.join(base, 'a');
    rootB = path.join(base, 'b');
    outside = path.join(base, 'outside');
    for (const dir of [rootA, rootB, outside]) mkdirSync(dir);
    writeFileSync(path.join(rootA, 'alpha.nowline'), MINIMAL, 'utf-8');
    writeFileSync(path.join(rootB, 'beta.nowline'), MINIMAL, 'utf-8');
    writeFileSync(path.join(outside, 'gamma.nowline'), MINIMAL, 'utf-8');
});

afterAll(() => {
    rmSync(base, { recursive: true, force: true });
});

// ---- Fake clients -----------------------------------------------------------

interface FakeClient {
    client: Client;
    /** How many roots/list requests the server sent. */
    listCalls: () => number;
    setRoots: (uris: string[]) => void;
    close: () => Promise<void>;
}

const open: FakeClient[] = [];

afterEach(async () => {
    await Promise.all(open.splice(0).map((c) => c.close()));
});

async function connect(opts: {
    roots?: string[];
    advertiseRoots: boolean;
    allowedRoot?: string;
    failRootsList?: boolean;
}): Promise<FakeClient> {
    let uris = opts.roots ?? [];
    let calls = 0;
    const server = createMcpServer({ allowedRoot: opts.allowedRoot });
    const client = new Client(
        { name: 'roots-test-client', version: '1.0.0' },
        { capabilities: opts.advertiseRoots ? { roots: { listChanged: true } } : {} },
    );
    if (opts.advertiseRoots) {
        client.setRequestHandler('roots/list', async () => {
            calls++;
            if (opts.failRootsList) throw new Error('roots unavailable');
            return { roots: uris.map((uri) => ({ uri })) };
        });
    }
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const fake: FakeClient = {
        client,
        listCalls: () => calls,
        setRoots: (next) => {
            uris = next;
        },
        close: async () => {
            await clientTransport.close().catch(() => {});
            await serverTransport.close().catch(() => {});
        },
    };
    open.push(fake);
    return fake;
}

function fileUri(p: string): string {
    return pathToFileURL(p).href;
}

async function listPaths(client: Client, directory?: string): Promise<string[]> {
    const result = await client.callTool({
        name: 'list',
        arguments: directory === undefined ? {} : { directory },
    });
    expect(result.isError).toBeFalsy();
    return (result.structuredContent as { paths: string[] }).paths;
}

async function readPath(client: Client, p: string) {
    return client.callTool({ name: 'read', arguments: { path: p } });
}

function errorCode(result: Awaited<ReturnType<Client['callTool']>>): string {
    const text = (result.content as { type: string; text: string }[])[0].text;
    return (JSON.parse(text) as { error: { code: string } }).error.code;
}

// ---- Client that advertises roots -------------------------------------------

describe('client with the roots capability', () => {
    it('resolves relative paths and the default list directory against the first root', async () => {
        const { client, listCalls } = await connect({
            advertiseRoots: true,
            roots: [fileUri(rootA), fileUri(rootB)],
        });

        expect(await listPaths(client)).toEqual([path.join(rootA, 'alpha.nowline')]);

        const read = await readPath(client, 'alpha.nowline');
        expect(read.isError).toBeFalsy();
        expect((read.structuredContent as { path: string }).path).toBe(
            path.join(rootA, 'alpha.nowline'),
        );

        // Asked once, then cached.
        expect(listCalls()).toBe(1);
    });

    it('allows paths inside any root and rejects paths outside all of them', async () => {
        const { client } = await connect({
            advertiseRoots: true,
            roots: [fileUri(rootA), fileUri(rootB)],
        });

        const inB = await readPath(client, path.join(rootB, 'beta.nowline'));
        expect(inB.isError).toBeFalsy();
        expect(await listPaths(client, rootB)).toEqual([path.join(rootB, 'beta.nowline')]);

        const viaRelative = await readPath(client, path.join('..', 'b', 'beta.nowline'));
        expect(viaRelative.isError).toBeFalsy();

        const out = await readPath(client, path.join(outside, 'gamma.nowline'));
        expect(out.isError).toBe(true);
        expect(errorCode(out)).toBe('NL.MCP.OUT_OF_ROOT');
    });

    it('creates files in the first root', async () => {
        const { client } = await connect({ advertiseRoots: true, roots: [fileUri(rootA)] });
        const result = await client.callTool({
            name: 'create',
            arguments: { path: 'created.nowline', source: MINIMAL },
        });
        expect(result.isError).toBeFalsy();
        expect((result.structuredContent as { path: string }).path).toBe(
            path.join(rootA, 'created.nowline'),
        );
        rmSync(path.join(rootA, 'created.nowline'));
    });

    it('re-reads roots after notifications/roots/list_changed', async () => {
        const fake = await connect({ advertiseRoots: true, roots: [fileUri(rootA)] });
        expect(await listPaths(fake.client)).toEqual([path.join(rootA, 'alpha.nowline')]);

        fake.setRoots([fileUri(rootB)]);
        await fake.client.sendRootsListChanged();
        // The server handles messages in order, so a ping round trip
        // guarantees the notification has been processed.
        await fake.client.ping();

        expect(await listPaths(fake.client)).toEqual([path.join(rootB, 'beta.nowline')]);
        const stale = await readPath(fake.client, path.join(rootA, 'alpha.nowline'));
        expect(stale.isError).toBe(true);
        expect(errorCode(stale)).toBe('NL.MCP.OUT_OF_ROOT');
        expect(fake.listCalls()).toBe(2);
    });

    it('falls back to cwd when the client lists no roots', async () => {
        const { client, listCalls } = await connect({ advertiseRoots: true, roots: [] });
        const read = await readPath(client, 'package.json');
        expect(read.isError).toBeFalsy();
        expect((read.structuredContent as { path: string }).path).toBe(
            path.join(process.cwd(), 'package.json'),
        );
        expect(listCalls()).toBe(1);
    });

    it('falls back to cwd when roots/list fails', async () => {
        const { client } = await connect({
            advertiseRoots: true,
            roots: [fileUri(rootA)],
            failRootsList: true,
        });
        const read = await readPath(client, 'package.json');
        expect(read.isError).toBeFalsy();
        expect((read.structuredContent as { path: string }).path).toBe(
            path.join(process.cwd(), 'package.json'),
        );
    });

    it('never asks the client when an explicit root is configured', async () => {
        const { client, listCalls } = await connect({
            advertiseRoots: true,
            roots: [fileUri(rootB)],
            allowedRoot: rootA,
        });
        expect(await listPaths(client)).toEqual([path.join(rootA, 'alpha.nowline')]);
        const inB = await readPath(client, path.join(rootB, 'beta.nowline'));
        expect(inB.isError).toBe(true);
        expect(listCalls()).toBe(0);
    });
});

// ---- Client without roots ---------------------------------------------------

describe('client without the roots capability', () => {
    it('resolves paths against process.cwd()', async () => {
        const { client } = await connect({ advertiseRoots: false });
        const read = await readPath(client, 'package.json');
        expect(read.isError).toBeFalsy();
        expect((read.structuredContent as { path: string }).path).toBe(
            path.join(process.cwd(), 'package.json'),
        );

        const out = await readPath(client, path.join(rootA, 'alpha.nowline'));
        expect(out.isError).toBe(true);
        expect(errorCode(out)).toBe('NL.MCP.OUT_OF_ROOT');
    });
});

// ---- URI conversion ---------------------------------------------------------

describe('rootsFromUris', () => {
    it('keeps file:// roots in order, drops other schemes, and collapses duplicates', () => {
        expect(
            rootsFromUris([
                'https://example.com/repo',
                fileUri(rootB),
                fileUri(rootA),
                fileUri(rootB),
                'not a uri',
            ]),
        ).toEqual({ primary: rootB, allowed: [rootB, rootA] });
    });

    it('returns undefined when no file:// root remains', () => {
        expect(rootsFromUris([])).toBeUndefined();
        expect(rootsFromUris(['https://example.com/repo'])).toBeUndefined();
    });
});
