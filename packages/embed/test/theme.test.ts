import { describe, expect, it } from 'vitest';
import { effectiveTheme } from '../src/theme.js';

describe('effectiveTheme', () => {
    it('explicit grayscale is honored, not overridden by systemTheme', () => {
        expect(effectiveTheme('grayscale', 'light')).toBe('grayscale');
        expect(effectiveTheme('grayscale', 'dark')).toBe('grayscale');
    });

    it('canonicalizes the UK alias greyscale to grayscale', () => {
        expect(effectiveTheme('greyscale', 'light')).toBe('grayscale');
        expect(effectiveTheme('greyscale', 'dark')).toBe('grayscale');
    });

    it('explicit light/dark are honored', () => {
        expect(effectiveTheme('light', 'dark')).toBe('light');
        expect(effectiveTheme('dark', 'light')).toBe('dark');
    });

    it('auto falls through to systemTheme', () => {
        expect(effectiveTheme('auto', 'dark')).toBe('dark');
        expect(effectiveTheme('auto', 'light')).toBe('light');
    });

    it('undefined falls through to systemTheme', () => {
        expect(effectiveTheme(undefined, 'light')).toBe('light');
        expect(effectiveTheme(undefined, 'dark')).toBe('dark');
    });
});
