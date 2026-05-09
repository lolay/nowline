import { describe, expect, it } from 'vitest';
import { LengthParseError, lengthToPoints, parseLength, pointsToLength } from '../src/units.js';

describe('lengthToPoints', () => {
    it('treats pt as identity', () => {
        expect(lengthToPoints({ value: 36, unit: 'pt' })).toBe(36);
    });

    it('converts inches at 72 pt/in', () => {
        expect(lengthToPoints({ value: 1, unit: 'in' })).toBe(72);
        expect(lengthToPoints({ value: 8.5, unit: 'in' })).toBe(612);
    });

    it('converts mm at 72/25.4 pt/mm', () => {
        expect(lengthToPoints({ value: 25.4, unit: 'mm' })).toBeCloseTo(72, 9);
    });

    it('converts cm at 72/2.54 pt/cm', () => {
        expect(lengthToPoints({ value: 2.54, unit: 'cm' })).toBeCloseTo(72, 9);
    });
});

describe('pointsToLength', () => {
    it('round-trips with lengthToPoints for every unit', () => {
        for (const unit of ['pt', 'in', 'mm', 'cm'] as const) {
            const original = { value: 12.5, unit };
            const pts = lengthToPoints(original);
            const back = pointsToLength(pts, unit);
            expect(back.value).toBeCloseTo(original.value, 9);
            expect(back.unit).toBe(unit);
        }
    });
});

describe('parseLength', () => {
    it('parses canonical examples', () => {
        expect(parseLength('36pt')).toEqual({ value: 36, unit: 'pt' });
        expect(parseLength('0.5in')).toEqual({ value: 0.5, unit: 'in' });
        expect(parseLength('10mm')).toEqual({ value: 10, unit: 'mm' });
        expect(parseLength('1cm')).toEqual({ value: 1, unit: 'cm' });
    });

    it('is case-insensitive on the unit', () => {
        expect(parseLength('36PT')).toEqual({ value: 36, unit: 'pt' });
        expect(parseLength('0.5In')).toEqual({ value: 0.5, unit: 'in' });
    });

    it('trims surrounding whitespace', () => {
        expect(parseLength('  10mm  ')).toEqual({ value: 10, unit: 'mm' });
    });

    it('rejects empty input', () => {
        expect(() => parseLength('')).toThrow(LengthParseError);
        expect(() => parseLength('   ')).toThrow(LengthParseError);
    });

    it('rejects missing unit with a targeted error', () => {
        try {
            parseLength('36');
            expect.fail('expected throw');
        } catch (err) {
            expect(err).toBeInstanceOf(LengthParseError);
            expect((err as Error).message).toContain('missing unit');
        }
    });

    it('rejects unknown units', () => {
        expect(() => parseLength('36em')).toThrow(/unknown unit/);
        expect(() => parseLength('36px')).toThrow(/unknown unit/);
    });

    it('rejects non-numeric values', () => {
        expect(() => parseLength('abcpt')).toThrow(LengthParseError);
    });

    it('rejects zero and negative values', () => {
        expect(() => parseLength('0pt')).toThrow(/positive/);
        expect(() => parseLength('-5pt')).toThrow(/positive/);
    });
});
