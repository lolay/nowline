// Capacity parsing, number formatting, and capacity-icon resolution helpers.
//
// Layout owns the *contract* the renderer reads:
//
//   - `parseCapacityValue` turns the DSL's three numeric forms (`5`, `0.5`,
//     `50%`) into a single positive number — percent literals are syntactic
//     sugar for decimals (`50%` → `0.5`) per specs/dsl.md § Capacity.
//   - `formatCapacityNumber` produces the spec's display string: integers
//     stay integers (`5`, not `5.0`); decimals trim trailing zeros (`0.5`,
//     `1.25`).
//   - `resolveCapacityIcon` collapses the three syntactic forms of the
//     `capacity-icon:` style property (built-in name, custom `symbol` id,
//     inline Unicode literal) into either a built-in name the renderer
//     recognizes OR a literal string the renderer paints as text. Custom
//     symbol ids are dereferenced via `ResolvedConfig.symbols` here so the
//     renderer never has to walk the config map.
//
// All three helpers are pure — no AST, no theme, no side effects — so they
// can be tested in isolation and reused by future capacity consumers (e.g.
// the lane badge in m7 and the overload sweep in m8).

import type { SymbolDeclaration } from '@nowline/core';
import { BUILTIN_CAPACITY_ICONS, propKey } from '@nowline/core/internal';
import { estimateTextWidth } from './text-measure.js';
import type { ResolvedCapacityIconRef } from './types.js';

/**
 * Built-in `capacity-icon:` names the renderer understands directly
 * (`BUILTIN_CAPACITY_ICONS` in core's `value-tables.ts`): the validator uses
 * the list to decide whether a value is a known built-in; the layout uses it
 * to decide whether to forward the value as-is or dereference it through the
 * glyph map.
 */
const BUILTIN_CAPACITY_ICON_SET: ReadonlySet<string> = new Set(BUILTIN_CAPACITY_ICONS);

const POSITIVE_INT_RE = /^\d+$/;
const POSITIVE_DECIMAL_RE = /^\d+\.\d+$/;
const POSITIVE_PERCENT_RE = /^\d+(?:\.\d+)?%$/;

/**
 * Parse a `capacity:` value. Accepts the three forms the validator allows on
 * items (positive int, positive decimal, positive percent) — swimlanes only
 * allow int/decimal but the validator already rejects percent on lanes, so a
 * single parser is fine here.
 *
 * Returns `null` when the value is missing, malformed, or non-positive. The
 * renderer must not draw a capacity suffix / badge in that case (per spec
 * "the suffix appears only when the resolved capacity is `> 0`").
 */
