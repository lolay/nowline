// Small helpers shared by the validator (`nowline-validator.ts`) and the
// wave rules (`waves.ts`). Kept free of Langium services so both the
// validator and the include resolver can call the wave rules as pure
// functions.

import type { AstNode } from 'langium';
import { singleLine } from '../util/single-line.js';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function propKey(prop: { key: string }): string {
    return prop.key.endsWith(':') ? prop.key.slice(0, -1) : prop.key;
}

// Levenshtein distance with an early-exit cap: returns `cap + 1` once the running
// minimum exceeds the cap so we can short-circuit the matcher in the common case
// where the typo is much further than 2 edits from any valid key. Used for the
// "did you mean?" suggestions on unknown property keys and wave ids.
export function levenshteinCapped(a: string, b: string, cap: number): number {
    if (a === b) return 0;
    const an = a.length;
    const bn = b.length;
    if (Math.abs(an - bn) > cap) return cap + 1;
    if (an === 0) return bn;
    if (bn === 0) return an;
    let prev = new Array<number>(bn + 1);
    let curr = new Array<number>(bn + 1);
    for (let j = 0; j <= bn; j++) prev[j] = j;
    for (let i = 1; i <= an; i++) {
        curr[0] = i;
        let rowMin = i;
        for (let j = 1; j <= bn; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1, // deletion
                curr[j - 1] + 1, // insertion
                prev[j - 1] + cost, // substitution
            );
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > cap) return cap + 1;
        const tmp = prev;
        prev = curr;
        curr = tmp;
    }
    return prev[bn];
}

// Pick the closest known key within `cap` edits of `key`, or undefined. Ties are
// broken by the order of `candidates`, so callers should pass entity-specific keys
// first when both lists are searched.
export function suggestKey(key: string, candidates: Iterable<string>, cap = 2): string | undefined {
    let best: string | undefined;
    let bestDist = cap + 1;
    for (const c of candidates) {
        const d = levenshteinCapped(key, c, cap);
        if (d < bestDist) {
            best = c;
            bestDist = d;
            if (d === 0) break;
        }
    }
    return best;
}

// Like `suggestKey`, but returns undefined when the best distance is shared by
// more than one candidate, so a suggestion is only made when it is unambiguous.
export function suggestUniqueKey(
    key: string,
    candidates: Iterable<string>,
    cap = 2,
): string | undefined {
    let best: string | undefined;
    let bestDist = cap + 1;
    let tied = false;
    for (const c of candidates) {
        const d = levenshteinCapped(key, c, cap);
        if (d < bestDist) {
            best = c;
            bestDist = d;
            tied = false;
        } else if (d === bestDist && d <= cap && c !== best) {
            tied = true;
        }
    }
    return tied ? undefined : best;
}

/**
 * The name a diagnostic echoes for an entity: its id, else its title. A
 * title can carry explicit line breaks, but a diagnostic is one line of
 * text, so breaks collapse to a single space (`singleLine`).
 */
export function displayName(node: { name?: string; title?: string }): string {
    return node.name ?? (node.title === undefined ? '<unnamed>' : singleLine(node.title));
}

/**
 * Returns the lowercase entity-type label for an AST node, suitable for
 * embedding inside a validator message (e.g. `"item"`, `"milestone"`,
 * `"swimlane"`). Mirrors `describeNode`'s normalization (strip
 * `Declaration` / `Block` suffix, lowercase) but returns just the type so
 * callers can compose their own message.
 */
export function entityTypeLabel(node: { $type: string }): string {
    return node.$type.replace(/Declaration$|Block$/, '').toLowerCase();
}

export function describeNode(node: { $type: string; name?: string; title?: string }): string {
    const kind = entityTypeLabel(node);
    const label = node.name ?? (node.title === undefined ? undefined : singleLine(node.title));
    return label ? `${kind} "${label}"` : kind;
}

/** 1-based source line of a node, or 0 when it has no CST node. */
export function lineOf(node: AstNode): number {
    const cst = node.$cstNode;
    return cst ? cst.range.start.line + 1 : 0;
}

// Defaults rule 23: the message for a property that cannot be set on a
// `default <entity>` line. Shared by `checkDefaultDeclaration` (static
// `DEFAULT_BANNED` table) and the wave rules (`wave` on a default line in a
// roadmap with waves), so both read the same.
export function defaultBannedMessage(key: string, entityType: string): string {
    return `"${key}" cannot be set on "default ${entityType}". Identity-defining, sizing, sequencing, reference, and prose properties must be explicit on each entity.`;
}
