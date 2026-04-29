// Convert Nowline duration tokens into a numeric working-day count for the
// XLSX "Duration" column. Spec: specs/handoffs/m2c.md § 7
// "Resolution 5: numeric working-day duration".
//
// We expose two artifacts:
//   - `durationToWorkingDays(literal)` for the cell value (Number type so
//     Excel SUM / sort / filter work).
//   - `durationLiteralToText(literal)` for the optional display column
//     (preserves the original DSL text — `2w`, `xl`, `1m`, …).

const SIZE_BUCKET_DAYS: Readonly<Record<string, number>> = {
    xs: 1,
    sm: 3,
    s: 3,
    md: 5,
    m: 5,
    lg: 10,
    l: 10,
    xl: 15,
};

const NUMERIC_RE = /^(\d+(?:\.\d+)?)\s*(d|w|m|y)?$/i;

const WORKING_DAYS_PER_WEEK = 5;
const WORKING_DAYS_PER_MONTH = 22;
const WORKING_DAYS_PER_YEAR = 252;

/** 0 if the literal is missing/invalid (Excel sums treat 0 as no-op). */
export function durationToWorkingDays(literal: string | undefined): number {
    if (!literal) return 0;
    const trimmed = literal.trim().toLowerCase();
    if (!trimmed) return 0;
    if (trimmed in SIZE_BUCKET_DAYS) return SIZE_BUCKET_DAYS[trimmed];
    const match = NUMERIC_RE.exec(trimmed);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const unit = (match[2] ?? 'd').toLowerCase();
    if (unit === 'd') return value;
    if (unit === 'w') return value * WORKING_DAYS_PER_WEEK;
    if (unit === 'm') return value * WORKING_DAYS_PER_MONTH;
    if (unit === 'y') return value * WORKING_DAYS_PER_YEAR;
    return 0;
}

export function durationLiteralToText(literal: string | undefined): string {
    if (!literal) return '';
    return literal.trim();
}
