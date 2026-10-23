// The waves layer (specs/waves.md section 9): the hatch patterns that mark
// background work, the wave strip, tints, boundaries, labels, crossings and the
// legend. Every wave layer is emitted only when it has content, so a roadmap
// without waves renders byte-identically.

import type {
    BoundingBox,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTimelineScale,
    PositionedTrackChild,
    PositionedWave,
    PositionedWaveBoundary,
    PositionedWaveCrossing,
    PositionedWaveLegend,
    ResolvedStyle,
    Theme,
    WaveHatchKind,
} from '@nowline/layout';
import {
    CORNER_RADIUS_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    WAVE_BOUNDARY_WIDTH_PX,
    WAVE_CELL_INSET_PX,
    WAVE_CROSS_DASH,
    WAVE_HATCH_OPACITY,
    WAVE_HATCH_STROKE_PX,
    WAVE_HATCH_TILE_PX,
    WAVE_STRIP_LABEL_FONT_SIZE_PX,
    WAVE_STYLED_STRIP_MIX_OPACITY,
    WAVE_STYLED_TINT_OPACITY,
} from '@nowline/layout';
import { renderInlineDatePins } from './item.js';
import { intersectBox } from './primitives.js';
import type { FontFamilies } from './render.js';
import { escText, num, tag, textTag } from './xml.js';

// --- Waves (specs/waves.md §9) ---------------------------------------------
//
// Every wave layer is emitted only when it has content, so a roadmap without
// waves renders byte-identically: no `wave-*` layers and no hatch `<defs>`.

/** Strip label baseline below the strip's vertical centre (10 px text). */
const WAVE_LABEL_BASELINE_BELOW_CENTER_PX = 4;

/** Footnote superscripts in the strip: size and baseline below the strip top. */
const WAVE_SUPERSCRIPT_FONT_SIZE_PX = 8;
const WAVE_SUPERSCRIPT_BASELINE_OFFSET_PX = 10;

function waveHatchUrl(idPrefix: string, kind: WaveHatchKind): string {
    return `url(#${idPrefix}-wave-hatch-${kind})`;
}

/**
 * A hatch `<pattern>`: a `WAVE_HATCH_TILE_PX` tile rotated 45°, one
 * `WAVE_HATCH_STROKE_PX` stroke down its middle (so the tile never clips
 * it) at `WAVE_HATCH_OPACITY`. The id carries the SVG's prefix, like the
 * shadow filters, so two SVGs on one page never share it.
 *
 * The line carries `opacity`, not `stroke-opacity`. Browsers and resvg draw
 * the two the same (one stroke, nothing overlaps), but svg-to-pdfkit turns
 * `stroke-opacity` into a stroke-only `CA` inside the pattern cell, which
 * poppler ignores, so the PDF hatch drew opaque. With `opacity` it sets the
 * fill alpha `ca` as well, which poppler and cairo both honour.
 */
export function waveHatchPatternDef(idPrefix: string, kind: WaveHatchKind, palette: Theme): string {
    const tile = WAVE_HATCH_TILE_PX;
    return tag(
        'pattern',
        {
            id: `${idPrefix}-wave-hatch-${kind}`,
            width: tile,
            height: tile,
            patternUnits: 'userSpaceOnUse',
            patternTransform: 'rotate(45)',
        },
        tag('line', {
            x1: num(tile / 2),
            y1: 0,
            x2: num(tile / 2),
            y2: tile,
            stroke: kind === 'dark' ? palette.wave.hatch : palette.wave.hatchOnDark,
            'stroke-width': WAVE_HATCH_STROKE_PX,
            opacity: WAVE_HATCH_OPACITY,
        }),
    );
}

/**
 * The hatch patterns the SVG uses, in a fixed order: one per kind that a
 * background bar (main lanes or isolated regions) or the legend's hatch
 * swatch needs, as layout resolved them (`waveHatch`, `hatch`). Empty
 * without waves.
 */
export function usedWaveHatchKinds(model: PositionedRoadmap): WaveHatchKind[] {
    if (!model.waves) return [];
    const used = new Set<WaveHatchKind>();
    const walk = (children: PositionedTrackChild[]): void => {
        for (const c of children) {
            if (c.kind === 'item') {
                if (c.waveRole === 'background' && c.waveHatch) used.add(c.waveHatch);
            } else {
                walk(c.children);
            }
        }
    };
    const walkLanes = (lanes: PositionedSwimlane[]): void => {
        for (const lane of lanes) {
            walk(lane.children);
            walkLanes(lane.nested);
        }
    };
    walkLanes(model.swimlanes);
    for (const r of model.includes) walkLanes(r.nestedSwimlanes);
    for (const e of model.waveLegend?.entries ?? []) {
        used.add(e.hatch);
    }
    return (['dark', 'light'] as const).filter((k) => used.has(k));
}

