import type {
    NowlineFile,
    ItemDeclaration,
    GroupBlock,
    ParallelBlock,
    SwimlaneDeclaration,
    AnchorDeclaration,
    MilestoneDeclaration,
    FootnoteDeclaration,
    EntityProperty,
    LabelDeclaration,
    IsolatedRegion,
    ResolveResult,
} from '@nowline/core';
import {
    isItemDeclaration,
    isGroupBlock,
    isParallelBlock,
} from '@nowline/core';
import type {
    PositionedRoadmap,
    PositionedHeader,
    PositionedSwimlane,
    PositionedTrackChild,
    PositionedItem,
    PositionedGroup,
    PositionedParallel,
    PositionedAnchor,
    PositionedMilestone,
    PositionedDependencyEdge,
    PositionedLabelChip,
    PositionedFootnoteArea,
    PositionedFootnoteEntry,
    PositionedIncludeRegion,
    PositionedNowline,
    PositionedTimelineScale,
    ResolvedStyle,
    Point,
    BoundingBox,
    StatusKind,
    LinkIconKind,
} from './types.js';
import { themes, type Theme, type ThemeName, resolveColor } from './themes/index.js';
import {
    resolveStyle,
    resolveLabelChipStyle,
    type StyleContext,
} from './style-resolution.js';
import { resolveCalendar, resolveDuration, addDays, daysBetween } from './calendar.js';
import { resolveScale, buildHeaderTicks, type ViewPreset } from './view-preset.js';
import { TimeScale } from './time-scale.js';
import { fromCalendarConfig, daysPerUnit, type WorkingCalendar } from './working-calendar.js';
import {
    HEADER_ABOVE_HEIGHT_PX,
    HEADER_BESIDE_MIN_WIDTH_PX,
    HEADER_BESIDE_MAX_WIDTH_PX,
    MIN_ITEM_WIDTH,
    ITEM_INSET_PX,
    PADDING_PX,
    SPACING_PX,
    GUTTER_PX,
    FOOTNOTE_ROW_HEIGHT,
    EDGE_CORNER_RADIUS,
    PROGRESS_STRIP_HEIGHT_PX,
    NOW_PILL_WIDTH_PX,
} from './themes/shared.js';
import { BandScale, defaultRowBand } from './band-scale.js';
import {
    HEADER_CARD_PADDING_X,
    HEADER_CARD_PADDING_TOP,
    HEADER_CARD_PADDING_BOTTOM,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_AUTHOR_FONT_SIZE_PX,
} from './header-card-geometry.js';
import {
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    ITEM_DECORATION_SPILL_GAP_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_INSET_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    LABEL_CHIP_HEIGHT_PX,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
    LABEL_CHIP_ROW_STEP_PX,
    MIN_BAR_WIDTH_FOR_DOT_PX,
    MIN_BAR_WIDTH_FOR_FOOTNOTE_PX,
    MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX,
    packSpillChips,
} from './item-bar-geometry.js';
import { ItemNode } from './nodes/item-node.js';
import { SwimlaneNode } from './nodes/swimlane-node.js';
import { ParallelNode } from './nodes/parallel-node.js';
import { GroupNode } from './nodes/group-node.js';
import { buildAnchors } from './nodes/anchor-node.js';
import { buildMilestones } from './nodes/milestone-node.js';
import { buildFootnotes } from './nodes/footnote-node.js';
import { buildIncludeRegions } from './nodes/include-node.js';
import { RoadmapNode } from './nodes/roadmap-node.js';
import { type LayoutContext, type TrackCursor, type LayoutHelpers, newCursor } from './layout-context.js';
import { propValue, propValues, parseDate } from './dsl-utils.js';

export interface LayoutOptions {
    theme?: ThemeName;
    today?: Date;
    width?: number;   // total SVG width in px; default 1280
}

export type LayoutResult = PositionedRoadmap;

