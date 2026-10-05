// Positioned waves (specs/waves.md §8.7, §9.1-§9.5): the solved spans engine
// A's barrier driver settled on, in declaration order, plus everything the
// renderer draws for them: strip cells (label fit chain, tooltip, empty-wave
// diamonds, gap labels, the all-empty placeholder), styled colours, boundary
// lines, crossings over background bars, and the legend.
//
// Built from the frozen `WaveLayoutState` after the post-layout extent growth
// and the marker-row `deltaY` shift, so the dates read the final scale and
// every y is final. Growth only extends the domain end (origin and
// pixels-per-day are unchanged), so the spans' x never move.

import type { StyleProperty } from '@nowline/core';
import { propValue } from '../dsl-utils.js';
import { type LocaleStrings, wavesDeclaredPlaceholder } from '../i18n.js';
import { ITEM_FOOTNOTE_INDICATOR_STEP_PX } from '../item-bar-geometry.js';
import type { LayoutContext } from '../layout-context.js';
import { estimateTextWidth } from '../text-measure.js';
import { contrastRatio, hexToRgb } from '../themes/contrast.js';
import { resolveColor } from '../themes/index.js';
import type { Theme } from '../themes/shape.js';
import {
    GUTTER_PX,
    WAVE_EMPTY_MARKER_STEP_PX,
    WAVE_LEGEND_BASELINE_OFFSET_PX,
    WAVE_LEGEND_ENTRY_GAP_PX,
    WAVE_LEGEND_LINE_PX,
    WAVE_LEGEND_SWATCH_GAP_PX,
    WAVE_LEGEND_SWATCH_HEIGHT_PX,
    WAVE_LEGEND_SWATCH_WIDTH_PX,
    WAVE_STRIP_LABEL_FONT_SIZE_PX,
    WAVE_STRIP_LABEL_PAD_PX,
    WAVE_STYLED_STRIP_MIX_OPACITY,
} from '../themes/shared.js';
import type {
    PositionedIncludeRegion,
    PositionedItem,
    PositionedSwimlane,
    PositionedTrackChild,
    PositionedWave,
    PositionedWaveBoundary,
    PositionedWaveCrossing,
    PositionedWaveLegend,
    PositionedWaveStyle,
    WaveLegendEntry,
} from '../types.js';
import { summarizeWaves } from '../wave-barrier.js';
import { dateAtX, WAVE_EDGE_TOLERANCE_PX, type WaveLayoutState } from '../wave-layout.js';
import { MARKER_BOLD_WIDTH_FACTOR } from './marker-geometry.js';

/** WCAG AA floor for the strip label against its composited cell fill. */
const WAVE_LABEL_MIN_CONTRAST = 4.5;

/** Everything `buildWaves` produces; the caller attaches it to the model. */
export interface BuiltWaves {
    waves: PositionedWave[];
    /** Boundary lines, left to right (empty when every wave is empty). */
    boundaries: PositionedWaveBoundary[];
    /** Crossings over the main lanes' background bars. */
    crossings: PositionedWaveCrossing[];
    /** Crossings over each isolated region's background bars, parallel to `includes`. */
    regionCrossings: PositionedWaveCrossing[][];
    /** True when any placed item (main lanes or regions) is background work. */
    hasBackground: boolean;
    /** The strip placeholder, set only when every wave is empty. */
    placeholder?: string;
}

/**
 * Build the positioned waves, boundaries and crossings. `state` must be
 * frozen: its `pass` is the pass that ran with the solved `S`/`E`, so its
 * member counts cover the main lanes and the first-level regions exactly
 * once (later placements never accumulate). `ctx.timeline.waveStrip` must
 * be set (it is whenever the roadmap declares waves).
 */
