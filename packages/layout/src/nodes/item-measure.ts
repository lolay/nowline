// Item measure (specs/layout-phases.md §3.6): everything about an item bar
// that does not depend on where the bar lands vertically or on what was
// placed before it. `measureItem` is the front half of `sequenceItem`
// without the start resolution and the `before:` caps: duration, width,
// style and status tint, progress, meta line, link icon, chip samples,
// caption fit, and the growth a wrapped title or a chip column adds to
// the bar. It reads the scope, the scale and the footnote index, never an
// entity edge or a placed item, so the row track can measure an item to
// size its row and hand the same measure to `sequenceItem`, which places
// it.

import type { EntityProperty, ItemDeclaration, LabelDeclaration } from '@nowline/core';
import { deriveTotalEffortDays, resolveDuration } from '../calendar.js';
import {
    estimateCapacitySuffixWidth,
    formatCapacityNumber,
    parseCapacityValue,
    resolveCapacityIcon,
} from '../capacity.js';
import { propValue, propValues } from '../dsl-utils.js';
import { pickInlineDate } from '../inline-date-pin-geometry.js';
import {
    type ChipRowSample,
    computeTitleBarExtra,
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_META_FONT_SIZE_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    itemCaptionLastBaselineOffset,
    itemTitleFirstLineRightReservePx,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
    LABEL_CHIP_HEIGHT_PX,
    LABEL_CHIP_ROW_STEP_PX,
    layoutSpillCluster,
    MIN_BAR_WIDTH_FOR_DOT_PX,
    MIN_BAR_WIDTH_FOR_FOOTNOTE_PX,
    MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX,
    packSpillChips,
    type SpillChipPack,
} from '../item-bar-geometry.js';
import { type LayoutContext, scheduledItemDays } from '../layout-context.js';
import { resolveLabelChipStyle, resolveStyle, type StyleContext } from '../style-resolution.js';
import { ellipsizeToWidth, estimateTextWidth } from '../text-measure.js';
import type { Theme } from '../themes/index.js';
import { PADDING_PX, PROGRESS_STRIP_HEIGHT_PX } from '../themes/shared.js';
import type {
    LinkIconKind,
    PositionedCapacity,
    PositionedLabelChip,
    ResolvedSize,
    ResolvedStyle,
    StatusKind,
} from '../types.js';
import { itemSpanPx } from '../working-span.js';
import {
    type ItemCaptionMeasure,
    type ItemNodeGeometry,
    itemBarInsetPx,
    itemVisualWidth,
    measureItemCaption,
    resolveCaptionTitleLines,
} from './item-node.js';

/** A label chip measured at its natural width, before it is placed. */
export type ChipSample = ChipRowSample<LabelDeclaration>;

export interface ResolvedItemMeta {
    /** Secondary line text under the title, or undefined when none. */
    metaText: string | undefined;
    ownerDisplay: string | undefined;
    capacity: PositionedCapacity | null;
    /** Estimated px width of the capacity suffix (incl. its separator). */
    capacityTrailingWidth: number;
}

export interface ItemMeasure extends ItemNodeGeometry {
    node: ItemDeclaration;
    /** The snapped start the bar is measured at (`ctx.scale.startX`). */
    startX: number;
    durationDays: number;
    /** Logical width: the item's span in time. */
    naturalWidth: number;
    /**
     * The bar box width: the logical extent `(startX + naturalWidth) -
     * startX` less the insets, as `ItemNode` has always computed it. The
     * caption fit, the narrow-bar spills and the chip pack read it.
     */
    visualWidth: number;
    /**
     * `naturalWidth` less the insets. Equal to `visualWidth` up to the
     * rounding of the logical extent; the inside-chip fit and the title's
     * first-line reserve read this one, as they always have.
     */
    naturalVisualWidth: number;
    /** Resolved style with the status tint applied (a copy, never the shared object). */
    style: ResolvedStyle;
    /** The `size:` declaration the item names, or null. */
    size: ResolvedSize | null;
    status: StatusKind;
    progress: number;
    meta: ResolvedItemMeta;
    link: { icon: LinkIconKind; href?: string };
    chips: {
        samples: ChipSample[];
        outside: boolean;
        pack: SpillChipPack<LabelDeclaration> | null;
        rowCount: number;
    };
    footnoteIndicators: number[];
    caption: ItemCaptionMeasure & {
        /** The title as declared (`title ?? name ?? ''`). */
        title: string;
        /** A narrow bar pushes the link icon, and with it the caption, out of the bar. */
        iconSpills: boolean;
        /**
         * The lines the title paints on (see `resolveCaptionTitleLines`),
         * each truncated with `…` when the spilled caption is capped at the
         * chart's end (`capCaptionAtAxisEnd`).
         */
        lines: string[];
        /** True when the cap truncated a line; the full title stays the bar's tooltip. */
        truncated: boolean;
        /** Baseline of the caption's last line, px from the bar's top. */
        lastBaseline: number;
    };
    /** Growth over the band height: max(title extra, chip extra). */
    barExtra: number;
}

