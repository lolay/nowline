export { darkNamed, darkTheme } from './dark.js';
export { lightNamed, lightTheme } from './light.js';
export type { EntityStyle, NamedColors, Theme } from './shape.js';

import { darkNamed, darkTheme } from './dark.js';
import { lightNamed, lightTheme } from './light.js';
import type { NamedColors, Theme } from './shape.js';

export type ThemeName = 'light' | 'dark';

export const themes: { light: Theme; dark: Theme } = {
    light: lightTheme,
    dark: darkTheme,
};

export const namedColors: { light: NamedColors; dark: NamedColors } = {
    light: lightNamed,
    dark: darkNamed,
};

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
    const named = theme.name === 'dark' ? darkNamed : lightNamed;
    const canonical = COLOR_ALIASES[token] ?? token;
    const hit = (named as unknown as Record<string, string>)[canonical];
    return typeof hit === 'string' ? hit : token;
}
