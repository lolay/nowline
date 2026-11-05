// The path-root sandbox (specs/mcp.md "Path roots"): file tools touch only
// `.nowline` files, outputs only export extensions, symlinks are resolved
// before the root check, and includes are confined to the root the way the
// CLI's --include-root confines them.

import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardPath, realPathAllowingMissing } from '../src/path-guard.js';
import { createMcpServer } from '../src/server.js';
import { staticRoots } from '../src/workspace-roots.js';

const roadmap = (title: string, include?: string) =>
    [
        'nowline v1',
        '',
        ...(include === undefined ? [] : [`include "${include}"`, '']),
        `roadmap r "${title}" start:2025-01-06 scale:1w`,
        '',
        `swimlane lane "${title} lane"`,
        '  item foo "Foo" duration:1w',
    ].join('\n');

const INCLUDED = [
    'nowline v1',
    '',
    'swimlane extra "INCLUDED-LANE-MARKER"',
    '  item bar "Bar" duration:1w',
].join('\n');

const OUTSIDE_INCLUDED = [
    'nowline v1',
    '',
    'swimlane leak "OUTSIDE-LANE-MARKER"',
    '  item baz "Baz" duration:1w',
].join('\n');

/** The fill colour marks the outside logo in a render; the sanitizer keeps it. */
const OUTSIDE_LOGO_FILL = '#a1b2c3';
const OUTSIDE_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${OUTSIDE_LOGO_FILL}"/></svg>`;

/**
 * Whether this OS lets an unprivileged process create a file symlink.
 * Windows refuses without Developer Mode; directory junctions need no privilege.
 */
function canSymlinkFiles(): boolean {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-symprobe-'));
    try {
        writeFileSync(path.join(dir, 'target'), '');
        symlinkSync(path.join(dir, 'target'), path.join(dir, 'link'));
        return true;
    } catch {
        return false;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
const FILE_SYMLINKS = canSymlinkFiles();

let base: string;
let root: string;
let outside: string;
let client: Client;
let closeAll: () => Promise<void>;

beforeAll(async () => {
    base = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-sandbox-'));
    root = path.join(base, 'root');
    outside = path.join(base, 'outside');
    mkdirSync(root);
    mkdirSync(outside);
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, '.env'), 'SECRET_TOKEN=inside-root\n');
    writeFileSync(path.join(root, 'notes.txt'), 'not a roadmap\n');
    writeFileSync(path.join(root, 'ok.nowline'), roadmap('Inside'));
    writeFileSync(path.join(root, 'sub', 'part.nowline'), INCLUDED);
    writeFileSync(path.join(outside, 'creds.txt'), 'SECRET_TOKEN=outside-root\n');
    writeFileSync(path.join(outside, 'other.nowline'), OUTSIDE_INCLUDED);
    writeFileSync(path.join(outside, 'logo.svg'), OUTSIDE_LOGO);
    // A directory link out of the root: a junction needs no privilege on Windows.
    symlinkSync(outside, path.join(root, 'out-dir'), 'junction');
    if (FILE_SYMLINKS) {
        symlinkSync(path.join(outside, 'creds.txt'), path.join(root, 'link.nowline'));
        symlinkSync(path.join(outside, 'other.nowline'), path.join(root, 'outside-link.nowline'));
        symlinkSync(path.join(root, '.env'), path.join(root, 'env-link.nowline'));
        symlinkSync(path.join(outside, 'planted.nowline'), path.join(root, 'dangling.nowline'));
        symlinkSync(path.join(outside, 'logo.svg'), path.join(root, 'logo.svg'));
    }

    const server = createMcpServer({ allowedRoot: root });
    client = new Client({ name: 'sandbox-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeAll = async () => {
        await clientTransport.close().catch(() => {});
        await serverTransport.close().catch(() => {});
    };
});

afterAll(async () => {
    await closeAll();
    rmSync(base, { recursive: true, force: true });
});

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return client.callTool({ name, arguments: args });
}