export function statusFromProp(raw: string | undefined): StatusKind {
    switch (raw) {
        case 'done':
        case 'completed':
            return 'done';
        case 'in-progress':
        case 'active':
            return 'in-progress';
        case 'at-risk':
        case 'blocked':
        case 'planned':
            return raw;
        case undefined:
            return 'planned';
        default:
            return 'neutral';
    }
}

function parseProgressFraction(raw: string | undefined): number {
    if (!raw) return 0;
    const m = /^(\d{1,3})%$/.exec(raw);
    if (!m) return 0;
    return Math.max(0, Math.min(100, parseInt(m[1], 10))) / 100;
}

// Resolve a `size:NAME` value to its size declaration's effort literal, used
// by displays that want the literal duration string (not days). Returns the
// original string for raw literals (`1w`, `3d`) and undefined for missing
// values. m5 will adjust callers to apply capacity-aware derivation when the
// caller wants the calendar duration; this helper continues to expose the
// raw effort/duration literal for chips, captions, and tooltips.
function resolveDurationLiteral(
    raw: string | undefined,
    ctx: { sizes: Map<string, ResolvedSize> },
): string | undefined {
    if (!raw) return undefined;
    if (/^\d+(?:\.\d+)?[dwmqy]$/.test(raw) || /^\d+%$/.test(raw)) return raw;
    return ctx.sizes.get(raw)?.effortLiteral ?? raw;
}

// Resolve a person/team id to its declared title when present (id otherwise).
function resolveActorDisplay(
    raw: string | undefined,
    ctx: {
        teams: Map<string, import('@nowline/core').TeamDeclaration>;
        persons: Map<string, import('@nowline/core').PersonDeclaration>;
    },
): string | undefined {
    if (!raw) return undefined;
    return ctx.teams.get(raw)?.title ?? ctx.persons.get(raw)?.title ?? raw;
}

export function parseLinkIcon(link: string | undefined): { icon: LinkIconKind; href?: string } {
    if (!link) return { icon: 'none' };
    const lower = link.toLowerCase();
    if (lower.includes('linear.app')) return { icon: 'linear', href: link };
    if (lower.includes('github.com')) return { icon: 'github', href: link };
    if (lower.includes('atlassian.net') || lower.includes('jira.')) {
        return { icon: 'jira', href: link };
    }
    return { icon: 'generic', href: link };
}

// Bake a named/hex color from a label's `bg:` or `fg:` into the chip style.
export function buildLabelChip(
    label: LabelDeclaration,
    ctx: StyleContext,
    x: number,
    y: number,
    maxWidth?: number,
): PositionedLabelChip {
    const style = resolveLabelChipStyle(label, ctx);
    // Prefer the short name (id) when it exists — chips inside an item bar
    // are tight; the long title risks overflowing.
    const text = label.name ?? label.title ?? '';
    const padKey = style.padding === 'none' ? 'xs' : style.padding;
    const pad = PADDING_PX[padKey as keyof typeof PADDING_PX];
    let width = Math.max(20, Math.round(text.length * 5.5 + pad * 2));
    if (maxWidth !== undefined) width = Math.min(width, maxWidth);
    return {
        text,
        style,
        box: { x, y, width, height: LABEL_CHIP_HEIGHT_PX },
    };
}

/**
 * Status kind and 0..1 progress fraction for an item: a pure function of
 * the item's properties and the layout scope.
 */
