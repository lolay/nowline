import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme, resolveColor } from '../src/themes/index.js';

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
});
