import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { tr } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { packageRoot, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const hasBuild = existsSync(distEntry);
const describeBuilt = hasBuild ? describe : describe.skip;

async function pickPort(): Promise<number> {
    return new Promise((resolve) => {
        const srv = http.createServer();
        srv.listen(0, () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close(() => resolve(port));
        });
    });
}

async function fetchText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.setEncoding('utf-8');
            res.on('data', (chunk: string) => {
                data += chunk;
            });
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/** The first server-sent event on `/events` after `hello`: the current payload. */
async function fetchPayloadEvent(url: string): Promise<{ event: string; data: string }> {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let buf = '';
            res.setEncoding('utf-8');
            res.on('data', (chunk: string) => {
                buf += chunk;
                for (let end = buf.indexOf('\n\n'); end !== -1; end = buf.indexOf('\n\n')) {
                    const lines = buf.slice(0, end).split('\n');
                    buf = buf.slice(end + 2);
                    const event = (lines.find((l) => l.startsWith('event: ')) ?? '').slice(7);
                    if (event === 'hello') continue;
                    req.destroy();
                    resolve({
                        event,
                        data: lines
                            .filter((l) => l.startsWith('data: '))
                            .map((l) => l.slice(6))
                            .join('\n'),
                    });
                    return;
                }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
    });
}

async function waitForReady(port: number, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await fetchText(`http://127.0.0.1:${port}/svg`);
            return;
        } catch {
            await new Promise((r) => setTimeout(r, 100));
        }
    }
    throw new Error(`serve never became ready on port ${port}`);
}

