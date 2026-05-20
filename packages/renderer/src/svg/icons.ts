// Built-in link icon paths. All drawn to a 16x16 box; renderer positions them.

export const LINK_ICON_PATHS: Record<string, string> = {
    // Generic link/chain icon.
    generic:
        'M7 3h2a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4h2a2 2 0 1 0 0-4H7Zm6 0h2a4 4 0 0 1 0 8h-2a4 4 0 0 1 0-8Z',
    // Abstract Linear triangle.
    linear: 'M2 8l6-6 6 6-6 6Z',
    // GitHub octocat silhouette (simplified).
    github: 'M8 1C4.14 1 1 4.14 1 8c0 3.1 2 5.7 4.8 6.6.35.07.48-.15.48-.34v-1.2c-1.95.43-2.36-.83-2.36-.83-.32-.82-.78-1.04-.78-1.04-.63-.43.05-.42.05-.42.71.05 1.08.73 1.08.73.62 1.06 1.63.75 2.03.57.06-.45.24-.75.44-.92-1.56-.18-3.2-.78-3.2-3.48 0-.77.27-1.4.72-1.9-.07-.18-.31-.9.07-1.88 0 0 .59-.19 1.93.72.56-.16 1.16-.24 1.76-.24.6 0 1.2.08 1.76.24 1.34-.9 1.93-.72 1.93-.72.38.98.14 1.7.07 1.88.45.5.72 1.13.72 1.9 0 2.7-1.65 3.3-3.22 3.48.25.21.47.63.47 1.27v1.88c0 .19.13.41.49.34C13 13.7 15 11.1 15 8c0-3.86-3.14-7-7-7Z',
    // Jira-ish blue diamond.
    jira: 'M8 1 1 8l7 7 7-7Zm0 3.5L11.5 8 8 11.5 4.5 8Z',
};

// --- Curated built-in icon library ---
//
// Named glyphs for the `capacity-icon:` style property, the `icon:` style
// property, and renderer-internal vocabulary like the inline-date pin glyph
// (`calendar`). Each glyph is a small inline SVG fragment drawn on a 24x24
// viewBox using `currentColor` so the renderer can paint it in the resolved
// entity text color and at any pixel size by setting the wrapping `<svg>`
// element's `width` / `height`.
//
// Adapted from Lucide (https://lucide.dev) under the ISC License — paths are
// transcribed verbatim; only the wrapping `<svg>` element differs (we set
// width / height at render time and bind colors to currentColor).
//
// Why a curated SVG library instead of Unicode glyphs? Per spec, built-in
// capacity-icon names render identically across every output platform (web,
// CLI export, embedded SVG, etc.). Unicode emoji (`👤`, `⏱`) render in
// platform-specific fonts (Apple, Google, Microsoft, Linux), so the same DSL
// would produce visually inconsistent output. SVG paths are pixel-deterministic.
// Authors who *want* the host-platform emoji can use an inline literal
// (`capacity-icon:"👤"`) or declare a custom symbol via the `symbol` keyword.
//
// `multiplier` is intentionally absent from this map: U+00D7 MULTIPLICATION
// SIGN is a stable typographic operator with consistent rendering across every
// system font, so it renders as a `<text>` element instead of an SVG path.
export interface CapacityIconSvg {
    /** SVG viewBox attribute. All glyphs are normalized to a 24x24 box. */
    viewBox: string;
    /**
     * Inline SVG fragment — paths/circles/lines using `currentColor` for stroke
     * and `none` (or `currentColor`) for fill. The renderer wraps this in an
     * `<svg>` element whose `width`/`height` set the rendered size and whose
     * `color` (or an enclosing `text`/`g` color) drives the glyph color.
     */
    body: string;
    /** Visible 1-3 ASCII character fallback used when SVG output is constrained
     * to ASCII (e.g. terminal text-mode export). Must match the `Built-in glyph
     * table` in specs/rendering.md. */
    ascii: string;
}