/**
 * The hatch overlay over a background bar: the bar's rect inset by half its
 * 1 px stroke, with the same corner radius, so it never covers the stroke.
 * `kind` is the bar's hatch kind as layout resolved it.
 */
export function hatchOverlay(
    box: BoundingBox,
    style: ResolvedStyle,
    kind: WaveHatchKind,
    idPrefix: string,
): string {
    const inset = 0.5;
    const rx = Math.min(CORNER_RADIUS_PX[style.cornerRadius] ?? 4, box.height / 2);
    return tag('rect', {
        x: num(box.x + inset),
        y: num(box.y + inset),
        width: num(Math.max(0, box.width - 2 * inset)),
        height: num(Math.max(0, box.height - 2 * inset)),
        rx: num(rx),
        ry: num(rx),
        fill: waveHatchUrl(idPrefix, kind),
    });
}

/** The strip's backing panel corner radius (matches the tick panel's). */
const WAVE_STRIP_PANEL_RADIUS_PX = 4;

/**
 * Corner radii of a cell's left and right ends: a cell that reaches an end
 * of the backing panel rounds its outer corners there to the panel's radius
 * less the inset, so it never covers the panel's rounded corner or border.
 */
interface WaveCellCorners {
    left: number;
    right: number;
}

function waveCellCorners(cell: BoundingBox, t: PositionedTimelineScale): WaveCellCorners {
    const r = Math.min(
        WAVE_STRIP_PANEL_RADIUS_PX - WAVE_CELL_INSET_PX,
        cell.width / 2,
        cell.height / 2,
    );
    const eps = 1e-6;
    return {
        left: cell.x <= t.box.x + WAVE_CELL_INSET_PX + eps ? r : 0,
        right: cell.x + cell.width >= t.box.x + t.box.width - WAVE_CELL_INSET_PX - eps ? r : 0,
    };
}

/** A box as a path with the given left / right corner radii. */
function roundedEndsPath(box: BoundingBox, c: WaveCellCorners): string {
    const { x, y, width: w, height: h } = box;
    const arc = (r: number, ex: number, ey: number): string =>
        r > 0 ? ` A${num(r)} ${num(r)} 0 0 1 ${num(ex)} ${num(ey)}` : '';
    return (
        `M${num(x + c.left)} ${num(y)}` +
        ` H${num(x + w - c.right)}` +
        arc(c.right, x + w, y + c.right) +
        ` V${num(y + h - c.right)}` +
        arc(c.right, x + w - c.right, y + h) +
        ` H${num(x + c.left)}` +
        arc(c.left, x, y + h - c.left) +
        ` V${num(y + c.left)}` +
        arc(c.left, x + c.left, y) +
        ' Z'
    );
}

/**
 * A cell's fill: the strip fill, then the styled `bg` overlay when set.
 * Square rects, unless `corners` rounds an end that meets the panel's.
 */
function waveCellFill(w: PositionedWave, box: BoundingBox, corners?: WaveCellCorners): string {
    const shape = (fill: Record<string, string | number>): string =>
        corners && (corners.left > 0 || corners.right > 0)
            ? tag('path', { d: roundedEndsPath(box, corners), ...fill })
            : tag('rect', {
                  x: num(box.x),
                  y: num(box.y),
                  width: num(box.width),
                  height: num(box.height),
                  ...fill,
              });
    const base = shape({ fill: w.style.stripFill });
    if (!w.style.tint) return base;
    return (
        base +
        shape({
            fill: w.style.tint,
            'fill-opacity': WAVE_STYLED_STRIP_MIX_OPACITY,
        })
    );
}

/**
 * `wave-strip` (§9.1): the backing panel and one cell per non-empty wave,
 * each with its tooltip. Drawn right after the timeline panels, so the
 * major grid lines cross the cells as they cross the tick panel.
 */
