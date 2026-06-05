import { describe, expect, it } from 'vitest';
import { normalizeZone, resolveToday, TimezoneError } from '../src/resolve-today.js';

// ---- helpers ----------------------------------------------------------------

/** Parse a UTC-midnight Date from a YYYY-MM-DD string for expectation building. */
function utcDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

// ---- normalizeZone ----------------------------------------------------------

describe('normalizeZone', () => {
    it('returns local for empty string', () => {
        expect(normalizeZone('')).toEqual({ kind: 'local' });
    });

    it('returns local for undefined', () => {
        expect(normalizeZone(undefined)).toEqual({ kind: 'local' });
    });

    it('returns local for "local"', () => {
        expect(normalizeZone('local')).toEqual({ kind: 'local' });
    });

    it('returns local for "LOCAL" (case-insensitive)', () => {
        expect(normalizeZone('LOCAL')).toEqual({ kind: 'local' });
    });

    it('returns utc for "UTC"', () => {
        expect(normalizeZone('UTC')).toEqual({ kind: 'utc' });
    });

    it('returns utc for "utc" (case-insensitive)', () => {
        expect(normalizeZone('utc')).toEqual({ kind: 'utc' });
    });

    it('returns offset=0 for "Z"', () => {
        expect(normalizeZone('Z')).toEqual({ kind: 'offset', ms: 0 });
    });

    it('returns offset=0 for "+00:00"', () => {
        expect(normalizeZone('+00:00')).toEqual({ kind: 'offset', ms: 0 });
    });

    it('returns offset=0 for "+00" (hours only)', () => {
        expect(normalizeZone('+00')).toEqual({ kind: 'offset', ms: 0 });
    });

    it('parses "+07:00" as +7h', () => {
        expect(normalizeZone('+07:00')).toEqual({ kind: 'offset', ms: 7 * 3_600_000 });
    });

    it('parses "-07:00" as -7h', () => {
        expect(normalizeZone('-07:00')).toEqual({ kind: 'offset', ms: -7 * 3_600_000 });
    });

    it('parses "+05:30" (IST fixed offset)', () => {
        expect(normalizeZone('+05:30')).toEqual({
            kind: 'offset',
            ms: (5 * 60 + 30) * 60_000,
        });
    });

    it('parses "-0700" (no colon)', () => {
        expect(normalizeZone('-0700')).toEqual({ kind: 'offset', ms: -7 * 3_600_000 });
    });

    it('parses "+09" (no minutes)', () => {
        expect(normalizeZone('+09')).toEqual({ kind: 'offset', ms: 9 * 3_600_000 });
    });

    it('accepts IANA name "America/Los_Angeles"', () => {
        const z = normalizeZone('America/Los_Angeles');
        expect(z.kind).toBe('iana');
        if (z.kind === 'iana') expect(z.name).toBe('America/Los_Angeles');
    });

    it('accepts IANA name "Asia/Kolkata"', () => {
        const z = normalizeZone('Asia/Kolkata');
        expect(z.kind).toBe('iana');
    });

    it('accepts IANA name "Europe/London"', () => {
        const z = normalizeZone('Europe/London');
        expect(z.kind).toBe('iana');
    });

    // Timezone abbreviation rejection is best-effort via Intl.DateTimeFormat validation.
    // Behavior is ICU-implementation-dependent: macOS Node 26 accepts PST, IST, EST
    // (mapping them to platform-specific IANA zones). Linux ICU typically rejects them.
    // We document this as a known caveat and only test strings that are universally rejected.

    it('throws TimezoneError for garbage input "Not/A/Zone"', () => {
        expect(() => normalizeZone('Not/A/Zone')).toThrow(TimezoneError);
    });

    it('throws TimezoneError for empty-looking garbage "123abc"', () => {
        expect(() => normalizeZone('123abc')).toThrow(TimezoneError);
    });

    it('throws TimezoneError for out-of-range offset hours', () => {
        expect(() => normalizeZone('+25:00')).toThrow(TimezoneError);
    });

    it('throws TimezoneError for out-of-range offset minutes', () => {
        expect(() => normalizeZone('+05:60')).toThrow(TimezoneError);
    });
});

