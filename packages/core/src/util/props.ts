// Property lookup and ISO date helpers shared by every `@nowline/*` package
// (specs/core-ast-utilities.md §3.5). Exported only through
// `@nowline/core/internal`. A leaf module: it imports nothing but the
// generated AST types.

import type { EntityProperty } from '../generated/ast.js';

/**
 * `prop.key` without a trailing `:`. Keys from the parser never carry one
 * (the value converter strips it); hand-built ASTs and JSON may.
 */
export function propKey(prop: { key: string }): string {
    return prop.key.endsWith(':') ? prop.key.slice(0, -1) : prop.key;
}

/** The first property with `key` (compared without a trailing `:`), or undefined. */
export function findProp<P extends { key: string }>(
    props: readonly P[],
    key: string,
): P | undefined {
    return props.find((prop) => propKey(prop) === key);
}

/** The scalar value of the first property with `key`; undefined for a bracket list. */
export function propValue(props: readonly EntityProperty[], key: string): string | undefined {
    return findProp(props, key)?.value;
}

/** The first property with `key` as a list: its scalar as one element, or its bracket list. */
export function propValues(props: readonly EntityProperty[], key: string): string[] {
    const prop = findProp(props, key);
    if (!prop) return [];
    return prop.value !== undefined ? [prop.value] : [...prop.values];
}

/** `YYYY-MM-DD`, without checking that it names a real day. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UTC midnight of a `YYYY-MM-DD` that names a real calendar day, or null.
 * Strict: `2026-02-30` is null rather than rolling over to March 2, and a
 * year below 100 is read as written (`Date.UTC` would add 1900).
 */
export function parseIsoDate(raw: string | undefined): Date | null {
    if (!raw || !ISO_DATE_RE.test(raw)) return null;
    const [year, month, day] = raw.split('-').map((part) => Number.parseInt(part, 10));
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    const isSameDay =
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
    return isSameDay ? date : null;
}

/** True for a `YYYY-MM-DD` that names a real calendar day (the validator's NL.E0405 check). */
export function isRealIsoDate(raw: string): boolean {
    return parseIsoDate(raw) !== null;
}