export function buildWaves(
    state: WaveLayoutState,
    ctx: LayoutContext,
    strings: LocaleStrings,
    swimlanes: PositionedSwimlane[],
    includes: PositionedIncludeRegion[],
): BuiltWaves {
    if (!state.frozen || !state.solve) {
        throw new Error('buildWaves: the wave barrier has not settled');
    }
    const strip = ctx.timeline.waveStrip;
    if (!strip) throw new Error('buildWaves: the timeline has no wave strip');
    const spans = summarizeWaves(
        state.plan,
        state.solve,
        state.pass,
        state.origin,
        state.floors,
        WAVE_EDGE_TOLERANCE_PX,
    );
    const allEmpty = spans.every((s) => s.memberCount === 0);
    // The visible part of a span is its overlap with the timeline.
    const visLeft = ctx.timeline.box.x;
    const visRight = visLeft + ctx.timeline.box.width;
    const stripMidY = strip.y + strip.height / 2;
    // Empty-wave diamonds placed so far, by their unstepped x.
    const emptyXs: number[] = [];
    let ordinal = 0;

    const waves = spans.map((span, i): PositionedWave => {
        const decl = state.plan.waves[i];
        const title = decl.title ?? span.id;
        const empty = span.memberCount === 0;
        const startDate = dateAtX(span.start, ctx);
        const endDate = dateAtX(span.end, ctx);
        const visibleOrdinal = empty ? undefined : ordinal++;
        const footnoteIndicators = waveFootnoteIndicators(span.id, ctx);
        const style = waveStyle(decl.properties, visibleOrdinal, ctx);

        const cellLeft = Math.max(span.start, visLeft);
        const cellRight = Math.min(span.end, visRight);
        const visibleWidth = Math.max(0, cellRight - cellLeft);

        // Fit chain (§9.1): try every candidate beside the footnote
        // superscripts; when none fits with them, the superscripts move
        // to the legend and the chain runs again on the label alone.
        let fit: LabelFit | undefined;
        let footnotesShown = false;
        if (!empty) {
            if (footnoteIndicators.length > 0) {
                const superscriptWidth =
                    footnoteIndicators.length * ITEM_FOOTNOTE_INDICATOR_STEP_PX;
                fit = fitStripLabel(title, span.id, i + 1, visibleWidth, superscriptWidth);
                footnotesShown = fit !== undefined;
            }
            fit ??= fitStripLabel(title, span.id, i + 1, visibleWidth, 0);
        }

        let labelX = (cellLeft + cellRight) / 2;
        let marker: PositionedWave['strip']['marker'];
        if (empty) {
            labelX = span.start;
            if (!allEmpty) {
                const sameX = emptyXs.filter(
                    (x) => Math.abs(x - span.start) < WAVE_EDGE_TOLERANCE_PX,
                ).length;
                emptyXs.push(span.start);
                labelX = span.start + sameX * WAVE_EMPTY_MARKER_STEP_PX;
                marker = { x: labelX, y: stripMidY };
            }
        }

        const range = empty ? isoDay(startDate) : `${isoDay(startDate)} – ${isoDay(endDate)}`;
        const tooltipParts = [title, range];
        if (empty) tooltipParts.push(strings.waveNoItems);
        else if (span.heldBy !== undefined) {
            tooltipParts.push(`${strings.waveHeldBy} ${span.heldBy}`);
        }

        // A gap (S_k > E_{k-1}) shows the floor reference that opened it.
        let gapLabel: PositionedWave['strip']['gapLabel'];
        const prior = spans[i - 1];
        if (
            !allEmpty &&
            prior !== undefined &&
            span.floorRef !== undefined &&
            span.start - prior.end > WAVE_EDGE_TOLERANCE_PX
        ) {
            const gapLeft = Math.max(prior.end, visLeft);
            const gapRight = Math.min(span.start, visRight);
            const textWidth = estimateTextWidth(span.floorRef, WAVE_STRIP_LABEL_FONT_SIZE_PX);
            if (textWidth + 2 * WAVE_STRIP_LABEL_PAD_PX <= gapRight - gapLeft) {
                gapLabel = { text: span.floorRef, x: (gapLeft + gapRight) / 2 };
            }
        }

        return {
            id: span.id,
            title,
            index: i,
            ...(visibleOrdinal !== undefined ? { visibleOrdinal } : {}),
            startX: span.start,
            endX: span.end,
            startDate,
            endDate,
            memberCount: span.memberCount,
            empty,
            ...(span.heldBy !== undefined ? { heldBy: span.heldBy } : {}),
            ...(span.floorRef !== undefined ? { floorRef: span.floorRef } : {}),
            columnBox: {
                x: span.start,
                y: ctx.chartTopY,
                width: span.end - span.start,
                height: ctx.swimlaneBottomY - ctx.chartTopY,
            },
            strip: {
                box: {
                    x: span.start,
                    y: strip.y,
                    width: span.end - span.start,
                    height: strip.height,
                },
                ...(fit ? { label: fit.label } : {}),
                labelKind: fit?.kind ?? 'none',
                labelX,
                tooltip: tooltipParts.join(' · '),
                footnotesShown,
                ...(marker ? { marker } : {}),
                ...(gapLabel ? { gapLabel } : {}),
            },
            style,
            footnoteIndicators,
        };
    });

    const boundaries = allEmpty ? [] : buildBoundaries(waves, state.origin, strip.y, ctx);
    const mainBackground = backgroundItems(swimlanes);
    const regionBackground = includes.map((inc) => backgroundItems(inc.nestedSwimlanes));
    // The renderer has no locale table: hand it the background tooltip.
    for (const item of [...mainBackground, ...regionBackground.flat()]) {
        item.waveTooltip = strings.waveBackgroundItem;
    }
    const built: BuiltWaves = {
        waves,
        boundaries,
        crossings: crossingsOver(mainBackground, boundaries),
        regionCrossings: regionBackground.map((items) => crossingsOver(items, boundaries)),
        hasBackground: mainBackground.length + regionBackground.flat().length > 0,
    };
    if (allEmpty) {
        built.placeholder = wavesDeclaredPlaceholder(
            strings,
            waves.map((w) => w.title),
        );
    }
    return built;
}

