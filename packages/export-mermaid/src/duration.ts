// Convert Nowline duration tokens (e.g. `2w`, `1m`, `xl`) into Mermaid's
// duration syntax. Mermaid `gantt` accepts day / week / hour units.
//
// Spec: specs/handoffs/m2c.md § 6 + the bridge rules in
// specs/rendering.md § Markdown+Mermaid Bridge.

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

/**
 * Convert a duration literal to a Mermaid token (`5d`, `2w`, …).
 * Returns `undefined` when the literal is missing — caller emits no duration
 * and Mermaid uses its default 1d.
 */
export function durationToMermaid(literal: string | undefined): string | undefined {
    if (!literal) return undefined;
    const trimmed = literal.trim().toLowerCase();
    if (!trimmed) return undefined;

    // Size buckets resolve to working-day counts.
    if (trimmed in SIZE_BUCKET_DAYS) {
        return `${SIZE_BUCKET_DAYS[trimmed]}d`;
    }

    const match = NUMERIC_RE.exec(trimmed);
    if (!match) return undefined;
    const value = match[1];
    const unit = (match[2] ?? 'd').toLowerCase();
    if (unit === 'd' || unit === 'w') return `${value}${unit}`;
    if (unit === 'm') {
        const days = Math.round(Number(value) * 22);
        return `${days}d`;
    }
    if (unit === 'y') {
        const days = Math.round(Number(value) * 252);
        return `${days}d`;
    }
    return undefined;
}
