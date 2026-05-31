export { darkNamed, darkTheme } from './dark.js';
export { grayscaleNamed, grayscaleTheme } from './grayscale.js';
export { lightNamed, lightTheme } from './light.js';
export type { EntityStyle, NamedColors, Theme } from './shape.js';

import { darkNamed, darkTheme } from './dark.js';
import { grayscaleNamed, grayscaleTheme } from './grayscale.js';
import { lightNamed, lightTheme } from './light.js';
import type { NamedColors, Theme } from './shape.js';

export type ThemeName = 'light' | 'dark' | 'grayscale';

export const themes: { light: Theme; dark: Theme; grayscale: Theme } = {
    light: lightTheme,
    dark: darkTheme,
    grayscale: grayscaleTheme,
};

export const namedColors: { light: NamedColors; dark: NamedColors; grayscale: NamedColors } = {
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
    if (canonical === 'light' || canonical === 'dark' || canonical === 'grayscale') {
        return canonical;
    }
    return undefined;
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
