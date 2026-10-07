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
import * as shared from '../src/themes/shared.js';

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

describe('non-working seam theme token (specs/working-calendar.md 7.4)', () => {
    const all = { light: lightTheme, dark: darkTheme, grayscale: grayscaleTheme };
    for (const [name, t] of Object.entries(all)) {
        describe(name, () => {
            // Read from the theme object, never a literal colour: the seam is
            // a faint dotted line between two working days.
            const seam = t.timeline.nonWorkingSeam;
            it('is a colour string on the theme', () => {
                expect(typeof seam).toBe('string');
                expect(seam).toMatch(/^#[0-9a-fA-F]{6}$/);
            });
            it('seam vs both row tints >= 1.8', () => {
                expect(contrastRatio(seam, t.swimlane.rowTintEven)).toBeGreaterThanOrEqual(1.8);
                expect(contrastRatio(seam, t.swimlane.rowTintOdd)).toBeGreaterThanOrEqual(1.8);
            });
            it('seam vs grid line >= 1.3', () => {
                expect(contrastRatio(seam, t.timeline.gridLine)).toBeGreaterThanOrEqual(1.3);
            });
            it('seam differs from the milestone and anchor cut lines', () => {
                const norm = (c: string) => c.toLowerCase();
                expect(norm(seam)).not.toBe(norm(t.milestoneDiamond.cutLineNormal));
                expect(norm(seam)).not.toBe(norm(t.milestoneDiamond.cutLineOverrun));
                expect(norm(seam)).not.toBe(norm(t.anchorDiamond.cutLine));
            });
        });
    }

    it('the grayscale seam is achromatic', () => {
        const seam = grayscaleTheme.timeline.nonWorkingSeam;
        expect(typeof seam).toBe('string');
        expect(isAchromatic(seam)).toBe(true);
    });
});

// The show view paints a non-working day as a band: `timeline.nonWorkingFill`
// at `NON_WORKING_FILL_OPACITY` over the row tint (specs/working-calendar.md
// 7.3). The band must stay a faint shade of the row, and a grid line drawn over
// it must stay visible.
describe('non-working band theme token (specs/working-calendar.md 7.3)', () => {
    const all = { light: lightTheme, dark: darkTheme, grayscale: grayscaleTheme };
    const OPACITY = 0.1;

    const fillOf = (t: typeof lightTheme): string | undefined =>
        (t.timeline as { nonWorkingFill?: string }).nonWorkingFill;

    /** `fill` at `OPACITY` over an opaque `under`, as a 6-digit hex. */
    function over(fill: string, under: string): string {
        const f = hexToRgb(fill);
        const u = hexToRgb(under);
        const mix = f.map((c, i) => Math.round(c * OPACITY + u[i] * (1 - OPACITY)));
        return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }

    it('the fill opacity is 0.1', () => {
        expect((shared as { NON_WORKING_FILL_OPACITY?: number }).NON_WORKING_FILL_OPACITY).toBe(
            OPACITY,
        );
    });

    for (const [name, t] of Object.entries(all)) {
        describe(name, () => {
            it('is a 6-digit hex colour on the theme', () => {
                expect(fillOf(t) ?? '').toMatch(/^#[0-9a-fA-F]{6}$/);
            });

            it('band over each row tint: contrast against the tint in [1.08, 1.30]', () => {
                const fill = fillOf(t) ?? '';
                expect(fill).toMatch(/^#[0-9a-fA-F]{6}$/);
                for (const tint of [t.swimlane.rowTintEven, t.swimlane.rowTintOdd]) {
                    const ratio = contrastRatio(over(fill, tint), tint);
                    expect(ratio).toBeGreaterThanOrEqual(1.08);
                    expect(ratio).toBeLessThanOrEqual(1.3);
                }
            });

            it('grid line over the band: contrast >= 1.25', () => {
                const fill = fillOf(t) ?? '';
                expect(fill).toMatch(/^#[0-9a-fA-F]{6}$/);
                for (const tint of [t.swimlane.rowTintEven, t.swimlane.rowTintOdd]) {
                    expect(
                        contrastRatio(t.timeline.gridLine, over(fill, tint)),
                    ).toBeGreaterThanOrEqual(1.25);
                }
            });
        });
    }

    it('the grayscale fill is achromatic', () => {
        const fill = fillOf(grayscaleTheme) ?? '';
        expect(fill).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(isAchromatic(fill)).toBe(true);
    });
});
