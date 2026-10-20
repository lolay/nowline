// Shared drawing primitives: the typography and stroke helpers every layer of
// the SVG renderer draws with, plus the rectangle frame and the box
// intersection the item, wave and non-working-band layers share. Nothing here
// knows about a particular roadmap element.

import type { BoundingBox, ResolvedStyle } from '@nowline/layout';
import { CORNER_RADIUS_PX, TEXT_SIZE_PX } from '@nowline/layout';
import type { FontFamilies } from './render.js';
import { num, tag } from './xml.js';

// `TEXT_SIZE_PX`, `CORNER_RADIUS_PX`, `FONT_STACK` come from
// `@nowline/layout` (themes/shared) so a typography or radius change
// flows from one place to both layout and renderer.
//
// `WEIGHT_NUM` lives here only because no DSL `weight` table exists in
// shared yet. If/when it does, hoist this alongside `FONT_STACK`.
const WEIGHT_NUM: Record<string, number> = {
    thin: 100,
    light: 300,
    normal: 400,
    bold: 700,
};

// `style.textSize` is `SizeBucket` which includes `'full'`; the shared
// `TEXT_SIZE_PX` table only carries the size buckets (no `'full'` —
// that's a corner-radius-only value). Widen the lookup so a stray
// `'full'` falls through to the `?? 14` fallback instead of compiling.
function textSizePx(bucket: ResolvedStyle['textSize']): number {
    return (TEXT_SIZE_PX as Record<string, number>)[bucket] ?? 14;
}

export function fontAttrs(
    style: ResolvedStyle,
    fonts: FontFamilies,
    overrideSize?: number,
): Record<string, string | number> {
    return {
        'font-family': fonts[style.font],
        'font-size': overrideSize ?? textSizePx(style.textSize),
        'font-weight': WEIGHT_NUM[style.weight] ?? 400,
        'font-style': style.italic ? 'italic' : 'normal',
        fill: style.text,
    };
}

function strokeDash(style: ResolvedStyle): string | undefined {
    if (style.border === 'dashed') return '4 3';
    if (style.border === 'dotted') return '1 3';
    return undefined;
}

export function rectFrame(
    x: number,
    y: number,
    w: number,
    h: number,
    style: ResolvedStyle,
    extra: Record<string, string | number | undefined | null | boolean> = {},
): string {
    // The radius is a maximum: a frame narrower than two radii, such as a
    // short bar drawn at its true width, rounds into a pill, then a line.
    const rx = Math.min(CORNER_RADIUS_PX[style.cornerRadius] ?? 4, h / 2, w / 2);
    return tag('rect', {
        x: num(x),
        y: num(y),
        width: num(w),
        height: num(h),
        rx: num(rx),
        ry: num(rx),
        fill: style.bg === 'none' ? 'transparent' : style.bg,
        stroke: style.fg,
        'stroke-width': 1,
        'stroke-dasharray': strokeDash(style) ?? null,
        ...extra,
    });
}

/** `a ∩ b`, or undefined when they do not overlap. */
export function intersectBox(a: BoundingBox, b: BoundingBox): BoundingBox | undefined {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    if (x2 <= x1 || y2 <= y1) return undefined;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
