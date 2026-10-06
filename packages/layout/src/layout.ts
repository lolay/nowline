import type {
    EntityProperty,
    GroupBlock,
    ItemDeclaration,
    LabelDeclaration,
    NowlineFile,
    ParallelBlock,
    ResolveResult,
    SwimlaneDeclaration,
    WavePlan,
} from '@nowline/core';
import { buildWavePlan, isGroupBlock, isItemDeclaration, isParallelBlock } from '@nowline/core';
import {
    addDays,
    daysBetween,
    deriveItemDurationDays,
    deriveTotalEffortDays,
    resolveDuration,
    resolveSizes,
} from './calendar.js';
import {
    estimateCapacitySuffixWidth,
    formatCapacityNumber,
    parseCapacityValue,
    resolveCapacityIcon,
} from './capacity.js';
import { parseDate, propValue, propValues } from './dsl-utils.js';
import {
    ChannelGrid,
    collectRoutingObstacles,
    type EdgeRouteRequest,
    routeChannelEdges,
} from './edge-routing.js';
import {
    HEADER_AUTHOR_FONT_SIZE_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_CARD_PADDING_BOTTOM,
    HEADER_CARD_PADDING_TOP,
    HEADER_CARD_PADDING_X,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
} from './header-card-geometry.js';
import { localeStrings } from './i18n.js';
import { computeItemInlineDatePins, pickInlineDate } from './inline-date-pin-geometry.js';
import {
    computeTitleBarExtra,
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    ITEM_DECORATION_SPILL_GAP_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    itemCaptionInsetX,
    itemCaptionLastBaselineOffset,
    itemTitleFirstLineRightReservePx,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
    LABEL_CHIP_HEIGHT_PX,
    LABEL_CHIP_ROW_STEP_PX,
    MIN_BAR_WIDTH_FOR_DOT_PX,
    MIN_BAR_WIDTH_FOR_FOOTNOTE_PX,
    MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX,
    packSpillChips,
} from './item-bar-geometry.js';
import { itemArrowSourcePort, itemArrowTargetPort } from './item-port-geometry.js';
import { type LayoutContext, newCursor, type TrackCursor } from './layout-context.js';
import { GroupNode } from './nodes/group-node.js';
import {
    estimateItemMetaWidth,
    fitItemCaption,
    ItemNode,
    resolveCaptionTitleLines,
} from './nodes/item-node.js';
import { ParallelNode } from './nodes/parallel-node.js';
import { RoadmapNode } from './nodes/roadmap-node.js';
import { SwimlaneNode } from './nodes/swimlane-node.js';
import { resolveLabelChipStyle, resolveStyle, type StyleContext } from './style-resolution.js';
import { estimateTextWidth, wrapText } from './text-measure.js';
import type { ThemeName } from './themes/index.js';
import {
    GUTTER_PX,
    HEADER_BESIDE_MAX_WIDTH_PX,
    HEADER_BESIDE_MIN_WIDTH_PX,
    ITEM_INSET_PX,
    MIN_ITEM_WIDTH,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOW_PILL_WIDTH_PX,
    PADDING_PX,
    PROGRESS_STRIP_HEIGHT_PX,
} from './themes/shared.js';
import type {
    BoundingBox,
    LinkIconKind,
    Point,
    PositionedCapacity,
    PositionedDependencyEdge,
    PositionedGroup,
    PositionedIncludeRegion,
    PositionedItem,
    PositionedLabelChip,
    PositionedNowline,
    PositionedParallel,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
    ResolvedSize,
    StatusKind,
} from './types.js';
import { tickBoundaryAtOrAfter, type ViewPreset } from './view-preset.js';
import { solveWaveBarriers, WavePass, waveFloorDays } from './wave-barrier.js';
import { accumulateWaveMember, waveFloorX, wavePinOverrideOf, waveRoleOf } from './wave-layout.js';
import { daysPerUnit } from './working-calendar.js';

export interface LayoutOptions {
    theme?: ThemeName;
    today?: Date;
    width?: number; // total SVG width in px; default 1280
    /**
     * BCP-47 tag controlling axis labels, the now-pill string, and the
     * quarter prefix. Resolved by the caller (CLI flag → env vars). When
     * undefined, layout falls back to the file's `nowline v1 locale:` and
     * then to `en-US`. See `specs/localization.md`.
     */
    locale?: string;
}

export type LayoutResult = PositionedRoadmap;

