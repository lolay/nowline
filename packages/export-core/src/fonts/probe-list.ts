// Per-platform candidate-font tables walked by `resolveFonts()`.
//
// Spec: specs/handoffs/m2c.md § 10 "Platform probe list".
//
// `path` segments use forward slashes; the resolver normalizes via
// `path.normalize()` at lookup time so Windows paths work correctly.
// `face` is set for `.ttc` collections — the resolver loads the TTC and
// hands the face PostScript name to PDFKit / resvg via `ResolvedFont.face`.

// Use platform-specific path joiners so Windows paths render with backslashes
// even when the resolver runs on a non-Windows host (e.g. test mocks on macOS
// CI exercising the win32 probe list).
import * as path from 'node:path';

export interface FontCandidate {
    path: string;
    face?: string;
    /** Friendly family name surfaced in `ResolvedFont.name`. */
    name: string;
}

export interface PlatformProbe {
    sans: readonly FontCandidate[];
    mono: readonly FontCandidate[];
}

const MACOS: PlatformProbe = {
    sans: [
        { path: '/System/Library/Fonts/SFNS.ttf', name: 'SF Pro' },
        { path: '/System/Library/Fonts/Helvetica.ttc', face: 'Helvetica', name: 'Helvetica' },
        { path: '/System/Library/Fonts/Supplemental/Arial.ttf', name: 'Arial' },
    ],
    mono: [
        { path: '/System/Library/Fonts/SFNSMono.ttf', name: 'SF Mono' },
        { path: '/System/Library/Fonts/Menlo.ttc', face: 'Menlo-Regular', name: 'Menlo' },
        { path: '/System/Library/Fonts/Monaco.ttf', name: 'Monaco' },
    ],
};

function windowsCandidate(
    fontsDir: string,
    file: string,
    name: string,
): FontCandidate {
    return { path: path.win32.join(fontsDir, file), name };
}

function windowsProbe(fontsDir: string): PlatformProbe {
    return {
        sans: [
            windowsCandidate(fontsDir, 'segoeui.ttf', 'Segoe UI'),
            windowsCandidate(fontsDir, 'arial.ttf', 'Arial'),
            windowsCandidate(fontsDir, 'tahoma.ttf', 'Tahoma'),
            windowsCandidate(fontsDir, 'verdana.ttf', 'Verdana'),
        ],
        mono: [
            windowsCandidate(fontsDir, 'consola.ttf', 'Consolas'),
            windowsCandidate(fontsDir, 'cour.ttf', 'Courier New'),
        ],
    };
}

const LINUX: PlatformProbe = {
    sans: [
        { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', name: 'DejaVu Sans' },
        { path: '/usr/share/fonts/dejavu/DejaVuSans.ttf', name: 'DejaVu Sans' },
        { path: '/usr/share/fonts/TTF/DejaVuSans.ttf', name: 'DejaVu Sans' },
        { path: '/usr/share/fonts/liberation/LiberationSans-Regular.ttf', name: 'Liberation Sans' },
        { path: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', name: 'Liberation Sans' },
        { path: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', name: 'Noto Sans' },
        { path: '/usr/share/fonts/ubuntu/Ubuntu-R.ttf', name: 'Ubuntu' },
        { path: '/usr/share/fonts/cantarell/Cantarell-Regular.otf', name: 'Cantarell' },
    ],
    mono: [
        { path: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', name: 'DejaVu Sans Mono' },
        { path: '/usr/share/fonts/dejavu/DejaVuSansMono.ttf', name: 'DejaVu Sans Mono' },
        { path: '/usr/share/fonts/TTF/DejaVuSansMono.ttf', name: 'DejaVu Sans Mono' },
        { path: '/usr/share/fonts/liberation/LiberationMono-Regular.ttf', name: 'Liberation Mono' },
        { path: '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf', name: 'Liberation Mono' },
        { path: '/usr/share/fonts/ubuntu/UbuntuMono-R.ttf', name: 'Ubuntu Mono' },
        { path: '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf', name: 'Noto Sans Mono' },
    ],
};

export function probeListFor(
    platform: NodeJS.Platform,
    env: NodeJS.ProcessEnv = process.env,
): PlatformProbe {
    if (platform === 'darwin') return MACOS;
    if (platform === 'win32') {
        const fontsDir = path.win32.join(env.WINDIR ?? 'C:\\Windows', 'Fonts');
        return windowsProbe(fontsDir);
    }
    return LINUX;
}

/**
 * Aliases for `--font-sans` / `--font-mono`. Resolves to the platform-default
 * candidate for that family. `dejavu` always resolves to the bundled fallback
 * regardless of platform — handled in resolver.ts.
 */
export const ALIASES: Readonly<Record<string, { sans?: string; mono?: string }>> = {
    sf: { sans: 'SF Pro', mono: 'SF Mono' },
    segoe: { sans: 'Segoe UI', mono: 'Consolas' },
    dejavu: { sans: 'DejaVu Sans', mono: 'DejaVu Sans Mono' },
    helvetica: { sans: 'Helvetica' },
    arial: { sans: 'Arial' },
    tahoma: { sans: 'Tahoma' },
    verdana: { sans: 'Verdana' },
    liberation: { sans: 'Liberation Sans', mono: 'Liberation Mono' },
    noto: { sans: 'Noto Sans', mono: 'Noto Sans Mono' },
    ubuntu: { sans: 'Ubuntu', mono: 'Ubuntu Mono' },
    cantarell: { sans: 'Cantarell' },
    menlo: { mono: 'Menlo' },
    consolas: { mono: 'Consolas' },
    monaco: { mono: 'Monaco' },
    courier: { mono: 'Courier New' },
};

export function isAlias(value: string): boolean {
    return Object.prototype.hasOwnProperty.call(ALIASES, value.toLowerCase());
}

/**
 * Look up the candidate corresponding to an alias for the given role.
 *
 * Returns `undefined` if the alias doesn't have an entry for that role
 * (e.g. `--font-sans menlo` makes no sense — menlo is a mono family).
 */
export function aliasCandidate(
    alias: string,
    role: 'sans' | 'mono',
    probe: PlatformProbe,
): FontCandidate | undefined {
    const entry = ALIASES[alias.toLowerCase()];
    if (!entry) return undefined;
    const target = entry[role];
    if (!target) return undefined;
    const list = probe[role];
    return list.find((c) => c.name === target);
}
