// Mermaid task durations. The day count is engine C's `ScheduledItem.days`
// under the file's calendar (specs/working-calendar.md §8), so sizes,
// `capacity:` and every unit match the chart. It is always written as `Nd`:
// with the business `excludes` Mermaid counts those in working days, and a
// full-calendar `4w` becomes `28d`, the same span.
//
// Spec: specs/handoffs/m2c.md § 6 + the bridge rules in
// specs/rendering.md § Markdown+Mermaid Bridge.

/**
 * `Nd` with up to two decimals, trailing zeros trimmed (`7.5d`, `7.33d`).
 * Returns `undefined` for no duration; the caller falls back to `1d`.
 */
export function daysToMermaid(days: number | undefined): string | undefined {
    if (days === undefined || !(days > 0)) return undefined;
    // parseFloat strips trailing zeros: `7.50` → `7.5`.
    return `${parseFloat(days.toFixed(2))}d`;
}
