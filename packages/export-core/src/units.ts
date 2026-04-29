// Length conversions and parsing for PDF page sizing.
//
// PDF native unit is the "PostScript point": 1 pt = 1/72 in. Every length
// resolves to points before the page is laid out — see specs/handoffs/m2c.md
// § 4 "Unit conversion".

import type { PdfLength, PdfLengthUnit } from './types.js';

const POINTS_PER_UNIT: Readonly<Record<PdfLengthUnit, number>> = {
    pt: 1,
    in: 72,
    mm: 72 / 25.4, // ≈ 2.83464567
    cm: 72 / 2.54, // ≈ 28.3464567
};

/** Convert a tagged length to PDF points. */
export function lengthToPoints(length: PdfLength): number {
    return length.value * POINTS_PER_UNIT[length.unit];
}

/** Convert a raw point count back to a tagged length in the requested unit. */
export function pointsToLength(points: number, unit: PdfLengthUnit): PdfLength {
    return { value: points / POINTS_PER_UNIT[unit], unit };
}

export class LengthParseError extends Error {
    constructor(input: string, reason: string) {
        super(`invalid length "${input}": ${reason}`);
        this.name = 'LengthParseError';
    }
}

const LENGTH_RE = /^(-?\d+(?:\.\d+)?)([a-z]+)$/i;
const KNOWN_UNITS = new Set<PdfLengthUnit>(['pt', 'in', 'mm', 'cm']);

/**
 * Parse a unit-tagged length like `36pt`, `0.5in`, `10mm`, `1cm`.
 *
 * Throws `LengthParseError` on missing unit, unknown unit, non-numeric, zero,
 * or negative values.
 */
export function parseLength(input: string): PdfLength {
    const trimmed = input.trim();
    if (!trimmed) throw new LengthParseError(input, 'empty');
    const match = LENGTH_RE.exec(trimmed);
    if (!match) {
        if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
            throw new LengthParseError(input, 'missing unit (expected pt, in, mm, or cm)');
        }
        throw new LengthParseError(input, 'expected <number><unit>');
    }
    const unit = match[2].toLowerCase();
    if (!KNOWN_UNITS.has(unit as PdfLengthUnit)) {
        throw new LengthParseError(input, `unknown unit "${unit}"; expected one of pt, in, mm, cm`);
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value)) throw new LengthParseError(input, 'non-numeric value');
    if (value <= 0) throw new LengthParseError(input, 'must be positive');
    return { value, unit: unit as PdfLengthUnit };
}
