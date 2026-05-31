export { darkNamed, darkTheme } from './dark.js';
export { greyscaleNamed, greyscaleTheme } from './greyscale.js';
export { lightNamed, lightTheme } from './light.js';
export type { EntityStyle, NamedColors, Theme } from './shape.js';

import { darkNamed, darkTheme } from './dark.js';
import { greyscaleNamed, greyscaleTheme } from './greyscale.js';
import { lightNamed, lightTheme } from './light.js';
import type { NamedColors, Theme } from './shape.js';

export type ThemeName = 'light' | 'dark' | 'greyscale';

export const themes: { light: Theme; dark: Theme; greyscale: Theme } = {
    light: lightTheme,
    dark: darkTheme,
    greyscale: greyscaleTheme,
};

export const namedColors: { light: NamedColors; dark: NamedColors; greyscale: NamedColors } = {
    light: lightNamed,
    dark: darkNamed,
    greyscale: greyscaleNamed,
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
    const named =
        theme.name === 'dark'
            ? darkNamed
            : theme.name === 'greyscale'
              ? greyscaleNamed
              : lightNamed;
    const canonical = COLOR_ALIASES[token] ?? token;
    const hit = (named as unknown as Record<string, string>)[canonical];
    return typeof hit === 'string' ? hit : token;
}
