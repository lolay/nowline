// Cross-surface determinism gate — compiled-CLI-binary surface (surface (a)).
//
// Spawns the standalone `bun compile` binary (the artifact users actually run)
// and hashes its output for a (fixture, format), using the same canonical
// inputs as the kernel-in-Node leg. The binary is built by `make compile
// TARGET=local`; when it is absent (a normal PR cell that didn't compile), the
// caller skips this leg — the dedicated `determinism` CI job always compiles
// first so the leg is never skipped there.

import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExportFormat } from '@nowline/export';
import { fixtureSourcePath, REPO_ROOT, sha256, stripVolatilePath } from './node-surface.js';
import { GATE_LOCALE, GATE_PNG_SCALE, GATE_TODAY, type GateFixture } from './spec.js';

const DIST_BIN = path.join(REPO_ROOT, 'packages', 'cli', 'dist-bin');

const EXT: Record<ExportFormat, string> = {
    svg: 'svg',
    json: 'json',
    html: 'html',
    mermaid: 'mmd',
    msproj: 'xml',
    xlsx: 'xlsx',
    png: 'png',
    pdf: 'pdf',
};

/** Map host platform/arch to the compiled-binary suffix from compile.mjs. */
function localBinarySuffix(): string | undefined {
    const key = `${process.platform}/${process.arch}`;
    const map: Record<string, string> = {
        'darwin/arm64': 'macos-arm64',
        'darwin/x64': 'macos-x64',
        'linux/x64': 'linux-x64',
        'linux/arm64': 'linux-arm64',
        'win32/x64': 'windows-x64.exe',
        'win32/arm64': 'windows-arm64.exe',
    };
    return map[key];
}

/** Absolute path to the local compiled binary, or undefined if not present. */
export function cliBinaryPath(): string | undefined {
    const suffix = localBinarySuffix();
    if (!suffix) return undefined;
    const p = path.join(DIST_BIN, `nowline-${suffix}`);
    return existsSync(p) ? p : undefined;
}

function cliArgs(fixture: GateFixture, format: ExportFormat, outPath: string): string[] {
    const args = [
        '-f',
        format,
        fixtureSourcePath(fixture),
        '-o',
        outPath,
        '--now',
        GATE_TODAY,
        '--locale',
        GATE_LOCALE,
        '--theme',
        fixture.theme,
        // Force bundled DejaVu (never probe system fonts) so the binary's
        // raster/embed bytes match the kernel's canonical font pair.
        '--headless',
    ];
    if (format === 'png') args.push('--scale', String(GATE_PNG_SCALE));
    return args;
}

function run(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'ignore', 'pipe'],
            // Belt-and-suspenders: ensure the binary also auto-headlesses if a
            // future flag rename slips, and never reads an ambient locale.
            env: { ...process.env, NOWLINE_HEADLESS: '1', LANG: 'C', LC_ALL: 'C' },
        });
        let stderr = '';
        child.stderr.on('data', (d: Buffer) => {
            stderr += d.toString('utf-8');
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`nowline exited ${code}: ${stderr.trim()}`));
        });
    });
}

export async function hashCli(
    bin: string,
    fixture: GateFixture,
    format: ExportFormat,
): Promise<string> {
    const outPath = path.join(
        os.tmpdir(),
        `nowline-det-${fixture.id}-${format}-${process.pid}-${Math.random().toString(36).slice(2)}.${EXT[format]}`,
    );
    try {
        await run(bin, cliArgs(fixture, format, outPath));
        const bytes = await fs.readFile(outPath);
        const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return sha256(stripVolatilePath(view, fixtureSourcePath(fixture)));
    } finally {
        await fs.rm(outPath, { force: true });
    }
}
