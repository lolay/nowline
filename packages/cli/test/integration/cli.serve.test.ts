import { describe, it, expect } from 'vitest';
import { existsSync, promises as fs } from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
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

    it('--serve -o - is a usage error', async () => {
        const { runCliBuilt } = await import('../helpers.js');
        const r = await runCliBuilt(['--serve', 'foo.nowline', '-o', '-']);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toMatch(/stdout|-o -/i);
    });
});
