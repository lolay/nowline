// Theme resolution for the embed.
//
// Precedence (highest to lowest):
//   1. `initialize({ theme })` flag (light / dark / auto).
//   2. The file's own `nowline v1 theme:` directive — handled inside
//      layout, so we just don't override it when the embed config says
//      `'auto'` and we have no system preference reading.
//   3. The browser's `prefers-color-scheme` media query.
//
// `prefers-color-scheme` is read **once on init**, not reactively, so
// flipping the OS theme mid-session does not cause every embedded
// roadmap on the page to repaint. This matches Mermaid's posture and
// keeps the embed deterministic for screenshot tools.

import type { ThemeName } from '@nowline/layout';

export type EmbedTheme = ThemeName | 'auto';

export function resolveSystemTheme(): ThemeName {
    if (typeof globalThis === 'undefined') return 'light';
    const win = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
    if (typeof win !== 'function') return 'light';
    try {
        return win('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

export function effectiveTheme(theme: EmbedTheme | undefined, systemTheme: ThemeName): ThemeName {
    if (theme === 'light' || theme === 'dark') return theme;
    return systemTheme;
}