function statusFromProp(raw: string | undefined): StatusKind {
    switch (raw) {
        case 'done':
        case 'in-progress':
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

// Resolve a duration property value to its literal length when it names a
// declared duration alias. Returns the original string for raw literals
// (`1w`, `3d`) and undefined for missing values.
function resolveDurationLiteral(
    raw: string | undefined,
    ctx: { durations: Map<string, import('@nowline/core').DurationDeclaration> },
): string | undefined {
    if (!raw) return undefined;
    if (/^\d+[dwmqy]$/.test(raw) || /^\d+%$/.test(raw)) return raw;
    const dur = ctx.durations.get(raw);
    if (!dur) return raw;
    const lengthProp = dur.properties.find((p) =>
        (p.key.endsWith(':') ? p.key.slice(0, -1) : p.key) === 'length',
    );
    return lengthProp?.value ?? raw;
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
    const durationDays = resolveDuration(propValue(props, 'duration'), ctx.durations, ctx.cal);
    const afterRaw = propValues(props, 'after');
    const beforeRaw = propValue(props, 'before');
    const dateRaw = propValue(props, 'date');
    const remainingDays = resolveDuration(
        propValue(props, 'remaining'),
        ctx.durations,
        ctx.cal,
    );

    // Resolve start x: explicit date > after-chain > cursor position
    let startX = cursor.x;
    const explicitDate = parseDate(dateRaw);
    if (explicitDate) {
        const xd = ctx.scale.forwardWithinDomain(explicitDate);
        if (xd !== null) startX = xd;
    } else if (afterRaw.length > 0) {
        let maxEnd = cursor.x;
        for (const ref of afterRaw) {
            const endX = ctx.entityRightEdges.get(ref);
            if (endX !== undefined) maxEnd = Math.max(maxEnd, endX);
        }
        startX = Math.max(cursor.x, maxEnd);
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
    const chipInsideAvailWidth = Math.max(
        0,
        visualWidthPredict - 2 * ITEM_CAPTION_INSET_X_PX,
    );
    const chipsOutside =
        chipSamples.length > 0 && chipRowWidth > chipInsideAvailWidth;

    // Handle `before:` — item must end by the named anchor/milestone x.
    let hasOverflow = false;
    let overflowBox: BoundingBox | undefined;
    let overflowAnchorId: string | undefined;
    if (beforeRaw) {
        const beforeX = ctx.entityLeftEdges.get(beforeRaw);
        if (beforeX !== undefined) {
            if (logicalRight > beforeX) {
                hasOverflow = true;
                overflowBox = {
                    x: beforeX,
                    y: cursor.y,
                    width: logicalRight - beforeX,
                    height: ctx.bandScale.bandwidth(),
                };
                overflowAnchorId = beforeRaw;
            }
        }
    }

    // Progress fraction
    const statusRaw = propValue(props, 'status');
    const status = statusFromProp(statusRaw);
    let progress = parseProgressFraction(statusRaw);
    if (progress === 0 && status === 'done') progress = 1;
    const remainingPctMatch = /^(\d{1,3})%$/.exec(propValue(props, 'remaining') ?? '');
    if (progress === 0 && status === 'in-progress' && remainingPctMatch) {
        const pct = Math.max(0, Math.min(100, parseInt(remainingPctMatch[1], 10))) / 100;
        progress = 1 - pct;
    }
    if (progress === 0 && status === 'in-progress' && remainingDays > 0 && durationDays > 0) {
        progress = Math.max(0, Math.min(1, 1 - remainingDays / durationDays));
    }

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
    const STATUS_BORDER: Record<StatusKind, string> = {
        done: ctx.styleCtx.theme.status.done,
        'in-progress': ctx.styleCtx.theme.status.inProgress,
        'at-risk': ctx.styleCtx.theme.status.atRisk,
        blocked: ctx.styleCtx.theme.status.blocked,
        planned: ctx.styleCtx.theme.status.planned,
        neutral: ctx.styleCtx.theme.status.neutral,
    };
    const isLight = ctx.styleCtx.theme.name === 'light';
    const themeDefaultBg = isLight ? '#ffffff' : '#0f172a';
    const themeDefaultFg = '#94a3b8';
    if (style.bg === themeDefaultBg) {
        style.bg = isLight ? STATUS_TINT_LIGHT[status] : STATUS_TINT_DARK[status];
    }
    if (style.fg === themeDefaultFg) {
        style.fg = STATUS_BORDER[status];
    }

    // Pre-format the secondary line shown inside the item bar. If the
    // duration is a named id (e.g. `lg`), resolve it to its declared length
    // literal so the bar shows the duration ("2w") not the alias ("lg").
    const durationRaw = propValue(props, 'duration');
    const durationLiteral = resolveDurationLiteral(durationRaw, ctx);
    const remainingRaw = propValue(props, 'remaining');
    const remainingLiteral = resolveDurationLiteral(remainingRaw, ctx);
    let metaText: string | undefined;
    const ownerDisplay = resolveActorDisplay(ownerOverride ?? propValue(props, 'owner'), ctx);
    if (status === 'in-progress' && remainingLiteral) {
        if (ownerDisplay) {
            metaText = `${ownerDisplay} — ${remainingLiteral} remaining`;
        } else if (durationLiteral) {
            metaText = `${durationLiteral} — ${remainingLiteral} remaining`;
        } else {
            metaText = `${remainingLiteral} remaining`;
        }
    } else if (status === 'in-progress' && progress > 0 && progress < 1) {
        const pct = Math.round((1 - progress) * 100);
        metaText = ownerDisplay
            ? `${ownerDisplay} — ${pct}% remaining`
            : durationLiteral ? `${durationLiteral} — ${pct}% remaining` : `${pct}% remaining`;
    } else if (ownerDisplay) {
        metaText = ownerDisplay;
    } else if (durationLiteral) {
        metaText = durationLiteral;
    }

    // Visual bar + caption-spill decision delegated to ItemNode. Logical
    // extent (used by chaining and `after:` lookups) stays on
    // logicalLeft/logicalRight; ItemNode computes the inset visual box and
    // whether the title+meta line overflows the bar's inner padded width.
    const titleStr = node.title ?? node.name ?? '';
    const placed = new ItemNode({
        id: node.name ?? '',
        title: titleStr,
        logicalLeftX: logicalLeft,
        logicalRightX: logicalRight,
        metaText,
        hasLinkIcon,
    }).place(
        { x: logicalLeft, y: cursor.y },
        { time: ctx.scale, bands: ctx.bandScale, style },
    );
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
    const iconSpills =
        hasLinkIcon && itemBox.width < MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX;
    const footnoteSpillsForNarrow =
        itemBox.width < MIN_BAR_WIDTH_FOR_FOOTNOTE_PX;
    const textSpills = placed.textSpills || iconSpills;

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
    // When chips spill, the BAR ITSELF GROWS DOWNWARD so the chip
    // column reads as enclosed by the bar — the painted footprint
    // of the bar is `bandwidth + chipBarExtra` and the bottom
    // progress strip moves with the new bottom edge. Chip Y is
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
    const chipRowCount = chipPack
        ? chipPack.rows.length
        : (chipSamples.length > 0 ? 1 : 0);
    const hasMeta = metaText !== undefined;
    const chipBarExtra = computeChipBarExtra(
        chipsOutside,
        textSpills,
        chipRowCount,
        bandwidth,
        hasMeta,
    );
    if (chipBarExtra > 0) {
        itemBox.height = bandwidth + chipBarExtra;
    }

    const labelChips: PositionedLabelChip[] = [];
    const baseChipY = itemBox.y + bandwidth
        - PROGRESS_STRIP_HEIGHT_PX
        - LABEL_CHIP_HEIGHT_PX
        - LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    const captionStackChipY =
        itemBox.y + ITEM_CAPTION_META_BASELINE_OFFSET_PX
        + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    // Inside-bar chips with meta need to clear the meta baseline —
    // the natural `baseChipY` (anchored to bar bottom) sits above
    // the meta line at typical bandwidths, so the chip rect would
    // overlap the meta text vertically. Use whichever Y is lower.
    // Outside-bar chips already reuse `captionStackChipY` when the
    // caption ALSO spills; with caption inside we don't need to
    // shift them since they're horizontally separated from the meta.
    const stackBelowMeta =
        (chipsOutside && textSpills) ||
        (!chipsOutside && hasMeta && chipSamples.length > 0);
    const chipRow0Y = stackBelowMeta
        ? Math.max(baseChipY, captionStackChipY)
        : baseChipY;
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
        chipsRightX = chipSamples.length > 0
            ? rowCursorX - LABEL_CHIP_GAP_BETWEEN_PX
            : chipStartX;
    }

    // Footnote superscript indicators. Authors can attach a footnote to
    // an item from either direction:
    //   item foo footnote:[bar]            → forward reference on the item
    //   footnote bar on:[foo]               → reverse reference on the footnote
    // Both are equally valid per `specs/dsl.md`. Collect indices from both
    // sides and deduplicate so an item that appears in both gets a single
    // superscript.
    const footIds = propValues(props, 'footnote');
    const footnoteIndicatorSet = new Set<number>();
    for (const id of footIds) {
        const n = ctx.footnoteIndex.get(id);
        if (n !== undefined) footnoteIndicatorSet.add(n);
    }
    if (node.name) {
        for (const [fid, hosts] of ctx.footnoteHosts.entries()) {
            if (hosts.includes(node.name)) {
                const n = ctx.footnoteIndex.get(fid);
                if (n !== undefined) footnoteIndicatorSet.add(n);
            }
        }
    }
    const footnoteIndicators = [...footnoteIndicatorSet].sort((a, b) => a - b);

    const owner = ownerDisplay ?? ownerOverride ?? propValue(props, 'owner');
    const description = node.description?.text;

    // Footnote glyphs only need to spill when there's at least one
    // indicator AND the bar is too narrow to host them at the inset-
    // right anchor. Compute the final boolean here once we know the
    // indicator count.
    const footnoteSpills =
        footnoteIndicators.length > 0 && footnoteSpillsForNarrow;

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
        const titleW = estimateTextWidth(
            titleStr,
            ITEM_CAPTION_TITLE_FONT_SIZE_PX,
        );
        const metaW = metaText ? estimateTextWidth(metaText, 11) : 0;
        captionSpillWidth = Math.max(titleW, metaW);
        spillCursor += captionSpillWidth;
        needGap = true;
    }
    let footnoteSpillStartX: number | null = null;
    if (footnoteSpills) {
        if (needGap) spillCursor += ITEM_DECORATION_SPILL_GAP_PX;
        footnoteSpillStartX = spillCursor;
        spillCursor +=
            footnoteIndicators.length * ITEM_FOOTNOTE_INDICATOR_STEP_PX;
        needGap = true;
    }
    let dotSpillCx: number | null = null;
    if (dotSpills) {
        if (needGap) spillCursor += ITEM_DECORATION_SPILL_GAP_PX;
        dotSpillCx = spillCursor + ITEM_STATUS_DOT_RADIUS_PX;
        spillCursor = dotSpillCx + ITEM_STATUS_DOT_RADIUS_PX;
        needGap = true;
    }
    const decorationsRightX = Math.max(
        itemBox.x + itemBox.width,
        spillCursor,
    );

    const id = node.name;
    if (id) {
        // Entity edges live in LOGICAL space so chained items / `after:`
        // references / dependency-arrow attach points sit on the column
        // boundary, not on the visually inset bar edge. The visible 12 px
        // gutter between bars then becomes a clean attach corridor.
        ctx.entityLeftEdges.set(id, logicalLeft);
        ctx.entityRightEdges.set(id, logicalRight);
        ctx.entityMidpoints.set(id, {
            x: (logicalLeft + logicalRight) / 2,
            y: itemBox.y + itemBox.height / 2,
        });
        // Slack-arrow attach Y. Defaults to the bar's row midpoint; when
        // the caption spills past the bar's right edge, drop to the
        // progress-strip's vertical center so the arrow aligns with the
        // bottom-edge progress bar instead of running through the
        // adjacent title/meta text. The `/ 2` keeps the attach point on
        // the strip's vertical center if `PROGRESS_STRIP_HEIGHT_PX` is
        // ever bumped.
        const slackAttachY = textSpills
            ? itemBox.y + itemBox.height - PROGRESS_STRIP_HEIGHT_PX / 2
            : itemBox.y + itemBox.height / 2;
        ctx.itemSlackAttachY.set(id, slackAttachY);
    }

    cursor.x = logicalRight;
    cursor.maxX = Math.max(cursor.maxX, cursor.x);
    // The next row in a parallel/group/lane starts at
    // `cursor.y + cursor.height`. Default pitch is `bandScale.step()`
    // (bandwidth + inter-row gap). When the bar grew to enclose a
    // spilled chip column, the pitch grows by the SAME amount so the
    // inter-row gap stays constant — the next row's bar starts
    // `step − bandwidth` px below the (now-taller) bar bottom.
    cursor.height = Math.max(cursor.height, ctx.bandScale.step() + chipBarExtra);

    const result: PositionedItem = {
        kind: 'item',
        id,
        title: titleStr,
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
        style,
    };
    return result;
}

function sequenceParallel(
    node: ParallelBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedParallel {
    return new ParallelNode(node, { sequenceOne, newCursor }).place(cursor, ctx);
}

function sequenceGroup(
    node: GroupBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedGroup {
    return new GroupNode(node, {
        sequenceItem,
        sequenceOne,
        resolveChildStart,
        newCursor,
        estimateTextWidth,
        predictItemChipExtraHeight,
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
    throw new Error(`Unknown swimlane child type: ${(node as { $type?: string }).$type ?? 'unknown'}`);
}

// Rough px-width estimate for sans-serif text. Intentionally pessimistic
// (uses ~0.58 em per char) so we err toward "doesn't fit" and trigger a
// row bump rather than draw an item with a clipped title.
function estimateTextWidth(text: string, fontSize: number): number {
    return text.length * fontSize * 0.58;
}

/**
 * Compute the extra vertical px the bar grows when its spilled chip
 * column would otherwise extend below the (single-row) bottom. The
 * bar's painted footprint becomes `bandwidth + chipBarExtra`, the
 * progress strip rides the new bottom, and chip rows pack inside
 * the taller bar (anchored from the bar TOP so row 0 doesn't shift
 * when the bar grows).
 *
 * Returns 0 when chips fit inside the bar, when there are no chips,
 * or when the spilled column happens to fit inside `bandwidth` (a
 * single row with the caption inside, for instance).
 *
 * The same number is the row-pitch increase the swimlane / group
 * row-packer needs to reserve so the next row clears the taller
 * bar — `cursor.height = step + chipBarExtra` and the predict
 * helper returns this verbatim.
 */
function computeChipBarExtra(
    chipsOutside: boolean,
    captionSpills: boolean,
    chipRowCount: number,
    bandwidth: number,
    hasMeta: boolean,
): number {
    if (chipRowCount === 0) return 0;
    // Row 0 anchor relative to the bar's TOP — three regimes:
    //
    //   1. chipsOutside + captionSpills → chips stack below the
    //      spilled meta line (`captionStackTop`).
    //   2. chips INSIDE the bar AND meta is present → chip top must
    //      clear the meta baseline; the natural `baseTop` sits
    //      ABOVE the meta line at default bandwidth (=56), so we
    //      take whichever is lower of base/captionStack.
    //   3. otherwise (in-bar w/o meta, or chipsOutside w/o caption
    //      spill) → row 0 hugs the bar bottom at `baseTop`.
    //
    // Cases (2) and (3-with-multi-row-spill) can both grow the bar;
    // case (3-with-single-row-inside-no-meta) never grows.
    const baseTop =
        bandwidth
        - PROGRESS_STRIP_HEIGHT_PX
        - LABEL_CHIP_HEIGHT_PX
        - LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    const captionStackTop =
        ITEM_CAPTION_META_BASELINE_OFFSET_PX
        + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    let chipRow0Top: number;
    if (chipsOutside && captionSpills) {
        chipRow0Top = captionStackTop;
    } else if (!chipsOutside && hasMeta) {
        chipRow0Top = Math.max(baseTop, captionStackTop);
    } else {
        chipRow0Top = baseTop;
    }
    const lastRowBottomTop =
        chipRow0Top
        + (chipRowCount - 1) * LABEL_CHIP_ROW_STEP_PX
        + LABEL_CHIP_HEIGHT_PX;
    // The bar must be tall enough to fit `lastRowBottomTop` plus a
    // GAP above the progress strip plus the progress strip itself.
    const requiredHeight =
        lastRowBottomTop
        + LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX
        + PROGRESS_STRIP_HEIGHT_PX;
    return Math.max(0, requiredHeight - bandwidth);
}

/**
 * Predict an item's bar growth (and therefore row-pitch growth) for
 * a multi-row spilled chip column BEFORE the bar is sequenced. Used
 * by the swimlane / group row-packer so neighboring rows on later
 * rows are positioned correctly without a retroactive shift.
 *
 * Mirrors the chip-pack + caption-spill arithmetic in
 * `sequenceItem` so prediction and placement agree byte-for-byte.
 */
function predictItemChipExtraHeight(
    item: ItemDeclaration,
    ctx: LayoutContext,
): number {
    const props = item.properties;
    const labelIds = propValues(props, 'labels');
    if (labelIds.length === 0) return 0;
    const durationDays = resolveDuration(
        propValue(props, 'duration'),
        ctx.durations,
        ctx.cal,
    );
    const naturalWidth = Math.max(MIN_ITEM_WIDTH, durationDays * ctx.timeline.pixelsPerDay);
    const visualWidth = Math.max(MIN_ITEM_WIDTH, naturalWidth - 2 * ITEM_INSET_PX);
    const samples: { id: LabelDeclaration; width: number }[] = [];
    for (const labelId of labelIds) {
        const label = ctx.labels.get(labelId);
        if (!label) continue;
        const sample = buildLabelChip(label, ctx.styleCtx, 0, 0);
        samples.push({ id: label, width: sample.box.width });
    }
    if (samples.length === 0) return 0;
    let chipRowWidth = 0;
    for (let i = 0; i < samples.length; i += 1) {
        if (i > 0) chipRowWidth += LABEL_CHIP_GAP_BETWEEN_PX;
        chipRowWidth += samples[i].width;
    }
    const insideAvail = Math.max(0, visualWidth - 2 * ITEM_CAPTION_INSET_X_PX);
    const chipsOutside = chipRowWidth > insideAvail;

    // `hasMeta` mirrors `metaText !== undefined` in `sequenceItem`:
    // metaText is set whenever an item declares a duration, owner,
    // or remaining — so we just check those three props. Status
    // strings (in-progress) only matter when paired with one of
    // these, so this is an upper bound (false-positives still grow
    // the bar by exactly the same amount as the renderer would, so
    // they stay byte-stable).
    const hasMeta =
        propValue(props, 'duration') !== undefined ||
        propValue(props, 'owner') !== undefined ||
        propValue(props, 'remaining') !== undefined;

    const titleStr = item.title ?? item.name ?? '';
    const titleW = titleStr ? estimateTextWidth(titleStr, ITEM_CAPTION_TITLE_FONT_SIZE_PX) : 0;
    const captionSpills = titleW > insideAvail;
    const pack = chipsOutside ? packSpillChips(samples, visualWidth) : null;
    const chipRowCount = pack ? pack.rows.length : (samples.length > 0 ? 1 : 0);
    return computeChipBarExtra(
        chipsOutside,
        captionSpills,
        chipRowCount,
        ctx.bandScale.bandwidth(),
        hasMeta,
    );
}

// Resolve the desired startX for a swimlane child, honoring `date:` (fixed
// pin) > `start:` (fixed pin) > `after:` (chain after refs) > sequential
// default (continue from `seqDefault`, which is the lane's rightmost time
// cursor across all rows).
function resolveChildStart(
    props: EntityProperty[],
    seqDefault: number,
    laneLeftX: number,
    ctx: LayoutContext,
): number {
    const explicitDate = parseDate(propValue(props, 'date')) ?? parseDate(propValue(props, 'start'));
    if (explicitDate) {
        const xd = ctx.scale.forwardWithinDomain(explicitDate);
        if (xd !== null) return xd;
    }
    const afterRefs = propValues(props, 'after');
    if (afterRefs.length > 0) {
        let maxEnd = laneLeftX;
        for (const ref of afterRefs) {
            const endX = ctx.entityRightEdges.get(ref);
            if (endX !== undefined) maxEnd = Math.max(maxEnd, endX);
        }
        return Math.max(laneLeftX, maxEnd);
    }
    return seqDefault;
}

function buildSwimlane(
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
            predictItemChipExtraHeight,
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

// Word-wrap `text` so that no line wider than `maxWidth` (in px). Long single
// words are kept on their own line even if they overflow — we never split a
// word in the middle.
function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    if (!text) return [];
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
        const trial = cur ? `${cur} ${word}` : word;
        if (cur && estimateTextWidth(trial, fontSize) > maxWidth) {
            lines.push(cur);
            cur = word;
        } else {
            cur = trial;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

function sizeBesideHeader(title: string, author: string | undefined): SizedHeader {
    const maxContentWidth = HEADER_BESIDE_MAX_WIDTH_PX - 2 * HEADER_CARD_PADDING_X;
    const titleLines = wrapText(title, maxContentWidth, HEADER_TITLE_FONT_SIZE_PX);
    const authorLines = wrapText(author ?? '', maxContentWidth, HEADER_AUTHOR_FONT_SIZE_PX);

    let widest = 0;
    for (const line of titleLines) widest = Math.max(widest, estimateTextWidth(line, HEADER_TITLE_FONT_SIZE_PX));
    for (const line of authorLines) widest = Math.max(widest, estimateTextWidth(line, HEADER_AUTHOR_FONT_SIZE_PX));

    const naturalCardWidth = widest + 2 * HEADER_CARD_PADDING_X;
    // `HEADER_BESIDE_{MIN,MAX}_WIDTH_PX` bound the **boxWidth** (= cardWidth
    // + left outer pad). Subtract one outer pad to derive the cardWidth
    // bounds.
    const cardWidth = Math.max(
        HEADER_BESIDE_MIN_WIDTH_PX - HEADER_CARD_OUTER_PAD,
        Math.min(HEADER_BESIDE_MAX_WIDTH_PX - HEADER_CARD_OUTER_PAD, naturalCardWidth),
    );

    const titleBlockHeight = titleLines.length > 0
        ? (titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT_PX
        : 0;
    const authorBlockHeight = authorLines.length > 0
        ? HEADER_TITLE_TO_AUTHOR_GAP_PX + (authorLines.length - 1) * HEADER_AUTHOR_LINE_HEIGHT_PX
        : 0;
    const cardHeight = HEADER_CARD_PADDING_TOP + titleBlockHeight + authorBlockHeight + HEADER_CARD_PADDING_BOTTOM;

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
//   1. Explicit `length:` on the roadmap declaration wins.
//   2. Otherwise we derive the end day from the actual content extent
//      (latest item end, anchor date, milestone date/after, and today's
//      now-line if it falls past the content). This keeps the rendered
//      chart from defaulting to a 180-day desert when the content only
//      spans a few weeks.
//   3. As a last resort (no content + no length), fall back to a small
//      4-week placeholder so an empty roadmap still draws a sensible axis.
function computeDateWindow(
    file: NowlineFile,
    ctx: {
        cal: import('./calendar.js').CalendarConfig;
        durations: Map<string, import('@nowline/core').DurationDeclaration>;
    },
    resolved: ResolveResult,
    today: Date | undefined,
    scale: ViewPreset,
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
    if (lengthRaw) {
        const days = literalDays(lengthRaw, ctx.cal);
        if (days > 0) {
            return { startDate, endDate: addDays(startDate, days) };
        }
    }
    const contentDays = computeContentEndDay(resolved, ctx, startDate, today);
    const tickDays = daysPerUnit(scale.unit, ctx.cal);
    // Round up to the smallest tick boundary that is `>= contentDays`. When
    // the latest content lands exactly on a tick boundary the chart ends
    // exactly there (no extra trailing tick); otherwise we extend to the
    // next tick so the right edge always sits on a labelled column.
    const padded = contentDays > 0
        ? Math.ceil(contentDays / tickDays) * tickDays
        : 4 * ctx.cal.daysPerWeek;
    return { startDate, endDate: addDays(startDate, Math.max(1, padded)) };
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
    const m = /^(\d+)([dwmqy])$/.exec(literal);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
        case 'd': return n;
        case 'w': return n * cal.daysPerWeek;
        case 'm': return n * cal.daysPerMonth;
        case 'q': return n * cal.daysPerQuarter;
        case 'y': return n * cal.daysPerYear;
        default: return 0;
    }
}

// Walk every dated/sequenced entity in the resolved content and return the
// latest day-offset from `startDate`. Mirrors the sequencer's start-rules
// (date: > start: > after: > previous-in-lane) without producing positions.
function computeContentEndDay(
    resolved: ResolveResult,
    ctx: {
        cal: import('./calendar.js').CalendarConfig;
        durations: Map<string, import('@nowline/core').DurationDeclaration>;
    },
    startDate: Date,
    today: Date | undefined,
): number {
    const itemEnd = new Map<string, number>();
    const anchorEnd = new Map<string, number>();
    const milestoneEnd = new Map<string, number>();
    let maxDay = 0;

    const refEndDay = (ref: string): number => {
        if (itemEnd.has(ref)) return itemEnd.get(ref)!;
        if (anchorEnd.has(ref)) return anchorEnd.get(ref)!;
        if (milestoneEnd.has(ref)) return milestoneEnd.get(ref)!;
        return 0;
    };

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

    const walkLane = (
        children: SwimlaneDeclaration['content'],
        baselineEnd: number,
    ): number => {
        let prevEnd = baselineEnd;
        for (const child of children) {
            if (child.$type === 'DescriptionDirective') continue;
            prevEnd = walkNode(child as ItemDeclaration | GroupBlock | ParallelBlock, prevEnd);
            maxDay = Math.max(maxDay, prevEnd);
        }
        return prevEnd;
    };

    const walkNode = (
        node: ItemDeclaration | GroupBlock | ParallelBlock,
        prevEnd: number,
    ): number => {
        if (isItemDeclaration(node)) {
            const dur = resolveDuration(propValue(node.properties, 'duration'), ctx.durations, ctx.cal);
            const dateProp = parseDate(propValue(node.properties, 'date'));
            const startProp = parseDate(propValue(node.properties, 'start'));
            const afterRefs = propValues(node.properties, 'after');
            let start = prevEnd;
            if (dateProp) {
                start = daysBetween(startDate, dateProp);
            } else if (startProp) {
                start = daysBetween(startDate, startProp);
            } else if (afterRefs.length > 0) {
                start = Math.max(prevEnd, ...afterRefs.map(refEndDay));
            }
            const end = start + dur;
            if (node.name) itemEnd.set(node.name, end);
            return end;
        }
        if (isParallelBlock(node)) {
            // All children share the parallel's start; the block's effective
            // end is the maximum child end.
            let parallelEnd = prevEnd;
            for (const child of node.content) {
                if (child.$type === 'DescriptionDirective') continue;
                const childEnd = walkNode(child as ItemDeclaration | GroupBlock, prevEnd);
                parallelEnd = Math.max(parallelEnd, childEnd);
            }
            return parallelEnd;
        }
        if (isGroupBlock(node)) {
            return walkLane(node.content as SwimlaneDeclaration['content'], prevEnd);
        }
        return prevEnd;
    };

    for (const lane of resolved.content.swimlanes.values()) {
        walkLane(lane.content, 0);
    }

    // Milestones (after items so `after:` references can resolve).
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
            const day = Math.max(0, ...after.map(refEndDay));
            if (ms.name) milestoneEnd.set(ms.name, day);
            maxDay = Math.max(maxDay, day);
        }
    }

    // Isolated includes contribute their own content extent against the
    // shared timeline.
    for (const region of resolved.content.isolatedRegions) {
        const nestedMax = computeContentEndDay(
            { config: region.config, content: region.content, diagnostics: [], processedFiles: new Set() },
            ctx,
            startDate,
            undefined,
        );
        maxDay = Math.max(maxDay, nestedMax);
    }

    if (today) {
        const t = daysBetween(startDate, today);
        if (t > 0) maxDay = Math.max(maxDay, t);
    }

    return maxDay;
}

// Orthogonal (Manhattan) dep-edge routing: source-right → vertical-elbow →
// target-left, with a small horizontal stub before the elbow on each side
// (10 px) so the renderer can draw rounded corners cleanly.
function routeEdge(from: Point, to: Point): Point[] {
    if (Math.abs(from.y - to.y) < 0.5) {
        return [from, to];
    }
    const stubOut = 10;
    const elbowX = Math.max(from.x + stubOut, to.x - stubOut);
    return [
        from,
        { x: elbowX, y: from.y },
        { x: elbowX, y: to.y },
        to,
    ];
}

function buildDependencies(
    items: Map<string, ItemDeclaration>,
    ctx: LayoutContext,
): PositionedDependencyEdge[] {
    const out: PositionedDependencyEdge[] = [];
    for (const [id, item] of items) {
        const afters = propValues(item.properties, 'after');
        for (const pred of afters) {
            const from = ctx.entityMidpoints.get(pred);
            const to = ctx.entityMidpoints.get(id);
            if (!from || !to) continue;
            // Skip self- or same-lane contiguous edges; we only draw
            // cross-lane / non-adjacent hops to reduce visual noise.
            if (Math.abs(from.y - to.y) < 0.5 && to.x - from.x < 20) continue;
            const waypoints = routeEdge(from, to);
            out.push({
                fromId: pred,
                toId: id,
                waypoints,
                kind: 'normal',
                style: resolveStyle('item', [], ctx.styleCtx),
            });
        }
    }
    return out;
}

function buildNowline(
    today: Date | undefined,
    ctx: LayoutContext,
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
    // The "chart's left edge" the pill must clear is `chartLeftX` (in
    // beside-mode, the right edge of the header card; in above-mode,
    // the canvas left edge at x=0). originX = chartLeftX + GUTTER_PX,
    // so we recover chartLeftX as `originX - GUTTER_PX`.
    const chartLeftX = ctx.timeline.originX - GUTTER_PX;
    const halfPill = NOW_PILL_WIDTH_PX / 2;
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
    return {
        x,
        topY: lineTopY,
        bottomY: ctx.chartBottomY,
        pillTopY,
        pillMode,
        label: 'Today',
        style: resolveStyle('item', [], ctx.styleCtx),
    };
}

// Mutable layout-time context shared across helpers.

// Traverse the full content tree to build an `items` map keyed by id.
function collectItems(
    swimlanes: SwimlaneDeclaration[],
): Map<string, ItemDeclaration> {
    const out = new Map<string, ItemDeclaration>();
    const walk = (node: ItemDeclaration | GroupBlock | ParallelBlock): void => {
        if (isItemDeclaration(node)) {
            if (node.name) out.set(node.name, node);
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
    return new RoadmapNode().place(file, resolved, options, {
        sequenceItem,
        sequenceOne,
        resolveChildStart,
        newCursor,
        estimateTextWidth,
        predictItemChipExtraHeight,
        computeDateWindow,
        sizeBesideHeader,
        collectItems,
        buildDependencies,
        buildNowline,
    });
}

