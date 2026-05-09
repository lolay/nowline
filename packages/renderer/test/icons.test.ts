import { describe, expect, it } from 'vitest';
import { CAPACITY_ICON_ASCII, CAPACITY_ICON_SVG, hasCapacityIconSvg } from '../src/svg/icons.js';

// These tests pin the contract m6 (item suffix), m7 (lane badge), and any
// future ASCII / non-SVG export paths will rely on. They intentionally don't
// snapshot the path geometry — the `ascii` fallback table and the rough SVG
// element shape are what consumers depend on.
describe('CAPACITY_ICON_SVG library', () => {
    const expectedNames = ['person', 'people', 'points', 'time'];

    it('exposes exactly the four built-in SVG glyphs', () => {
        expect(Object.keys(CAPACITY_ICON_SVG).sort()).toEqual(expectedNames.slice().sort());
    });

    it.each(expectedNames)('declares a 24x24 viewBox for %s', (name) => {
        expect(CAPACITY_ICON_SVG[name].viewBox).toBe('0 0 24 24');
    });

    it.each(expectedNames)('%s body uses currentColor so renderer can recolor inline', (name) => {
        expect(CAPACITY_ICON_SVG[name].body).toContain('currentColor');
    });

    it.each(expectedNames)('%s body is a non-empty string of SVG primitives', (name) => {
        const body = CAPACITY_ICON_SVG[name].body;
        expect(body.length).toBeGreaterThan(0);
        // Must contain at least one SVG drawing primitive.
        expect(body).toMatch(/<(path|circle|line|polygon|rect)\b/);
    });

    it('hasCapacityIconSvg reports built-ins as present and unknowns as absent', () => {
        for (const name of expectedNames) {
            expect(hasCapacityIconSvg(name)).toBe(true);
        }
        expect(hasCapacityIconSvg('multiplier')).toBe(false);
        expect(hasCapacityIconSvg('none')).toBe(false);
        expect(hasCapacityIconSvg('budget')).toBe(false);
        expect(hasCapacityIconSvg('')).toBe(false);
    });
});

describe('CAPACITY_ICON_ASCII fallbacks', () => {
    // Source of truth: the `Built-in glyph table` in specs/rendering.md.
    it('matches the spec table exactly', () => {
        expect(CAPACITY_ICON_ASCII).toEqual({
            none: '',
            multiplier: 'x',
            person: 'p',
            people: 'P',
            points: '*',
            time: 't',
        });
    });

    it.each([
        'multiplier',
        'person',
        'people',
        'points',
        'time',
    ])('%s ASCII fallback is 1-3 printable ASCII characters', (name) => {
        const value = CAPACITY_ICON_ASCII[name];
        expect(value.length).toBeGreaterThanOrEqual(1);
        expect(value.length).toBeLessThanOrEqual(3);
        // Every character in the printable ASCII range (no control chars,
        // no Unicode).
        for (const ch of value) {
            const cp = ch.codePointAt(0)!;
            expect(cp).toBeGreaterThanOrEqual(0x20);
            expect(cp).toBeLessThanOrEqual(0x7e);
        }
    });
});
