// resolveToday — shared timezone-aware now-line date resolver.
//
// Every surface (CLI, VS Code extension, embed, browser SPA) calls this helper
// to decide which civil calendar date to mark as "now" on the chart. Layout
// itself stays a pure function of its inputs and never calls this — callers
// resolve the date first, then pass `today: Date` into `layoutRoadmap`.
//
// Design contract (see plan: timezone-aware now-line resolution):
//
//  - "Today" is the viewer's local civil date by default. UTC is opt-in via
//    --timezone UTC. This matches iCalendar floating-date semantics: authored
//    dates in .nowline files are already floating (zone-free); the only thing
//    that benefits from a timezone is the clock-based "today" default.
//
//  - Dates on the axis, item bars, milestones, and anchors are floating and
//    are NEVER affected by --timezone. Only the now-line moves.
//
//  - An explicit --now value always wins over --timezone. When --now carries
//    an embedded ISO 8601 offset/Z, that offset determines the civil day; the
//    --timezone is ignored. --timezone only governs the clock-based default
//    (when --now is omitted).

// ---- Types and errors -------------------------------------------------------

/**
 * Structured representation of a normalised --timezone / timezone option.
 * Produced by {@link normalizeZone}; consumed by {@link civilDateInZone}.
 */
export type NormalizedZone =
    | { kind: 'local' }
    | { kind: 'utc' }
    | { kind: 'offset'; ms: number }
    | { kind: 'iana'; name: string };

/**
 * Thrown by {@link normalizeZone} when the raw timezone string is not
 * recognised. CLI surfaces catch this and re-throw as `CliError`.
 */
export class TimezoneError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimezoneError';
    }
}

// ---- Zone normalisation -----------------------------------------------------

/**
 * Normalise a raw --timezone / timezone option string into a {@link NormalizedZone}.
 *
 * Accepted forms (case-insensitive for keywords):
 *   - empty / `'local'`                      → host/viewer local zone (default)
 *   - `'UTC'`                                → UTC
 *   - ISO 8601 offset: `Z`, `±HH`, `±HH:MM`, `±HHMM`  → fixed offset (DST-naive)
 *   - IANA name e.g. `'America/Los_Angeles'` → validated via Intl
 *
 * Throws {@link TimezoneError} for strings not recognised by `Intl.DateTimeFormat`.
 * Ambiguous abbreviations (`PST`, `IST`, …) are rejected on platforms where `Intl`
 * rejects them (Linux ICU typically rejects them); on macOS Node 26 they may be
 * accepted and silently mapped to a platform-specific IANA zone — a known platform
 * caveat. Use explicit IANA names for portable results.
 * and any unrecognised string. (`GMT` and `Etc/GMT±N` are accepted by `Intl`
 * but are undocumented; `Etc/GMT±N` has an inverted sign convention.)
 */
export function normalizeZone(raw: string | undefined): NormalizedZone {
    if (!raw || raw.toLowerCase() === 'local') return { kind: 'local' };
    if (raw.toUpperCase() === 'UTC') return { kind: 'utc' };

    // ISO 8601 offset shorthand: Z, ±HH, ±HH:MM, ±HHMM
    if (raw === 'Z') return { kind: 'offset', ms: 0 };
    const offsetMatch = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(raw);
    if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? 1 : -1;
        const hours = parseInt(offsetMatch[2], 10);
        const minutes = offsetMatch[3] !== undefined ? parseInt(offsetMatch[3], 10) : 0;
        if (hours > 23 || minutes > 59) {
            throw new TimezoneError(
                `nowline: invalid timezone offset "${raw}". Hours must be 0–23 and minutes 0–59.`,
            );
        }
        return { kind: 'offset', ms: sign * (hours * 60 + minutes) * 60_000 };
    }

    // IANA name — validate with Intl; ambiguous abbreviations (PST, IST, …)
    // are not valid IANA names and will throw here.
    try {
        const canonical = Intl.DateTimeFormat(undefined, { timeZone: raw }).resolvedOptions()
            .timeZone;
        return { kind: 'iana', name: canonical };
    } catch {
        throw new TimezoneError(
            `nowline: unrecognised timezone "${raw}". ` +
                `Use "local", "UTC", an ISO 8601 offset (e.g. "+05:30", "-07:00", "Z"), ` +
                `or an IANA timezone name (e.g. "America/Los_Angeles", "Asia/Kolkata").`,
        );
    }
}

// ---- Civil-date extraction --------------------------------------------------

/**
 * Extract the civil `YYYY-MM-DD` date of `instant` in the given zone and
 * return it as a UTC-midnight `Date` (matching the layout engine's convention
 * for authored dates).
 */
export function civilDateInZone(instant: Date, zone: NormalizedZone): Date {
    switch (zone.kind) {
        case 'local': {
            // JS local time — getFullYear/Month/Date already reflect the host zone.
            return new Date(Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate()));
        }
        case 'utc': {
            return new Date(
                Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()),
            );
        }
        case 'offset': {
            // Shift the instant by the fixed offset, then read UTC components.
            // No Intl dependency — portable to older embed browsers.
            const shifted = new Date(instant.getTime() + zone.ms);
            return new Date(
                Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
            );
        }
        case 'iana': {
            // Use en-CA locale so formatToParts gives YYYY-MM-DD numeric fields.
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: zone.name,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).formatToParts(instant);
            let y = 0;
            let m = 0;
            let d = 0;
            for (const p of parts) {
                if (p.type === 'year') y = parseInt(p.value, 10);
                else if (p.type === 'month') m = parseInt(p.value, 10) - 1;
                else if (p.type === 'day') d = parseInt(p.value, 10);
            }
            return new Date(Date.UTC(y, m, d));
        }
    }
}

