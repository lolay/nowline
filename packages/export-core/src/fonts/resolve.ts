// 5-step font resolver shared by PDF and PNG.
//
// Spec: specs/handoffs/m2c.md § 10 "Font strategy — system first, one
// bundled headless fallback".
//
// Resolution order (run independently for sans / mono — first hit wins):
//   1. Explicit flag    — `--font-sans <path|alias>` / `--font-mono <path|alias>`
//   2. Environment      — NOWLINE_FONT_SANS / NOWLINE_FONT_MONO
//   3. Headless override — `--headless`, NOWLINE_HEADLESS=1, or auto in CI
//                          without a TTY
//   4. Platform probe   — first existing entry from `probe-list.ts`
//   5. Bundled fallback — DejaVuSans.ttf / DejaVuSansMono.ttf

import { existsSync as defaultExistsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { FontRole, FontSource, ResolvedFont } from '../types.js';
import { loadBundledMono, loadBundledSans } from './bundled.js';
import { aliasCandidate, isAlias, type PlatformProbe, probeListFor } from './probe-list.js';
import { isVariableFontBytes } from './sfns.js';

export interface ResolveOptions {
    /** Path or alias for the sans role. Wins over env / probe / bundled. */
    fontSans?: string;
    /** Path or alias for the mono role. */
    fontMono?: string;
    /**
     * Skip steps 4–5; go straight to step 5 (bundled DejaVu pair). Implied by
     * `NOWLINE_HEADLESS=1` and by `CI=true` without a TTY (unless
     * `disableAutoHeadless` is set).
     */
    headless?: boolean;
    /** Disable the CI-no-TTY auto-headless heuristic. Defaults to false. */
    disableAutoHeadless?: boolean;
    // Test seams — defaults wire to real `node:fs` / `node:process`.
    platform?: NodeJS.Platform;
    fileExists?: (p: string) => boolean;
    readFileBytes?: (p: string) => Promise<Uint8Array>;
    env?: NodeJS.ProcessEnv;
    isStdoutTty?: boolean;
}

export interface ResolveResult {
    sans: ResolvedFont;
    mono: ResolvedFont;
    /**
     * True when EITHER role landed at step 5 without explicit `--headless`.
     * Callers (CLI) emit a `--strict` warning on this.
     */
    sansFellBackToBundled: boolean;
    monoFellBackToBundled: boolean;
}

export async function resolveFonts(options: ResolveOptions = {}): Promise<ResolveResult> {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const fileExists = options.fileExists ?? defaultExistsSync;
    const readFileBytes = options.readFileBytes ?? defaultReadFileBytes;
    const probe = probeListFor(platform, env);

    const headlessRequested = isHeadlessRequested(options, env);
    const sans = await resolveRole({
        role: 'sans',
        flag: options.fontSans,
        envValue: env.NOWLINE_FONT_SANS,
        headless: headlessRequested,
        probe,
        fileExists,
        readFileBytes,
    });
    const mono = await resolveRole({
        role: 'mono',
        flag: options.fontMono,
        envValue: env.NOWLINE_FONT_MONO,
        headless: headlessRequested,
        probe,
        fileExists,
        readFileBytes,
    });
    return {
        sans,
        mono,
        sansFellBackToBundled: sans.source === 'bundled' && !headlessRequested,
        monoFellBackToBundled: mono.source === 'bundled' && !headlessRequested,
    };
}

function isHeadlessRequested(options: ResolveOptions, env: NodeJS.ProcessEnv): boolean {
    if (options.headless) return true;
    if (env.NOWLINE_HEADLESS === '1' || env.NOWLINE_HEADLESS === 'true') return true;
    if (options.disableAutoHeadless) return false;
    const inCI = env.CI === 'true' || env.CI === '1';
    const stdoutIsTty = options.isStdoutTty ?? Boolean(process.stdout.isTTY);
    return inCI && !stdoutIsTty;
}

interface RoleArgs {
    role: FontRole;
    flag?: string;
    envValue?: string;
    headless: boolean;
    probe: PlatformProbe;
    fileExists: (p: string) => boolean;
    readFileBytes: (p: string) => Promise<Uint8Array>;
}

async function resolveRole(args: RoleArgs): Promise<ResolvedFont> {
    // Step 1 — flag (path or alias)
    if (args.flag) {
        return loadFlag(args.flag, args.role, 'flag', args);
    }
    // Step 2 — environment
    if (args.envValue) {
        return loadFlag(args.envValue, args.role, 'env', args);
    }
    // Step 3 — headless: skip probe, go to bundled
    if (args.headless) {
        return loadBundled(args.role, 'headless');
    }
    // Step 4 — platform probe
    for (const candidate of args.probe[args.role]) {
        if (args.fileExists(candidate.path)) {
            const bytes = await args.readFileBytes(candidate.path);
            return decorate(bytes, {
                name: candidate.name,
                source: 'probe',
                path: candidate.path,
                face: candidate.face,
            });
        }
    }
    // Step 5 — bundled fallback
    return loadBundled(args.role, 'bundled');
}

async function loadFlag(
    raw: string,
    role: FontRole,
    source: 'flag' | 'env',
    args: RoleArgs,
): Promise<ResolvedFont> {
    if (
        path.isAbsolute(raw) ||
        raw.startsWith('.') ||
        raw.includes(path.sep) ||
        raw.endsWith('.ttf') ||
        raw.endsWith('.otf') ||
        raw.endsWith('.ttc')
    ) {
        const abs = path.resolve(raw);
        if (!args.fileExists(abs)) {
            throw new FontResolveError(`font path does not exist: ${raw} (resolved to ${abs})`);
        }
        const bytes = await args.readFileBytes(abs);
        return decorate(bytes, {
            name: deriveDisplayName(abs),
            source,
            path: abs,
        });
    }

    if (isAlias(raw)) {
        const candidate = aliasCandidate(raw, role, args.probe);
        if (!candidate) {
            throw new FontResolveError(`alias "${raw}" has no ${role} mapping on this platform`);
        }
        if (!args.fileExists(candidate.path)) {
            // Alias is known but the underlying file is missing — fall through
            // to bundled with the original source preserved is wrong; surface
            // the missing-file error so the user knows their alias didn't land.
            throw new FontResolveError(
                `alias "${raw}" maps to ${candidate.path} which does not exist on this system`,
            );
        }
        const bytes = await args.readFileBytes(candidate.path);
        return decorate(bytes, {
            name: candidate.name,
            source,
            path: candidate.path,
            face: candidate.face,
        });
    }

    throw new FontResolveError(`font value "${raw}" is neither a path nor a known alias`);
}

async function loadBundled(role: FontRole, source: FontSource): Promise<ResolvedFont> {
    const bytes = role === 'sans' ? await loadBundledSans() : await loadBundledMono();
    return decorate(bytes, {
        name: role === 'sans' ? 'DejaVu Sans' : 'DejaVu Sans Mono',
        source,
    });
}

interface DecorateMeta {
    name: string;
    source: FontSource;
    path?: string;
    face?: string;
}

function decorate(bytes: Uint8Array, meta: DecorateMeta): ResolvedFont {
    return {
        name: meta.name,
        bytes,
        source: meta.source,
        path: meta.path,
        face: meta.face,
        isVariableFont: isVariableFontBytes(bytes),
    };
}

function deriveDisplayName(absPath: string): string {
    const base = path.basename(absPath, path.extname(absPath));
    return base.replace(/-Regular$/, '').replace(/[_-]/g, ' ');
}

async function defaultReadFileBytes(p: string): Promise<Uint8Array> {
    const buf = await fs.readFile(p);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export class FontResolveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FontResolveError';
    }
}
