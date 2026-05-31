import { describe, expect, it } from 'vitest';
import {
    darkTheme,
    grayscaleNamed,
    grayscaleTheme,
    lightTheme,
    normalizeThemeName,
    resolveColor,
} from '../src/themes/index.js';

// Pin the alias canonicalization at the theme boundary. Authors who type
// `bg:grey` should land on the same paint as `bg:gray`; same for
// `violet`/`purple`. The aliases collapse before lookup so themes don't
// need to grow new palette fields.
describe('resolveColor aliases', () => {
    it('grey resolves to the same value as gray (light theme)', () => {
        expect(resolveColor('grey', lightTheme)).toBe(resolveColor('gray', lightTheme));
    });

    it('grey resolves to the same value as gray (dark theme)', () => {
        expect(resolveColor('grey', darkTheme)).toBe(resolveColor('gray', darkTheme));
    });

    it('violet resolves to the same value as purple (light theme)', () => {
        expect(resolveColor('violet', lightTheme)).toBe(resolveColor('purple', lightTheme));
    });

    it('violet resolves to the same value as purple (dark theme)', () => {
        expect(resolveColor('violet', darkTheme)).toBe(resolveColor('purple', darkTheme));
    });

    it('passes hex values through unchanged', () => {
        expect(resolveColor('#abcdef', lightTheme)).toBe('#abcdef');
    });

    it('returns "none" for the literal "none"', () => {
        expect(resolveColor('none', lightTheme)).toBe('none');
    });

    it('grey resolves to the same value as gray (grayscale theme)', () => {
        expect(resolveColor('grey', grayscaleTheme)).toBe(resolveColor('gray', grayscaleTheme));
    });

    it('blue resolves to the grayscale palette value, not the light palette blue', () => {
        const grayscaleBlue = resolveColor('blue', grayscaleTheme);
        const lightBlue = resolveColor('blue', lightTheme);
        expect(grayscaleBlue).not.toBe(lightBlue);
        expect(grayscaleBlue).toBe(grayscaleNamed.blue);
    });
});

// `grayscale` (US) is canonical, matching the `gray` color token; `greyscale`
// (UK) is accepted as input and canonicalizes here so every theme-name surface
// (CLI `--theme`, embed config) stays single-canonical.
describe('normalizeThemeName', () => {
    it('passes the canonical themes through unchanged', () => {
        expect(normalizeThemeName('light')).toBe('light');
        expect(normalizeThemeName('dark')).toBe('dark');
        expect(normalizeThemeName('grayscale')).toBe('grayscale');
    });

    it('canonicalizes the UK spelling greyscale to grayscale', () => {
        expect(normalizeThemeName('greyscale')).toBe('grayscale');
    });

    it('is case-insensitive for both spellings', () => {
        expect(normalizeThemeName('GREYSCALE')).toBe('grayscale');
        expect(normalizeThemeName('Grayscale')).toBe('grayscale');
    });

    it('returns undefined for unknown tokens', () => {
        expect(normalizeThemeName('auto')).toBeUndefined();
        expect(normalizeThemeName('sepia')).toBeUndefined();
    });
});

// Helper: parse a hex string to [r, g, b] components.
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function isAchromatic(hex: string): boolean {
    const [r, g, b] = hexToRgb(hex);
    return r === g && g === b;
}

// Collect every string value from a nested object (skipping non-color strings).
function collectHexValues(obj: unknown): string[] {
    if (typeof obj === 'string') {
        return obj.startsWith('#') ? [obj] : [];
    }
    if (typeof obj === 'object' && obj !== null) {
        return Object.values(obj as Record<string, unknown>).flatMap(collectHexValues);
    }
    return [];
}

describe('grayscale theme achromatic invariant', () => {
    it('every hex color in grayscaleTheme has R === G === B', () => {
        const hexValues = collectHexValues(grayscaleTheme as unknown as Record<string, unknown>);
        const chromatic = hexValues.filter((h) => !isAchromatic(h));
        expect(chromatic).toEqual([]);
    });

    it('every hex color in grayscaleNamed has R === G === B', () => {
        const hexValues = collectHexValues(grayscaleNamed as unknown as Record<string, unknown>);
        const chromatic = hexValues.filter((h) => !isAchromatic(h));
        expect(chromatic).toEqual([]);
    });
});