export function resolveItemProgress(
    props: EntityProperty[],
    ctx: LayoutContext,
): { status: StatusKind; progress: number } {
    // Total work in single-engineer days, used below to normalize a literal
    // `remaining:` value into a progress fraction. Stays per-engineer
    // regardless of the item's `capacity:` so a `remaining:1w` always means
    // "one engineer-week of work left".
    const totalEffortDays = deriveTotalEffortDays(props, ctx.sizes, ctx.cal);
    const remainingDays = resolveDuration(propValue(props, 'remaining'), ctx.sizes, ctx.cal);
    const statusRaw = propValue(props, 'status');
    const status = statusFromProp(statusRaw);
    let progress = parseProgressFraction(statusRaw);
    if (progress === 0 && status === 'done') progress = 1;
    const remainingPctMatch = /^(\d{1,3})%$/.exec(propValue(props, 'remaining') ?? '');
    if (progress === 0 && status === 'in-progress' && remainingPctMatch) {
        const pct = Math.max(0, Math.min(100, parseInt(remainingPctMatch[1], 10))) / 100;
        progress = 1 - pct;
    }
    if (progress === 0 && status === 'in-progress' && remainingDays > 0 && totalEffortDays > 0) {
        // `remaining:` literal is single-engineer days; `totalEffortDays`
        // is also single-engineer days, so the ratio is unit-correct.
        // Clamp to [0, 1] — the renderer paints 100% remaining when the
        // author overshot, matching the spec's "warn-and-clamp" overflow
        // behavior. (Validation defers the warn to layout-time today; a
        // future diagnostics channel can surface it back to the user.)
        progress = Math.max(0, Math.min(1, 1 - remainingDays / totalEffortDays));
    }
    return { status, progress };
}

/**
 * Assemble an item's meta line and capacity suffix. The caption fit needs
 * the real meta width to know whether a title wraps or spills, and
 * `sequenceItem` paints from the same result.
 */
export function resolveItemMeta(
    props: EntityProperty[],
    ctx: LayoutContext,
    sizeResolved: ResolvedSize | null,
    status: StatusKind,
    progress: number,
    capacityIconName: string,
): ResolvedItemMeta {
    // Driver-only meta line (`rendering.md` § Item size chip): exactly one
    // leading token — the explicit non-empty `duration:LITERAL` when set,
    // otherwise the size chip when `size:` drives. Never both; bar width
    // already encodes derived calendar span for sized items.
    const explicitDurationLiteral = propValue(props, 'duration');
    const durationDrives =
        !!explicitDurationLiteral && /^\d+(?:\.\d+)?[dwmqy]$/.test(explicitDurationLiteral);
    const sizeChipText = sizeResolved ? (sizeResolved.title ?? sizeResolved.name) : '';
    const driverToken: string | undefined = durationDrives
        ? explicitDurationLiteral
        : sizeChipText || undefined;
    const remainingRaw = propValue(props, 'remaining');
    const remainingLiteral = resolveDurationLiteral(remainingRaw, ctx);
    const ownerDisplay = resolveActorDisplay(propValue(props, 'owner'), ctx);
    const metaHead = (): string => [driverToken, ownerDisplay].filter(Boolean).join(' ');
    let metaText: string | undefined;
    if (status === 'in-progress' && remainingLiteral) {
        const head = metaHead();
        metaText = head
            ? `${head} — ${remainingLiteral} remaining`
            : `${remainingLiteral} remaining`;
    } else if (status === 'in-progress' && progress > 0 && progress < 1) {
        const pct = Math.round((1 - progress) * 100);
        const head = metaHead();
        metaText = head ? `${head} — ${pct}% remaining` : `${pct}% remaining`;
    } else if (ownerDisplay || driverToken) {
        metaText = metaHead() || undefined;
    }

    // Capacity suffix — appended after metaText at render time. Layout's
    // job here is to (a) parse the value out of `capacity:`, (b) format
    // the display number, (c) resolve `capacity-icon` to either a
    // built-in name or a literal string the renderer can paint directly,
    // and (d) feed the suffix's estimated width into the caption fit so
    // spill detection accounts for `2w 5×` rather than just `2w`. The
    // suffix disappears entirely when capacity is missing or non-positive.
    const capacityRaw = propValue(props, 'capacity');
    const capacityValue = parseCapacityValue(capacityRaw);
    let capacity: PositionedCapacity | null = null;
    let capacityTrailingWidth = 0;
    if (capacityValue !== null) {
        const capacityText = formatCapacityNumber(capacityValue);
        const capacityIcon = resolveCapacityIcon(capacityIconName, ctx.symbols);
        capacity = { value: capacityValue, text: capacityText, icon: capacityIcon };
        const META_FONT_SIZE_PX_LOCAL = 11;
        // Add a small leading separator (a single space's worth) only when
        // the suffix sits next to existing meta text, so `m 5×` has air
        // between the driver token and the count. Standalone suffix needs no
        // leading separator.
        const separatorWidth = metaText ? estimateTextWidth(' ', META_FONT_SIZE_PX_LOCAL) : 0;
        capacityTrailingWidth =
            separatorWidth +
            estimateCapacitySuffixWidth(capacityText, capacityIcon, META_FONT_SIZE_PX_LOCAL);
    }
    return { metaText, ownerDisplay, capacity, capacityTrailingWidth };
}