function errorCode(result: ToolResult): string {
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0].text;
    return (JSON.parse(text) as { error: { code: string } }).error.code;
}

function allText(result: ToolResult): string {
    return (result.content as { type: string; text?: string }[])
        .map((block) => block.text ?? '')
        .join('\n');
}

/** Diagnostic codes from a `validate` result or a diagnostics error response. */
function diagnosticCodes(result: ToolResult): string[] {
    const structured =
        (result.structuredContent as { diagnostics?: { code: string }[] } | undefined) ??
        JSON.parse((result.content as { type: string; text: string }[])[0].text);
    return ((structured.diagnostics ?? []) as { code: string }[]).map((d) => d.code);
}

// ---- Extension rule ---------------------------------------------------------

describe('file tools accept only .nowline paths', () => {
    it('read refuses a non-.nowline file inside the root', async () => {
        const result = await call('read', { path: '.env' });
        expect(errorCode(result)).toBe('NL.MCP.INPUT');
        expect(allText(result)).not.toContain('SECRET_TOKEN');
    });

    it('create refuses a non-.nowline target and writes nothing', async () => {
        const result = await call('create', { path: 'new.txt', source: roadmap('New') });
        expect(errorCode(result)).toBe('NL.MCP.INPUT');
        expect(existsSync(path.join(root, 'new.txt'))).toBe(false);
    });

    it('update refuses a non-.nowline target and leaves it unchanged', async () => {
        const result = await call('update', { path: 'notes.txt', source: roadmap('New') });
        expect(errorCode(result)).toBe('NL.MCP.INPUT');
        expect(readFileSync(path.join(root, 'notes.txt'), 'utf-8')).toBe('not a roadmap\n');
    });

    it('delete refuses a non-.nowline target and leaves it in place', async () => {
        const result = await call('delete', { path: 'notes.txt' });
        expect(errorCode(result)).toBe('NL.MCP.INPUT');
        expect(existsSync(path.join(root, 'notes.txt'))).toBe(true);
    });

    it('a path input to render and validate must be .nowline', async () => {
        expect(errorCode(await call('render', { path: '.env', preview: false }))).toBe(
            'NL.MCP.INPUT',
        );
        expect(errorCode(await call('validate', { path: 'notes.txt' }))).toBe('NL.MCP.INPUT');
    });

    it('still reads a .nowline file inside the root', async () => {
        const result = await call('read', { path: 'ok.nowline' });
        expect(result.isError).toBeFalsy();
        expect((result.structuredContent as { source: string }).source).toBe(roadmap('Inside'));
    });
});

describe('render and export write only export extensions', () => {
    it('render refuses an output that is not an export extension', async () => {
        const result = await call('render', {
            source: roadmap('Out'),
            output: 'roadmap.txt',
            preview: false,
        });
        expect(errorCode(result)).toBe('NL.MCP.INPUT');
        expect(existsSync(path.join(root, 'roadmap.txt'))).toBe(false);
    });

    it('export refuses an output that is not an export extension', async () => {
        const result = await call('export', {
            source: roadmap('Out'),
            format: 'mermaid',
            output: 'ok.nowline',
        });
        expect(errorCode(result)).toBe('NL.MCP.INPUT');
        expect(readFileSync(path.join(root, 'ok.nowline'), 'utf-8')).toBe(roadmap('Inside'));
    });

    it('render writes an .svg output inside the root', async () => {
        const result = await call('render', {
            source: roadmap('Out'),
            output: 'written.svg',
            preview: false,
        });
        expect(result.isError).toBeFalsy();
        expect(readFileSync(path.join(root, 'written.svg'), 'utf-8')).toContain('<svg');
    });

    it('refuses an output under a directory link that leaves the root', async () => {
        const result = await call('render', {
            source: roadmap('Out'),
            output: 'out-dir/escaped.svg',
            preview: false,
        });
        expect(errorCode(result)).toBe('NL.MCP.OUT_OF_ROOT');
        expect(existsSync(path.join(outside, 'escaped.svg'))).toBe(false);
    });
});

