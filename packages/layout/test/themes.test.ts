import { describe, expect, it } from 'vitest';
import {
    darkTheme,
    greyscaleNamed,
    greyscaleTheme,
    lightTheme,
    resolveColor,
} from '../src/themes/index.js';
import type { NamedColors, Theme } from '../src/themes/index.js';

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

    it('grey resolves to the same value as gray (greyscale theme)', () => {
        expect(resolveColor('grey', greyscaleTheme)).toBe(resolveColor('gray', greyscaleTheme));
    });

    it('blue resolves to the greyscale palette value, not the light palette blue', () => {
        const greyscaleBlue = resolveColor('blue', greyscaleTheme);
        const lightBlue = resolveColor('blue', lightTheme);
        expect(greyscaleBlue).not.toBe(lightBlue);
        expect(greyscaleBlue).toBe(greyscaleNamed.blue);
    });
});

// Helper: parse a hex string to [r, g, b] components.
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
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

describe('greyscale theme achromatic invariant', () => {
    it('every hex color in greyscaleTheme has R === G === B', () => {
        const hexValues = collectHexValues(greyscaleTheme as unknown as Record<string, unknown>);
        const chromatic = hexValues.filter((h) => !isAchromatic(h));
        expect(chromatic).toEqual([]);
    });

    it('every hex color in greyscaleNamed has R === G === B', () => {
        const hexValues = collectHexValues(greyscaleNamed as unknown as Record<string, unknown>);
        const chromatic = hexValues.filter((h) => !isAchromatic(h));
        expect(chromatic).toEqual([]);
    });
});