/**
 * Footnote numbers attached to an item, ascending. Per `specs/dsl.md`,
 * footnotes attach via the `on:` property on the footnote declaration
 * only — there is no forward `footnote:` property on the host entity.
 * Walk `footnoteHosts` (built from each footnote's `on:` list) and
 * collect every footnote that names this item. The caption fit needs
 * them, since the indicators narrow the title's first line.
 */
export function collectItemFootnoteIndicators(
    name: string | undefined,
    ctx: LayoutContext,
): number[] {
    const set = new Set<number>();
    if (name) {
        for (const [fid, hosts] of ctx.footnoteHosts.entries()) {
            if (hosts.includes(name)) {
                const n = ctx.footnoteIndex.get(fid);
                if (n !== undefined) set.add(n);
            }
        }
    }
    return [...set].sort((a, b) => a - b);
}

/**
 * How far the title's first line must stay from the bar's right edge so
 * it clears the top-right decoration cluster.
 */
export function resolveTitleFirstLineReserve(
    barWidth: number,
    footnoteIndicators: readonly number[],
    beforeRaw: readonly string[],
): number {
    return itemTitleFirstLineRightReservePx({
        barWidth,
        footnoteLabels: footnoteIndicators.map(String),
        hasBeforeGlyph: pickInlineDate(beforeRaw) !== undefined,
    });
}

/** `StatusKind` to the key `Theme.status` and `Theme.statusTint` use. */
const THEME_STATUS_KEY = {
    done: 'done',
    'in-progress': 'inProgress',
    'at-risk': 'atRisk',
    blocked: 'blocked',
    planned: 'planned',
    neutral: 'neutral',
} as const satisfies Record<StatusKind, keyof Theme['status']>;

/**
 * Copy of an item's resolved style with the theme's status tint as `bg` when
 * `bg` is still `entities.item.bg`, and the status color as `fg` when `fg` is
 * still `entities.item.fg`.
 */
function applyStatusTheme(
    resolved: ResolvedStyle,
    status: StatusKind,
    theme: Theme,
): ResolvedStyle {
    const key = THEME_STATUS_KEY[status];
    const style = { ...resolved };
    if (style.bg === theme.entities.item.bg) {
        style.bg = theme.statusTint[key];
    }
    if (style.fg === theme.entities.item.fg) {
        style.fg = theme.status[key];
    }
    return style;
}

/**
 * Compute the extra vertical px the bar grows to fit its label chips
 * (a spilled chip column, or inside-bar chips stacked below a caption
 * that reaches past the default chip row). The bar's painted footprint
 * becomes `bandwidth + chipBarExtra`, the progress strip rides the new
 * bottom, and chip rows pack inside the taller bar (anchored from the
 * bar TOP so row 0 doesn't shift when the bar grows).
 *
 * Returns 0 when chips fit inside the bar, when there are no chips,
 * or when the spilled column happens to fit inside `bandwidth` (a
 * single row with the caption inside, for instance).
 *
 * `captionLastBaseline` is the in-bar caption's last text baseline
 * (px from the bar's top): the meta baseline when the item has a meta
 * line, otherwise the last title line's baseline. A wrapped title
 * pushes it down; see `itemCaptionLastBaselineOffset`.
 *
 * The bar's final growth is `max(titleBarExtra, chipBarExtra)`; the
 * same number is the row-pitch increase the swimlane / group
 * row-packer reserves so the next row clears the taller bar.
 */