export function parseCapacityValue(raw: string | undefined): number | null {
    if (!raw) return null;
    if (POSITIVE_INT_RE.test(raw)) {
        const n = parseInt(raw, 10);
        return n > 0 ? n : null;
    }
    if (POSITIVE_DECIMAL_RE.test(raw)) {
        const n = parseFloat(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (POSITIVE_PERCENT_RE.test(raw)) {
        const n = parseFloat(raw.slice(0, -1)) / 100;
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
}

/**
 * Format a parsed capacity number for display per specs/rendering.md §
 * "Number formatting": integers render as integers (`5`, not `5.0`); decimals
 * render with trailing zeros trimmed (`0.5`, `1.25`).
 *
 * The `toFixed(6)` cap guards against `0.1 + 0.2`-style float noise creeping
 * into the rendered string. Six is more than the DSL grammar admits anyway —
 * `1.234567%` lexes but is far below the granularity any roadmap author cares
 * about, so trimming there is safe.
 */
export function formatCapacityNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    let s = value.toFixed(6);
    s = s.replace(/0+$/, '');
    s = s.replace(/\.$/, '');
    return s;
}

/**
 * Resolved capacity-icon ready for the renderer. Re-exported from
 * `./types.js` so callers can `import { ResolvedCapacityIcon } from
 * './capacity.js'` without reaching into the positioned-model module.
 *
 * Two flavors:
 *
 *   - `kind: 'builtin'` — the renderer looks up its SVG (person/people/
 *     points/time) or text representation (multiplier) via its icon library.
 *     `'none'` is collapsed to `null` upstream (no glyph rendered).
 *   - `kind: 'literal'` — the renderer paints `text` as a `<text>` node.
 *     Covers inline Unicode literals (`capacity-icon:"💰"`) and dereferenced
 *     custom `symbol` declarations.
 */
export type ResolvedCapacityIcon = ResolvedCapacityIconRef;

function symbolUnicode(decl: SymbolDeclaration): string | undefined {
    for (const p of decl.properties) {
        if (propKey(p) === 'unicode' && p.value) return p.value;
    }
    return undefined;
}

/**
 * Resolve a `capacity-icon:` style value into a `ResolvedCapacityIcon` (or
 * `null` for `'none'`).
 *
 * Resolution order matches specs/dsl.md § Style Properties for `icon:` and
 * `capacity-icon:`:
 *
 *   1. `'none'` → `null` (renderer emits no glyph).
 *   2. Built-in name → `{ kind: 'builtin', name }`.
 *   3. Custom symbol id present in `symbols` → `{ kind: 'literal', text:
 *      <unicode:> }`. The author wrote an identifier; we hand the
 *      renderer the underlying Unicode payload.
 *   4. Anything else → `{ kind: 'literal', text: icon }`. This is the inline
 *      Unicode literal form (`capacity-icon:"💰"`) — Langium's
 *      ValueConverter has already stripped the surrounding quotes, so the
 *      raw payload arrives here.
 *
 * Validator rule 17 already rejects malformed combinations (unknown built-in
 * with no matching symbol, symbol id collision with built-ins, etc.), so this
 * function trusts its input shape.
 */
export function resolveCapacityIcon(
    icon: string,
    symbols: Map<string, SymbolDeclaration>,
): ResolvedCapacityIcon | null {
    if (icon === 'none') return null;
    if (BUILTIN_CAPACITY_ICON_SET.has(icon)) {
        return {
            kind: 'builtin',
            name: icon as 'multiplier' | 'person' | 'people' | 'points' | 'time',
        };
    }
    const custom = symbols.get(icon);
    if (custom) {
        const unicode = symbolUnicode(custom);
        return { kind: 'literal', text: unicode ?? icon };
    }
    return { kind: 'literal', text: icon };
}

/**
 * Estimate the on-screen width (px) the capacity suffix will occupy at the
 * given font size, including the leading separator gap before the glyph.
 *
 * The renderer paints the suffix as `<num>{gap}<glyph>` (no leading space
 * before the number — callers handle that as an outer separator). Width
 * estimates are intentionally pessimistic so borderline-fitting captions
 * trigger spill rather than clip.
 */
export function estimateCapacitySuffixWidth(
    text: string,
    icon: ResolvedCapacityIcon | null,
    fontSizePx: number,
): number {
    if (!icon) return text.length * fontSizePx * 0.58;
    if (icon.kind === 'builtin' && icon.name === 'multiplier') {
        // Multiplier is a typographic operator with built-in side bearing —
        // no separator gap, glyph width approx. one character.
        return (text.length + 1) * fontSizePx * 0.58;
    }
    // 0.1em separator + 1em glyph. Estimating the glyph as 1em (rather than
    // 0.58em, the per-character width) is intentional: SVG icons render at
    // their full font-size square, and most Unicode literals authors use for
    // capacity (★, 💰, ⚙) similarly read at near-em widths.
    const glyphWidthEm = 1.0;
    const gapEm = 0.1;
    return text.length * fontSizePx * 0.58 + (gapEm + glyphWidthEm) * fontSizePx;
}

/**
 * Em-distance the renderer reserves between an item's metaText and its
 * capacity suffix (or any inline trailing token). Half a space's worth
 * — wide enough to read as a separator, narrow enough not to look like
 * a stray gap. SVG `<tspan dx>` honors this exactly so we don't depend
 * on per-character estimation for the gap itself.
 */
export const META_SUFFIX_DX_EM = 0.6;

/**
 * Tighter em-per-char width estimate used inside `renderItemMetaLine`
 * for positioning a built-in SVG icon after a metaText + number. Layout
 * still uses 0.58 em/char to pessimistically reserve bar width for
 * spill detection (so `metaText 5×` always fits its row); the renderer
 * paints the icon at a tighter offset so there's no visible
 * dead-space between the rendered number and its glyph. Lands inside
 * the layout reservation either way (`0.5 < 0.58`).
 */
const META_ICON_EM_PER_CHAR = 0.5;

/** Gap (em) between a capacity number and its built-in SVG icon. */
const CAPACITY_ICON_GAP_EM = 0.1;

/**
 * Where a built-in SVG capacity icon (person, people, points, time) sits:
 * its x offset (px) from the start of the text run the suffix is painted
 * in, at `fontSizePx`. Undefined for every other glyph (`null`, the
 * multiplier, a literal), which the renderer paints inside the `<text>`.
 *
 * With `metaText`, the run is the item meta line: the number follows the
 * meta text after a `META_SUFFIX_DX_EM` separator, and the icon follows
 * the number, both measured at the tighter `META_ICON_EM_PER_CHAR` so the
 * icon hugs the number. Without it, the number starts the run (an item
 * with no meta text, or a lane badge) and the icon follows its
 * `estimateTextWidth` width. Either way a 0.1 em gap precedes the icon.
 */
export function capacityIconDx(
    text: string,
    icon: ResolvedCapacityIcon | null,
    fontSizePx: number,
    metaText?: string,
): number | undefined {
    if (icon?.kind !== 'builtin' || icon.name === 'multiplier') return undefined;
    const gapPx = fontSizePx * CAPACITY_ICON_GAP_EM;
    if (metaText) {
        const tightWidth = (s: string) => s.length * fontSizePx * META_ICON_EM_PER_CHAR;
        const numberStartDx = tightWidth(metaText) + fontSizePx * META_SUFFIX_DX_EM;
        return numberStartDx + tightWidth(text) + gapPx;
    }
    return estimateTextWidth(text, fontSizePx) + gapPx;
}
