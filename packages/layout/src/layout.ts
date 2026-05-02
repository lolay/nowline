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
} from './themes/shared.js';
import { BandScale, defaultRowBand } from './band-scale.js';

export interface LayoutOptions {
    theme?: ThemeName;
    today?: Date;
    width?: number;   // total SVG width in px; default 1280
}

export type LayoutResult = PositionedRoadmap;

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

function propValue(props: EntityProperty[], key: string): string | undefined {
    return props.find((p) => stripColon(p.key) === key)?.value;
}

function propValues(props: EntityProperty[], key: string): string[] {
    const p = props.find((x) => stripColon(x.key) === key);
    if (!p) return [];
    return p.value !== undefined ? [p.value] : [...p.values];
}

function parseDate(raw: string | undefined): Date | null {
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    return Number.isNaN(d.getTime()) ? null : d;
}

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
        box: { x, y, width, height: 13 },
    };
}

// A slim accumulator used while sequencing items into a track.
interface TrackCursor {
    x: number;    // left edge where the next item begins
    y: number;    // top edge of the current row
    height: number;  // accumulated height of the track
    maxX: number;    // rightmost edge reached
}

function newCursor(x: number, y: number): TrackCursor {
    return { x, y, height: 0, maxX: x };
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

    // Visual bar — inset on each side so adjacent (chained) items have a
    // 2× ITEM_INSET_PX visual gutter between them. The logical extent stays
    // unchanged (for chaining + arrow-attachment math), the bar just draws
    // a little narrower than its column.
    const visualWidth = Math.max(MIN_ITEM_WIDTH, naturalWidth - 2 * ITEM_INSET_PX);
    const itemBox: BoundingBox = {
        x: logicalLeft + ITEM_INSET_PX,
        y: cursor.y,
        width: visualWidth,
        height: ctx.bandScale.bandwidth(),
    };

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

    // Label chips laid out left → right INSIDE the item bar, sitting just
    // above the bottom progress strip (4 px tall).
    const labelChips: PositionedLabelChip[] = [];
    const labelIds = propValues(props, 'labels');
    const chipY = itemBox.y + itemBox.height - 4 - 13 - 3;
    let chipX = itemBox.x + 12;
    const chipMaxRight = itemBox.x + itemBox.width - 12;
    for (const id of labelIds) {
        const label = ctx.labels.get(id);
        if (!label) continue;
        const remaining = Math.max(8, chipMaxRight - chipX);
        const chip = buildLabelChip(label, ctx.styleCtx, chipX, chipY, remaining);
        labelChips.push(chip);
        chipX += chip.box.width + 4;
        if (chipX >= chipMaxRight) break;
    }

    // Footnote superscript indicators
    const footIds = propValues(props, 'footnote');
    const footnoteIndicators: number[] = [];
    for (const id of footIds) {
        const n = ctx.footnoteIndex.get(id);
        if (n !== undefined) footnoteIndicators.push(n);
    }

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
    }

    cursor.x = logicalRight;
    cursor.maxX = Math.max(cursor.maxX, cursor.x);
    cursor.height = Math.max(cursor.height, ctx.bandScale.step());

    const titleStr = node.title ?? node.name ?? '';
    // Title + meta are an atomic caption: spill BOTH outside the bar if
    // either one would overflow the bar's inner padded width.
    const innerWidth = Math.max(0, itemBox.width - 24);
    const titleWidth = titleStr ? estimateTextWidth(titleStr, 13) : 0;
    const metaWidth = metaText ? estimateTextWidth(metaText, 11) : 0;
    const textSpills =
        (titleStr.length > 0 && titleWidth > innerWidth) ||
        (metaText !== undefined && metaWidth > innerWidth);

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
    const style = resolveStyle('parallel', node.properties, ctx.styleCtx);
    const startX = cursor.x;
    const startY = cursor.y;
    const children: PositionedTrackChild[] = [];
    let maxRight = startX;
    let accumulatedHeight = 0;

    for (const child of node.content) {
        if (child.$type === 'DescriptionDirective') continue;
        const subCursor = newCursor(startX, startY + accumulatedHeight);
        const positioned = sequenceOne(child as ItemDeclaration | GroupBlock, subCursor, ctx);
        children.push(positioned);
        accumulatedHeight += Math.max(ctx.bandScale.step(), subCursor.height);
        maxRight = Math.max(maxRight, subCursor.maxX);
    }

    const box: BoundingBox = {
        x: startX,
        y: startY,
        width: maxRight - startX,
        height: accumulatedHeight,
    };

    cursor.x = maxRight + 8;
    cursor.maxX = Math.max(cursor.maxX, cursor.x);
    cursor.height = Math.max(cursor.height, accumulatedHeight);

    const id = node.name;
    if (id) {
        ctx.entityLeftEdges.set(id, box.x);
        ctx.entityRightEdges.set(id, box.x + box.width);
    }

    return {
        kind: 'parallel',
        id,
        title: node.title ?? node.name,
        box,
        children,
        style,
    };
}

