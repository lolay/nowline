import { describe, expect, it } from 'vitest';
import { effectiveTheme } from '../src/theme.js';

describe('effectiveTheme', () => {
    it('explicit greyscale is honored, not overridden by systemTheme', () => {
        expect(effectiveTheme('greyscale', 'light')).toBe('greyscale');
        expect(effectiveTheme('greyscale', 'dark')).toBe('greyscale');
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