describeBuilt('--serve integration (requires `pnpm build`)', () => {
    it('serves HTML shell and rebuilds on file changes', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'roadmap r1 "One"',
                    '',
                    'swimlane a "A"',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
            );

            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', source, '--port', String(port)],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );

            try {
                await waitForReady(port);
                const html = await fetchText(`http://127.0.0.1:${port}/`);
                expect(html).toContain('<title>nowline serve</title>');
                expect(html).toContain('EventSource');

                const svg = await fetchText(`http://127.0.0.1:${port}/svg`);
                expect(svg).toContain('<svg');
                expect(svg).toContain('data-layer="item"');

                await fs.writeFile(
                    source,
                    [
                        'nowline v1',
                        '',
                        'roadmap r1 "Two"',
                        '',
                        'swimlane a "A"',
                        '  item x duration:1w',
                        '  item y duration:1w',
                        '',
                    ].join('\n'),
                );

                let newSvg = svg;
                const start = Date.now();
                while (Date.now() - start < 3000) {
                    await new Promise((r) => setTimeout(r, 150));
                    newSvg = await fetchText(`http://127.0.0.1:${port}/svg`);
                    if (newSvg !== svg) break;
                }
                expect(newSvg).not.toBe(svg);
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
    }, 15000);

    // Wave-rule include diagnostics (specs/waves.md §6.1) print like
    // validator diagnostics, at the file and line they point into.
    it('reports a wave-rule include error like a validator diagnostic', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'parent.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'include "./child.nowline"',
                    '',
                    'roadmap r "R"',
                    'wave w1',
                    'wave w2',
                    'swimlane a "A"',
                    '  item x duration:1w wave:w1',
                    '',
                ].join('\n'),
            );
            await fs.writeFile(
                path.join(dir, 'child.nowline'),
                'swimlane c "C"\n  item y duration:1w\n',
            );

            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', source, '--port', String(port)],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            let stderr = '';
            child.stderr?.on('data', (d: Buffer) => {
                stderr += d.toString('utf-8');
            });

            try {
                await waitForReady(port);
                const expected = `${source}:3:1 error: ${tr('en-US', 'NL.E0202', {
                    reason: 'child-none',
                    path: './child.nowline',
                    parent: ['w1', 'w2'],
                })}`;
                const start = Date.now();
                while (!stderr.includes(expected) && Date.now() - start < 3000) {
                    await new Promise((r) => setTimeout(r, 50));
                }
                expect(stderr).toContain(expected);
                const svg = await fetchText(`http://127.0.0.1:${port}/svg`);
                expect(svg).not.toContain('data-layer="item"');
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
    }, 15000);

    // REGRESSION: an uncoded include error keeps its pre-waves form: one
    // `${sourcePath}: ${message}` line sent to browsers, nothing on stderr.
    it('broadcasts a missing include as before, without stderr', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'parent.nowline');
            await fs.writeFile(
                source,
                'include "./missing.nowline"\nroadmap r "R"\nswimlane a "A"\n  item x duration:1w\n',
            );

            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', source, '--port', String(port)],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            let stderr = '';
            child.stderr?.on('data', (d: Buffer) => {
                stderr += d.toString('utf-8');
            });

            try {
                await waitForReady(port);
                const first = await fetchPayloadEvent(`http://127.0.0.1:${port}/events`);
                expect(first).toEqual({
                    event: 'error',
                    data:
                        `${source}: Could not read include "./missing.nowline": ` +
                        `ENOENT: no such file or directory, open '${path.join(dir, 'missing.nowline')}'`,
                });
                expect(stderr).not.toContain('error:');
                expect(stderr).not.toContain('missing.nowline');
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
    }, 15000);

    // REGRESSION: an uncoded include error takes precedence over wave-rule
    // diagnostics (specs/waves.md §6.1). With both present, the broadcast
    // is the legacy one-line payload alone and nothing goes to stderr.
    it('reports only the missing include when wave-rule errors also occur', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'parent.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'include "./child.nowline"',
                    'include "./missing.nowline"',
                    '',
                    'roadmap r "R"',
                    'wave w1',
                    'wave w2',
                    'swimlane a "A"',
                    '  item x duration:1w wave:w1',
                    '',
                ].join('\n'),
            );
            await fs.writeFile(
                path.join(dir, 'child.nowline'),
                'swimlane c "C"\n  item y duration:1w\n',
            );

            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', source, '--port', String(port)],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            let stderr = '';
            child.stderr?.on('data', (d: Buffer) => {
                stderr += d.toString('utf-8');
            });

            try {
                await waitForReady(port);
                const first = await fetchPayloadEvent(`http://127.0.0.1:${port}/events`);
                expect(first).toEqual({
                    event: 'error',
                    data:
                        `${source}: Could not read include "./missing.nowline": ` +
                        `ENOENT: no such file or directory, open '${path.join(dir, 'missing.nowline')}'`,
                });
                expect(stderr).not.toContain('error');
                expect(stderr).not.toContain('NL.E0202');
                expect(stderr).not.toContain('child.nowline');
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
    }, 15000);

    it('--theme grayscale serves the grayscale palette on light chrome', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            await fs.writeFile(
                source,
                'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w\n',
            );
            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', source, '--port', String(port), '--theme', 'grayscale'],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            try {
                await waitForReady(port);
                const html = await fetchText(`http://127.0.0.1:${port}/`);
                expect(html).toContain('background: #ffffff');
                const svg = await fetchText(`http://127.0.0.1:${port}/svg`);
                expect(svg).toContain('data-layer="item"');
                expect(svg).toContain('data-theme="grayscale"');
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
    }, 15000);

    it('.nowlinerc theme applies to served SVG when -t is absent', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'sample.nowline');
            await fs.writeFile(
                source,
                'nowline v1\n\nroadmap r "R"\n\nswimlane a "A"\n  item x duration:1w\n',
            );
            await fs.writeFile(path.join(dir, '.nowlinerc'), 'theme: dark\n');
            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', source, '--port', String(port)],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            try {
                await waitForReady(port);
                const svg = await fetchText(`http://127.0.0.1:${port}/svg`);
                expect(svg).toContain('data-theme="dark"');
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
    }, 15000);

    it('--theme with an unknown name is an input error', async () => {
        const { runCliBuilt } = await import('../helpers.js');
        const r = await runCliBuilt(['--serve', 'foo.nowline', '--theme', 'sepia']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid --theme "sepia". Expected light, dark, or grayscale.');
    });

    it('--serve -o - is a usage error', async () => {
        const { runCliBuilt } = await import('../helpers.js');
        const r = await runCliBuilt(['--serve', 'foo.nowline', '-o', '-']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/stdout|-o -/i);
    });
});

