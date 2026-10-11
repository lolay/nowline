export { darkNamed, darkTheme } from './dark.js';
export { grayscaleNamed, grayscaleTheme } from './grayscale.js';
export { lightNamed, lightTheme } from './light.js';
export type { EntityStyle, NamedColors, Theme } from './shape.js';

import { darkNamed, darkTheme } from './dark.js';
import { grayscaleNamed, grayscaleTheme } from './grayscale.js';
import { lightNamed, lightTheme } from './light.js';
import type { NamedColors, Theme } from './shape.js';

// The one list of theme names. `ThemeName` derives from it and `themes` /
// `namedColors` are keyed by it, so a new theme is added here and tsc then
// demands its palette. Every surface that validates a theme (CLI `render` /
// `serve`, the GitHub Action) goes through `normalizeThemeName` below.
export const THEME_NAMES = ['light', 'dark', 'grayscale'] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const themes: Record<ThemeName, Theme> = {
    light: lightTheme,
    dark: darkTheme,
    grayscale: grayscaleTheme,
};

export const namedColors: Record<ThemeName, NamedColors> = {
    light: lightNamed,
    dark: darkNamed,
    grayscale: grayscaleNamed,
};

// Theme-name aliases mirror the COLOR_ALIASES policy below: the US spelling
// `grayscale` is canonical (matching the `gray` color token), and the UK
// `greyscale` is accepted as input. Every surface that turns user-typed text
// into a ThemeName (CLI `--theme`, embed config) runs it through this so the
// canonical token stays single while both spellings resolve.
const THEME_ALIASES: Record<string, ThemeName> = {
    greyscale: 'grayscale',
};

// Normalize a user-supplied theme token to its canonical ThemeName, or
// `undefined` when it is not a recognized theme (callers decide how to
// report the error). Lowercases first so `Grayscale` / `GREYSCALE` resolve.
export function normalizeThemeName(raw: string): ThemeName | undefined {
    const lower = raw.toLowerCase();
    const canonical = THEME_ALIASES[lower] ?? lower;
    return THEME_NAMES.find((name) => name === canonical);
}

// Aliases collapse internationally-friendlier spellings onto the canonical
// keys before lookup so themes only need to define each color once.
const COLOR_ALIASES: Record<string, string> = {
    grey: 'gray',
    violet: 'purple',
};

// Resolve a DSL color token (`blue`, `#ff00aa`, or `none`) against a theme.
export function resolveColor(token: string, theme: Theme): string {
    if (token === 'none') return 'none';
    if (token.startsWith('#')) return token;
    const named =
        theme.name === 'dark'
            ? darkNamed
            : theme.name === 'grayscale'
              ? grayscaleNamed
              : lightNamed;
    const canonical = COLOR_ALIASES[token] ?? token;
    const hit = (named as unknown as Record<string, string>)[canonical];
    return typeof hit === 'string' ? hit : token;
}