export function computeChipBarExtra(
    chipsOutside: boolean,
    captionSpills: boolean,
    chipRowCount: number,
    bandwidth: number,
    captionLastBaseline: number,
): number {
    if (chipRowCount === 0) return 0;
    // Row 0 anchor relative to the bar's TOP — three regimes:
    //
    //   1. chipsOutside + captionSpills → chips stack below the
    //      spilled meta line. A break-free spilled caption is the
    //      single-line title + meta stack, so this clears the classic
    //      meta baseline; a spilled block with explicit breaks is
    //      taller, so it clears its own last baseline instead.
    //   2. chips INSIDE the bar → chip top must clear the caption's
    //      last baseline (meta line, else the last title line); the
    //      natural `baseTop` sits ABOVE the meta line at default
    //      bandwidth (=56) and above line 2 of a wrapped title, so we
    //      take whichever is lower of base/captionStack. For a
    //      single-line title with no meta the caption bottom is above
    //      `baseTop`, so this is `baseTop`.
    //   3. otherwise (chipsOutside w/o caption spill) → row 0 hugs
    //      the bar bottom at `baseTop`.
    //
    // Cases (2) and (3-with-multi-row-spill) can both grow the bar;
    // case (3-with-single-row-inside-no-meta) never grows.
    const baseTop =
        bandwidth -
        PROGRESS_STRIP_HEIGHT_PX -
        LABEL_CHIP_HEIGHT_PX -
        LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    let chipRow0Top: number;
    if (chipsOutside && captionSpills) {
        chipRow0Top =
            Math.max(ITEM_CAPTION_META_BASELINE_OFFSET_PX, captionLastBaseline) +
            LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    } else if (!chipsOutside) {
        chipRow0Top = Math.max(
            baseTop,
            captionLastBaseline + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
        );
    } else {
        chipRow0Top = baseTop;
    }
    const lastRowBottomTop =
        chipRow0Top + (chipRowCount - 1) * LABEL_CHIP_ROW_STEP_PX + LABEL_CHIP_HEIGHT_PX;
    // The bar must be tall enough to fit `lastRowBottomTop` plus a
    // GAP above the progress strip plus the progress strip itself.
    const requiredHeight =
        lastRowBottomTop + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX + PROGRESS_STRIP_HEIGHT_PX;
    return Math.max(0, requiredHeight - bandwidth);
}

/** What `capCaptionAtAxisEnd` needs from the item measure. */
interface CaptionCapInput {
    /** The caption spills right of the bar (a forced icon spill included). */
    textSpills: boolean;
    iconSpills: boolean;
    /** The bar's visual right edge, where the spill column starts. */
    barRightX: number;
    visualWidth: number;
    footnoteCount: number;
    meta: ResolvedItemMeta;
}

/**
 * Cap a spilled caption at the chart's end (specs/scheduler-unification.md
 * §8 decision 12). When the spill column (`layoutSpillCluster`: icon,
 * caption, footnotes, dot) would end past `AxisColumns.captionCapX`, one
 * column past the axis end, every title line wider than the room left is
 * truncated with `…` so the column ends there; finalize f2 grows the axis
 * by that column. The meta line is never truncated. A caption in the
 * middle of the chart, or one that ends inside the extra column, keeps its
 * lines.
 */
