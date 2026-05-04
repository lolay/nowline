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
    FOOTNOTE_ROW_HEIGHT,
    EDGE_CORNER_RADIUS,
    PROGRESS_STRIP_HEIGHT_PX,
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
    LABEL_CHIP_HEIGHT_PX,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
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

    // Handle `before:` — item must end by the named anchor/milestone x
    let hasOverflow = false;
    let overflowBox: BoundingBox | undefined;
    let overflowAnchorId: string | undefined;
    if (beforeRaw) {
        const beforeX = ctx.entityLeftEdges.get(beforeRaw);
        if (beforeX !== undefined) {
            if (logicalRight > beforeX) {
                // Flag the overflow tail; we still render the natural bar but
                // the tail past beforeX is marked red by the renderer.
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
    }).place(
        { x: logicalLeft, y: cursor.y },
        { time: ctx.scale, bands: ctx.bandScale, style },
    );
    const itemBox = placed.box;
    const textSpills = placed.textSpills;

    // Label chips laid out left → right INSIDE the item bar, sitting just
    // above the bottom progress strip (`PROGRESS_STRIP_HEIGHT_PX`).
    const labelChips: PositionedLabelChip[] = [];
    const labelIds = propValues(props, 'labels');
    const chipY = itemBox.y + itemBox.height
        - PROGRESS_STRIP_HEIGHT_PX
        - LABEL_CHIP_HEIGHT_PX
        - LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX;
    let chipX = itemBox.x + ITEM_CAPTION_INSET_X_PX;
    const chipMaxRight = itemBox.x + itemBox.width - ITEM_CAPTION_INSET_X_PX;
    for (const id of labelIds) {
        const label = ctx.labels.get(id);
        if (!label) continue;
        const remaining = Math.max(8, chipMaxRight - chipX);
        const chip = buildLabelChip(label, ctx.styleCtx, chipX, chipY, remaining);
        labelChips.push(chip);
        chipX += chip.box.width + LABEL_CHIP_GAP_BETWEEN_PX;
        if (chipX >= chipMaxRight) break;
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

    // Link icon
    const linkRaw = propValue(props, 'link');
    const linkInfo = parseLinkIcon(linkRaw);

    const owner = ownerDisplay ?? ownerOverride ?? propValue(props, 'owner');
    const description = node.description?.text;

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
    cursor.height = Math.max(cursor.height, ctx.bandScale.step());

    const result: PositionedItem = {
        kind: 'item',
        id,
        title: titleStr,
        box: itemBox,
        status,
        progressFraction: progress,
        footnoteIndicators,
        labelChips,
        linkIcon: linkInfo.icon,
        linkHref: linkInfo.href,
        hasOverflow,
        overflowBox,
        overflowAnchorId,
        owner,
        description,
        metaText,
        textSpills,
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
    return new GroupNode(node, { sequenceOne, newCursor }).place(cursor, ctx);
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
    const startDate = parseDate(startRaw) ?? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
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
    return {
        x,
        topY: lineTopY,
        bottomY: ctx.chartBottomY,
        pillTopY,
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
        computeDateWindow,
        sizeBesideHeader,
        collectItems,
        buildDependencies,
        buildNowline,
    });
}