// ---- Symlinks ---------------------------------------------------------------

describe('symlinks are resolved before the root check', () => {
    it('create refuses a path under a directory link that leaves the root', async () => {
        const result = await call('create', {
            path: 'out-dir/planted.nowline',
            source: roadmap('Planted'),
        });
        expect(errorCode(result)).toBe('NL.MCP.OUT_OF_ROOT');
        expect(existsSync(path.join(outside, 'planted.nowline'))).toBe(false);
    });

    it('read refuses a path under a directory link that leaves the root', async () => {
        const result = await call('read', { path: 'out-dir/other.nowline' });
        expect(errorCode(result)).toBe('NL.MCP.OUT_OF_ROOT');
        expect(allText(result)).not.toContain('OUTSIDE-LANE-MARKER');
    });

    it.skipIf(!FILE_SYMLINKS)(
        'read refuses a .nowline link to a file outside the root',
        async () => {
            const result = await call('read', { path: 'link.nowline' });
            expect(errorCode(result)).toBe('NL.MCP.OUT_OF_ROOT');
            expect(allText(result)).not.toContain('SECRET_TOKEN');

            const other = await call('read', { path: 'outside-link.nowline' });
            expect(errorCode(other)).toBe('NL.MCP.OUT_OF_ROOT');
        },
    );

    it.skipIf(!FILE_SYMLINKS)(
        'read refuses a .nowline link to a non-.nowline file inside the root',
        async () => {
            const result = await call('read', { path: 'env-link.nowline' });
            expect(errorCode(result)).toBe('NL.MCP.INPUT');
            expect(allText(result)).not.toContain('SECRET_TOKEN');
        },
    );

    it.skipIf(!FILE_SYMLINKS)(
        'update refuses to write through a link out of the root',
        async () => {
            const result = await call('update', {
                path: 'outside-link.nowline',
                source: roadmap('Overwritten'),
            });
            expect(errorCode(result)).toBe('NL.MCP.OUT_OF_ROOT');
            expect(readFileSync(path.join(outside, 'other.nowline'), 'utf-8')).toBe(
                OUTSIDE_INCLUDED,
            );
        },
    );

    it.skipIf(!FILE_SYMLINKS)(
        'create refuses to write through a dangling link out of the root',
        async () => {
            const result = await call('create', {
                path: 'dangling.nowline',
                source: roadmap('Planted'),
            });
            expect(errorCode(result)).toBe('NL.MCP.OUT_OF_ROOT');
            expect(existsSync(path.join(outside, 'planted.nowline'))).toBe(false);
        },
    );

    it.skipIf(!FILE_SYMLINKS)('render does not embed a logo linked from outside', async () => {
        const source = roadmap('Logo').replace('scale:1w', 'scale:1w logo:"./logo.svg"');
        const result = await call('render', { source, preview: false });
        expect(result.isError).toBeFalsy();
        expect(allText(result)).not.toContain(OUTSIDE_LOGO_FILL);
    });
});

// ---- Includes ---------------------------------------------------------------