function sequenceGroup(
    node: GroupBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedGroup {
    const style = resolveStyle('group', node.properties, ctx.styleCtx);
    const startX = cursor.x;
    const startY = cursor.y;
    const innerCursor = newCursor(startX, startY);
    const children: PositionedTrackChild[] = [];
    for (const child of node.content) {
        if (child.$type === 'DescriptionDirective') continue;
        const positioned = sequenceOne(
            child as ItemDeclaration | GroupBlock | ParallelBlock,
            innerCursor,
            ctx,
        );
        children.push(positioned);
    }
    const box: BoundingBox = {
        x: startX,
        y: startY,
        width: innerCursor.maxX - startX,
        height: Math.max(ctx.bandScale.step(), innerCursor.height),
    };
    cursor.x = innerCursor.maxX + 8;
    cursor.maxX = Math.max(cursor.maxX, cursor.x);
    cursor.height = Math.max(cursor.height, box.height);
    const id = node.name;
    if (id) {
        ctx.entityLeftEdges.set(id, box.x);
        ctx.entityRightEdges.set(id, box.x + box.width);
    }
    return {
        kind: 'group',
        id,
        title: node.title ?? node.name,
        box,
        children,
        style,
    };
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

// Returns the right edge (in canvas px) of the lane title tab, mirroring
// the renderer's chiclet sizing in renderSwimlane. Used by the layout to
// decide whether the first row of items can sit at the tab's y instead of
// dropping below it. Keep these two formulas in sync.
function computeLaneTabRightX(lane: SwimlaneDeclaration): number {
    const title = lane.title ?? lane.name ?? '';
    if (!title) return 0;
    const ownerRaw = propValue(lane.properties, 'owner');
    const titleWidth = Math.max(40, title.length * 7);
    const ownerWidth = ownerRaw ? Math.max(60, ('owner: ' + ownerRaw).length * 5.6) : 0;
    const padding = 24;
    const tabX = 10;  // matches renderer: tabX = box.x + 10, box.x = 0
    return tabX + titleWidth + ownerWidth + padding;
}

// Resolve the desired starting x for the first non-description child of a
// lane (item, parallel, or group). Returns undefined when the lane has no
// chartable children.
function firstChildStartX(
    lane: SwimlaneDeclaration,
    laneLeftX: number,
    ctx: LayoutContext,
): number | undefined {
    for (const child of lane.content) {
        if (child.$type === 'DescriptionDirective') continue;
        const props = isItemDeclaration(child)
            ? child.properties
            : (child as ParallelBlock | GroupBlock).properties ?? [];
        return resolveChildStart(props, laneLeftX, laneLeftX, ctx);
    }
    return undefined;
}

function buildSwimlane(
    lane: SwimlaneDeclaration,
    y: number,
    bandIndex: number,
    ctx: LayoutContext,
): { positioned: PositionedSwimlane; usedHeight: number } {
    const style = resolveStyle('swimlane', lane.properties, ctx.styleCtx);
    const laneLeftX = ctx.timeline.originX;
    // Title-tab geometry (mirrors the renderer; see renderSwimlane). The tab
    // hugs the upper-left of the band and lives entirely in the gutter
    // between the lane's left edge and the chart area.
    const tabRightX = computeLaneTabRightX(lane);
    const TAB_TOP_Y = 10;     // matches renderer: tabY = box.y + 10
    const TAB_BOTTOM_Y = 38;  // tab (height 22) plus 6 px breathing room
    // First-row Y: when the first child's desired x is past the title tab,
    // we top-align the row with the tab and reclaim ~28 px of vertical
    // space per lane. Otherwise (no title, or the first item starts
    // before/under the tab) we fall back to the default drop-below-tab
    // reservation. Subsequent rows always step down by bandScale.step().
    const TAB_GUTTER_PX = 8;
    const firstChildDesiredX = firstChildStartX(lane, laneLeftX, ctx);
    const canAlignFirstRowWithTab = !lane.title
        || firstChildDesiredX === undefined
        || firstChildDesiredX >= tabRightX + TAB_GUTTER_PX;
    const startY = y + (canAlignFirstRowWithTab ? TAB_TOP_Y : TAB_BOTTOM_Y);

    // Row-packing state: items in the same lane chain in time and pack onto
    // the same row when they fit. The next item bumps to a fresh row when
    //   (a) its desired start is left of the current row's right edge
    //       (would overlap a sibling already drawn on this row), or
    //   (b) the previous item's title spilled past its bar and would
    //       overlap the next item's bar.
    // Parallels and groups are block-level: they always own a fresh row.
    let rowY = startY;          // top of the current row
    let rowEndX = laneLeftX;    // rightmost x of the current row's last item
    let timeCursorX = laneLeftX; // rightmost x in time across all rows (the
                                 // "what comes next" anchor for sequential
                                 // items, regardless of which row they land on)
    let prevTitleSpillX = laneLeftX; // right edge of the previous title's
                                     // visible glyphs (incl. spill past bar)

    const children: PositionedTrackChild[] = [];
    for (const child of lane.content) {
        if (child.$type === 'DescriptionDirective') continue;

        if (!isItemDeclaration(child)) {
            // Parallel/group: always own a fresh row. Honor `after:` on the
            // block itself; otherwise place at the timeCursor (continue
            // from where the lane has progressed in time).
            if (rowEndX > laneLeftX) {
                rowY += ctx.bandScale.step();
            }
            const blockProps = (child as ParallelBlock | GroupBlock).properties ?? [];
            const blockStart = resolveChildStart(blockProps, timeCursorX, laneLeftX, ctx);
            const cursor = newCursor(blockStart, rowY);
            const positioned = sequenceOne(
                child as ItemDeclaration | GroupBlock | ParallelBlock,
                cursor,
                ctx,
            );
            children.push(positioned);
            const blockEnd = positioned.box.x + positioned.box.width;
            rowY += Math.max(ctx.bandScale.step(), cursor.height);
            rowEndX = laneLeftX;
            timeCursorX = Math.max(timeCursorX, blockEnd);
            prevTitleSpillX = laneLeftX;
            continue;
        }

        // Item: determine where it wants to live in time, then decide which
        // row it lands on.
        const props = (child as ItemDeclaration).properties;
        const desiredStart = resolveChildStart(props, timeCursorX, laneLeftX, ctx);

        const collidesWithRow = desiredStart < rowEndX;
        const collidesWithSpill = desiredStart < prevTitleSpillX;
        if (collidesWithRow || collidesWithSpill) {
            rowY += ctx.bandScale.step();
            rowEndX = laneLeftX;
            prevTitleSpillX = laneLeftX;
        }

        const cursor = newCursor(desiredStart, rowY);
        const positioned = sequenceItem(child as ItemDeclaration, cursor, ctx);
        children.push(positioned);

        // Item end in LOGICAL space (one ITEM_INSET_PX past the visual bar's
        // right edge). The next chained item starts here and lands edge-to-
        // edge in time, with a 2 × ITEM_INSET_PX visible gutter between bars.
        const itemLogicalEnd = positioned.box.x + positioned.box.width + ITEM_INSET_PX;
        timeCursorX = Math.max(timeCursorX, itemLogicalEnd);
        rowEndX = itemLogicalEnd;

        // If the caption spills past the bar (computed in sequenceItem),
        // the renderer will draw title + meta as an atomic block BESIDE
        // the bar starting just past its visual right edge. Reserve enough
        // space (max of title/meta width) so the next item bumps to a fresh
        // row and the caption has empty room.
        if (positioned.textSpills) {
            const titleWidth = estimateTextWidth(positioned.title, 13);
            const metaWidth = positioned.metaText
                ? estimateTextWidth(positioned.metaText, 11)
                : 0;
            const visualRight = positioned.box.x + positioned.box.width;
            prevTitleSpillX = visualRight + 6 + Math.max(titleWidth, metaWidth) + 6;
        } else {
            prevTitleSpillX = laneLeftX;
        }
    }

    const lastRowBottom = rowY + ctx.bandScale.step();
    const bandHeight = Math.max(ctx.bandScale.step() + 32, lastRowBottom - y + 16);
    const box: BoundingBox = {
        x: 0,
        y,
        width: ctx.chartRightX,
        height: bandHeight,
    };
    // Owner display string: id → title for teams/people; falls back to id.
    const ownerRaw = propValue(lane.properties, 'owner');
    let ownerDisplay: string | undefined;
    if (ownerRaw) {
        const team = ctx.teams.get(ownerRaw);
        const person = ctx.persons.get(ownerRaw);
        ownerDisplay = team?.title ?? person?.title ?? ownerRaw;
    }
    // Footnote indicators that name this swimlane via `on:`.
    const footnoteIndicators: number[] = [];
    if (lane.name) {
        for (const [fid, host] of ctx.footnoteHosts.entries()) {
            if (host.includes(lane.name)) {
                const n = ctx.footnoteIndex.get(fid);
                if (n !== undefined) footnoteIndicators.push(n);
            }
        }
        footnoteIndicators.sort((a, b) => a - b);
    }
    return {
        positioned: {
            id: lane.name,
            title: lane.title ?? lane.name ?? '',
            box,
            bandIndex,
            children,
            nested: [],
            style,
            owner: ownerDisplay,
            footnoteIndicators,
        },
        usedHeight: bandHeight,
    };
}

// Card-sizing constants for beside-mode headers. Title and author both wrap
// at MAX_CONTENT_WIDTH (= MAX header width minus 2 * padding). The card hugs
// its content in the MIN..MAX range and grows vertically when wrapping is
// needed. Title baselines step by TITLE_LINE_HEIGHT, author baselines by
// AUTHOR_LINE_HEIGHT, with TITLE_TO_AUTHOR_GAP between the last title line
// and the first author line.
const HEADER_CARD_PADDING_X = 16;
const HEADER_CARD_PADDING_TOP = 26;     // baseline of the first title line
const HEADER_CARD_PADDING_BOTTOM = 14;  // descender padding below last line
const HEADER_TITLE_LINE_HEIGHT = 20;
const HEADER_AUTHOR_LINE_HEIGHT = 14;
const HEADER_TITLE_TO_AUTHOR_GAP = 18;
const HEADER_TITLE_FONT_SIZE = 16;
const HEADER_AUTHOR_FONT_SIZE = 11;
const HEADER_CARD_OUTER_PAD = 6;        // gap between card and box edge

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
    const titleLines = wrapText(title, maxContentWidth, HEADER_TITLE_FONT_SIZE);
    const authorLines = wrapText(author ?? '', maxContentWidth, HEADER_AUTHOR_FONT_SIZE);

    let widest = 0;
    for (const line of titleLines) widest = Math.max(widest, estimateTextWidth(line, HEADER_TITLE_FONT_SIZE));
    for (const line of authorLines) widest = Math.max(widest, estimateTextWidth(line, HEADER_AUTHOR_FONT_SIZE));

    const naturalCardWidth = widest + 2 * HEADER_CARD_PADDING_X;
    const cardWidth = Math.max(
        HEADER_BESIDE_MIN_WIDTH_PX - 2 * HEADER_CARD_OUTER_PAD,
        Math.min(HEADER_BESIDE_MAX_WIDTH_PX - 2 * HEADER_CARD_OUTER_PAD, naturalCardWidth),
    );

    const titleBlockHeight = titleLines.length > 0
        ? (titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT
        : 0;
    const authorBlockHeight = authorLines.length > 0
        ? HEADER_TITLE_TO_AUTHOR_GAP + (authorLines.length - 1) * HEADER_AUTHOR_LINE_HEIGHT
        : 0;
    const cardHeight = HEADER_CARD_PADDING_TOP + titleBlockHeight + authorBlockHeight + HEADER_CARD_PADDING_BOTTOM;

    const boxWidth = cardWidth + 2 * HEADER_CARD_OUTER_PAD;
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
    // Round up to the next tick boundary + one extra tick of trailing pad
    // so the last tick label and any "ends on the deadline" item have a
    // little visual breathing room.
    const padded = contentDays > 0
        ? Math.ceil((contentDays + 1) / tickDays) * tickDays + tickDays
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

function buildAnchors(
    anchors: Map<string, AnchorDeclaration>,
    ctx: LayoutContext,
    milestoneXs: Set<number>,
): PositionedAnchor[] {
    const out: PositionedAnchor[] = [];
    const inRowY = ctx.timeline.markerRow.y;
    const collisionY = ctx.timeline.markerRow.collisionY;
    // Cut lines drop from the BOTTOM of the marker row (= chart top) into
    // the chart, so the anchor diamond sits visually on top of the line.
    const cutTopY = ctx.chartTopY;
    const cutBottomY = ctx.chartBottomY;
    for (const [id, a] of anchors) {
        const dateRaw = propValue(a.properties, 'date');
        const date = parseDate(dateRaw);
        if (!date) continue;
        const x = ctx.scale.forwardWithinDomain(date);
        if (x === null) continue;
        const style = resolveStyle('anchor', a.properties, ctx.styleCtx);
        const bumpedUp = milestoneXs.has(x);
        const y = bumpedUp ? collisionY : inRowY;
        const center: Point = { x, y };
        ctx.entityLeftEdges.set(id, x);
        ctx.entityRightEdges.set(id, x);
        ctx.entityMidpoints.set(id, center);
        out.push({
            id,
            title: a.title ?? id,
            center,
            radius: 6,
            style,
            predecessorPoints: [],
            cutTopY,
            cutBottomY,
            bumpedUp,
        });
    }
    return out;
}

function buildMilestones(
    milestones: Map<string, MilestoneDeclaration>,
    ctx: LayoutContext,
): PositionedMilestone[] {
    const out: PositionedMilestone[] = [];
    const inRowY = ctx.timeline.markerRow.y;
    const cutTopY = ctx.chartTopY;
    const cutBottomY = ctx.chartBottomY;
    for (const [id, m] of milestones) {
        const style = resolveStyle('milestone', m.properties, ctx.styleCtx);
        const dateRaw = propValue(m.properties, 'date');
        const afterRaw = propValues(m.properties, 'after');
        const date = parseDate(dateRaw);
        let center: Point | null = null;
        let fixed = false;
        let slackX: number | undefined;
        let slackY: number | undefined;
        let isOverrun = false;
        if (date) {
            const x = ctx.scale.forwardWithinDomain(date);
            if (x !== null) {
                center = { x, y: inRowY };
                fixed = true;
                let maxEnd = 0;
                for (const ref of afterRaw) {
                    const end = ctx.entityRightEdges.get(ref);
                    if (end !== undefined) maxEnd = Math.max(maxEnd, end);
                }
                if (maxEnd > x) {
                    isOverrun = true;
                    slackX = maxEnd;
                }
            }
        } else if (afterRaw.length > 0) {
            // Track the binding (rightmost) and the next-latest non-binding
            // predecessor — the latter drives the slack arrow.
            type Pred = { ref: string; x: number; y: number };
            const preds: Pred[] = [];
            for (const ref of afterRaw) {
                const end = ctx.entityRightEdges.get(ref);
                if (end === undefined) continue;
                const mid = ctx.entityMidpoints.get(ref);
                preds.push({ ref, x: end, y: mid?.y ?? 0 });
            }
            preds.sort((a, b) => b.x - a.x);
            const maxEnd = preds[0]?.x ?? ctx.timeline.originX;
            center = { x: maxEnd, y: inRowY };
            fixed = false;
            const second = preds[1];
            if (second && second.x < maxEnd && second.y > 0) {
                slackX = second.x;
                slackY = second.y;
            }
        }
        if (!center) continue;
        ctx.entityLeftEdges.set(id, center.x);
        ctx.entityRightEdges.set(id, center.x);
        ctx.entityMidpoints.set(id, center);
        out.push({
            id,
            title: m.title ?? id,
            center,
            radius: 6,
            fixed,
            slackX,
            slackY,
            isOverrun,
            style,
            cutTopY,
            cutBottomY,
        });
    }
    return out;
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

function buildFootnotes(
    footnotes: Map<string, FootnoteDeclaration>,
    ctx: LayoutContext,
    chartBottomY: number,
): { area: PositionedFootnoteArea; index: Map<string, number>; hosts: Map<string, string[]> } {
    const entries: PositionedFootnoteEntry[] = [];
    const index = new Map<string, number>();
    const hosts = new Map<string, string[]>();
    const ordered = [...footnotes.entries()].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([id, f], i) => {
        const n = i + 1;
        index.set(id, n);
        hosts.set(id, propValues(f.properties, 'on'));
        entries.push({
            number: n,
            title: f.title ?? id,
            description: f.description?.text,
            style: resolveStyle('footnote', f.properties, ctx.styleCtx),
        });
    });
    // Footnote panel grows: 28px header + (entries × row height) + 16 padding.
    const headerHeight = 28;
    const box: BoundingBox = {
        x: 16,
        y: chartBottomY + 16,
        width: ctx.chartRightX - 32,
        height: entries.length === 0 ? 0 : headerHeight + entries.length * FOOTNOTE_ROW_HEIGHT + 16,
    };
    return {
        area: { box, entries },
        index,
        hosts,
    };
}

function buildIncludeRegions(
    regions: IsolatedRegion[],
    ctx: LayoutContext,
    startY: number,
): { regions: PositionedIncludeRegion[]; endY: number } {
    // Reserve room above the first region for the label tab so it doesn't
    // collide with the previous swimlane's bottom edge.
    const TAB_RESERVE = 18;
    const REGION_INSET_TOP = 14;
    const REGION_INSET_BOTTOM = 14;
    const GAP_BETWEEN_REGIONS = 16;

    let y = startY + TAB_RESERVE;
    const out: PositionedIncludeRegion[] = [];
    let isFirst = true;
    for (const region of regions) {
        if (!isFirst) y += GAP_BETWEEN_REGIONS;
        isFirst = false;
        const label = region.content.roadmap?.title ?? region.sourcePath;
        const innerStartY = y + REGION_INSET_TOP;
        // Lay out the included content's swimlanes against the parent timeline.
        // The included roadmap shares originX / pixelsPerDay so dates align
        // vertically with the tick row above the region.
        const childCtx: LayoutContext = {
            cal: ctx.cal,
            styleCtx: {
                theme: ctx.styleCtx.theme,
                styles: region.config.styles,
                defaults: region.config.defaults,
                labels: region.content.labels,
            },
            durations: region.content.durations,
            labels: region.content.labels,
            teams: region.content.teams,
            persons: region.content.persons,
            footnoteIndex: new Map(),
            footnoteHosts: new Map(),
            timeline: ctx.timeline,
            scale: ctx.scale,
            calendar: ctx.calendar,
            bandScale: ctx.bandScale,
            entityLeftEdges: new Map(),
            entityRightEdges: new Map(),
            entityMidpoints: new Map(),
            chartTopY: innerStartY,
            chartBottomY: innerStartY,
            chartRightX: ctx.chartRightX,
        };
        const nestedSwimlanes: PositionedSwimlane[] = [];
        let cursorY = innerStartY;
        let bandIndex = 0;
        for (const lane of region.content.swimlanes.values()) {
            const { positioned, usedHeight } = buildSwimlane(lane, cursorY, bandIndex, childCtx);
            nestedSwimlanes.push(positioned);
            cursorY += usedHeight;
            bandIndex++;
        }
        const innerEndY = cursorY;
        const regionHeight = Math.max(56, innerEndY - y + REGION_INSET_BOTTOM);
        const box: BoundingBox = {
            x: 0,
            y,
            width: ctx.chartRightX,
            height: regionHeight,
        };
        out.push({
            sourcePath: region.sourcePath,
            label,
            box,
            nestedSwimlanes,
            style: resolveStyle('swimlane', [], ctx.styleCtx),
        });
        y += regionHeight;
    }
    return { regions: out, endY: y };
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
interface LayoutContext {
    cal: ReturnType<typeof resolveCalendar>;
    styleCtx: StyleContext;
    durations: Map<string, import('@nowline/core').DurationDeclaration>;
    labels: Map<string, LabelDeclaration>;
    teams: Map<string, import('@nowline/core').TeamDeclaration>;
    persons: Map<string, import('@nowline/core').PersonDeclaration>;
    footnoteIndex: Map<string, number>;
    // For each footnote id, the list of `on:` host ids it references.
    footnoteHosts: Map<string, string[]>;
    timeline: PositionedTimelineScale;
    scale: TimeScale;
    calendar: WorkingCalendar;
    bandScale: BandScale;
    entityLeftEdges: Map<string, number>;
    entityRightEdges: Map<string, number>;
    entityMidpoints: Map<string, Point>;
    chartTopY: number;
    chartBottomY: number;
    chartRightX: number;
}

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
    const themeName: ThemeName = options.theme ?? 'light';
    const theme: Theme = themes[themeName];
    const width = options.width ?? 1280;

    const cal = resolveCalendar(file, resolved.config.calendar);
    const scale = resolveScale(file, resolved.config.scale);

    const styleCtx: StyleContext = {
        theme,
        styles: resolved.config.styles,
        defaults: resolved.config.defaults,
        labels: resolved.content.labels,
    };

    // Date window + header geometry. The window is content-aware: when the
    // roadmap declaration omits `length:`, we derive it from the latest
    // dated/sequenced entity (item, anchor, milestone, today's now-line)
    // instead of defaulting to a 180-day desert.
    const { startDate, endDate } = computeDateWindow(
        file,
        { cal, durations: resolved.content.durations },
        resolved,
        options.today,
        scale,
    );

    // Determine header position via `default roadmap` / theme.
    const headerStyle = resolveStyle('roadmap', file.roadmapDecl?.properties ?? [], styleCtx);
    const isBeside = headerStyle.headerPosition === 'beside';

    // Pre-size the beside-mode header card from its actual title + author
    // text. Width = max line width + padding, clamped to MIN..MAX with
    // word-wrap kicking in once the title would exceed MAX. Above-mode
    // keeps the existing fixed-strip geometry (full canvas width, fixed
    // height) since horizontal headers don't have the same wasted-space
    // problem.
    const titleStr = file.roadmapDecl?.title ?? file.roadmapDecl?.name ?? '';
    const authorStr = propValue(file.roadmapDecl?.properties ?? [], 'author');
    const sizedHeader = sizeBesideHeader(titleStr, authorStr);

    // headerBox.width is patched after we know the final canvas width; for
    // horizontal-above mode the header strip should match the canvas width,
    // not the requested max.
    const headerBox = isBeside
        ? { x: 0, y: 0, width: sizedHeader.boxWidth, height: 0 }
        : { x: 0, y: 0, width: 0, height: HEADER_ABOVE_HEIGHT_PX };

    const chartLeftX = isBeside ? sizedHeader.boxWidth : 0;
    const chartTopY = isBeside ? 8 : HEADER_ABOVE_HEIGHT_PX + 8;

    // `options.width` is treated as a *maximum* canvas width, not a fixed
    // target. The chart sizes itself to the natural width of the content
    // (date window × pixels-per-day) plus chrome padding, capped at the max.
    // A small minimum keeps the header / attribution wordmark legible when
    // content is very short.
    const MIN_CANVAS_WIDTH = 480;
    const calendar = fromCalendarConfig(cal);
    const ppd = scale.pixelsPerUnit / calendar.daysPerUnit(scale.unit);
    const spanDays = Math.max(1, daysBetween(startDate, endDate));
    const naturalWidth = spanDays * ppd;
    const originX = chartLeftX + 16;
    const totalChartWidth = naturalWidth;
    const desiredCanvas = chartLeftX + 16 + totalChartWidth + 16;
    const chartRightX = Math.max(MIN_CANVAS_WIDTH, Math.min(width, desiredCanvas));
    const chartWidthAvailable = chartRightX - chartLeftX - 24;

    // Header layout (top → bottom):
    //   1. Now-pill row    (16 px) — only when there's a now-line to draw
    //   2. Tick-label panel (24 px) — always
    //   3. Marker row       (26 px) — only when there are anchors/milestones
    //   4. 8 px gap, then the chart begins
    // The now-pill sits ABOVE the date headers; the vertical line drops
    // from the pill bottom through the headers into the chart, so the
    // pill and the line stay visually connected.
    const willHaveNowline = options.today !== undefined
        && options.today >= startDate
        && options.today <= endDate;
    const hasMarkerEntities = resolved.content.anchors.size + resolved.content.milestones.size > 0;
    const pillRowHeight = willHaveNowline ? 16 : 0;
    const tickPanelHeight = 24;
    const markerRowHeight = hasMarkerEntities ? 26 : 0;
    const headerRowsHeight = pillRowHeight + tickPanelHeight + markerRowHeight;
    const timelineHeightBudget = headerRowsHeight + 8;
    // In beside-mode we want the header card's BOTTOM to line up with the
    // bottom of the header rows (so it visually anchors to the chart's top
    // edge). When the card is taller than the natural header rows + a 4px
    // top inset, push the timeline down so the card still has room without
    // clipping above the canvas. Above-mode keeps its fixed strip layout
    // and isn't affected.
    const HEADER_CARD_TOP_INSET = 4;
    const minHeaderRowsBottomForCard = isBeside
        ? sizedHeader.cardHeight + HEADER_CARD_TOP_INSET
        : 0;
    const timelineY = Math.max(chartTopY, minHeaderRowsBottomForCard - headerRowsHeight);
    const tickPanelY = timelineY + pillRowHeight;
    const markerRowY = tickPanelY + tickPanelHeight;
    const headerRowsBottomY = markerRowY + markerRowHeight;

    const timeScale = new TimeScale({
        domain: [startDate, endDate],
        range: [originX, originX + naturalWidth],
        calendar,
    });
    const ticks = buildHeaderTicks(timeScale, scale, calendar);
    const timeline: PositionedTimelineScale = {
        box: {
            x: originX,
            y: timelineY,
            width: naturalWidth,
            height: 0,
        },
        ticks,
        pixelsPerDay: ppd,
        originX,
        startDate,
        endDate,
        labelStyle: resolveStyle('roadmap', [], styleCtx),
        pillRowHeight,
        tickPanelY,
        tickPanelHeight,
        markerRow: {
            y: markerRowY + 13,
            height: markerRowHeight,
            collisionY: markerRowY - 8,
        },
    };

    const ctx: LayoutContext = {
        cal,
        styleCtx,
        durations: resolved.content.durations,
        labels: resolved.content.labels,
        teams: resolved.content.teams,
        persons: resolved.content.persons,
        footnoteIndex: new Map(),
        footnoteHosts: new Map(),
        timeline,
        scale: timeScale,
        calendar,
        bandScale: defaultRowBand(),
        entityLeftEdges: new Map(),
        entityRightEdges: new Map(),
        entityMidpoints: new Map(),
        chartTopY: timelineY + timelineHeightBudget,
        chartBottomY: 0,
        chartRightX: Math.max(chartRightX, originX + totalChartWidth + 16),
    };

    // Footnotes index must be built before sequencing items reference them.
    const pre = buildFootnotes(resolved.content.footnotes, ctx, 0);
    ctx.footnoteIndex = pre.index;
    ctx.footnoteHosts = pre.hosts;

    // Build swimlanes (order: declared order). The inter-band gap is
    // sourced from the swimlane default style's `spacing` bucket
    // (m2.5b: surface `defaults > spacing`). With the legacy theme
    // default of `spacing: none` the gap is 0 px and existing samples
    // stay byte-stable; bumping to `md` introduces an 8 px gap.
    const laneEntries = [...resolved.content.swimlanes.values()];
    const swimlaneDefaultStyle = resolveStyle('swimlane', [], styleCtx);
    const interBandGapPx =
        SPACING_PX[swimlaneDefaultStyle.spacing as keyof typeof SPACING_PX] ?? 0;
    const swimlanes: PositionedSwimlane[] = [];
    let y = ctx.chartTopY;
    let bandIndex = 0;
    for (const lane of laneEntries) {
        if (bandIndex > 0) y += interBandGapPx;
        const { positioned, usedHeight } = buildSwimlane(lane, y, bandIndex, ctx);
        swimlanes.push(positioned);
        y += usedHeight;
        bandIndex++;
    }

    // Include regions under the swimlanes. We only reserve the 8px gap +
    // tab-reserve when there's at least one isolated region to render —
    // otherwise the now-line and chart bottom would extend past the last
    // swimlane into empty space.
    const isolated = resolved.content.isolatedRegions;
    let includes: PositionedIncludeRegion[] = [];
    if (isolated.length > 0) {
        const r = buildIncludeRegions(isolated, ctx, y + 8);
        includes = r.regions;
        y = r.endY;
    }

    ctx.chartBottomY = y;
    timeline.box.height = ctx.chartBottomY - timeline.box.y;

    // Milestones first so anchors know which xs are occupied (for collision bumps).
    const milestones = buildMilestones(resolved.content.milestones, ctx);
    const milestoneXs = new Set<number>(milestones.map((m) => m.center.x));
    const anchors = buildAnchors(resolved.content.anchors, ctx, milestoneXs);
    const itemsMap = collectItems(laneEntries);
    const edges = buildDependencies(itemsMap, ctx);

    // Now-line (if today is within the window). Initially drops to the
    // bottom of the chart area; if a footnote panel exists below, we extend
    // it through the panel so the line still reads as a single sweep.
    const nowline = buildNowline(options.today, ctx);

    // Finalize footnotes at the bottom
    const foot = buildFootnotes(resolved.content.footnotes, ctx, ctx.chartBottomY);
    ctx.footnoteIndex = foot.index;
    ctx.footnoteHosts = foot.hosts;
    if (nowline && foot.area.box.height > 0) {
        nowline.bottomY = foot.area.box.y + foot.area.box.height;
    }

    // Header (depends on chart height when beside, and on the final canvas
    // width when above).
    headerBox.height = headerBox.height || ctx.chartBottomY;
    if (!isBeside) headerBox.width = ctx.chartRightX;
    // Build a card sub-box for beside-mode (the visible white panel inside
    // headerBox). The card BOTTOM hugs the bottom of the header rows
    // (date headers, or marker row when present) so the title block visually
    // anchors to the chart's top edge regardless of which header rows are
    // present. timelineY was already nudged down above to guarantee the card
    // has at least HEADER_CARD_TOP_INSET clearance from the canvas top.
    // For above-mode the cardBox spans the full strip — the renderer
    // ignores it and uses its existing horizontal layout.
    const cardBox: BoundingBox = isBeside
        ? {
            x: 6,
            y: headerRowsBottomY - sizedHeader.cardHeight,
            width: sizedHeader.cardWidth,
            height: sizedHeader.cardHeight,
        }
        : { x: 0, y: 0, width: ctx.chartRightX, height: HEADER_ABOVE_HEIGHT_PX };

    const header: PositionedHeader = {
        box: headerBox,
        position: headerStyle.headerPosition,
        title: titleStr,
        author: authorStr,
        titleLines: sizedHeader.titleLines,
        authorLines: sizedHeader.authorLines,
        cardBox,
        logo: undefined,
        style: headerStyle,
        attributionBox: {
            x: ctx.chartRightX - 120,
            y: isBeside ? 4 : 4,
            width: 116,
            height: 16,
        },
    };

    const height = (foot.area.box.y + foot.area.box.height) + 16;

    return {
        width: ctx.chartRightX,
        height,
        theme: themeName,
        palette: theme,
        backgroundColor: theme.surface.page,
        header,
        timeline,
        nowline,
        swimlanes,
        anchors,
        milestones,
        edges,
        footnotes: foot.area,
        includes,
        chartBox: {
            x: chartLeftX,
            y: ctx.chartTopY,
            width: ctx.chartRightX - chartLeftX,
            height: ctx.chartBottomY - ctx.chartTopY,
        },
    };
}