// `--serve` takes the same --non-working option as render (m2p phase 4).
describeBuilt('--serve --non-working (requires `pnpm build`)', () => {
    const BODY = [
        'roadmap r "R" start:2026-01-05 scale:1w calendar:business',
        '',
        'swimlane a "A"',
        '  item w1 "W1" duration:1w',
        '  item w2 "W2" duration:1w',
        '',
    ].join('\n');
    const PLAIN = `nowline v1\n\n${BODY}`;
    const FILE_SHOW = `nowline v1\n\nconfig\n\ndefault roadmap non-working:show\n\n${BODY}`;
    const LAYER = 'data-layer="non-working"';

    async function servedSvg(source: string, extraArgs: string[]): Promise<string> {
        let svg = '';
        await withTempDir(async (dir) => {
            const file = path.join(dir, 'sample.nowline');
            await fs.writeFile(file, source);
            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [distEntry, '--serve', file, '--port', String(port), '--now', '-', ...extraArgs],
                {
                    cwd: packageRoot,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            try {
                await waitForReady(port);
                svg = await fetchText(`http://127.0.0.1:${port}/svg`);
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
        return svg;
    }

    it('--non-working show adds the non-working layer', async () => {
        expect(await servedSvg(PLAIN, ['--non-working', 'show'])).toContain(LAYER);
    }, 15000);

    it('a file key show with no flag has the layer', async () => {
        expect(await servedSvg(FILE_SHOW, [])).toContain(LAYER);
    }, 15000);

    it('a file key show with --non-working hide has no layer', async () => {
        const svg = await servedSvg(FILE_SHOW, ['--non-working', 'hide']);
        expect(svg).toContain('data-layer="item"');
        expect(svg).not.toContain(LAYER);
    }, 15000);
});

// Under -q a failed rebuild prints only errors on stderr, while the browser
// still gets the full report, warnings included (lolay/nowline#135).
describeBuilt('--serve -q (requires `pnpm build`)', () => {
    // `sizee:` is an unknown property (a warning); `item y` lacks size and
    // duration (an error).
    const MIXED = [
        'nowline v1',
        '',
        'roadmap r "R"',
        '',
        'swimlane a "A"',
        '  item x duration:1w sizee:l',
        '  item y',
        '',
    ].join('\n');

    async function withServe(
        source: string,
        extraArgs: string[],
        check: (port: number, stderr: () => string) => Promise<void>,
    ): Promise<void> {
        const port = await pickPort();
        const child: ChildProcess = spawn(
            process.execPath,
            [distEntry, '--serve', source, '--port', String(port), ...extraArgs],
            {
                cwd: packageRoot,
                env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        let stderr = '';
        child.stderr?.on('data', (d: Buffer) => {
            stderr += d.toString('utf-8');
        });
        try {
            await waitForReady(port);
            await check(port, () => stderr);
        } finally {
            child.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 150));
            child.kill('SIGKILL');
        }
    }

    // Warnings print before errors, so once the error line is in, any
    // warning from the same rebuild has arrived too.
    async function waitForStderr(stderr: () => string, needle: string): Promise<void> {
        const start = Date.now();
        while (!stderr().includes(needle) && Date.now() - start < 3000) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }

    it('prints warnings and errors on stderr without -q', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'in.nowline');
            await fs.writeFile(source, MIXED);
            await withServe(source, [], async (_port, stderr) => {
                const errorLine = `${source}:7:3 error:`;
                await waitForStderr(stderr, errorLine);
                expect(stderr()).toContain(errorLine);
                expect(stderr()).toContain('warning:');
                expect(stderr()).toContain('Unknown property');
            });
        });
    }, 15000);

    it('-q keeps validator warnings off stderr but sends them to the browser', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'in.nowline');
            await fs.writeFile(source, MIXED);
            await withServe(source, ['-q'], async (port, stderr) => {
                const errorLine = `${source}:7:3 error:`;
                await waitForStderr(stderr, errorLine);
                expect(stderr()).toContain(errorLine);
                expect(stderr()).not.toContain('warning:');
                expect(stderr()).not.toContain('Unknown property');

                const payload = await fetchPayloadEvent(`http://127.0.0.1:${port}/events`);
                expect(payload.event).toBe('error');
                expect(payload.data).toContain(errorLine);
                expect(payload.data).toContain('Unknown property');
            });
        });
    }, 15000);

    it('-q keeps parent warnings off stderr on a wave-rule include error', async () => {
        await withTempDir(async (dir) => {
            const source = path.join(dir, 'parent.nowline');
            await fs.writeFile(
                source,
                [
                    'nowline v1',
                    '',
                    'include "./child.nowline"',
                    '',
                    'roadmap r "R"',
                    'wave w1',
                    'wave w2',
                    'swimlane a "A"',
                    '  item x duration:1w wave:w1 sizee:l',
                    '',
                ].join('\n'),
            );
            await fs.writeFile(
                path.join(dir, 'child.nowline'),
                'swimlane c "C"\n  item y duration:1w\n',
            );
            await withServe(source, ['-q'], async (port, stderr) => {
                const expected = `${source}:3:1 error: ${tr('en-US', 'NL.E0202', {
                    reason: 'child-none',
                    path: './child.nowline',
                    parent: ['w1', 'w2'],
                })}`;
                await waitForStderr(stderr, expected);
                expect(stderr()).toContain(expected);
                expect(stderr()).not.toContain('warning:');
                expect(stderr()).not.toContain('Unknown property');

                const payload = await fetchPayloadEvent(`http://127.0.0.1:${port}/events`);
                expect(payload.event).toBe('error');
                expect(payload.data).toContain(expected);
                expect(payload.data).toContain('Unknown property');
            });
        });
    }, 15000);
});