interface LabelFit {
    kind: 'title' | 'id' | 'ellipsis' | 'ordinal';
    label: string;
}

/**
 * The first strip label candidate that fits (§9.1): the title, the id, the
 * title ellipsized to 3 or more characters plus "…", then the 1-based
 * `#k`. The test is the bold 10 px width estimate plus `extraWidth` (the
 * footnote superscripts) plus 6 px padding on each side. Undefined: no
 * label.
 */
export function fitStripLabel(
    title: string,
    id: string,
    ordinal: number,
    visibleWidth: number,
    extraWidth: number,
): LabelFit | undefined {
    const fits = (text: string): boolean =>
        estimateTextWidth(text, WAVE_STRIP_LABEL_FONT_SIZE_PX) * MARKER_BOLD_WIDTH_FACTOR +
            extraWidth +
            2 * WAVE_STRIP_LABEL_PAD_PX <=
        visibleWidth;
    if (fits(title)) return { kind: 'title', label: title };
    if (id !== title && fits(id)) return { kind: 'id', label: id };
    for (let n = title.length - 1; n >= 3; n--) {
        const prefix = title.slice(0, n).trimEnd();
        if (prefix.length < 3) break;
        const text = `${prefix}…`;
        if (fits(text)) return { kind: 'ellipsis', label: text };
    }
    const hash = `#${ordinal}`;
    if (fits(hash)) return { kind: 'ordinal', label: hash };
    return undefined;
}

/** Footnotes whose `on:` names the wave, as 1-based numbers, ascending. */
function waveFootnoteIndicators(id: string, ctx: LayoutContext): number[] {
    const out: number[] = [];
    for (const [fid, hosts] of ctx.footnoteHosts.entries()) {
        if (!hosts.includes(id)) continue;
        const n = ctx.footnoteIndex.get(fid);
        if (n !== undefined) out.push(n);
    }
    return out.sort((a, b) => a - b);
}

/**
 * A wave's colours (§9.4). Only the named `style:` applies (there is no
 * `default wave`), and of it only `bg`, `fg`, `text` and `border`. The
 * style is read raw.
 */