export function renderWaveStrip(model: PositionedRoadmap, palette: Theme): string {
    const t = model.timeline;
    const strip = t.waveStrip;
    if (!model.waves || !strip) return '';
    const parts: string[] = [
        tag('rect', {
            x: num(t.box.x),
            y: num(strip.y),
            width: num(t.box.width),
            height: num(strip.height),
            rx: WAVE_STRIP_PANEL_RADIUS_PX,
            ry: WAVE_STRIP_PANEL_RADIUS_PX,
            fill: palette.timeline.panelFill,
            stroke: palette.timeline.border,
            'stroke-width': 1,
        }),
    ];
    for (const w of model.waves) {
        // The cell layout clipped to the panel; none for an empty or
        // off-screen wave.
        const box = w.strip.cell;
        if (!box) continue;
        parts.push(
            tag(
                'g',
                { 'data-id': w.id },
                `<title>${escText(w.strip.tooltip)}</title>${waveCellFill(w, box, waveCellCorners(box, t))}`,
            ),
        );
    }
    return tag('g', { 'data-layer': 'wave-strip' }, parts.join(''));
}

/**
 * `wave-bg` (§9.4): a column tint over each styled wave's `columnBox`,
 * clipped to `clip` when given (an include region's painted rect).
 */
export function renderWaveTints(waves: PositionedWave[], clip?: BoundingBox): string {
    const parts: string[] = [];
    for (const w of waves) {
        if (!w.style.tint || w.empty) continue;
        const box = clip ? intersectBox(w.columnBox, clip) : w.columnBox;
        if (!box || box.width <= 0 || box.height <= 0) continue;
        parts.push(
            tag('rect', {
                x: num(box.x),
                y: num(box.y),
                width: num(box.width),
                height: num(box.height),
                fill: w.style.tint,
                'fill-opacity': WAVE_STYLED_TINT_OPACITY,
            }),
        );
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'wave-bg' }, parts.join(''));
}

/**
 * `wave-boundary` (§9.2): the 2 px boundary lines, from the strip top to the
 * last lane. With `clip`, only the lines strictly inside it, cut to its
 * vertical extent.
 */
export function renderWaveBoundaries(
    boundaries: PositionedWaveBoundary[] | undefined,
    clip?: BoundingBox,
): string {
    const parts: string[] = [];
    for (const b of boundaries ?? []) {
        let topY = b.topY;
        let bottomY = b.bottomY;
        if (clip) {
            if (b.x <= clip.x || b.x >= clip.x + clip.width) continue;
            topY = Math.max(topY, clip.y);
            bottomY = Math.min(bottomY, clip.y + clip.height);
            if (bottomY <= topY) continue;
        }
        parts.push(
            tag('line', {
                x1: num(b.x),
                y1: num(topY),
                x2: num(b.x),
                y2: num(bottomY),
                stroke: b.stroke,
                'stroke-width': WAVE_BOUNDARY_WIDTH_PX,
                'stroke-dasharray': b.dash,
            }),
        );
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'wave-boundary' }, parts.join(''));
}

/**
 * `wave-labels` (§9.1): strip labels on halos in their cell's fill,
 * right-aligned footnote superscripts, empty-wave diamonds, gap floor
 * labels, and the all-empty placeholder. Drawn after the boundaries.
 */
