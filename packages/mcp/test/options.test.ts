// Tool arguments resolve through the shared options schema, over one
// `argument` layer, and a bad value keeps MCP's own wording.

import { describe, expect, it } from 'vitest';
import { InputRequiredError } from '../src/diagnostics.js';
import { resolveMcpOptions } from '../src/options.js';

describe('resolveMcpOptions', () => {
    it('defaults to light and keeps an omitted theme out of the preview payload', () => {
        const resolved = resolveMcpOptions({});
        expect(resolved.options.theme).toBe('light');
        expect(resolved.theme).toBeUndefined();
    });

    it('normalizes the theme spelling the way the CLI does', () => {
        const resolved = resolveMcpOptions({ theme: 'Greyscale' });
        expect(resolved.options.theme).toBe('grayscale');
        expect(resolved.theme).toBe('grayscale');
    });

    it('reads now as a floating date, and "-" suppresses the now-line', () => {
        expect(resolveMcpOptions({ now: '2026-02-09' }).options.today).toEqual(
            new Date(Date.UTC(2026, 1, 9)),
        );
        expect(resolveMcpOptions({ now: '-' }).options.today).toBeUndefined();
    });

    it('draws an omitted now at the local civil date', () => {
        const instant = new Date('2026-02-09T23:30:00-08:00');
        const local = new Date(
            Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate()),
        );
        expect(resolveMcpOptions({}, () => instant).options.today).toEqual(local);
        expect(resolveMcpOptions({ timezone: 'local' }, () => instant).options.today).toEqual(
            local,
        );
    });

    it('draws an omitted now at the civil date in the timezone argument', () => {
        const instant = new Date('2026-02-09T23:30:00-08:00');
        const today = (timezone: string) =>
            resolveMcpOptions({ timezone }, () => instant).options.today;
        // 23:30 in San Francisco is already the 10th in UTC and in Tokyo.
        expect(today('America/Los_Angeles')).toEqual(new Date(Date.UTC(2026, 1, 9)));
        expect(today('UTC')).toEqual(new Date(Date.UTC(2026, 1, 10)));
        expect(today('+09:00')).toEqual(new Date(Date.UTC(2026, 1, 10)));
        expect(today('Asia/Tokyo')).toEqual(new Date(Date.UTC(2026, 1, 10)));
    });

    it('ignores the timezone when now is given', () => {
        const options = resolveMcpOptions({ now: '2026-02-09', timezone: 'Asia/Tokyo' }).options;
        expect(options.today).toEqual(new Date(Date.UTC(2026, 1, 9)));
    });

    it('throws an input error for an unknown timezone', () => {
        expect(() => resolveMcpOptions({ timezone: 'Mars/Olympus' })).toThrow(InputRequiredError);
        expect(() => resolveMcpOptions({ timezone: 'Mars/Olympus' })).toThrow(
            /^Invalid timezone: unrecognised timezone "Mars\/Olympus"/,
        );
    });

    it('parses pageSize and treats an empty string as unset', () => {
        expect(resolveMcpOptions({ pageSize: 'A4' }).options.pageSize).toBeDefined();
        expect(resolveMcpOptions({ pageSize: '' }).options.pageSize).toBeUndefined();
    });

    it('passes nonWorking through and leaves it unset when omitted', () => {
        expect(resolveMcpOptions({ nonWorking: 'show' }).options.nonWorking).toBe('show');
        expect(resolveMcpOptions({}).options.nonWorking).toBeUndefined();
    });

    it('throws an input error naming the theme list', () => {
        expect(() => resolveMcpOptions({ theme: 'neon' })).toThrow(InputRequiredError);
        expect(() => resolveMcpOptions({ theme: 'neon' })).toThrow(
            'Unknown theme "neon". Expected one of: light, dark, grayscale.',
        );
    });

    it('throws an input error with the parser detail for a bad pageSize', () => {
        expect(() => resolveMcpOptions({ pageSize: 'bogus' })).toThrow(
            /^Invalid pageSize "bogus": .*expected preset/,
        );
    });

    it('rejects a nonWorking value outside hide and show', () => {
        expect(() => resolveMcpOptions({ nonWorking: 'maybe' })).toThrow(
            'Invalid nonWorking "maybe". Expected one of: hide, show.',
        );
    });

    it('accepts a width of at least 320 and leaves it unset when omitted', () => {
        expect(resolveMcpOptions({ width: 320 }).options.width).toBe(320);
        expect(resolveMcpOptions({ width: 1600 }).options.width).toBe(1600);
        expect(resolveMcpOptions({}).options.width).toBeUndefined();
    });

    it('rejects a width below 320 or that is not an integer', () => {
        for (const width of [0, 1, 319, -5, 400.5, Number.NaN]) {
            expect(() => resolveMcpOptions({ width })).toThrow(InputRequiredError);
        }
        expect(() => resolveMcpOptions({ width: 100 })).toThrow(
            'Invalid width "100": must be an integer ≥ 320',
        );
    });
});