function waveStyle(
    properties: Parameters<typeof propValue>[0],
    visibleOrdinal: number | undefined,
    ctx: LayoutContext,
): PositionedWaveStyle {
    const theme = ctx.styleCtx.theme;
    const raw = new Map<string, string>();
    const styleId = propValue(properties, 'style');
    const decl = styleId ? ctx.styleCtx.styles.get(styleId) : undefined;
    for (const p of (decl?.properties ?? []) as StyleProperty[]) {
        const key = p.key.endsWith(':') ? p.key.slice(0, -1) : p.key;
        raw.set(key, p.value);
    }
    const color = (key: string): string | undefined => {
        const v = raw.get(key);
        if (v === undefined) return undefined;
        const c = resolveColor(v, theme);
        return c === 'none' ? undefined : c;
    };
    const tint = color('bg');
    const stripFill =
        visibleOrdinal !== undefined && visibleOrdinal % 2 === 1
            ? theme.wave.stripFillAlt
            : theme.wave.stripFill;
    // The cell the label sits on: the strip fill under the tint overlay.
    const cellFill = tint
        ? (mixHex(stripFill, tint, WAVE_STYLED_STRIP_MIX_OPACITY) ?? stripFill)
        : stripFill;
    const border = raw.get('border');
    return {
        ...(tint ? { tint } : {}),
        stripFill,
        text: color('text') ?? readableLabelText(theme.wave, cellFill),
        boundary: color('fg') ?? theme.wave.boundary,
        boundaryDash: border === 'dashed' ? '4 2' : border === 'dotted' ? '1 2' : null,
    };
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `top` composited over `base` at `alpha`, as `#rrggbb`; undefined unless both are hex. */
function mixHex(base: string, top: string, alpha: number): string | undefined {
    if (!HEX_RE.test(base) || !HEX_RE.test(top)) return undefined;
    const b = hexToRgb(base);
    const t = hexToRgb(top);
    return `#${b
        .map((v, i) =>
            Math.round(v * (1 - alpha) + t[i] * alpha)
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
}

/**
 * `wave.labelText` when it reaches 4.5:1 against `fill` (or either colour is
 * not hex), else whichever of the theme's dark (`hatch`) and light
 * (`hatchOnDark`) strokes contrasts more.
 */
export function readableLabelText(
    wave: Pick<Theme['wave'], 'labelText' | 'hatch' | 'hatchOnDark'>,
    fill: string,
): string {
    const preferred = wave.labelText;
    if (!HEX_RE.test(preferred) || !HEX_RE.test(fill)) return preferred;
    if (contrastRatio(preferred, fill) >= WAVE_LABEL_MIN_CONTRAST) return preferred;
    return contrastRatio(wave.hatch, fill) >= contrastRatio(wave.hatchOnDark, fill)
        ? wave.hatch
        : wave.hatchOnDark;
}

/**
 * One line at every distinct x in `{S_k} ∪ {E_k}` of the non-empty waves,
 * except the origin (§9.2): contiguous waves share a line, a gap gives two,
 * and an empty wave adds none of its own. A wave's opening line uses its
 * own style; a closing line that opens nothing (a gap, or `E_n`) uses the
 * closing wave's.
 */
function buildBoundaries(
    waves: PositionedWave[],
    origin: number,
    topY: number,
    ctx: LayoutContext,
): PositionedWaveBoundary[] {
    const edges: Array<{ x: number; wave: PositionedWave; opening: boolean }> = [];
    for (const w of waves) {
        if (w.empty) continue;
        edges.push({ x: w.startX, wave: w, opening: true });
        edges.push({ x: w.endX, wave: w, opening: false });
    }
    edges.sort((a, b) => a.x - b.x);
    const out: PositionedWaveBoundary[] = [];
    let i = 0;
    while (i < edges.length) {
        let j = i;
        while (j < edges.length && edges[j].x - edges[i].x < WAVE_EDGE_TOLERANCE_PX) j++;
        const group = edges.slice(i, j);
        i = j;
        const x = group[0].x;
        if (Math.abs(x - origin) < WAVE_EDGE_TOLERANCE_PX) continue;
        const owner = (group.find((e) => e.opening) ?? group[0]).wave;
        out.push({
            x,
            topY,
            bottomY: ctx.swimlaneBottomY,
            stroke: owner.style.boundary,
            dash: owner.style.boundaryDash,
        });
    }
    return out;
}

/** Background items (`waveRole: 'background'`) in lane and document order. */
function backgroundItems(lanes: PositionedSwimlane[]): PositionedItem[] {
    const out: PositionedItem[] = [];
    const walk = (children: PositionedTrackChild[]): void => {
        for (const child of children) {
            if (child.kind === 'item') {
                if (child.waveRole === 'background') out.push(child);
            } else {
                walk(child.children);
            }
        }
    };
    for (const lane of lanes) {
        walk(lane.children);
        out.push(...backgroundItems(lane.nested));
    }
    return out;
}

/**
 * A crossing for every boundary strictly inside a background bar's visual
 * extent (§9.3). Item boxes are visual (inset from the logical edges), so a
 * boundary at a bar's logical edge falls in the inset and gets none.
 */
function crossingsOver(
    items: PositionedItem[],
    boundaries: PositionedWaveBoundary[],
): PositionedWaveCrossing[] {
    const out: PositionedWaveCrossing[] = [];
    for (const item of items) {
        const left = item.box.x;
        const right = item.box.x + item.box.width;
        for (const b of boundaries) {
            if (left < b.x && b.x < right) {
                out.push({
                    x: b.x,
                    topY: item.box.y,
                    bottomY: item.box.y + item.box.height,
                    stroke: b.stroke,
                });
            }
        }
    }
    return out;
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function superscript(n: number): string {
    return String(n).replace(/[0-9]/g, (d) => SUPERSCRIPT_DIGITS[Number(d)]);
}

/**
 * The wave legend (§9.5), or undefined when none of its triggers holds:
 * background work, a label that is not its full title, dropped footnote
 * indicators, or an empty wave. Entries: the hatch swatch (background
 * work), the boundary swatch (when any boundary is drawn), and the wave
 * names (when a label is abbreviated, a wave is empty, or a wave's
 * footnotes moved here). Lines are `WAVE_LEGEND_LINE_PX` high from `topY`
 * at the chart origin, wrapped at entry boundaries (the wave list also
 * between waves) to the canvas width less the gutter.
 */
export function buildWaveLegend(
    built: BuiltWaves,
    ctx: LayoutContext,
    strings: LocaleStrings,
    topY: number,
): PositionedWaveLegend | undefined {
    const { waves } = built;
    const abbreviated = waves.some((w) => !w.empty && w.strip.labelKind !== 'title');
    const anyEmpty = waves.some((w) => w.empty);
    const dropped = waves.some((w) => w.footnoteIndicators.length > 0 && !w.strip.footnotesShown);
    if (!built.hasBackground && !abbreviated && !anyEmpty && !dropped) return undefined;

    const fontSize = WAVE_STRIP_LABEL_FONT_SIZE_PX;
    const textWidth = (text: string): number => estimateTextWidth(text, fontSize);
    const left = ctx.timeline.originX;
    const maxRight = Math.max(left, ctx.chartRightX - GUTTER_PX);
    let line = 0;
    let cursor = left;
    let lineUsed = false;
    let widest = 0;
    const baseline = (l: number): number =>
        topY + l * WAVE_LEGEND_LINE_PX + WAVE_LEGEND_BASELINE_OFFSET_PX;
    // Start a unit `width` wide: on this line after the entry gap, or on a
    // fresh line when it would overflow (a first unit never wraps).
    const startUnit = (width: number): number => {
        if (lineUsed && cursor + WAVE_LEGEND_ENTRY_GAP_PX + width > maxRight) {
            line++;
            cursor = left;
            lineUsed = false;
        }
        const x = lineUsed ? cursor + WAVE_LEGEND_ENTRY_GAP_PX : cursor;
        cursor = x + width;
        lineUsed = true;
        widest = Math.max(widest, cursor - left);
        return x;
    };

    const entries: WaveLegendEntry[] = [];
    const swatchEntry = (kind: 'background' | 'boundary', text: string): void => {
        const textX0 = WAVE_LEGEND_SWATCH_WIDTH_PX + WAVE_LEGEND_SWATCH_GAP_PX;
        const x = startUnit(textX0 + textWidth(text));
        const y = baseline(line);
        entries.push({
            kind,
            text,
            swatch: {
                x,
                y:
                    y -
                    WAVE_LEGEND_BASELINE_OFFSET_PX +
                    (WAVE_LEGEND_LINE_PX - WAVE_LEGEND_SWATCH_HEIGHT_PX) / 2,
                width: WAVE_LEGEND_SWATCH_WIDTH_PX,
                height: WAVE_LEGEND_SWATCH_HEIGHT_PX,
            },
            runs: [{ text, x: x + textX0, y }],
        });
    };
    if (built.hasBackground) swatchEntry('background', strings.waveLegendBackground);
    if (built.boundaries.length > 0) swatchEntry('boundary', strings.waveLegendBoundary);

    if (abbreviated || anyEmpty || dropped) {
        const names = waves.map((w) => {
            let name = `#${w.index + 1} ${w.title}`;
            if (w.footnoteIndicators.length > 0 && !w.strip.footnotesShown) {
                name += ` ${w.footnoteIndicators.map(superscript).join(',')}`;
            }
            if (w.empty) name += ` (${strings.waveNoItems})`;
            return name;
        });
        const sep = ' · ';
        const first = `${strings.waveLegendPrefix} ${names[0]}`;
        const runs: WaveLegendEntry['runs'] = [
            { text: first, x: startUnit(textWidth(first)), y: baseline(line) },
        ];
        for (const name of names.slice(1)) {
            const run = runs[runs.length - 1];
            if (cursor + textWidth(sep + name) <= maxRight) {
                run.text += sep + name;
                cursor += textWidth(sep + name);
                widest = Math.max(widest, cursor - left);
            } else {
                line++;
                cursor = left;
                lineUsed = false;
                runs.push({ text: name, x: startUnit(textWidth(name)), y: baseline(line) });
            }
        }
        entries.push({
            kind: 'waves',
            text: `${strings.waveLegendPrefix} ${names.join(sep)}`,
            runs,
        });
    }

    return {
        box: {
            x: left,
            y: topY,
            width: widest,
            height: (line + 1) * WAVE_LEGEND_LINE_PX,
        },
        entries,
    };
}

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}