export function renderWaveLabels(
    model: PositionedRoadmap,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const t = model.timeline;
    const strip = t.waveStrip;
    if (!model.waves || !strip) return '';
    const baselineY = strip.y + strip.height / 2 + WAVE_LABEL_BASELINE_BELOW_CENTER_PX;
    const parts: string[] = [];
    // Muted italics on a halo in the backing panel's fill, so the major
    // grid lines drawn later never cut through the text (§9.1). Layout
    // placed the halo.
    const mutedText = (x: number, text: string, halo: BoundingBox): string => {
        return (
            tag('rect', {
                x: num(halo.x),
                y: num(halo.y),
                width: num(halo.width),
                height: num(halo.height),
                fill: palette.timeline.panelFill,
            }) +
            textTag(
                {
                    x: num(x),
                    y: num(baselineY),
                    'font-family': fonts.sans,
                    'font-size': WAVE_STRIP_LABEL_FONT_SIZE_PX,
                    'font-style': 'italic',
                    fill: palette.wave.labelMuted,
                    'text-anchor': 'middle',
                },
                text,
            )
        );
    };

    for (const w of model.waves) {
        // A gap opened by a start floor: no cell, the floor reference in
        // muted italics on a halo in the backing panel's fill.
        if (w.strip.gapLabel) {
            const { text, x, halo } = w.strip.gapLabel;
            parts.push(mutedText(x, text, halo));
        }

        // Layout placed the label and superscript halos in the painted
        // cell; a wave without one draws neither.
        if (!w.strip.cell) continue;
        const { labelDraw, superscripts, inlineDatePin } = w.strip;
        if (inlineDatePin) parts.push(renderInlineDatePins([inlineDatePin], w.style.text));
        if (superscripts) {
            // The superscripts' own halo in the cell's fill, first so the
            // label's halo never covers them.
            parts.push(waveCellFill(w, superscripts.halo));
        }
        if (w.strip.label !== undefined && labelDraw) {
            // Centred on the visible span, but never under the superscripts.
            parts.push(waveCellFill(w, labelDraw.halo));
            parts.push(
                textTag(
                    {
                        x: num(labelDraw.x),
                        y: num(baselineY),
                        'font-family': fonts.sans,
                        'font-size': WAVE_STRIP_LABEL_FONT_SIZE_PX,
                        'font-weight': 600,
                        fill: w.style.text,
                        'text-anchor': 'middle',
                    },
                    w.strip.label,
                ),
            );
        }
        if (superscripts) {
            // Right-aligned in the cell, walking left like an item's.
            let fx = superscripts.rightX;
            for (let k = w.footnoteIndicators.length - 1; k >= 0; k--) {
                parts.push(
                    textTag(
                        {
                            x: num(fx),
                            y: num(strip.y + WAVE_SUPERSCRIPT_BASELINE_OFFSET_PX),
                            'font-family': fonts.sans,
                            'font-size': WAVE_SUPERSCRIPT_FONT_SIZE_PX,
                            'font-weight': 700,
                            fill: w.style.text,
                            'text-anchor': 'end',
                        },
                        String(w.footnoteIndicators[k]),
                    ),
                );
                fx -= ITEM_FOOTNOTE_INDICATOR_STEP_PX;
            }
        }
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'wave-labels' }, parts.join(''));
}

/**
 * `wave-cross` (§9.3): a 1 px dashed boundary over each background bar a
 * boundary runs through, showing the barrier does not hold that work.
 */
export function renderWaveCrossings(crossings: PositionedWaveCrossing[] | undefined): string {
    if (!crossings || crossings.length === 0) return '';
    const parts = crossings.map((c) =>
        tag('line', {
            x1: num(c.x),
            y1: num(c.topY),
            x2: num(c.x),
            y2: num(c.bottomY),
            stroke: c.stroke,
            'stroke-width': 1,
            'stroke-dasharray': WAVE_CROSS_DASH,
        }),
    );
    return tag('g', { 'data-layer': 'wave-cross' }, parts.join(''));
}

/** The legend's hatch swatch fill: a default item bar. */
function legendSwatchFill(palette: Theme): string {
    const bg = palette.entities.item.bg;
    return bg === 'none' ? 'transparent' : bg;
}

/**
 * `wave-legend` (§9.5): the hatched bar swatch for background work and its
 * text, as the layout placed them.
 */
export function renderWaveLegend(
    legend: PositionedWaveLegend | undefined,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    if (!legend) return '';
    const parts: string[] = [];
    for (const entry of legend.entries) {
        const s = entry.swatch;
        const fill = legendSwatchFill(palette);
        const geometry = {
            x: num(s.x),
            y: num(s.y),
            width: num(s.width),
            height: num(s.height),
        };
        parts.push(
            tag('rect', {
                ...geometry,
                rx: 2,
                ry: 2,
                fill,
                stroke: palette.entities.item.fg,
                'stroke-width': 1,
            }),
        );
        parts.push(
            tag('rect', {
                x: num(s.x + 0.5),
                y: num(s.y + 0.5),
                width: num(s.width - 1),
                height: num(s.height - 1),
                rx: 2,
                ry: 2,
                fill: waveHatchUrl(idPrefix, entry.hatch),
            }),
        );
        for (const run of entry.runs) {
            parts.push(
                textTag(
                    {
                        x: num(run.x),
                        y: num(run.y),
                        'font-family': fonts.sans,
                        'font-size': WAVE_STRIP_LABEL_FONT_SIZE_PX,
                        fill: palette.wave.labelText,
                    },
                    run.text,
                ),
            );
        }
    }
    return tag('g', { 'data-layer': 'wave-legend' }, parts.join(''));
}