function capCaptionAtAxisEnd(
    lines: string[],
    input: CaptionCapInput,
    ctx: LayoutContext,
): { lines: string[]; truncated: boolean } {
    const columns = ctx.axisColumns;
    if (!input.textSpills || !columns) return { lines, truncated: false };
    const titleWidth = Math.max(
        0,
        ...lines.map((line) => estimateTextWidth(line, ITEM_CAPTION_TITLE_FONT_SIZE_PX)),
    );
    const { metaText, capacityTrailingWidth } = input.meta;
    const metaWidth =
        (metaText ? estimateTextWidth(metaText, ITEM_CAPTION_META_FONT_SIZE_PX) : 0) +
        capacityTrailingWidth;
    const captionWidth = Math.max(titleWidth, metaWidth);
    const spill = layoutSpillCluster({
        barRightX: input.barRightX,
        iconSpills: input.iconSpills,
        captionWidth,
        footnoteCount: input.visualWidth < MIN_BAR_WIDTH_FOR_FOOTNOTE_PX ? input.footnoteCount : 0,
        dotSpills: input.visualWidth < MIN_BAR_WIDTH_FOR_DOT_PX,
    });
    const capX = columns.captionCapX(input.barRightX);
    if (spill.rightX <= capX + CAPTION_CAP_TOLERANCE_PX || spill.captionX === null) {
        return { lines, truncated: false };
    }
    // The room for a title line: up to the cap, less what trails the caption.
    const trailing = spill.rightX - (spill.captionX + captionWidth);
    const room = capX - spill.captionX - trailing;
    let truncated = false;
    const out = lines.map((line) => {
        const fitted = ellipsizeToWidth(line, room, ITEM_CAPTION_TITLE_FONT_SIZE_PX);
        if (fitted !== line) truncated = true;
        return fitted;
    });
    return { lines: out, truncated };
}

/** Pixel float noise the caption cap ignores. */
const CAPTION_CAP_TOLERANCE_PX = 1e-6;

/**
 * Measure `node` as a bar starting at `startX`, the snapped start
 * (`ctx.scale.startX`) it will be placed at. Pure: it writes nothing to
 * `ctx`.
 */