export const CAPACITY_ICON_SVG: Record<string, CapacityIconSvg> = {
    // Lucide `user` — a single figure (head + shoulders).
    person: {
        viewBox: '0 0 24 24',
        body:
            '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ascii: 'p',
    },
    // Lucide `users` — paired figures (foreground + smaller silhouette behind).
    people: {
        viewBox: '0 0 24 24',
        body:
            '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M22 21v-2a4 4 0 0 0-3-3.87" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ascii: 'P',
    },
    // Lucide `star` — five-pointed star, filled with currentColor for visual weight.
    points: {
        viewBox: '0 0 24 24',
        body: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>',
        ascii: '*',
    },
    // Lucide `timer` — stopwatch silhouette (face circle, top crown line, hand).
    time: {
        viewBox: '0 0 24 24',
        body:
            '<line x1="10" x2="14" y1="2" y2="2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="12" x2="15" y1="14" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="12" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ascii: 't',
    },
};

// --- Renderer-internal built-in icons ---
//
// Glyphs from the curated library that the renderer reaches for outside the
// `capacity-icon:` path. Currently just `calendar`, used by the inline-date
// pin painter (`after:DATE` / `before:DATE` on items, parallels, and groups
// — see specs/rendering.md "Inline-date glyph"). The validator reserves
// `calendar` as a built-in name so authors can't shadow it via a `symbol`
// declaration (rule 17i).
//
// `BUILTIN_ICON_SVG` re-exports the capacity-icon entries plus these renderer-
// internal glyphs so callers walking the curated library by name don't have to
// know which path each glyph belongs to. The capacity-icon contract
// (`CAPACITY_ICON_SVG` exposes exactly the four `capacity-icon:` glyphs) stays
// intact for the m6/m7 sites that depend on it.

const RENDERER_BUILTIN_ICON_SVG: Record<string, CapacityIconSvg> = {
    // Lucide `calendar` — month grid (rounded rectangle body, two top tabs
    // for hanger pegs, a horizontal divider for the day-row separator).
    calendar: {
        viewBox: '0 0 24 24',
        body:
            '<rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="16" x2="16" y1="2" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="8" x2="8" y1="2" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<line x1="3" x2="21" y1="10" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ascii: 'd',
    },
};

/**
 * Union of every built-in glyph the renderer can paint by name: the
 * `capacity-icon:` set plus renderer-internal glyphs (currently `calendar`).
 * Use this when you need any built-in by name; use `CAPACITY_ICON_SVG` when
 * you specifically want the `capacity-icon:` subset.
 */
export const BUILTIN_ICON_SVG: Record<string, CapacityIconSvg> = {
    ...CAPACITY_ICON_SVG,
    ...RENDERER_BUILTIN_ICON_SVG,
};

/** Returns true when `name` is a renderer-curated capacity glyph. Useful for
 * differentiating built-ins from custom glyph declarations and inline literals
 * in the upcoming layout/render passes (m6/m7). */
export function hasCapacityIconSvg(name: string): boolean {
    return Object.hasOwn(CAPACITY_ICON_SVG, name);
}

/** ASCII fallbacks for every built-in capacity-icon name, including the ones
 * that render as text (`multiplier`) or render nothing (`none`). The spec's
 * `Built-in glyph table` is the source of truth — keep these in sync.
 *
 * `calendar` is intentionally absent: it is a renderer-internal glyph for
 * inline-date pins (not a `capacity-icon:` value), so it has no role in
 * capacity-suffix ASCII fallback.
 */
export const CAPACITY_ICON_ASCII: Record<string, string> = {
    none: '',
    multiplier: 'x',
    person: CAPACITY_ICON_SVG.person.ascii,
    people: CAPACITY_ICON_SVG.people.ascii,
    points: CAPACITY_ICON_SVG.points.ascii,
    time: CAPACITY_ICON_SVG.time.ascii,
};