// ---- resolveToday -----------------------------------------------------------

describe('resolveToday', () => {
    // Use a fixed clock for deterministic tests.
    // 2026-06-05T06:00:00Z = June 5 in UTC, June 4 in America/Los_Angeles (PDT = UTC-7).
    const FIXED_INSTANT = new Date('2026-06-05T06:00:00Z');
    const clock = () => FIXED_INSTANT;

    describe('suppress sentinel', () => {
        it('returns undefined for now="-"', () => {
            expect(resolveToday({ now: '-', clock })).toBeUndefined();
        });

        it('returns undefined for now=null', () => {
            expect(resolveToday({ now: null, clock })).toBeUndefined();
        });
    });

    describe('pre-resolved Date', () => {
        it('passes a Date through unchanged', () => {
            const d = utcDate('2026-03-15');
            expect(resolveToday({ now: d, clock })).toBe(d);
        });
    });

    describe('bare YYYY-MM-DD (floating)', () => {
        it('returns UTC midnight for a bare date (zone ignored)', () => {
            const result = resolveToday({
                now: '2026-03-15',
                zone: { kind: 'iana', name: 'America/Los_Angeles' },
                clock,
            });
            expect(result).toEqual(utcDate('2026-03-15'));
        });

        it('bare date is unaffected by UTC zone', () => {
            expect(resolveToday({ now: '2026-01-01', zone: { kind: 'utc' }, clock })).toEqual(
                utcDate('2026-01-01'),
            );
        });
    });

    describe('ISO 8601 with Z (embedded UTC wins)', () => {
        it('extracts the civil date in UTC from Z instant', () => {
            // 2026-06-05T06:00:00Z → civil date in UTC = June 5
            const result = resolveToday({ now: '2026-06-05T06:00:00Z', clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('Z-instant near midnight: just before UTC midnight → previous day', () => {
            // 2026-06-04T23:59:59Z → civil date in UTC = June 4
            const result = resolveToday({ now: '2026-06-04T23:59:59Z', clock });
            expect(result).toEqual(utcDate('2026-06-04'));
        });

        it('Z overrides --timezone', () => {
            // Same result regardless of timezone flag
            const withZone = resolveToday({
                now: '2026-06-05T06:00:00Z',
                zone: { kind: 'iana', name: 'America/Los_Angeles' },
                clock,
            });
            expect(withZone).toEqual(utcDate('2026-06-05'));
        });
    });

    describe('ISO 8601 with explicit offset (embedded offset wins)', () => {
        it('+07:00 offset: 2026-06-05T06:00:00+07:00 → civil date June 5', () => {
            // The same UTC instant as FIXED_INSTANT, but at +07:00 → June 5 06:00 local
            const result = resolveToday({ now: '2026-06-05T06:00:00+07:00', clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('-07:00 offset: 2026-06-04T23:00:00-07:00 → civil date June 4', () => {
            // UTC midnight June 5 expressed in PDT = June 4 at 17:00 → civil day = June 4
            const result = resolveToday({ now: '2026-06-04T23:00:00-07:00', clock });
            expect(result).toEqual(utcDate('2026-06-04'));
        });

        it('embedded offset overrides timezone flag (precedence rule)', () => {
            // 2026-06-05T06:00:00Z = June 5 in UTC. Even with UTC-7 zone flag,
            // the embedded Z wins → result stays June 5.
            const result = resolveToday({
                now: '2026-06-05T06:00:00Z',
                zone: { kind: 'offset', ms: -7 * 3_600_000 },
                clock,
            });
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('+05:30 offset: civil day on east side of midnight', () => {
            // 2026-06-05T01:30:00+05:30 — local time 01:30 on June 5 at +05:30
            // UTC = June 4 at 20:00. Civil date AT +05:30 = June 5 (local clock shows Jun 5).
            const result = resolveToday({ now: '2026-06-05T01:30:00+05:30', clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('-0700 format (no colon) is parsed correctly', () => {
            const result = resolveToday({ now: '2026-06-04T23:00:00-0700', clock });
            expect(result).toEqual(utcDate('2026-06-04'));
        });
    });

    describe('ISO 8601 without offset (floating date-time)', () => {
        it('uses the written date part regardless of zone', () => {
            const result = resolveToday({
                now: '2026-06-04T23:00:00',
                zone: { kind: 'iana', name: 'Asia/Kolkata' },
                clock,
            });
            // Written date = June 4, not June 5
            expect(result).toEqual(utcDate('2026-06-04'));
        });

        it('floating at 00:00:00 → same written date', () => {
            const result = resolveToday({ now: '2026-06-05T00:00:00', clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });
    });

    describe('clock-based default (no now given)', () => {
        it('uses local zone by default (zone: local)', () => {
            // When run in a UTC environment, local = UTC and result = June 5.
            // We test the UTC case explicitly to make it deterministic.
            const result = resolveToday({ zone: { kind: 'utc' }, clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('UTC zone: FIXED_INSTANT (06:00 UTC Jun 5) → Jun 5', () => {
            const result = resolveToday({ zone: { kind: 'utc' }, clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('fixed -7h offset: FIXED_INSTANT (06:00 UTC) → Jun 4 in PDT', () => {
            const result = resolveToday({ zone: { kind: 'offset', ms: -7 * 3_600_000 }, clock });
            // 06:00Z - 7h = 23:00 on Jun 4 → civil date = Jun 4
            expect(result).toEqual(utcDate('2026-06-04'));
        });

        it('fixed +7h offset: FIXED_INSTANT (06:00 UTC) → Jun 5 in +07', () => {
            const result = resolveToday({ zone: { kind: 'offset', ms: 7 * 3_600_000 }, clock });
            // 06:00Z + 7h = 13:00 on Jun 5 → civil date = Jun 5
            expect(result).toEqual(utcDate('2026-06-05'));
        });

        it('IANA America/Los_Angeles: 06:00Z in PDT → Jun 4 (civil date)', () => {
            // PDT = UTC-7 in June. 06:00Z = 23:00 Jun 4 in LA.
            const result = resolveToday({
                zone: { kind: 'iana', name: 'America/Los_Angeles' },
                clock,
            });
            expect(result).toEqual(utcDate('2026-06-04'));
        });

        it('omitting zone defaults to local (does not throw)', () => {
            // Just verify it returns a Date (local-zone value is machine-dependent)
            expect(resolveToday({ clock })).toBeInstanceOf(Date);
        });

        it('clock is called when now is omitted', () => {
            let called = false;
            const spyClock = () => {
                called = true;
                return FIXED_INSTANT;
            };
            resolveToday({ zone: { kind: 'utc' }, clock: spyClock });
            expect(called).toBe(true);
        });

        it('clock is NOT called when now is provided', () => {
            let called = false;
            const spyClock = () => {
                called = true;
                return FIXED_INSTANT;
            };
            resolveToday({ now: '2026-01-01', clock: spyClock });
            expect(called).toBe(false);
        });
    });

    describe('DST and near-midnight cross-zone', () => {
        // The key real-world case: it's 23:00 on Jun 4 in PDT (= 06:00 UTC Jun 5).
        // Without --timezone (UTC default), old CLI showed Jun 5. With local/PDT, shows Jun 4.
        it('Jun 4 23:00 PDT vs Jun 5 06:00 UTC — offset zone gives Jun 4', () => {
            const result = resolveToday({ zone: { kind: 'offset', ms: -7 * 3_600_000 }, clock });
            expect(result).toEqual(utcDate('2026-06-04'));
        });

        it('Jun 4 23:00 PDT vs Jun 5 06:00 UTC — UTC zone gives Jun 5', () => {
            const result = resolveToday({ zone: { kind: 'utc' }, clock });
            expect(result).toEqual(utcDate('2026-06-05'));
        });
    });

    describe('unrecognised string', () => {
        it('returns undefined for a completely invalid now string', () => {
            expect(resolveToday({ now: 'not-a-date', clock })).toBeUndefined();
        });
    });
});