export function measureItem(
    node: ItemDeclaration,
    startX: number,
    ctx: LayoutContext,
): ItemMeasure {
    const props = node.properties;
    const resolvedStyle = resolveStyle('item', props, ctx.styleCtx);
    // Sizing precedence (specs/dsl.md § "Sizing precedence"):
    //   1. `duration:LITERAL` wins as the calendar duration — `size:NAME`
    //      becomes a pure annotation (chip only).
    //   2. Otherwise, `size:NAME` derives `effort ÷ capacity` (default
    //      capacity = 1).
    // The validator requires one of the two on every item.
    const sizeRef = propValue(props, 'size');
    const sizeResolved = sizeRef ? (ctx.sizes.get(sizeRef) ?? null) : null;
    const durationDays = scheduledItemDays(ctx, node);
    const afterRaw = propValues(props, 'after');
    const beforeRaw = propValues(props, 'before');

    // The bar spans exactly its dates (specs/true-width-layout.md §3.1):
    // the logical width is the span, and the box `ItemNode` paints is that
    // span less its seams, at least the 1 px floor.
    const naturalWidth = itemSpanPx(ctx, startX, durationDays);
    const visualWidth = itemVisualWidth(naturalWidth);

    const link = parseLinkIcon(propValue(props, 'link'));
    const hasLinkIcon = link.icon !== 'none';

    // The chip row: every chip at its NATURAL text-fit width on a single
    // horizontal row, never truncated. Only the total row width matters
    // here, to decide whether the row fits inside the bar; `sequenceItem`
    // places the chips once the bar box is known.
    //
    // Chips sit at the bar's bottom (just above the progress strip) and
    // the link icon (when present) sits in the bar's UPPER-LEFT corner,
    // so they never share a vertical band: chips have the full
    // caption-inset-bounded inner width whether or not a link icon is
    // rendered. The link-icon column's horizontal cost is borne by the
    // caption (title/meta) inset instead, see `measureItemCaption`.
    const naturalVisualWidth = itemVisualWidth(naturalWidth);
    const labelIds = propValues(props, 'labels');
    const chipSamples: ChipSample[] = [];
    for (const labelId of labelIds) {
        const label = ctx.labels.get(labelId);
        if (!label) continue;
        const sample = buildLabelChip(label, ctx.styleCtx, 0, 0);
        chipSamples.push({ id: label, width: sample.box.width });
    }
    let chipRowWidth = 0;
    for (let i = 0; i < chipSamples.length; i += 1) {
        if (i > 0) chipRowWidth += LABEL_CHIP_GAP_BETWEEN_PX;
        chipRowWidth += chipSamples[i].width;
    }
    const chipInsideAvailWidth = Math.max(0, naturalVisualWidth - 2 * ITEM_CAPTION_INSET_X_PX);
    const chipsOutside = chipSamples.length > 0 && chipRowWidth > chipInsideAvailWidth;

    const { status, progress } = resolveItemProgress(props, ctx);

    // Apply the status-tinted item background and status border when the
    // resolved bg / fg is still the theme default. Authors who set explicit
    // `bg:` / `fg:` keep their override. Per m2d handoff Resolution 3: layout
    // owns this so the renderer stays palette-dumb. The tokens live in the
    // theme (`statusTint`, `status`); the style is copied, never mutated.
    const style = applyStatusTheme(resolvedStyle, status, ctx.styleCtx.theme);

    // The secondary line shown inside the item bar, plus the capacity
    // suffix that renders after it.
    const meta = resolveItemMeta(props, ctx, sizeResolved, status, progress, style.capacityIcon);

    const title = node.title ?? node.name ?? '';
    // Footnote indicators and the `before:` glyph share the bar's
    // upper-right with the title's first line, so resolve them BEFORE the
    // caption is fit: the first line stops short of that cluster.
    const footnoteIndicators = collectItemFootnoteIndicators(node.name, ctx);
    const captionFit = measureItemCaption({
        title,
        visualWidth,
        metaText: meta.metaText,
        metaTrailingWidth: meta.capacityTrailingWidth,
        hasLinkIcon,
        hasAfterGlyph: pickInlineDate(afterRaw) !== undefined,
        titleFirstLineRightReservePx: resolveTitleFirstLineReserve(
            naturalVisualWidth,
            footnoteIndicators,
            beforeRaw,
        ),
    });

    // A bar too narrow for the link icon spills it, and the caption with
    // it, so the icon and the title stay adjacent; see `sequenceItem`.
    const iconSpills = hasLinkIcon && visualWidth < MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX;
    const textSpills = captionFit.fit.textSpills || iconSpills;
    // The lines the title paints on. A title that word-wrapped INSIDE the
    // bar paints on two lines; if a narrow-bar icon spill forces the caption
    // out anyway, that wrap is dropped (a spilled break-free title is a
    // single line to the right). A title with explicit `\n` breaks keeps the
    // author's lines whether it stays in-bar or spills.
    // A spilled caption that would run past the axis end is truncated to
    // end within one column past it (specs/rendering.md § "Caption cap at
    // the chart's end").
    const capped = capCaptionAtAxisEnd(
        resolveCaptionTitleLines(title, captionFit.fit, iconSpills),
        {
            textSpills,
            iconSpills,
            barRightX: startX + itemBarInsetPx(naturalWidth) + visualWidth,
            visualWidth,
            footnoteCount: footnoteIndicators.length,
            meta,
        },
        ctx,
    );
    const lines = capped.lines;

    // A chip set that does not fit inside the bar moves to the spill column
    // and packs into rows capped at the bar's visual width.
    const chipPack = chipsOutside ? packSpillChips(chipSamples, visualWidth) : null;
    const chipRowCount = chipPack ? chipPack.rows.length : chipSamples.length > 0 ? 1 : 0;
    // Capacity suffix renders on the same line as metaText. Treat the meta
    // line as present whenever EITHER metaText OR a capacity suffix will
    // paint, so chip-row pitch reserves the right amount of vertical space.
    const hasMeta = meta.metaText !== undefined || meta.capacity !== null;
    // Baseline (px from the bar's top) of the caption's last line: the
    // meta line when present, else the last title line. Chips stacked
    // inside the bar must clear it.
    const lastBaseline = itemCaptionLastBaselineOffset(lines.length, hasMeta);
    const titleBarExtra = computeTitleBarExtra(lines.length, hasMeta);
    const chipBarExtra = computeChipBarExtra(
        chipsOutside,
        textSpills,
        chipRowCount,
        ctx.bandScale.bandwidth(),
        lastBaseline,
    );

    return {
        node,
        id: node.name ?? '',
        startX,
        durationDays,
        naturalWidth,
        visualWidth,
        naturalVisualWidth,
        style,
        size: sizeResolved,
        status,
        progress,
        meta,
        link,
        chips: {
            samples: chipSamples,
            outside: chipsOutside,
            pack: chipPack,
            rowCount: chipRowCount,
        },
        footnoteIndicators,
        caption: {
            ...captionFit,
            title,
            iconSpills,
            lines,
            truncated: capped.truncated,
            lastBaseline,
        },
        barExtra: Math.max(titleBarExtra, chipBarExtra),
    };
}
