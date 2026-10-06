import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/themes/contrast.js';
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

describe('contrastRatio', () => {
    it('is 21 for black on white and symmetric', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    });

    it('is 1 for equal colours', () => {
        expect(contrastRatio('#0d9488', '#0d9488')).toBeCloseTo(1, 5);
    });
});

describe('wave theme contrast floors (specs/waves.md 9.10)', () => {
    const all = { light: lightTheme, dark: darkTheme, grayscale: grayscaleTheme };
    for (const [name, t] of Object.entries(all)) {
        describe(name, () => {
            const b = t.wave.boundary;
            it('boundary vs grid lines >= 2.0', () => {
                expect(contrastRatio(b, t.timeline.gridLine)).toBeGreaterThanOrEqual(2.0);
                expect(contrastRatio(b, t.timeline.minorGridLine)).toBeGreaterThanOrEqual(2.0);
            });
            it('boundary vs lane tints >= 3.0', () => {
                expect(contrastRatio(b, t.swimlane.rowTintEven)).toBeGreaterThanOrEqual(3.0);
                expect(contrastRatio(b, t.swimlane.rowTintOdd)).toBeGreaterThanOrEqual(3.0);
            });
            it('label text vs strip fills >= 4.5', () => {
                expect(contrastRatio(t.wave.labelText, t.wave.stripFill)).toBeGreaterThanOrEqual(
                    4.5,
                );
                expect(contrastRatio(t.wave.labelText, t.wave.stripFillAlt)).toBeGreaterThanOrEqual(
                    4.5,
                );
            });
            it('boundary differs from milestone and anchor cut lines', () => {
                const norm = (c: string) => c.toLowerCase();
                expect(norm(b)).not.toBe(norm(t.milestoneDiamond.cutLineNormal));
                expect(norm(b)).not.toBe(norm(t.milestoneDiamond.cutLineOverrun));
                expect(norm(b)).not.toBe(norm(t.anchorDiamond.cutLine));
            });
        });
    }
});