function statusFromProp(raw: string | undefined): StatusKind {
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
    ctx: { sizes: Map<string, import('./types.js').ResolvedSize> },
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

function parseLinkIcon(link: string | undefined): { icon: LinkIconKind; href?: string } {
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
function buildLabelChip(
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
 * Status kind and 0..1 progress fraction for an item. A pure function of
 * the item's properties and the layout context, so `sequenceItem` and the
 * row-height predictor derive the same meta line from it.
 */
function resolveItemProgress(
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

interface ResolvedItemMeta {
    /** Secondary line text under the title, or undefined when none. */
    metaText: string | undefined;
    ownerDisplay: string | undefined;
    capacity: PositionedCapacity | null;
    /** Estimated px width of the capacity suffix (incl. its separator). */
    capacityTrailingWidth: number;
}

/**
 * Assemble an item's meta line and capacity suffix. Shared by
 * `sequenceItem` (which paints from it) and `predictItemBarExtraHeight`
 * (which needs the real meta width to know whether a title wraps or
 * spills), so the two can never disagree.
 */
function resolveItemMeta(
    props: EntityProperty[],
    ctx: LayoutContext,
    ownerOverride: string | undefined,
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
    const ownerDisplay = resolveActorDisplay(ownerOverride ?? propValue(props, 'owner'), ctx);
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
    // and (d) feed the suffix's estimated width into ItemNode so spill
    // detection accounts for `2w 5×` rather than just `2w`. The suffix
    // disappears entirely when capacity is missing or non-positive.
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
 * collect every footnote that names this item. Shared by
 * `sequenceItem` (which paints the indicators) and the row-height
 * predictor, since both need the footnotes BEFORE the caption is fit.
 */
function collectItemFootnoteIndicators(name: string | undefined, ctx: LayoutContext): number[] {
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
 * it clears the top-right decoration cluster. `sequenceItem` and the
 * row-height predictor both call this, so a predicted wrap and a placed
 * wrap use the same budget.
 */
function resolveTitleFirstLineReserve(
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

// Sequence a set of nodes into a single horizontal track. `parallelInside`
// indicates the caller is inside a ParallelBlock and each child occupies a
// fresh sub-track (caller passes a new cursor per call).
function sequenceItem(
    node: ItemDeclaration,
    cursor: TrackCursor,
    ctx: LayoutContext,
    ownerOverride?: string,
): PositionedItem {
    const props = node.properties;
    const style = resolveStyle('item', props, ctx.styleCtx);
    // Sizing precedence (specs/dsl.md § "Sizing precedence"):
    //   1. `duration:LITERAL` wins as the calendar duration — `size:NAME`
    //      becomes a pure annotation (chip only).
    //   2. Otherwise, `size:NAME` derives `effort ÷ capacity` (default
    //      capacity = 1).
    // The validator requires one of the two on every item.
    const sizeRef = propValue(props, 'size');
    const sizeResolved = sizeRef ? (ctx.sizes.get(sizeRef) ?? null) : null;
    const durationDays = deriveItemDurationDays(props, ctx.sizes, ctx.cal);
    const afterRaw = propValues(props, 'after');
    const beforeRaw = propValues(props, 'before');
    const dateRaw = propValue(props, 'date');

    // Resolve start x: explicit date > after-chain > cursor position.
    // `after:` accepts both entity ids (looked up in entityRightEdges) and
    // inline ISO date literals (resolved through the time scale). The
    // validator enforces "at most one inline date per direction" so at most
    // one element will hit the date path per item.
    let startX = cursor.x;
    const explicitDate = parseDate(dateRaw);
    if (explicitDate) {
        const xd = ctx.scale.forwardWithinDomain(explicitDate);
        if (xd !== null) startX = xd;
    } else if (afterRaw.length > 0) {
        let maxEnd = cursor.x;
        for (const ref of afterRaw) {
            const inlineDate = parseDate(ref);
            if (inlineDate) {
                const xd = ctx.scale.forwardWithinDomain(inlineDate);
                if (xd !== null) maxEnd = Math.max(maxEnd, xd);
                continue;
            }
            const endX = ctx.entityRightEdges.get(ref);
            if (endX !== undefined) maxEnd = Math.max(maxEnd, endX);
        }
        startX = Math.max(cursor.x, maxEnd);
    }
    // Wave barrier (specs/waves.md §5.1, §8.4): the floor is one more term
    // in the max, after the pin and `after:` logic, so a pin becomes
    // max(pin, F). Parallel tracks reach this function directly, so this
    // is where their floor applies.
    let wavePinOverride: PositionedItem['wavePinOverride'];
    if (ctx.waves) {
        startX = waveFloorX(node, startX, ctx);
        wavePinOverride = wavePinOverrideOf(node, startX, ctx);
    }

    const naturalWidth = Math.max(MIN_ITEM_WIDTH, durationDays * ctx.timeline.pixelsPerDay);
    // Logical extent — what the item "owns" in time (used for chaining,
    // `after:` lookups, dependency-arrow attach points).
    const logicalLeft = startX;
    const logicalRight = startX + naturalWidth;

    const linkRaw = propValue(props, 'link');
    const linkInfo = parseLinkIcon(linkRaw);
    const hasLinkIcon = linkInfo.icon !== 'none';

    // Pre-compute the chip row geometry — every chip renders at its
    // NATURAL text-fit width on a single horizontal row, never
    // truncated. We only need the total row width here so we can
    // decide whether the row fits inside the bar; concrete chip
    // (x, y) placement comes after ItemNode resolves the visible
    // bar box below.
    //
    // Chips sit at the bar's bottom (just above the progress strip)
    // and the link icon (when present) sits in the bar's UPPER-LEFT
    // corner, so they no longer share a vertical band — chips have
    // the full caption-inset-bounded inner width regardless of
    // whether a link icon is rendered. The link-icon column's
    // horizontal cost is borne by the caption (title/meta) inset
    // instead, see `ItemNode`.
    const visualWidthPredict = Math.max(MIN_ITEM_WIDTH, naturalWidth - 2 * ITEM_INSET_PX);
    const labelIds = propValues(props, 'labels');
    const chipSamples: { id: LabelDeclaration; width: number }[] = [];
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
    const chipInsideAvailWidth = Math.max(0, visualWidthPredict - 2 * ITEM_CAPTION_INSET_X_PX);
    const chipsOutside = chipSamples.length > 0 && chipRowWidth > chipInsideAvailWidth;

    // Handle `before:` — item must end by the earliest cap. Each cap is
    // either an entity id (looked up in entityLeftEdges) or an inline ISO
    // date literal (resolved through the time scale). The validator enforces
    // "at most one inline date per direction" so at most one element per
    // before-list will hit the date path.
    let hasOverflow = false;
    let overflowBox: BoundingBox | undefined;
    let overflowAnchorId: string | undefined;
    if (beforeRaw.length > 0) {
        let earliestCapX: number | undefined;
        let earliestCapRef: string | undefined;
        for (const ref of beforeRaw) {
            const inlineDate = parseDate(ref);
            const capX = inlineDate
                ? (ctx.scale.forwardWithinDomain(inlineDate) ?? undefined)
                : ctx.entityLeftEdges.get(ref);
            if (capX === undefined) continue;
            if (earliestCapX === undefined || capX < earliestCapX) {
                earliestCapX = capX;
                earliestCapRef = ref;
            }
        }
        if (earliestCapX !== undefined && logicalRight > earliestCapX) {
            hasOverflow = true;
            overflowBox = {
                x: earliestCapX,
                y: cursor.y,
                width: logicalRight - earliestCapX,
                height: ctx.bandScale.bandwidth(),
            };
            overflowAnchorId = earliestCapRef;
        }
    }

    // Progress fraction
    const { status, progress } = resolveItemProgress(props, ctx);

    // Apply the status-tinted item background when the resolved bg is still
    // theme-default. Authors who set explicit `bg:` keep their override.
    // Per m2d handoff Resolution 3: layout owns this so the renderer stays
    // palette-dumb.
    const STATUS_TINT_LIGHT: Record<StatusKind, string> = {
        done: '#ecfdf5',
        'in-progress': '#eff6ff',
        'at-risk': '#fffbeb',
        blocked: '#fee2e2',
        planned: '#f8fafc',
        neutral: '#f8fafc',
    };
    const STATUS_TINT_DARK: Record<StatusKind, string> = {
        done: '#052e16',
        'in-progress': '#172554',
        'at-risk': '#422006',
        blocked: '#7f1d1d',
        planned: '#1e293b',
        neutral: '#1e293b',
    };
    const STATUS_TINT_GREY: Record<StatusKind, string> = {
        done: '#ebebeb',
        'in-progress': '#e4e4e4',
        'at-risk': '#eeeeee',
        blocked: '#dcdcdc',
        planned: '#f5f5f5',
        neutral: '#f5f5f5',
    };
    const STATUS_BORDER: Record<StatusKind, string> = {
        done: ctx.styleCtx.theme.status.done,
        'in-progress': ctx.styleCtx.theme.status.inProgress,
        'at-risk': ctx.styleCtx.theme.status.atRisk,
        blocked: ctx.styleCtx.theme.status.blocked,
        planned: ctx.styleCtx.theme.status.planned,
        neutral: ctx.styleCtx.theme.status.neutral,
    };
    const themeName = ctx.styleCtx.theme.name;
    const isDark = themeName === 'dark';
    const themeDefaultBg = isDark ? '#0f172a' : '#ffffff';
    const themeDefaultFg = themeName === 'grayscale' ? '#9e9e9e' : '#94a3b8';
    if (style.bg === themeDefaultBg) {
        style.bg =
            themeName === 'grayscale'
                ? STATUS_TINT_GREY[status]
                : isDark
                  ? STATUS_TINT_DARK[status]
                  : STATUS_TINT_LIGHT[status];
    }
    if (style.fg === themeDefaultFg) {
        style.fg = STATUS_BORDER[status];
    }

    // Pre-format the secondary line shown inside the item bar, plus the
    // capacity suffix that renders after it.
    const { metaText, ownerDisplay, capacity, capacityTrailingWidth } = resolveItemMeta(
        props,
        ctx,
        ownerOverride,
        sizeResolved,
        status,
        progress,
        style.capacityIcon,
    );

    // Visual bar + caption-spill decision delegated to ItemNode. Logical
    // extent (used by chaining and `after:` lookups) stays on
    // logicalLeft/logicalRight; ItemNode computes the inset visual box and
    // whether the title+meta line overflows the bar's inner padded width.
    const titleStr = node.title ?? node.name ?? '';
    // Footnote indicators and the `before:` glyph share the bar's
    // upper-right with the title's first line, so resolve them BEFORE the
    // caption is fit: the first line stops short of that cluster.
    const footnoteIndicators = collectItemFootnoteIndicators(node.name, ctx);
    const placed = new ItemNode({
        id: node.name ?? '',
        title: titleStr,
        logicalLeftX: logicalLeft,
        logicalRightX: logicalRight,
        metaText,
        metaTrailingWidth: capacityTrailingWidth,
        hasLinkIcon,
        hasAfterGlyph: pickInlineDate(afterRaw) !== undefined,
        titleFirstLineRightReservePx: resolveTitleFirstLineReserve(
            visualWidthPredict,
            footnoteIndicators,
            beforeRaw,
        ),
    }).place({ x: logicalLeft, y: cursor.y }, { time: ctx.scale, bands: ctx.bandScale, style });
    const itemBox = placed.box;
    const bandwidth = ctx.bandScale.bandwidth();

    // Narrow-bar decoration spill — when a bar is too narrow to host
    // the dot, link icon, or footnote with its full inset, those
    // glyphs render in the same spill column as the (already-
    // spilling) caption text, in reading order
    // `[bar][dot][icon][title][footnote#…][meta]`. Each decoration's
    // threshold is independent (a 20-px-wide bar can host the dot
    // but not the icon, etc.); see the `MIN_BAR_WIDTH_FOR_*`
    // constants in `item-bar-geometry`.
    //
    // Forcing `textSpills` when `iconSpills` keeps the icon and
    // title visually adjacent — otherwise a spilled icon would
    // float at `bar.right + 6` while the title stayed inside the
    // bar, breaking the icon→title affordance.
    const dotSpills = itemBox.width < MIN_BAR_WIDTH_FOR_DOT_PX;
    const iconSpills = hasLinkIcon && itemBox.width < MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX;
    const footnoteSpillsForNarrow = itemBox.width < MIN_BAR_WIDTH_FOR_FOOTNOTE_PX;
    const textSpills = placed.textSpills || iconSpills;
    // The lines the title paints on. A title that word-wrapped INSIDE the
    // bar paints on two lines; if a narrow-bar icon spill forces the caption
    // out anyway, that wrap is dropped (a spilled break-free title is a
    // single line to the right). A title with explicit `\n` breaks keeps the
    // author's lines whether it stays in-bar or spills.
    const captionLines = resolveCaptionTitleLines(titleStr, placed, iconSpills);
    const titleLineCount = captionLines.length;

    // Label chips lay out left → right at natural text width.
    //
    // INSIDE the bar (chipsOutside === false): single row,
    // left-aligned at the caption inset, anchored just above the
    // bottom progress strip.
    //
    // OUTSIDE the bar (chipsOutside === true): the whole chip set
    // moves to the spill column at `bar.right + 6`. Within the
    // column, chips pack into rows capped at the bar's visual
    // width — see `packSpillChips`. Row 0 sits at the same y the
    // single-row would have used; subsequent rows stack DOWNWARD by
    // one `LABEL_CHIP_ROW_STEP_PX`.
    //
    // When chips spill OR the title wrapped over a meta line, the BAR
    // ITSELF GROWS DOWNWARD so the chip column (or the second title
    // line plus meta) reads as enclosed by the bar — the painted
    // footprint of the bar is `bandwidth + barExtra` (the larger of
    // `titleBarExtra` and `chipBarExtra`) and the bottom progress
    // strip moves with the new bottom edge. Chip Y is
    // anchored to the ORIGINAL bandwidth (relative to the bar's
    // top), not to the grown box.height, so row 0 stays where a
    // single-row chip would naturally render and rows 1..N grow
    // downward into the new bar area.
    //
    // When the caption ALSO spills (`textSpills && chipsOutside`),
    // row 0's y drops below the meta baseline so the spilled stack
    // reads `title → meta → chip-row-0 → chip-row-1 → ...` at a
    // single column inside the (now-taller) bar.
    let chipPack: ReturnType<typeof packSpillChips<LabelDeclaration>> | null = null;
    if (chipsOutside) {
        chipPack = packSpillChips(chipSamples, itemBox.width);
    }
    const chipRowCount = chipPack ? chipPack.rows.length : chipSamples.length > 0 ? 1 : 0;
    // Capacity suffix renders on the same line as metaText. Treat the meta
    // line as present whenever EITHER metaText OR a capacity suffix will
    // paint, so chip-row pitch reserves the right amount of vertical space.
    const hasMeta = metaText !== undefined || capacity !== null;
    // Baseline (px from the bar's top) of the caption's last line: the
    // meta line when present, else the last title line. Chips stacked
    // inside the bar must clear it.
    const captionLastBaseline = itemCaptionLastBaselineOffset(titleLineCount, hasMeta);
    const titleBarExtra = computeTitleBarExtra(titleLineCount, hasMeta);
    const chipBarExtra = computeChipBarExtra(
        chipsOutside,
        textSpills,
        chipRowCount,
        bandwidth,
        captionLastBaseline,
    );
    const barExtra = Math.max(titleBarExtra, chipBarExtra);
    if (barExtra > 0) {
        itemBox.height = bandwidth + barExtra;
    }

    const labelChips: PositionedLabelChip[] = [];
    const baseChipY =
        itemBox.y +
        bandwidth -
        PROGRESS_STRIP_HEIGHT_PX -
        LABEL_CHIP_HEIGHT_PX -
        LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    // Chips under a SPILLED caption clear the classic meta baseline (38),
    // or the caption's own last baseline when explicit breaks make the
    // spilled block taller than that; an in-bar caption is cleared at its
    // own last baseline (which a wrapped title pushes down).
    const captionStackChipY =
        itemBox.y +
        (chipsOutside && textSpills
            ? Math.max(ITEM_CAPTION_META_BASELINE_OFFSET_PX, captionLastBaseline)
            : captionLastBaseline) +
        LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    // Inside-bar chips need to clear the caption's last baseline —
    // the natural `baseChipY` (anchored to bar bottom) sits above
    // the meta line at typical bandwidths, and above line 2 of a
    // wrapped title, so the chip rect would overlap the text
    // vertically. Use whichever Y is lower. With no meta and a
    // single-line title the caption bottom is above `baseChipY`, so
    // this resolves to `baseChipY` as before.
    // Outside-bar chips already reuse `captionStackChipY` when the
    // caption ALSO spills; with caption inside we don't need to
    // shift them since they're horizontally separated from the meta.
    const stackBelowCaption =
        (chipsOutside && textSpills) || (!chipsOutside && chipSamples.length > 0);
    const chipRow0Y = stackBelowCaption ? Math.max(baseChipY, captionStackChipY) : baseChipY;
    const chipStartX = chipsOutside
        ? itemBox.x + itemBox.width + ITEM_CAPTION_SPILL_GAP_PX
        : itemBox.x + ITEM_CAPTION_INSET_X_PX;

    let chipsRightX = chipStartX;
    if (chipPack) {
        for (let r = 0; r < chipPack.rows.length; r += 1) {
            const rowY = chipRow0Y + r * LABEL_CHIP_ROW_STEP_PX;
            let rowCursorX = chipStartX;
            for (const sample of chipPack.rows[r]) {
                const chip = buildLabelChip(sample.id, ctx.styleCtx, rowCursorX, rowY);
                labelChips.push(chip);
                rowCursorX += chip.box.width + LABEL_CHIP_GAP_BETWEEN_PX;
            }
            const rowRight = rowCursorX - LABEL_CHIP_GAP_BETWEEN_PX;
            if (rowRight > chipsRightX) chipsRightX = rowRight;
        }
    } else {
        let rowCursorX = chipStartX;
        for (const sample of chipSamples) {
            const chip = buildLabelChip(sample.id, ctx.styleCtx, rowCursorX, chipRow0Y);
            labelChips.push(chip);
            rowCursorX += chip.box.width + LABEL_CHIP_GAP_BETWEEN_PX;
        }
        chipsRightX = chipSamples.length > 0 ? rowCursorX - LABEL_CHIP_GAP_BETWEEN_PX : chipStartX;
    }

    // `footnoteIndicators` (one superscript per footnote that names this
    // item) was resolved above, before the caption fit.

    const owner = ownerDisplay ?? ownerOverride ?? propValue(props, 'owner');
    const description = node.description?.text;

    // Footnote glyphs only need to spill when there's at least one
    // indicator AND the bar is too narrow to host them at the inset-
    // right anchor. Compute the final boolean here once we know the
    // indicator count.
    const footnoteSpills = footnoteIndicators.length > 0 && footnoteSpillsForNarrow;

    // Spill-column x positions for the decorations. The cluster
    // mirrors the in-bar reading order so users see the same visual
    // hierarchy whether everything fits inside or trails off to the
    // right:
    //
    //   In-bar (default):  [icon] [title]    [¹²]   [dot]
    //   Spilled (narrow):  [bar] [icon?] [title][¹²?] [dot?]
    //
    // The dot lives at the trailing edge in BOTH cases — pushing it
    // to the LEFT of the title (with the title trailing it) read as
    // the dot belonging to the next item, not this one. A missing
    // decoration just collapses out of the row; e.g. an item with
    // no link AND a too-narrow bar gives `[bar] [title] [dot]`.
    //
    // `decorationsRightX` is the furthest right edge any spilled
    // glyph reaches; the row-packer uses it (alongside spilled-chip
    // width) to reserve x-extent so the next chained item bumps to
    // a fresh row instead of landing under the spilled cluster.
    const SPILL_COLUMN_X0 = itemBox.x + itemBox.width + ITEM_CAPTION_SPILL_GAP_PX;
    let spillCursor = SPILL_COLUMN_X0;
    // Advance the cursor by `gap` IFF something has already been
    // placed in the column — keeps the cluster from leaving a
    // dangling gap past its final glyph (which would over-reserve
    // x-extent and shift downstream items).
    let needGap = false;
    let iconSpillX: number | null = null;
    if (iconSpills) {
        if (needGap) spillCursor += ITEM_DECORATION_SPILL_GAP_PX;
        iconSpillX = spillCursor;
        spillCursor = iconSpillX + ITEM_LINK_ICON_TILE_SIZE_PX;
        needGap = true;
    }
    let captionSpillWidth = 0;
    if (textSpills) {
        if (needGap) spillCursor += ITEM_DECORATION_SPILL_GAP_PX;
        // The widest title LINE: a multi-line spill is as wide as its
        // longest line, not as the raw string (newlines included).
        const titleW = Math.max(
            ...captionLines.map((line) => estimateTextWidth(line, ITEM_CAPTION_TITLE_FONT_SIZE_PX)),
        );
        // Spill column width is the wider of the title and the *full* meta
        // line (text + capacity suffix). `capacityTrailingWidth` is 0 when
        // no capacity suffix is rendered, so this stays a no-op for items
        // without `capacity:`.
        const metaW = (metaText ? estimateTextWidth(metaText, 11) : 0) + capacityTrailingWidth;
        captionSpillWidth = Math.max(titleW, metaW);
        spillCursor += captionSpillWidth;
        needGap = true;
    }
    let footnoteSpillStartX: number | null = null;
    if (footnoteSpills) {
        if (needGap) spillCursor += ITEM_DECORATION_SPILL_GAP_PX;
        footnoteSpillStartX = spillCursor;
        spillCursor += footnoteIndicators.length * ITEM_FOOTNOTE_INDICATOR_STEP_PX;
        needGap = true;
    }
    let dotSpillCx: number | null = null;
    if (dotSpills) {
        if (needGap) spillCursor += ITEM_DECORATION_SPILL_GAP_PX;
        dotSpillCx = spillCursor + ITEM_STATUS_DOT_RADIUS_PX;
        spillCursor = dotSpillCx + ITEM_STATUS_DOT_RADIUS_PX;
        needGap = true;
    }
    const decorationsRightX = Math.max(itemBox.x + itemBox.width, spillCursor);

    const id = node.name;
    // Reference-target edges resolve `after:` / `before:` lookups, so only
    // EXPLICIT ids register here — an id-less item never becomes a
    // referenceable target. Entity edges live in LOGICAL space so chained
    // items / `after:` references sit on the column boundary, not on the
    // visually inset bar edge. The visible 12 px gutter between bars then
    // becomes a clean attach corridor.
    if (id) {
        ctx.entityLeftEdges.set(id, logicalLeft);
        ctx.entityRightEdges.set(id, logicalRight);
    }
    // A member's end feeds its wave's barrier: the lane cursor's logical
    // end (`itemLogicalEnd` in `SwimlaneNode`), MIN_ITEM_WIDTH clamp
    // included, never a group box or caption spill (specs/waves.md §8.4).
    accumulateWaveMember(node, itemBox.x + itemBox.width + ITEM_INSET_PX, ctx);
    // Drawing / flow maps key on a registration handle EVERY item has: the
    // explicit id when present, else a synthetic, non-referenceable handle
    // (see `syntheticItemKey`). This lets a title-only item register its own
    // dependency-arrow target geometry and join flow-key dedup without
    // entering the human-referenceable namespace above. The item itself is
    // registered in `ctx.placedItems` once it is built (below); its arrow
    // and slack-arrow attach points are derived from its final box later.
    const drawKey = id ?? syntheticItemKey(node);
    ctx.itemFlowKey.set(drawKey, ctx.currentFlowKey);

    cursor.x = logicalRight;
    cursor.maxX = Math.max(cursor.maxX, cursor.x);
    // The next row in a parallel/group/lane starts at
    // `cursor.y + cursor.height`. Default pitch is `bandScale.step()`
    // (bandwidth + inter-row gap). When the bar grew to enclose a
    // spilled chip column or a wrapped title, the pitch grows by the
    // SAME amount so the inter-row gap stays constant — the next row's
    // bar starts `step − bandwidth` px below the (now-taller) bar bottom.
    cursor.height = Math.max(cursor.height, ctx.bandScale.step() + barExtra);

    const inlineDatePins = computeItemInlineDatePins({
        box: itemBox,
        afterDate: pickInlineDate(afterRaw),
        beforeDate: pickInlineDate(beforeRaw),
        hasLinkIcon,
        footnoteCount: footnoteIndicators.length,
    });

    const result: PositionedItem = {
        kind: 'item',
        id,
        title: titleStr,
        // Only present when the painted lines differ from `[title]`: an
        // auto-wrap, explicit breaks, or a stray leading/trailing break
        // that was trimmed away. A plain one-line title carries no key.
        ...(captionLines.length >= 2 || captionLines[0] !== titleStr
            ? { titleLines: captionLines }
            : {}),
        box: itemBox,
        status,
        progressFraction: progress,
        footnoteIndicators,
        labelChips,
        chipsOutside,
        chipsRightX,
        linkIcon: linkInfo.icon,
        linkHref: linkInfo.href,
        hasOverflow,
        overflowBox,
        overflowAnchorId,
        owner,
        description,
        metaText,
        textSpills,
        dotSpills,
        iconSpills,
        footnoteSpills,
        dotSpillCx,
        iconSpillX,
        footnoteSpillStartX,
        decorationsRightX,
        capacity,
        size: sizeResolved,
        style,
        inlineDatePins: inlineDatePins.length > 0 ? inlineDatePins : undefined,
    };
    // Wave fields exist only in a roadmap with waves (omitted, never
    // undefined, so wave-free models keep their exact shape).
    const waveRole = waveRoleOf(node, ctx);
    if (waveRole !== undefined) result.waveRole = waveRole;
    if (wavePinOverride !== undefined) result.wavePinOverride = wavePinOverride;
    // Register the item object itself, not coordinates sampled from it:
    // the row packer and the marker-band shift may still move this box
    // down, and every attach port is read off the final box (see
    // `item-port-geometry.ts`).
    ctx.placedItems.set(drawKey, result);
    return result;
}

function sequenceParallel(
    node: ParallelBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedParallel {
    return new ParallelNode(node, { sequenceOne, newCursor }).place(cursor, ctx);
}

function sequenceGroup(node: GroupBlock, cursor: TrackCursor, ctx: LayoutContext): PositionedGroup {
    return new GroupNode(node, {
        sequenceItem,
        sequenceOne,
        resolveChildStart,
        newCursor,
        estimateTextWidth,
        predictItemBarExtraHeight,
    }).place(cursor, ctx);
}

function sequenceOne(
    node: ItemDeclaration | GroupBlock | ParallelBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedTrackChild {
    if (isItemDeclaration(node)) return sequenceItem(node, cursor, ctx);
    if (isParallelBlock(node)) return sequenceParallel(node, cursor, ctx);
    if (isGroupBlock(node)) return sequenceGroup(node, cursor, ctx);
    throw new Error(
        `Unknown swimlane child type: ${(node as { $type?: string }).$type ?? 'unknown'}`,
    );
}

/**
 * Internal drawing handle for an id-less item. Title-only items have no
 * `node.name`, yet they still need a stable key to register their own
 * dependency-arrow target geometry and join flow-key dedup. The handle is
 * derived from the item's source position so it is deterministic and
 * byte-stable, and the `#item@line:col` form cannot be produced by the
 * grammar's id rule — so `after:` / `before:` / `on:` can never resolve to it
 * (an id-less item stays non-referenceable; declare an explicit id to
 * reference it). Distinct items always start at distinct positions, so the
 * handle is unique within a file.
 */
function syntheticItemKey(node: ItemDeclaration): string {
    const start = node.$cstNode?.range.start;
    return `#item@${start ? start.line + 1 : 0}:${start ? start.character + 1 : 0}`;
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
 * row-packer needs to reserve so the next row clears the taller
 * bar — `cursor.height = step + barExtra`, and the predict helper
 * returns it.
 */
function computeChipBarExtra(
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

/**
 * Predict an item's bar growth (and therefore row-pitch growth) BEFORE
 * the bar is sequenced: the larger of the growth a wrapped title needs
 * and the growth a multi-row spilled chip column needs. Used by the
 * swimlane / group row-packer so neighboring rows on later rows are
 * positioned correctly without a retroactive shift.
 *
 * Mirrors the caption-fit, chip-pack and caption-spill arithmetic in
 * `sequenceItem` so prediction and placement agree byte-for-byte: it
 * resolves the same meta line (`resolveItemMeta`) and runs the same
 * caption-fit helper (`fitItemCaption`) as `ItemNode.place`. The meta
 * width matters because a meta line wider than the bar makes the
 * caption spill instead of wrap; predicting a wrap there would reserve
 * a taller row than the (un-grown) bar needs.
 */
function predictItemBarExtraHeight(item: ItemDeclaration, ctx: LayoutContext): number {
    const props = item.properties;
    const bandwidth = ctx.bandScale.bandwidth();
    const durationDays = deriveItemDurationDays(props, ctx.sizes, ctx.cal);
    const naturalWidth = Math.max(MIN_ITEM_WIDTH, durationDays * ctx.timeline.pixelsPerDay);
    const visualWidth = Math.max(MIN_ITEM_WIDTH, naturalWidth - 2 * ITEM_INSET_PX);

    // The real meta line, exactly as `sequenceItem` assembles it.
    const sizeRef = propValue(props, 'size');
    const sizeResolved = sizeRef ? (ctx.sizes.get(sizeRef) ?? null) : null;
    const { status, progress } = resolveItemProgress(props, ctx);
    const { metaText, capacity, capacityTrailingWidth } = resolveItemMeta(
        props,
        ctx,
        undefined,
        sizeResolved,
        status,
        progress,
        resolveStyle('item', props, ctx.styleCtx).capacityIcon,
    );
    const hasMeta = metaText !== undefined || capacity !== null;

    // Same caption-fit helper `ItemNode.place` runs.
    const hasLinkIcon = !!propValue(props, 'link');
    const titleStr = item.title ?? item.name ?? '';
    // The left inset clears the link tile and the in-bar `after:` glyph,
    // exactly as `ItemNode.place` computes it.
    const hasAfterGlyph = pickInlineDate(propValues(props, 'after')) !== undefined;
    const captionLeftInset = itemCaptionInsetX(
        hasLinkIcon,
        hasAfterGlyph ? { barWidth: visualWidth } : undefined,
    );
    const innerWidth = Math.max(0, visualWidth - captionLeftInset - ITEM_CAPTION_INSET_X_PX);
    // The first title line clears the top-right decoration cluster, found
    // the same way `sequenceItem` finds it (footnotes via `footnoteHosts`,
    // `before:` via the inline date), so prediction and placement agree.
    const firstLineWidth = Math.max(
        0,
        visualWidth -
            captionLeftInset -
            resolveTitleFirstLineReserve(
                visualWidth,
                collectItemFootnoteIndicators(item.name, ctx),
                propValues(props, 'before'),
            ),
    );
    const fit = fitItemCaption(
        titleStr,
        innerWidth,
        estimateItemMetaWidth(metaText, capacityTrailingWidth),
        firstLineWidth,
    );
    // A narrow-bar link icon spills the caption outright (and drops any
    // auto-wrap, though explicit breaks stay), mirroring `iconSpills` in
    // `sequenceItem`; both resolve the painted lines the same way.
    const iconSpills = hasLinkIcon && visualWidth < MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX;
    const captionSpills = fit.textSpills || iconSpills;
    const titleLineCount = resolveCaptionTitleLines(titleStr, fit, iconSpills).length;
    const titleExtra = computeTitleBarExtra(titleLineCount, hasMeta);

    const labelIds = propValues(props, 'labels');
    const samples: { id: LabelDeclaration; width: number }[] = [];
    for (const labelId of labelIds) {
        const label = ctx.labels.get(labelId);
        if (!label) continue;
        const sample = buildLabelChip(label, ctx.styleCtx, 0, 0);
        samples.push({ id: label, width: sample.box.width });
    }
    if (samples.length === 0) return titleExtra;
    let chipRowWidth = 0;
    for (let i = 0; i < samples.length; i += 1) {
        if (i > 0) chipRowWidth += LABEL_CHIP_GAP_BETWEEN_PX;
        chipRowWidth += samples[i].width;
    }
    const insideAvail = Math.max(0, visualWidth - 2 * ITEM_CAPTION_INSET_X_PX);
    const chipsOutside = chipRowWidth > insideAvail;
    const pack = chipsOutside ? packSpillChips(samples, visualWidth) : null;
    const chipRowCount = pack ? pack.rows.length : 1;
    const chipExtra = computeChipBarExtra(
        chipsOutside,
        captionSpills,
        chipRowCount,
        bandwidth,
        itemCaptionLastBaselineOffset(titleLineCount, hasMeta),
    );
    return Math.max(titleExtra, chipExtra);
}

// Resolve the desired startX for a swimlane child, honoring `date:` (fixed
// pin) > `start:` (fixed pin) > `after:` (chain after refs) > sequential
// default (continue from `seqDefault`, which is the lane's rightmost time
// cursor across all rows).
//
// `after:` accepts both entity ids (looked up in `ctx.entityRightEdges`) and
// inline ISO date literals (looked up via `ctx.scale.forwardWithinDomain`).
// The validator already enforces "at most one inline date per direction" so
// at most one element in the list will hit the date path.
//
// In a roadmap with waves the result is floored by the child's wave and,
// for a container, its lead wave (specs/waves.md §8.4), so the row
// packer's predicted start matches the start `sequenceItem` / the
// container node places.
function resolveChildStart(
    child: ItemDeclaration | GroupBlock | ParallelBlock,
    seqDefault: number,
    laneLeftX: number,
    ctx: LayoutContext,
): number {
    return waveFloorX(
        child,
        resolvePinnedOrSequentialStart(child.properties, seqDefault, laneLeftX, ctx),
        ctx,
    );
}

function resolvePinnedOrSequentialStart(
    props: EntityProperty[],
    seqDefault: number,
    laneLeftX: number,
    ctx: LayoutContext,
): number {
    const explicitDate =
        parseDate(propValue(props, 'date')) ?? parseDate(propValue(props, 'start'));
    if (explicitDate) {
        const xd = ctx.scale.forwardWithinDomain(explicitDate);
        if (xd !== null) return xd;
    }
    const afterRefs = propValues(props, 'after');
    if (afterRefs.length > 0) {
        let maxEnd = laneLeftX;
        for (const ref of afterRefs) {
            const inlineDate = parseDate(ref);
            if (inlineDate) {
                const xd = ctx.scale.forwardWithinDomain(inlineDate);
                if (xd !== null) maxEnd = Math.max(maxEnd, xd);
                continue;
            }
            const endX = ctx.entityRightEdges.get(ref);
            if (endX !== undefined) maxEnd = Math.max(maxEnd, endX);
        }
        return Math.max(laneLeftX, maxEnd);
    }
    return seqDefault;
}

function _buildSwimlane(
    lane: SwimlaneDeclaration,
    y: number,
    bandIndex: number,
    ctx: LayoutContext,
): { positioned: PositionedSwimlane; usedHeight: number } {
    return new SwimlaneNode(
        { lane, bandIndex },
        {
            sequenceItem,
            sequenceOne,
            resolveChildStart,
            newCursor,
            estimateTextWidth,
            predictItemBarExtraHeight,
        },
    ).place({ x: ctx.timeline.originX, y }, ctx);
}

// Card-sizing constants for beside-mode headers live in
// `header-card-geometry.ts` so the renderer can paint with the same
// numbers the layout sized against. Title and author both wrap at
// MAX_CONTENT_WIDTH (= MAX header width minus 2 * padding). The card
// hugs its content in the MIN..MAX range and grows vertically when
// wrapping is needed.
//
// Left margin between the canvas's left edge and the visible card. The
// matching right-side breathing room is owned by `GUTTER_PX` (the canonical
// content gutter, applied between `chartLeftX` and `originX`), so the gap
// from the card's right edge to the timeline strip is the same as the gap
// between two adjacent items.
const HEADER_CARD_OUTER_PAD = 6;

interface SizedHeader {
    titleLines: string[];
    authorLines: string[];
    cardWidth: number;
    cardHeight: number;
    boxWidth: number;
}

function sizeBesideHeader(title: string, author: string | undefined): SizedHeader {
    const maxContentWidth = HEADER_BESIDE_MAX_WIDTH_PX - 2 * HEADER_CARD_PADDING_X;
    const titleLines = wrapText(title, maxContentWidth, HEADER_TITLE_FONT_SIZE_PX);
    const authorLines = wrapText(author ?? '', maxContentWidth, HEADER_AUTHOR_FONT_SIZE_PX);

    let widest = 0;
    for (const line of titleLines)
        widest = Math.max(widest, estimateTextWidth(line, HEADER_TITLE_FONT_SIZE_PX));
    for (const line of authorLines)
        widest = Math.max(widest, estimateTextWidth(line, HEADER_AUTHOR_FONT_SIZE_PX));

    const naturalCardWidth = widest + 2 * HEADER_CARD_PADDING_X;
    // `HEADER_BESIDE_{MIN,MAX}_WIDTH_PX` bound the **boxWidth** (= cardWidth
    // + left outer pad). Subtract one outer pad to derive the cardWidth
    // bounds.
    const cardWidth = Math.max(
        HEADER_BESIDE_MIN_WIDTH_PX - HEADER_CARD_OUTER_PAD,
        Math.min(HEADER_BESIDE_MAX_WIDTH_PX - HEADER_CARD_OUTER_PAD, naturalCardWidth),
    );

    const titleBlockHeight =
        titleLines.length > 0 ? (titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT_PX : 0;
    const authorBlockHeight =
        authorLines.length > 0
            ? HEADER_TITLE_TO_AUTHOR_GAP_PX +
              (authorLines.length - 1) * HEADER_AUTHOR_LINE_HEIGHT_PX
            : 0;
    const cardHeight =
        HEADER_CARD_PADDING_TOP + titleBlockHeight + authorBlockHeight + HEADER_CARD_PADDING_BOTTOM;

    // `boxWidth` only includes the LEFT outer pad — the right-side breathing
    // room between the card and the chart is owned by `GUTTER_PX` in
    // `RoadmapNode`. So `boxWidth` doubles as `chartLeftX` (the card's right
    // edge in canvas coordinates).
    const boxWidth = cardWidth + HEADER_CARD_OUTER_PAD;
    return { titleLines, authorLines, cardWidth, cardHeight, boxWidth };
}

// Compute a sensible [startDate, endDate] window.
//
// Precedence:
//   1. An explicit `length:` is a minimum span; content (including wave
//      barriers E_n and every S_k) past it grows the window to the next
//      tick boundary.
//   2. Otherwise we derive the end day from the actual content extent
//      (latest item end, anchor date, milestone date/after, and today's
//      now-line if it falls past the content). This keeps the rendered
//      chart from defaulting to a 180-day desert when the content only
//      spans a few weeks.
//   3. As a last resort (no content + no length), fall back to a small
//      4-week placeholder so an empty roadmap still draws a sensible axis.
//
// `plan` is the roadmap's wave plan (`buildWavePlan`, built once per
// layout), or undefined when it declares no waves.
//
// Exported for tests (engine B, specs/waves.md §8.5); not part of the
// package surface.
export function computeDateWindow(
    file: NowlineFile,
    ctx: {
        cal: import('./calendar.js').CalendarConfig;
        sizes: Map<string, import('./types.js').ResolvedSize>;
    },
    resolved: ResolveResult,
    today: Date | undefined,
    scale: ViewPreset,
    plan: WavePlan | undefined,
): { startDate: Date; endDate: Date } {
    const roadmap = file.roadmapDecl;
    const props = roadmap?.properties ?? [];
    const startRaw = propValue(props, 'start');
    // Spec (`specs/dsl.md`): "A roadmap with no `start:` and no dates is
    // purely relative — renderers choose their own reference date (e.g.
    // the day of rendering)." Use the caller's `today` (the resolved
    // `--now`) when present so the start lines up with the now-line, and
    // fall back to actual today's UTC midnight otherwise. Either default
    // is dangerous — output drifts day-to-day — but it's strictly better
    // than the legacy "Jan 1 of the current year" fallback that drifted
    // every January 1 by 365 days at once. Authors should set `start:`
    // for any roadmap they want to be reproducible.
    const startDate = parseDate(startRaw) ?? defaultStartDate(today);
    const lengthRaw = propValue(props, 'length');
    let minDays = 0;
    if (lengthRaw) {
        const days = literalDays(lengthRaw, ctx.cal);
        if (days > 0) {
            minDays = days;
        }
    }
    // An explicit `length:` bounds the now-line: a far-future `today` must
    // not stretch a deliberately-sized roadmap (that case stays out of range
    // and surfaces as an NL.W1000 insight). Content overflow — items,
    // anchors, milestones — still grows the window below via `padded`, with
    // `length:` acting purely as the floor. Without `length:`, `today`
    // extends the window as before so the now-line is always in range.
    const contentDays = computeContentEndDay(
        resolved,
        ctx,
        startDate,
        minDays > 0 ? undefined : today,
        plan,
    );
    const tickDays = daysPerUnit(scale.unit, ctx.cal);
    // Round up to the smallest tick boundary that is `>= contentDays`. When
    // the latest content lands exactly on a tick boundary the chart ends
    // exactly there (no extra trailing tick); otherwise we extend to the
    // next tick so the right edge always sits on a labelled column. For
    // month / quarter / year scales the boundary is a real month /
    // quarter / year start, not a multiple of `days-per-month` etc.
    const padded = tickBoundaryAtOrAfter(
        startDate,
        contentDays > 0 ? contentDays : 4 * ctx.cal.daysPerWeek,
        scale.unit,
        tickDays,
    );
    const finalDays = Math.max(minDays, padded);
    return { startDate, endDate: addDays(startDate, Math.max(1, finalDays)) };
}

/**
 * Reference date used when a roadmap omits `start:`. Prefers the
 * caller-supplied `today` (UTC midnight already, when it comes from
 * the CLI); falls back to actual today's UTC midnight so the layout
 * still produces a valid window for direct API callers that don't pass
 * a `today`. Date components are taken in UTC to match `parseDate`.
 */
function defaultStartDate(today: Date | undefined): Date {
    const ref = today ?? new Date();
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
}

function literalDays(literal: string, cal: import('./calendar.js').CalendarConfig): number {
    const m = /^(\d+(?:\.\d+)?)([dwmqy])$/.exec(literal);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    switch (m[2]) {
        case 'd':
            return n;
        case 'w':
            return n * cal.daysPerWeek;
        case 'm':
            return n * cal.daysPerMonth;
        case 'q':
            return n * cal.daysPerQuarter;
        case 'y':
            return n * cal.daysPerYear;
        default:
            return 0;
    }
}

// Walk every dated/sequenced entity in the resolved content and return the
// latest day-offset from `startDate`. Mirrors the sequencer's start-rules
// (date: > start: > after: > previous-in-lane) without producing positions.
//
// With waves (`plan` set, specs/waves.md §8.5) the lane walk runs inside the
// barrier driver: starts are floored by their wave's `S_k`, isolated regions
// are walked in-pass (one level, fresh id maps seeded with the wave edges)
// instead of by the post-hoc recursion, and the result includes `E_n` and
// every `S_k`.
function computeContentEndDay(
    resolved: ResolveResult,
    ctx: {
        cal: import('./calendar.js').CalendarConfig;
        sizes: Map<string, import('./types.js').ResolvedSize>;
    },
    startDate: Date,
    today: Date | undefined,
    plan?: WavePlan,
): number {
    let itemEnd = new Map<string, number>();
    const anchorEnd = new Map<string, number>();
    const milestoneEnd = new Map<string, number>();
    let maxDay = 0;

    // Pre-seed anchors fixed by `date:` so items that reference them get a
    // valid end-day during the lane walk.
    for (const anchor of resolved.content.anchors.values()) {
        const d = parseDate(propValue(anchor.properties, 'date'));
        if (d && anchor.name) {
            const day = daysBetween(startDate, d);
            anchorEnd.set(anchor.name, day);
            maxDay = Math.max(maxDay, day);
        }
    }

    // The id maps one walk resolves `after:` against: the main lanes share
    // the maps above; an isolated region (wave mode only) gets fresh maps.
    interface WalkScope {
        itemEnd: Map<string, number>;
        anchorEnd: ReadonlyMap<string, number>;
        milestoneEnd: ReadonlyMap<string, number>;
        sizes: Map<string, import('./types.js').ResolvedSize>;
    }
    const mainScope = (): WalkScope => ({ itemEnd, anchorEnd, milestoneEnd, sizes: ctx.sizes });

    // `wave` is the current barrier pass (undefined without waves); `reach`
    // receives every lane cursor so the caller can track the content end.
    const makeWalker = (
        scope: WalkScope,
        wave: WavePass | undefined,
        reach: (day: number) => void,
    ) => {
        // Resolve a single `after:` element to a day-offset from `startDate`.
        // The element is either an entity id (looked up in itemEnd /
        // anchorEnd / milestoneEnd) or an inline ISO date literal (converted
        // directly via `daysBetween`). The validator already enforces "at
        // most one inline date per direction", so at most one element per
        // list will hit the date path.
        const resolveAfterDay = (ref: string): number => {
            const inlineDate = parseDate(ref);
            if (inlineDate) return daysBetween(startDate, inlineDate);
            if (scope.itemEnd.has(ref)) return scope.itemEnd.get(ref)!;
            if (scope.anchorEnd.has(ref)) return scope.anchorEnd.get(ref)!;
            if (scope.milestoneEnd.has(ref)) return scope.milestoneEnd.get(ref)!;
            return 0;
        };

        const walkLane = (
            children: SwimlaneDeclaration['content'],
            baselineEnd: number,
        ): number => {
            let prevEnd = baselineEnd;
            for (const child of children) {
                if (child.$type === 'DescriptionDirective') continue;
                prevEnd = walkNode(child as ItemDeclaration | GroupBlock | ParallelBlock, prevEnd);
                reach(prevEnd);
            }
            return prevEnd;
        };

        const walkNode = (
            node: ItemDeclaration | GroupBlock | ParallelBlock,
            prevEnd: number,
        ): number => {
            if (isItemDeclaration(node)) {
                const dur = deriveItemDurationDays(node.properties, scope.sizes, ctx.cal);
                const dateProp = parseDate(propValue(node.properties, 'date'));
                const startProp = parseDate(propValue(node.properties, 'start'));
                const afterRefs = propValues(node.properties, 'after');
                let start = prevEnd;
                if (dateProp) {
                    start = daysBetween(startDate, dateProp);
                } else if (startProp) {
                    start = daysBetween(startDate, startProp);
                } else if (afterRefs.length > 0) {
                    start = Math.max(prevEnd, ...afterRefs.map(resolveAfterDay));
                }
                // The barrier floor is one more term in the max; a pin
                // becomes max(pin, F).
                if (wave) start = wave.apply(node, start);
                const end = start + dur;
                if (node.name) scope.itemEnd.set(node.name, end);
                wave?.accumulate(node, end);
                return end;
            }
            if (isParallelBlock(node)) {
                // All children share the parallel's start; the block's
                // effective end is the maximum child end. The parallel's own
                // `after:` (including inline-date pins) widens that shared
                // start, and so does its wave floor.
                const afterRefs = propValues(node.properties, 'after');
                let containerStart =
                    afterRefs.length > 0
                        ? Math.max(prevEnd, ...afterRefs.map(resolveAfterDay))
                        : prevEnd;
                if (wave) containerStart = wave.apply(node, containerStart);
                let parallelEnd = containerStart;
                for (const child of node.content) {
                    if (child.$type === 'DescriptionDirective') continue;
                    const childEnd = walkNode(
                        child as ItemDeclaration | GroupBlock,
                        containerStart,
                    );
                    parallelEnd = Math.max(parallelEnd, childEnd);
                }
                return parallelEnd;
            }
            if (isGroupBlock(node)) {
                // The group's own `after:` (including inline-date pins) widens
                // the baseline before walking the inner sequential lane, and
                // so does its wave floor.
                const afterRefs = propValues(node.properties, 'after');
                let containerStart =
                    afterRefs.length > 0
                        ? Math.max(prevEnd, ...afterRefs.map(resolveAfterDay))
                        : prevEnd;
                if (wave) containerStart = wave.apply(node, containerStart);
                return walkLane(node.content as SwimlaneDeclaration['content'], containerStart);
            }
            return prevEnd;
        };

        return { walkLane, resolveAfterDay };
    };

    const reachMax = (day: number): void => {
        maxDay = Math.max(maxDay, day);
    };
    if (!plan) {
        const { walkLane } = makeWalker(mainScope(), undefined, reachMax);
        for (const lane of resolved.content.swimlanes.values()) {
            walkLane(lane.content, 0);
        }
    } else {
        const ids = plan.waves.map((w) => w.name as string);
        let passMax = 0;
        const reachPass = (day: number): void => {
            passMax = Math.max(passMax, day);
        };
        const barrier = solveWaveBarriers(ids.length, 0, waveFloorDays(plan, startDate), (S, E) => {
            // Reset the item maps, keep the anchors, and seed each wave
            // id with E_k so `after:<wave>` resolves to the wave's end.
            const seeds = ids.map((id, i): [string, number] => [id, E[i]]);
            itemEnd = new Map(seeds);
            passMax = 0;
            const pass = new WavePass(plan, S);
            const { walkLane } = makeWalker(mainScope(), pass, reachPass);
            for (const lane of resolved.content.swimlanes.values()) {
                walkLane(lane.content, 0);
            }
            // Exactly one level of isolated regions, each with fresh id
            // maps seeded only with the wave edges (engine A's region
            // `childCtx`). This replaces the post-hoc region recursion.
            // In wave mode region anchors, region milestones and nested
            // regions do not extend the window, matching engine A, which
            // draws none of them.
            for (const region of resolved.content.isolatedRegions) {
                const regionWalker = makeWalker(
                    {
                        itemEnd: new Map(seeds),
                        anchorEnd: new Map(),
                        milestoneEnd: new Map(),
                        sizes: resolveSizes(region.content.sizes, ctx.cal),
                    },
                    pass,
                    reachPass,
                );
                for (const lane of region.content.swimlanes.values()) {
                    regionWalker.walkLane(lane.content, 0);
                }
            }
            return pass;
        });
        // The final pass ran with the solved S/E. The content end covers the
        // last wave's end and every wave start, so floors and empty trailing
        // waves stay inside the window.
        maxDay = Math.max(maxDay, passMax, ...barrier.S, ...barrier.E.slice(-1));
    }

    // Milestones (after items so `after:` references can resolve, including
    // wave ids to their E_k).
    const { resolveAfterDay } = makeWalker(mainScope(), undefined, reachMax);
    for (const ms of resolved.content.milestones.values()) {
        const d = parseDate(propValue(ms.properties, 'date'));
        if (d) {
            const day = daysBetween(startDate, d);
            if (ms.name) milestoneEnd.set(ms.name, day);
            maxDay = Math.max(maxDay, day);
            continue;
        }
        const after = propValues(ms.properties, 'after');
        if (after.length > 0) {
            // Milestones disallow inline date literals at the validator
            // level (rule 24a — milestones already have `date:`). The
            // shared `resolveAfterDay` helper still handles such input
            // gracefully if it slips past, treating the date as the
            // milestone's effective day.
            const day = Math.max(0, ...after.map(resolveAfterDay));
            if (ms.name) milestoneEnd.set(ms.name, day);
            maxDay = Math.max(maxDay, day);
        }
    }

    // Isolated includes contribute their own content extent against the
    // shared timeline. With waves they were walked in-pass above.
    if (!plan) {
        for (const region of resolved.content.isolatedRegions) {
            const nestedMax = computeContentEndDay(
                {
                    config: region.config,
                    content: region.content,
                    diagnostics: [],
                    processedFiles: new Set(),
                },
                ctx,
                startDate,
                undefined,
            );
            maxDay = Math.max(maxDay, nestedMax);
        }
    }

    if (today) {
        const t = daysBetween(startDate, today);
        if (t > 0) maxDay = Math.max(maxDay, t);
    }

    return maxDay;
}

function buildDependencies(
    items: Map<string, ItemDeclaration>,
    swimlanes: PositionedSwimlane[],
    includes: PositionedIncludeRegion[],
    ctx: LayoutContext,
): PositionedDependencyEdge[] {
    // m2g+: collect every painted item bar + every visible parallel /
    // group bracket once, hand to the channel router so it can drop
    // vertical legs in clean inter-column gutters and nudge away from
    // bracket strokes that would otherwise be hugged.
    const grid = new ChannelGrid(collectRoutingObstacles(swimlanes, includes));

    interface Pending {
        fromId: string;
        toId: string;
    }
    const requests: EdgeRouteRequest[] = [];
    const pending: Pending[] = [];

    // Ports are read off each item's FINAL box here, after every row and
    // marker-band shift has run, never captured while the item was placed.
    const bandwidth = ctx.bandScale.bandwidth();
    for (const [id, item] of items) {
        const afters = propValues(item.properties, 'after');
        const target = ctx.placedItems.get(id);
        if (!target) continue;
        // The arrow always TERMINATES at the target item's left
        // visual edge, on its attach line (see `itemArrowTargetPort`).
        const targetPoint = itemArrowTargetPort(target, bandwidth);
        for (const pred of afters) {
            // Source point depends on what kind of predecessor `pred`
            // is. For ITEMS we use the per-item arrow source port
            // — (visualRight, nominal midline) by default, dropping to
            // (visualRight, bar.bottom - PROGRESS_STRIP_HEIGHT/2) when
            // the caption spilled past the right edge so the arrow
            // exits below the spilled title / meta text. For ANCHORS
            // / MILESTONES we attach to the marker's vertical CUT
            // LINE at the TARGET item's attach Y — the dashed/solid
            // cut line already drops through the chart and reads as
            // the arrow's stem, so a short horizontal stub from the
            // line into the bar's left edge is the cleanest
            // connection.
            const predItem = ctx.placedItems.get(pred);
            let from: Point;
            const isMarkerPred = predItem === undefined;
            if (predItem) {
                from = itemArrowSourcePort(predItem, bandwidth);
            } else {
                const markerMid = ctx.entityMidpoints.get(pred);
                if (!markerMid) continue;
                from = { x: markerMid.x, y: targetPoint.y };
            }
            // Skip same-row contiguous chains for ITEM → ITEM only:
            // when the target sits immediately to the right of the
            // source on the same row, the spatial flow already
            // conveys ordering and an arrow is redundant noise.
            // MARKER → ITEM stubs always draw (the cut line is the
            // stem; the short stub completes the visual connection
            // even when the bar is right next to the cut line).
            if (
                !isMarkerPred &&
                Math.abs(from.y - targetPoint.y) < 0.5 &&
                targetPoint.x - from.x < 20
            ) {
                continue;
            }
            requests.push({
                fromId: pred,
                toId: id,
                from,
                to: targetPoint,
                isMarkerSource: isMarkerPred,
            });
            pending.push({ fromId: pred, toId: id });
        }
    }

    const routed = routeChannelEdges(requests, grid);
    const out: PositionedDependencyEdge[] = [];
    for (let i = 0; i < routed.length; i++) {
        const r = routed[i];
        out.push({
            fromId: pending[i].fromId,
            toId: pending[i].toId,
            waypoints: r.waypoints,
            kind: r.underBar ? 'underBar' : 'normal',
            style: resolveStyle('item', [], ctx.styleCtx),
        });
    }
    return out;
}

function buildNowline(
    today: Date | undefined,
    ctx: LayoutContext,
    locale: string,
): PositionedNowline | null {
    if (!today) return null;
    const x = ctx.scale.forwardWithinDomain(today);
    if (x === null) return null;
    // Pill row is the band reserved at the very top of the timeline area.
    // The line drops from the bottom of the pill (top of the date headers)
    // through any marker row and into the chart, so the pill and line stay
    // visually connected.
    const pillTopY = ctx.timeline.box.y;
    const lineTopY = ctx.timeline.tickPanelY;
    // Pill width is locale-aware: en-US's `'now'` (3 chars) fits the
    // 36 px default trivially; longer strings like fr's `'maint.'`
    // (6 chars) need a wider pill to avoid clipping. Floor at the
    // default so en-US output stays byte-stable; grow when the
    // measured label needs it. The 2× inset matches the renderer's
    // flag-mode label inset (`NOW_PILL_LABEL_INSET_X_PX`) and gives
    // the same visual padding to centered-mode strings.
    const label = localeStrings(locale).nowLabel;
    const labelTextWidth = estimateTextWidth(label, NOW_PILL_LABEL_FONT_SIZE_PX);
    const pillWidth = Math.max(
        NOW_PILL_WIDTH_PX,
        Math.ceil(labelTextWidth + 2 * NOW_PILL_LABEL_INSET_X_PX),
    );
    // The "chart's left edge" the pill must clear is `chartLeftX` (in
    // beside-mode, the right edge of the header card; in above-mode,
    // the canvas left edge at x=0). originX = chartLeftX + GUTTER_PX,
    // so we recover chartLeftX as `originX - GUTTER_PX`.
    const chartLeftX = ctx.timeline.originX - GUTTER_PX;
    const halfPill = pillWidth / 2;
    let pillMode: 'center' | 'flag-right' | 'flag-left';
    if (x - halfPill < chartLeftX) {
        // Centered pill would intrude into the header card / past the
        // canvas left edge — anchor the pill's LEFT side to the line
        // and let it extend right into the chart.
        pillMode = 'flag-right';
    } else if (x + halfPill > ctx.chartRightX) {
        // Centered pill would clip past the canvas right edge — anchor
        // the pill's RIGHT side to the line and let it extend left.
        pillMode = 'flag-left';
    } else {
        pillMode = 'center';
    }
    // Bottom-most Y the now-line should reach. When a mirrored bottom
    // tick panel exists, thread the line through it (so the line ties
    // the two date strips together visually). Otherwise stop at the
    // last swimlane — never extend into the footnote area below.
    const bottomTickPanelY = ctx.timeline.bottomTickPanelY;
    const bottomTickPanelHeight = ctx.timeline.bottomTickPanelHeight ?? 0;
    const lineBottomY =
        bottomTickPanelY !== undefined && bottomTickPanelHeight > 0
            ? bottomTickPanelY + bottomTickPanelHeight
            : ctx.swimlaneBottomY;
    return {
        x,
        topY: lineTopY,
        bottomY: lineBottomY,
        pillTopY,
        pillMode,
        label,
        pillWidth,
        style: resolveStyle('item', [], ctx.styleCtx),
    };
}

// Mutable layout-time context shared across helpers.

// Traverse the full content tree to build an `items` map keyed by id.
function collectItems(swimlanes: SwimlaneDeclaration[]): Map<string, ItemDeclaration> {
    const out = new Map<string, ItemDeclaration>();
    const walk = (node: ItemDeclaration | GroupBlock | ParallelBlock): void => {
        if (isItemDeclaration(node)) {
            // Title-only items register under a synthetic, non-referenceable
            // handle so they still appear as dependency-edge targets.
            out.set(node.name ?? syntheticItemKey(node), node);
            return;
        }
        if (isParallelBlock(node)) {
            for (const child of node.content) {
                if (child.$type === 'DescriptionDirective') continue;
                walk(child as ItemDeclaration | GroupBlock);
            }
            return;
        }
        if (isGroupBlock(node)) {
            for (const child of node.content) {
                if (child.$type === 'DescriptionDirective') continue;
                walk(child as ItemDeclaration | GroupBlock | ParallelBlock);
            }
            return;
        }
    };
    for (const lane of swimlanes) {
        for (const child of lane.content) {
            if (child.$type === 'DescriptionDirective') continue;
            walk(child as ItemDeclaration | GroupBlock | ParallelBlock);
        }
    }
    return out;
}

export function layoutRoadmap(
    file: NowlineFile,
    resolved: ResolveResult,
    options: LayoutOptions = {},
): LayoutResult {
    // The wave plan is built once and shared by engine B (the date window)
    // and engine A (the barrier passes); undefined without waves.
    const plan = buildWavePlan(resolved);
    return new RoadmapNode().place(file, resolved, options, plan, {
        sequenceItem,
        sequenceOne,
        resolveChildStart,
        newCursor,
        estimateTextWidth,
        predictItemBarExtraHeight,
        computeDateWindow,
        sizeBesideHeader,
        collectItems,
        buildDependencies,
        buildNowline,
    });
}
