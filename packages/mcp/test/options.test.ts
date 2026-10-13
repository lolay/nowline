// Tool arguments resolve through the shared options schema, over one
// `argument` layer, and a bad value keeps MCP's own wording.

import { describe, expect, it } from 'vitest';
import { InputRequiredError } from '../src/diagnostics.js';
import { resolveMcpOptions } from '../src/options.js';

const UTC = { zone: { kind: 'utc' } } as const;

describe('resolveMcpOptions', () => {
    it('defaults to light and keeps an omitted theme out of the preview payload', () => {
        const resolved = resolveMcpOptions({}, UTC);
        expect(resolved.options.theme).toBe('light');
        expect(resolved.theme).toBeUndefined();
    });

    it('normalizes the theme spelling the way the CLI does', () => {
        const resolved = resolveMcpOptions({ theme: 'Greyscale' }, UTC);
        expect(resolved.options.theme).toBe('grayscale');
        expect(resolved.theme).toBe('grayscale');
    });

    it('reads now as a floating date, and "-" suppresses the now-line', () => {
        expect(resolveMcpOptions({ now: '2026-02-09' }, UTC).options.today).toEqual(
            new Date(Date.UTC(2026, 1, 9)),
        );
        expect(resolveMcpOptions({ now: '-' }, UTC).options.today).toBeUndefined();
    });

    it('draws an omitted now at the civil date in the policy zone', () => {
        const clock = () => new Date('2026-02-09T23:30:00-08:00');
        const utc = resolveMcpOptions({}, { zone: { kind: 'utc' }, clock });
        expect(utc.options.today).toEqual(new Date(Date.UTC(2026, 1, 10)));
        const pacific = resolveMcpOptions(
            {},
            { zone: { kind: 'iana', name: 'America/Los_Angeles' }, clock },
        );
        expect(pacific.options.today).toEqual(new Date(Date.UTC(2026, 1, 9)));
    });

    it('parses pageSize and treats an empty string as unset', () => {
        expect(resolveMcpOptions({ pageSize: 'A4' }, UTC).options.pageSize).toBeDefined();
        expect(resolveMcpOptions({ pageSize: '' }, UTC).options.pageSize).toBeUndefined();
    });

    it('passes nonWorking through and leaves it unset when omitted', () => {
        expect(resolveMcpOptions({ nonWorking: 'show' }, UTC).options.nonWorking).toBe('show');
        expect(resolveMcpOptions({}, UTC).options.nonWorking).toBeUndefined();
    });

    it('throws an input error naming the theme list', () => {
        expect(() => resolveMcpOptions({ theme: 'neon' }, UTC)).toThrow(InputRequiredError);
        expect(() => resolveMcpOptions({ theme: 'neon' }, UTC)).toThrow(
            'Unknown theme "neon". Expected one of: light, dark, grayscale.',
        );
    });

    it('throws an input error with the parser detail for a bad pageSize', () => {
        expect(() => resolveMcpOptions({ pageSize: 'bogus' }, UTC)).toThrow(
            /^Invalid pageSize "bogus": .*expected preset/,
        );
    });

    it('rejects a nonWorking value outside hide and show', () => {
        expect(() => resolveMcpOptions({ nonWorking: 'maybe' }, UTC)).toThrow(
            'Invalid nonWorking "maybe". Expected one of: hide, show.',
        );
    });

    it('accepts a width of at least 320 and leaves it unset when omitted', () => {
        expect(resolveMcpOptions({ width: 320 }, UTC).options.width).toBe(320);
        expect(resolveMcpOptions({ width: 1600 }, UTC).options.width).toBe(1600);
        expect(resolveMcpOptions({}, UTC).options.width).toBeUndefined();
    });

    it('rejects a width below 320 or that is not an integer', () => {
        for (const width of [0, 1, 319, -5, 400.5, Number.NaN]) {
            expect(() => resolveMcpOptions({ width }, UTC)).toThrow(InputRequiredError);
        }
        expect(() => resolveMcpOptions({ width: 100 }, UTC)).toThrow(
            'Invalid width "100": must be an integer ≥ 320',
        );
    });
});
