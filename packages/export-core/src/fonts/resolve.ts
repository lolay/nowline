// Bundled-first font resolver shared by PDF and PNG.
//
// Spec: specs/handoffs/m2c.md § 10 "Font strategy — bundled first, system
// fonts opt-in".
//
// The resolver defaults to the bundled static DejaVu pair on every OS so that
// preview and raster export look identical everywhere and we never hand
// `@resvg/resvg-wasm` a variable font (which it cannot rasterize — see
// `sfns.ts`). System fonts are an explicit opt-in.
//
// Resolution order (run independently for sans / mono — first hit wins):
//   1. Explicit flag    — `--font-sans <path|alias>` / `--font-mono <path|alias>`
//   2. Environment      — NOWLINE_FONT_SANS / NOWLINE_FONT_MONO
//   3. Headless / default — `--headless`, NOWLINE_HEADLESS=1, auto in CI
//                          without a TTY, OR the plain default (no
//                          `useSystemFonts`): bundled DejaVu pair, no probe.
//   4. Platform probe   — opt-in via `useSystemFonts`; first existing STATIC
//                          entry from `probe-list.ts` (variable fonts skipped).
//   5. Bundled fallback — DejaVuSans.ttf / DejaVuSansMono.ttf (after an
//                          opted-in probe found nothing usable).
//
// Variable-font guard: an explicitly requested font (flag/env/alias) that
// turns out to be a variable font is substituted with the bundled DejaVu and
// flagged (`*VariableFontSubstituted`), because raster export cannot render a
// VF and there is no runtime instancer. On the opt-in probe path, variable
// candidates are skipped in favor of the next static system font.

import { existsSync as defaultExistsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { FontRole, FontSource, ResolvedFont } from '../types.js';
import {
    BUNDLED_MONO_FAMILY,
    BUNDLED_SANS_FAMILY,
    loadBundledMono,
    loadBundledSans,
} from './bundled.js';
import { aliasCandidate, isAlias, type PlatformProbe, probeListFor } from './probe-list.js';
import { isVariableFontBytes } from './sfns.js';

export interface ResolveOptions {
    /** Path or alias for the sans role. Wins over env / probe / bundled. */
    fontSans?: string;
    /** Path or alias for the mono role. */
    fontMono?: string;
    /**
     * Opt in to the platform font probe (step 4). Off by default: the
     * resolver is bundled-first, so the default (no flag/env) is the bundled
     * DejaVu pair on every OS. With this set the probe runs and the first
     * STATIC system font wins (variable fonts are skipped), bundled if none.
     */
    useSystemFonts?: boolean;
    /**
     * Skip the probe; go straight to the bundled DejaVu pair. Implied by
     * `NOWLINE_HEADLESS=1` and by `CI=true` without a TTY (unless
     * `disableAutoHeadless` is set). Largely redundant now that bundled is the
     * default, but retained so an explicit `--headless` still forces bundled
     * even alongside `useSystemFonts`.
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
     * True when a role landed on bundled DejaVu *after an opted-in probe found
     * nothing usable* (`useSystemFonts` set, no static system font present).
     * The bundled-first default is the intended path, not a fallback, so it
     * does NOT set this. Callers (CLI) emit a `--strict` warning on this.
     */
    sansFellBackToBundled: boolean;
    monoFellBackToBundled: boolean;
    /**
     * True when an explicitly requested font (flag / env / alias) was a
     * variable font and was replaced by the bundled DejaVu (raster cannot
     * render a VF). Callers warn; the CLI errors under `--strict`.
     */
    sansVariableFontSubstituted: boolean;
    monoVariableFontSubstituted: boolean;
}

export async function resolveFonts(options: ResolveOptions = {}): Promise<ResolveResult> {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const fileExists = options.fileExists ?? defaultExistsSync;
    const readFileBytes = options.readFileBytes ?? defaultReadFileBytes;
    const probe = probeListFor(platform, env);

    const headlessRequested = isHeadlessRequested(options, env);
    const useSystemFonts = options.useSystemFonts ?? false;
    const sans = await resolveRole({
        role: 'sans',
        flag: options.fontSans,
        envValue: env.NOWLINE_FONT_SANS,
        headless: headlessRequested,
        useSystemFonts,
        probe,
        fileExists,
        readFileBytes,
    });
    const mono = await resolveRole({
        role: 'mono',
        flag: options.fontMono,
        envValue: env.NOWLINE_FONT_MONO,
        headless: headlessRequested,
        useSystemFonts,
        probe,
        fileExists,
        readFileBytes,
    });
    return {
        sans: sans.font,
        mono: mono.font,
        sansFellBackToBundled: sans.fellBack,
        monoFellBackToBundled: mono.fellBack,
        sansVariableFontSubstituted: sans.variableSubstituted,
        monoVariableFontSubstituted: mono.variableSubstituted,
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
    useSystemFonts: boolean;
    probe: PlatformProbe;
    fileExists: (p: string) => boolean;
    readFileBytes: (p: string) => Promise<Uint8Array>;
}

interface RoleResolution {
    font: ResolvedFont;
    /** Bundled because an opted-in probe found no usable system font. */
    fellBack: boolean;
    /** An explicit VF request was replaced by the bundled DejaVu. */
    variableSubstituted: boolean;
}

async function resolveRole(args: RoleArgs): Promise<RoleResolution> {
    // Step 1 — flag (path or alias)
    if (args.flag) {
        return guardExplicit(await loadFlag(args.flag, args.role, 'flag', args), args);
    }
    // Step 2 — environment
    if (args.envValue) {
        return guardExplicit(await loadFlag(args.envValue, args.role, 'env', args), args);
    }
    // Step 3 — explicit headless: skip probe, go to bundled.
    if (args.headless) {
        const font = await loadBundled(args.role, 'headless');
        return { font, fellBack: false, variableSubstituted: false };
    }
    // Step 3 (default) — bundled-first: with no explicit system opt-in the
    // default is the bundled DejaVu pair on every OS. This is the intended
    // path (not a fallback), so it does not set `fellBack`.
    if (!args.useSystemFonts) {
        const font = await loadBundled(args.role, 'bundled');
        return { font, fellBack: false, variableSubstituted: false };
    }
    // Step 4 — platform probe (opt-in). Skip variable candidates so we land on
    // the next STATIC system font (resvg/raster cannot render a VF).
    for (const candidate of args.probe[args.role]) {
        if (!args.fileExists(candidate.path)) continue;
        const bytes = await args.readFileBytes(candidate.path);
        if (isVariableFontBytes(bytes)) continue;
        return {
            font: decorate(bytes, {
                name: candidate.name,
                source: 'probe',
                path: candidate.path,
                face: candidate.face,
            }),
            fellBack: false,
            variableSubstituted: false,
        };
    }
    // Step 5 — bundled fallback after an opted-in probe found nothing usable.
    const font = await loadBundled(args.role, 'bundled');
    return { font, fellBack: true, variableSubstituted: false };
}

/**
 * Guard an explicitly resolved font (flag / env / alias). A variable font
 * cannot be rasterized and we have no runtime instancer, so substitute the
 * bundled DejaVu and flag it; the caller decides whether to warn or error.
 */
async function guardExplicit(font: ResolvedFont, args: RoleArgs): Promise<RoleResolution> {
    if (font.isVariableFont) {
        const bundled = await loadBundled(args.role, 'bundled');
        return { font: bundled, fellBack: false, variableSubstituted: true };
    }
    return { font, fellBack: false, variableSubstituted: false };
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
        name: role === 'sans' ? BUNDLED_SANS_FAMILY : BUNDLED_MONO_FAMILY,
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