describe('includes are confined to the root', () => {
    it('reads a relative include inside the root', async () => {
        const source = roadmap('Includes', `./sub/part.nowline`);
        const result = await call('render', { source, preview: false });
        expect(result.isError).toBeFalsy();
        expect(allText(result)).toContain('INCLUDED-LANE-MARKER');
    });

    it('refuses an absolute include (NL.E0208)', async () => {
        const abs = path.join(outside, 'other.nowline').replace(/\\/g, '/');
        const source = roadmap('Includes', `${abs}`);
        const result = await call('render', { source, preview: false });
        expect(result.isError).toBe(true);
        expect(diagnosticCodes(result)).toContain('NL.E0208');
        expect(allText(result)).not.toContain('OUTSIDE-LANE-MARKER');
    });

    it('refuses an include that leaves the root through .. (NL.E0208)', async () => {
        const source = roadmap('Includes', `../outside/other.nowline`);
        const result = await call('render', { source, preview: false });
        expect(result.isError).toBe(true);
        expect(diagnosticCodes(result)).toContain('NL.E0208');
        expect(allText(result)).not.toContain('OUTSIDE-LANE-MARKER');
    });

    it('refuses an include through a directory link out of the root (NL.E0208)', async () => {
        const source = roadmap('Includes', `./out-dir/other.nowline`);
        const result = await call('validate', { source });
        expect(diagnosticCodes(result)).toContain('NL.E0208');
        expect(allText(result)).not.toContain('OUTSIDE-LANE-MARKER');
    });

    it('confines includes of a file read by path, and of export and convert', async () => {
        writeFileSync(
            path.join(root, 'escape.nowline'),
            roadmap('Escape', `../outside/other.nowline`),
        );
        const exported = await call('export', { path: 'escape.nowline', format: 'mermaid' });
        expect(diagnosticCodes(exported)).toContain('NL.E0208');
        expect(allText(exported)).not.toContain('OUTSIDE-LANE-MARKER');

        const converted = await call('convert', { path: 'escape.nowline', to: 'json' });
        expect(allText(converted)).not.toContain('OUTSIDE-LANE-MARKER');
    });
});

// ---- A root reached through a link ------------------------------------------

describe('a root configured through a directory link', () => {
    // macOS's temp dir is one: /var is a link to /private/var.
    let linkClient: Client;
    let rootLink: string;
    let closeLink: () => Promise<void>;

    beforeAll(async () => {
        rootLink = path.join(base, 'root-link');
        symlinkSync(root, rootLink, 'junction');
        writeFileSync(path.join(root, 'sub', 'broken.nowline'), 'nowline v1\n\nswimlane @@@\n');
        const server = createMcpServer({ allowedRoot: rootLink });
        linkClient = new Client({ name: 'sandbox-link-client', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await linkClient.connect(clientTransport);
        closeLink = async () => {
            await clientTransport.close().catch(() => {});
            await serverTransport.close().catch(() => {});
        };
    });

    afterAll(async () => {
        await closeLink();
    });

    it('names an included file by the configured spelling of the root', async () => {
        const result = await linkClient.callTool({
            name: 'validate',
            arguments: { source: roadmap('Linked', './sub/broken.nowline') },
        });
        const { diagnostics } = result.structuredContent as {
            diagnostics: { code: string; file: string }[];
        };
        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics.map((d) => d.file)).toContain(
            path.join(rootLink, 'sub', 'broken.nowline'),
        );
    });

    it('still refuses an include that leaves the root (NL.E0208)', async () => {
        const result = await linkClient.callTool({
            name: 'validate',
            arguments: { source: roadmap('Linked', './out-dir/other.nowline') },
        });
        expect(diagnosticCodes(result)).toContain('NL.E0208');
        expect(allText(result)).not.toContain('OUTSIDE-LANE-MARKER');
    });
});

// ---- Guard unit -------------------------------------------------------------

describe('guardPath', () => {
    it('resolves a missing path through its deepest existing ancestor', async () => {
        const real = await realPathAllowingMissing(path.join(root, 'out-dir', 'a', 'b.nowline'));
        expect(real).toBe(path.join(await realPathAllowingMissing(outside), 'a', 'b.nowline'));
    });

    it('returns the real root the path lies in', async () => {
        const guarded = await guardPath('sub/new.nowline', staticRoots(root), ['.nowline']);
        expect(guarded.abs).toBe(path.join(root, 'sub', 'new.nowline'));
        expect(guarded.root).toBe(await realPathAllowingMissing(root));
        expect(guarded.displayRoot).toBe(root);
        expect(guarded.real).toBe(path.join(guarded.root, 'sub', 'new.nowline'));
    });
});
