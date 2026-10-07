// The XLSX "Duration (text)" column: the item's DSL literal as written
// (`2w`, `xl`, `1m`, …). The numeric "Duration" column is engine C's
// `ScheduledItem.days`, so it follows the file's calendar and sizes.

export function durationLiteralToText(literal: string | undefined): string {
    if (!literal) return '';
    return literal.trim();
}