// ---- Now-value parsing ------------------------------------------------------

// Bare YYYY-MM-DD (floating date, zone-independent)
const BARE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ISO 8601 instant with explicit Z or ±HH / ±HH:MM / ±HHMM offset.
// Captures: [1] datetime part, [2] sign or Z, [3] hours, [4] minutes (optional)
const ISO_WITH_OFFSET_RE =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|([+-])(\d{2})(?::?(\d{2}))?)$/;

// ISO 8601 with time but no offset (floating local date-time).
// Captures: [1] year, [2] month, [3] day
const ISO_FLOATING_RE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

// ---- Public API -------------------------------------------------------------

export interface ResolveTodayOptions {
    /**
     * Raw now value: the CLI's `--now` string, a pre-resolved `Date`, `null`
     * to suppress the now-line, or `undefined` to use the clock default.
     *
     * String forms accepted:
     *  - `'-'`                   → suppress (same as `null`)
     *  - `'YYYY-MM-DD'`          → floating date; zone ignored
     *  - ISO 8601 + Z/offset     → embedded offset wins; zone ignored
     *  - ISO 8601 without offset → floating; written date part used; zone ignored
     */
    now?: string | Date | null;
    /**
     * Effective timezone for the clock-based default. Produced by
     * {@link normalizeZone}. Defaults to `{ kind: 'local' }` (host/viewer zone).
     * Only consulted when `now` is omitted.
     */
    zone?: NormalizedZone;
    /**
     * Clock factory — injected for tests; defaults to `() => new Date()`.
     * Only called when `now` is omitted.
     */
    clock?: () => Date;
}

/**
 * Resolve the now-line anchor date.
 *
 * Returns a UTC-midnight `Date` (the civil day at which to draw the red
 * now-line), or `undefined` to suppress the now-line entirely.
 *
 * Precedence (from highest to lowest):
 *  1. `now === '-'` / `null`       → `undefined` (suppress)
 *  2. `now` is a `Date` object     → returned as-is (caller must supply UTC midnight)
 *  3. `now` bare `YYYY-MM-DD`      → floating; `Date.UTC(y, m, d)` regardless of zone
 *  4. `now` ISO 8601 + Z/offset    → embedded offset wins; zone ignored
 *  5. `now` ISO 8601 without offset→ floating; written date part; zone ignored
 *  6. `now` omitted                → civil date of `clock()` in effective `zone`
 *
 * The `zone` is ONLY consulted for case 6 (clock-based default). Authored
 * dates — item bars, milestones, anchors, the axis ticks — are floating and
 * are never affected by this function.
 */
export function resolveToday(opts: ResolveTodayOptions = {}): Date | undefined {
    const zone: NormalizedZone = opts.zone ?? { kind: 'local' };
    const clock = opts.clock ?? (() => new Date());
    const now = opts.now;

    // 1. Suppress sentinel
    if (now === '-' || now === null) return undefined;

    // 2. Pre-resolved Date — pass through as-is
    if (now instanceof Date) return now;

    if (now !== undefined) {
        // 3. Bare YYYY-MM-DD — floating; zone ignored
        const bareMatch = BARE_DATE_RE.exec(now);
        if (bareMatch) {
            return new Date(
                Date.UTC(
                    parseInt(bareMatch[1], 10),
                    parseInt(bareMatch[2], 10) - 1,
                    parseInt(bareMatch[3], 10),
                ),
            );
        }

        // 4. ISO 8601 instant with explicit Z or offset — embedded offset WINS
        const withOffset = ISO_WITH_OFFSET_RE.exec(now);
        if (withOffset) {
            const instant = new Date(now);
            if (!Number.isNaN(instant.getTime())) {
                const suffix = withOffset[2]; // 'Z' or '±HH:MM'
                if (suffix === 'Z') {
                    return civilDateInZone(instant, { kind: 'utc' });
                }
                // Fixed offset embedded in the string
                const sign = withOffset[3] === '+' ? 1 : -1;
                const hh = parseInt(withOffset[4], 10);
                const mm = withOffset[5] !== undefined ? parseInt(withOffset[5], 10) : 0;
                const offsetMs = sign * (hh * 60 + mm) * 60_000;
                return civilDateInZone(instant, { kind: 'offset', ms: offsetMs });
            }
        }

        // 5. ISO 8601 without offset — floating; use written date part; zone ignored
        const floating = ISO_FLOATING_RE.exec(now);
        if (floating) {
            return new Date(
                Date.UTC(
                    parseInt(floating[1], 10),
                    parseInt(floating[2], 10) - 1,
                    parseInt(floating[3], 10),
                ),
            );
        }

        // Unrecognised string — caller should have validated before calling.
        // Return undefined so a bad value doesn't crash the render pipeline.
        return undefined;
    }

    // 6. No now given — civil date of clock() in the effective zone
    return civilDateInZone(clock(), zone);
}
