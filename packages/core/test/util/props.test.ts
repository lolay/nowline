import { describe, expect, it } from 'vitest';
import type { EntityProperty } from '../../src/generated/ast.js';
import {
    findProp,
    ISO_DATE_RE,
    isRealIsoDate,
    parseIsoDate,
    propKey,
    propValue,
    propValues,
} from '../../src/util/props.js';

/** A hand-built property: only `key`, `value` and `values` matter to these helpers. */
function prop(key: string, value?: string, values: string[] = []): EntityProperty {
    return { key, value, values } as unknown as EntityProperty;
}

describe('propKey', () => {
    it('strips one trailing colon', (): void => {
        expect(propKey({ key: 'date:' })).toBe('date');
    });

    it('leaves a key without a colon unchanged', (): void => {
        expect(propKey({ key: 'date' })).toBe('date');
    });

    it('strips only the last colon', (): void => {
        expect(propKey({ key: 'a::' })).toBe('a:');
    });
});

describe('findProp', () => {
    it('returns the first property with the key, with or without a colon', (): void => {
        const first = prop('date:', '2026-01-05');
        const second = prop('date', '2026-02-02');
        expect(findProp([prop('start', 'x'), first, second], 'date')).toBe(first);
    });

    it('returns undefined when no property has the key', (): void => {
        expect(findProp([prop('start', 'x')], 'date')).toBeUndefined();
    });

    it('works on any object with a key', (): void => {
        const options = [{ key: 'mode:' }, { key: 'prefix' }];
        expect(findProp(options, 'mode')).toBe(options[0]);
    });
});

describe('propValue', () => {
    it('returns the scalar of the first match', (): void => {
        expect(propValue([prop('size', 'm'), prop('size', 'l')], 'size')).toBe('m');
    });

    it('returns undefined for a bracket list', (): void => {
        expect(propValue([prop('labels', undefined, ['a', 'b'])], 'labels')).toBeUndefined();
    });

    it('returns undefined when the key is missing', (): void => {
        expect(propValue([], 'size')).toBeUndefined();
    });
});

describe('propValues', () => {
    it('returns a scalar as a one-element list', (): void => {
        expect(propValues([prop('after', 'a')], 'after')).toEqual(['a']);
    });

    it('returns a copy of a bracket list', (): void => {
        const list = ['a', 'b'];
        const values = propValues([prop('after', undefined, list)], 'after');
        expect(values).toEqual(['a', 'b']);
        expect(values).not.toBe(list);
    });

    it('returns an empty list when the key is missing', (): void => {
        expect(propValues([prop('before', 'a')], 'after')).toEqual([]);
    });
});

describe('ISO_DATE_RE', () => {
    it('matches YYYY-MM-DD only', (): void => {
        expect(ISO_DATE_RE.test('2026-02-09')).toBe(true);
        expect(ISO_DATE_RE.test('2026-2-9')).toBe(false);
        expect(ISO_DATE_RE.test('2026-02-09T00:00:00Z')).toBe(false);
        expect(ISO_DATE_RE.test(' 2026-02-09')).toBe(false);
    });

    it('does not check that the day is real', (): void => {
        expect(ISO_DATE_RE.test('2026-02-30')).toBe(true);
    });
});

describe('parseIsoDate', () => {
    it('reads a real day as UTC midnight', (): void => {
        expect(parseIsoDate('2026-02-09')?.toISOString()).toBe('2026-02-09T00:00:00.000Z');
    });

    it('reads a leap day in a leap year', (): void => {
        expect(parseIsoDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    });

    it('returns null for a day the month does not have, rather than rolling over', (): void => {
        expect(parseIsoDate('2026-02-30')).toBeNull();
        expect(parseIsoDate('2026-02-29')).toBeNull();
        expect(parseIsoDate('2026-04-31')).toBeNull();
    });

    it('returns null for a day or month out of range', (): void => {
        expect(parseIsoDate('2025-12-40')).toBeNull();
        expect(parseIsoDate('2026-01-00')).toBeNull();
        expect(parseIsoDate('2026-00-10')).toBeNull();
        expect(parseIsoDate('2026-13-01')).toBeNull();
    });

    it('reads years below 100 as written, not as 19xx', (): void => {
        expect(parseIsoDate('0000-01-01')?.getUTCFullYear()).toBe(0);
        expect(parseIsoDate('0099-03-01')?.getUTCFullYear()).toBe(99);
        expect(parseIsoDate('0000-02-29')?.getUTCDate()).toBe(29);
    });

    it('returns null for anything that is not YYYY-MM-DD', (): void => {
        expect(parseIsoDate(undefined)).toBeNull();
        expect(parseIsoDate('')).toBeNull();
        expect(parseIsoDate('2026-2-9')).toBeNull();
        expect(parseIsoDate('next week')).toBeNull();
    });
});

describe('isRealIsoDate', () => {
    it('accepts real days and rejects impossible ones', (): void => {
        expect(isRealIsoDate('2026-02-28')).toBe(true);
        expect(isRealIsoDate('0000-01-01')).toBe(true);
        expect(isRealIsoDate('2026-02-30')).toBe(false);
        expect(isRealIsoDate('2025-12-40')).toBe(false);
        expect(isRealIsoDate('20260209')).toBe(false);
    });
});