// `--serve` resolves its options as render does and renders what render renders
// (specs/surface-options.md §3.2, m2.s7): the same flags give the same SVG.
describeBuilt('--serve shares render options (requires `pnpm build`)', () => {
    const LOGO =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40">' +
        '<rect width="120" height="40" fill="#369"/></svg>';
    const roadmap = (header: string): string =>
        [
            'nowline v1',
            '',
            `roadmap r "R" ${header}start:2026-01-05 scale:1w`,
            '',
            'swimlane a "A"',
            '  item x "X" duration:12w link:https://example.com/x',
            '  item y "Y" duration:12w link:https://example.com/y',
            '',
        ].join('\n');
    const PLAIN = roadmap('');
    const WITH_LOGO = roadmap('logo:"./logo.svg" ');
    const FIXED = ['--now', '2026-01-07'];

    interface Served {
        svg: string;
        /** The first payload event the browser gets: `update` for a render, `error` otherwise. */
        first: { event: string; data: string };
    }

    /** Serve `files` (the first is the roadmap) with `flags`, then fetch what a browser would. */
    async function serve(files: Record<string, string>, flags: string[]): Promise<Served> {
        let served: Served | undefined;
        await withTempDir(async (dir) => {
            for (const [name, text] of Object.entries(files)) {
                await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
                await fs.writeFile(path.join(dir, name), text);
            }
            const port = await pickPort();
            const child: ChildProcess = spawn(
                process.execPath,
                [
                    distEntry,
                    '--serve',
                    path.join(dir, 'main.nowline'),
                    '--port',
                    String(port),
                    ...flags,
                ],
                {
                    cwd: dir,
                    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
            try {
                await waitForReady(port);
                served = {
                    svg: await fetchText(`http://127.0.0.1:${port}/svg`),
                    first: await fetchPayloadEvent(`http://127.0.0.1:${port}/events`),
                };
            } finally {
                child.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 150));
                child.kill('SIGKILL');
            }
        });
        if (!served) throw new Error('serve produced nothing');
        return served;
    }

    /** What `nowline <file> -o -` writes for the same files and flags. */
    async function rendered(files: Record<string, string>, flags: string[]): Promise<string> {
        const { runCliBuilt } = await import('../helpers.js');
        let svg = '';
        await withTempDir(async (dir) => {
            for (const [name, text] of Object.entries(files)) {
                await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
                await fs.writeFile(path.join(dir, name), text);
            }
            const r = await runCliBuilt([path.join(dir, 'main.nowline'), '-o', '-', ...flags], {
                cwd: dir,
            });
            expect(r.exitCode).toBe(0);
            // The CLI ends the file with a newline; the server sends the SVG as is.
            svg = r.stdout.replace(/\n$/, '');
        });
        return svg;
    }

    const files = (extra: Record<string, string> = {}) => ({ 'main.nowline': PLAIN, ...extra });

    it('serves the SVG nowline <file> renders for the same flags', async () => {
        const flags = [...FIXED, '--theme', 'dark', '--width', '640', '--no-links'];
        const served = await serve(files(), flags);
        expect(served.svg).toBe(await rendered(files(), flags));
    }, 30000);

    it('--width caps the canvas as it does for render', async () => {
        const wide = await serve(files(), FIXED);
        const narrow = await serve(files(), [...FIXED, '--width', '420']);
        expect(narrow.svg).not.toBe(wide.svg);
        expect(narrow.svg).toBe(await rendered(files(), [...FIXED, '--width', '420']));
    }, 30000);

    it('an rc width applies, and --width overrides it', async () => {
        const rc = { '.nowlinerc': 'width: 420\n' };
        const viaRc = await serve(files(rc), FIXED);
        expect(viaRc.svg).toBe(await rendered(files(), [...FIXED, '--width', '420']));
        const flagged = await serve(files(rc), [...FIXED, '--width', '900']);
        expect(flagged.svg).toBe(await rendered(files(), [...FIXED, '--width', '900']));
    }, 30000);

    it('--no-links drops the link anchors', async () => {
        const linked = await serve(files(), FIXED);
        const plain = await serve(files(), [...FIXED, '--no-links']);
        // The attribution is always a link; the item links are what the flag drops.
        expect(linked.svg).toContain('href="https://example.com/x"');
        expect(plain.svg).not.toContain('href="https://example.com/');
        expect(plain.svg).toBe(await rendered(files(), [...FIXED, '--no-links']));
    }, 30000);

    it('--strict turns a missing logo into an error instead of a render', async () => {
        const missing = { 'main.nowline': WITH_LOGO };
        const lax = await serve(missing, FIXED);
        expect(lax.first.event).toBe('update');
        const strict = await serve(missing, [...FIXED, '--strict']);
        expect(strict.first.event).toBe('error');
        expect(strict.first.data).toContain('render warnings (--strict)');
        expect(strict.first.data).toContain('logo.svg');
    }, 30000);

    it('an rc assetRoot is where the logo is read from', async () => {
        const project = {
            'main.nowline': WITH_LOGO,
            'brand/logo.svg': LOGO,
            '.nowlinerc': 'assetRoot: brand\n',
        };
        const served = await serve(project, FIXED);
        expect(served.svg).toContain('data-layer="logo"');
        expect(served.svg).toBe(await rendered(project, FIXED));
        const flagged = await serve({ ...project, 'other/logo.svg': LOGO }, [
            ...FIXED,
            '--asset-root',
            'other',
            '--strict',
        ]);
        expect(flagged.first.event).toBe('update');
    }, 30000);

    it('rejects an invalid --width as render does', async () => {
        const { runCliBuilt } = await import('../helpers.js');
        const r = await runCliBuilt(['--serve', 'foo.nowline', '--width', '100']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain('invalid --width "100". Must be an integer ≥ 320.');
    });
});
