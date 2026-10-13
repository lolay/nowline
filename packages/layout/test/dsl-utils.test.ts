import { describe, expect, it } from 'vitest';
import { formatIsoDate, parseIsoDate } from '../src/dsl-utils.js';

// Layout reads an impossible day as no date, the same as the validator's
// NL.E0405 (specs/core-ast-utilities.md §7, decision 5).
describe('layout date parsing', () => {
    it('reads a real day as UTC midnight', (): void => {
        const date = parseIsoDate('2026-02-09');
        expect(date && formatIsoDate(date)).toBe('2026-02-09');
    });

    it('reads 2026-02-30 as no date, not March 2', (): void => {
        expect(parseIsoDate('2026-02-30')).toBeNull();
    });

    it('reads an out-of-range day as no date, not a day of the next month', (): void => {
        expect(parseIsoDate('2025-12-40')).toBeNull();
    });
});
