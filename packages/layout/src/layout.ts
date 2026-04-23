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
import {
    buildTimelineScale,
    resolveScale,
    pixelsPerDay,
    xForDate,
} from './timeline.js';
import {
    HEADER_ABOVE_HEIGHT_PX,
    HEADER_BESIDE_WIDTH_PX,
    ITEM_ROW_HEIGHT,
    MIN_ITEM_WIDTH,
    PADDING_PX,
    FOOTNOTE_ROW_HEIGHT,
    EDGE_CORNER_RADIUS,
} from './themes/shared.js';

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
): PositionedLabelChip {
    const style = resolveLabelChipStyle(label, ctx);
    const title = label.title ?? label.name ?? '';
    // Rough chip metrics: ~7 px per char + 2 * padding.
    const padKey = style.padding === 'none' ? 'xs' : style.padding;
    const pad = PADDING_PX[padKey as keyof typeof PADDING_PX];
    const width = Math.max(24, title.length * 7 + pad * 2);
    return {
        text: title,
        style,
        box: { x, y, width, height: 16 },
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
        const xd = xForDate(explicitDate, ctx.timeline);
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
    let endX = startX + naturalWidth;

    // Handle `before:` — item must end by the named anchor/milestone x
    let hasOverflow = false;
    let overflowBox: BoundingBox | undefined;
    if (beforeRaw) {
        const beforeX = ctx.entityLeftEdges.get(beforeRaw);
        if (beforeX !== undefined) {
            if (endX > beforeX) {
                // Flag the overflow tail; we still render the natural bar but
                // the tail past beforeX is marked red by the renderer.
                hasOverflow = true;
                overflowBox = {
                    x: beforeX,
                    y: cursor.y,
                    width: endX - beforeX,
                    height: ITEM_ROW_HEIGHT - 6,
                };
            }
        }
    }

    const itemBox: BoundingBox = {
        x: startX,
        y: cursor.y,
        width: Math.max(MIN_ITEM_WIDTH, endX - startX),
        height: ITEM_ROW_HEIGHT - 6,
    };

    // Progress fraction
    const statusRaw = propValue(props, 'status');
    const status = statusFromProp(statusRaw);
    let progress = parseProgressFraction(statusRaw);
    if (progress === 0 && status === 'done') progress = 1;
    if (progress === 0 && status === 'in-progress' && remainingDays > 0 && durationDays > 0) {
        progress = Math.max(0, Math.min(1, 1 - remainingDays / durationDays));
    }

    // Label chips laid out left → right along the right side of the item bar.
    const labelChips: PositionedLabelChip[] = [];
    const labelIds = propValues(props, 'labels');
    let chipX = itemBox.x + itemBox.width + 4;
    const chipY = itemBox.y + 2;
    for (const id of labelIds) {
        const label = ctx.labels.get(id);
        if (!label) continue;
        const chip = buildLabelChip(label, ctx.styleCtx, chipX, chipY);
        labelChips.push(chip);
        chipX += chip.box.width + 4;
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

    const owner = ownerOverride ?? propValue(props, 'owner');
    const description = node.description?.text;

    const id = node.name;
    if (id) {
        ctx.entityLeftEdges.set(id, itemBox.x);
        ctx.entityRightEdges.set(id, itemBox.x + itemBox.width);
        ctx.entityMidpoints.set(id, {
            x: itemBox.x + itemBox.width / 2,
            y: itemBox.y + itemBox.height / 2,
        });
    }

    cursor.x = itemBox.x + itemBox.width + 8;
    cursor.maxX = Math.max(cursor.maxX, cursor.x);
    cursor.height = Math.max(cursor.height, ITEM_ROW_HEIGHT);

    const result: PositionedItem = {
        kind: 'item',
        id,
        title: node.title ?? node.name ?? '',
        box: itemBox,
        status,
        progressFraction: progress,
        footnoteIndicators,
        labelChips,
        linkIcon: linkInfo.icon,
        linkHref: linkInfo.href,
        hasOverflow,
        overflowBox,
        owner,
        description,
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
        accumulatedHeight += Math.max(ITEM_ROW_HEIGHT, subCursor.height);
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
        height: Math.max(ITEM_ROW_HEIGHT, innerCursor.height),
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

function buildSwimlane(
    lane: SwimlaneDeclaration,
    y: number,
    bandIndex: number,
    ctx: LayoutContext,
): { positioned: PositionedSwimlane; usedHeight: number } {
    const style = resolveStyle('swimlane', lane.properties, ctx.styleCtx);
    const contentLeftX = ctx.timeline.originX;
    const cursor = newCursor(contentLeftX, y + 8);
    const children: PositionedTrackChild[] = [];
    for (const child of lane.content) {
        if (child.$type === 'DescriptionDirective') continue;
        // Reset x to contentLeftX for new rows so items don't trail the prior
        // parallel/group (they will auto-compute startX via after/date anyway).
        cursor.x = contentLeftX;
        const positioned = sequenceOne(
            child as ItemDeclaration | GroupBlock | ParallelBlock,
            cursor,
            ctx,
        );
        children.push(positioned);
        cursor.y += Math.max(ITEM_ROW_HEIGHT, cursor.height);
        cursor.height = 0;
    }
    const bandHeight = Math.max(ITEM_ROW_HEIGHT + 16, cursor.y - y);
    const box: BoundingBox = {
        x: 0,
        y,
        width: ctx.chartRightX,
        height: bandHeight,
    };
    return {
        positioned: {
            id: lane.name,
            title: lane.title ?? lane.name ?? '',
            box,
            bandIndex,
            children,
            nested: [],
            style,
        },
        usedHeight: bandHeight,
    };
}

function buildHeader(
    file: NowlineFile,
    ctx: LayoutContext,
): PositionedHeader {
    const roadmap = file.roadmapDecl;
    const props = roadmap?.properties ?? [];
    const style = resolveStyle('roadmap', props, ctx.styleCtx);
    const title = roadmap?.title ?? roadmap?.name ?? '';
    const author = propValue(props, 'author');

    const position = style.headerPosition;
    const attributionBox: BoundingBox = {
        x: ctx.chartRightX - 120,
        y: 4,
        width: 116,
        height: 16,
    };
    if (position === 'beside') {
        const box: BoundingBox = {
            x: 0,
            y: 0,
            width: HEADER_BESIDE_WIDTH_PX,
            height: ctx.chartBottomY,
        };
        return {
            box,
            position,
            title,
            author,
            logo: undefined,   // m2b will inject when logo prop is present
            style,
            attributionBox,
        };
    }
    const box: BoundingBox = {
        x: 0,
        y: 0,
        width: ctx.chartRightX,
        height: HEADER_ABOVE_HEIGHT_PX,
    };
    return {
        box,
        position,
        title,
        author,
        logo: undefined,
        style,
        attributionBox,
    };
}

// Compute a sensible [startDate, endDate] window.
function computeDateWindow(
    file: NowlineFile,
    ctx: {
        cal: { daysPerWeek: number; daysPerMonth: number; daysPerQuarter: number; daysPerYear: number };
        durations: Map<string, import('@nowline/core').DurationDeclaration>;
    },
): { startDate: Date; endDate: Date } {
    const roadmap = file.roadmapDecl;
    const props = roadmap?.properties ?? [];
    const startRaw = propValue(props, 'start');
    const startDate = parseDate(startRaw) ?? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const lengthRaw = propValue(props, 'length');
    // If explicit length, use it; else pick 180 days default.
    let totalDays = 180;
    if (lengthRaw) {
        const m = /^(\d+)([dwmqy])$/.exec(lengthRaw);
        if (m) {
            const n = parseInt(m[1], 10);
            switch (m[2]) {
                case 'd':
                    totalDays = n;
                    break;
                case 'w':
                    totalDays = n * ctx.cal.daysPerWeek;
                    break;
                case 'm':
                    totalDays = n * ctx.cal.daysPerMonth;
                    break;
                case 'q':
                    totalDays = n * ctx.cal.daysPerQuarter;
                    break;
                case 'y':
                    totalDays = n * ctx.cal.daysPerYear;
                    break;
            }
        }
    }
    const endDate = addDays(startDate, Math.max(1, totalDays));
    return { startDate, endDate };
}

function buildAnchors(
    anchors: Map<string, AnchorDeclaration>,
    ctx: LayoutContext,
): PositionedAnchor[] {
    const out: PositionedAnchor[] = [];
    for (const [id, a] of anchors) {
        const dateRaw = propValue(a.properties, 'date');
        const date = parseDate(dateRaw);
        if (!date) continue;
        const x = xForDate(date, ctx.timeline);
        if (x === null) continue;
        const style = resolveStyle('anchor', a.properties, ctx.styleCtx);
        const center: Point = { x, y: ctx.chartTopY + 12 };
        ctx.entityLeftEdges.set(id, x);
        ctx.entityRightEdges.set(id, x);
        ctx.entityMidpoints.set(id, center);
        out.push({
            id,
            title: a.title ?? id,
            center,
            radius: 8,
            style,
            predecessorPoints: [],
        });
    }
    return out;
}

function buildMilestones(
    milestones: Map<string, MilestoneDeclaration>,
    ctx: LayoutContext,
): PositionedMilestone[] {
    const out: PositionedMilestone[] = [];
    for (const [id, m] of milestones) {
        const style = resolveStyle('milestone', m.properties, ctx.styleCtx);
        const dateRaw = propValue(m.properties, 'date');
        const afterRaw = propValues(m.properties, 'after');
        const date = parseDate(dateRaw);
        let center: Point | null = null;
        let fixed = false;
        let slackX: number | undefined;
        let isOverrun = false;
        if (date) {
            const x = xForDate(date, ctx.timeline);
            if (x !== null) {
                center = { x, y: ctx.chartTopY + 12 };
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
            let maxEnd = ctx.timeline.originX;
            for (const ref of afterRaw) {
                const end = ctx.entityRightEdges.get(ref);
                if (end !== undefined) maxEnd = Math.max(maxEnd, end);
            }
            center = { x: maxEnd, y: ctx.chartTopY + 12 };
            fixed = false;
        }
        if (!center) continue;
        ctx.entityLeftEdges.set(id, center.x);
        ctx.entityRightEdges.set(id, center.x);
        ctx.entityMidpoints.set(id, center);
        out.push({
            id,
            title: m.title ?? id,
            center,
            radius: 10,
            fixed,
            slackX,
            isOverrun,
            style,
        });
    }
    return out;
}

// Orthogonal (Manhattan) dep-edge routing: single elbow with rounded corner.
function routeEdge(from: Point, to: Point): Point[] {
    if (Math.abs(from.y - to.y) < 0.5) {
        return [from, to];
    }
    const midX = (from.x + to.x) / 2;
    return [
        from,
        { x: midX, y: from.y },
        { x: midX, y: to.y },
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
): { area: PositionedFootnoteArea; index: Map<string, number> } {
    const entries: PositionedFootnoteEntry[] = [];
    const index = new Map<string, number>();
    const ordered = [...footnotes.entries()].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([id, f], i) => {
        const n = i + 1;
        index.set(id, n);
        entries.push({
            number: n,
            title: f.title ?? id,
            description: f.description?.text,
            style: resolveStyle('footnote', f.properties, ctx.styleCtx),
        });
    });
    const box: BoundingBox = {
        x: 0,
        y: chartBottomY + 16,
        width: ctx.chartRightX,
        height: entries.length * FOOTNOTE_ROW_HEIGHT + 12,
    };
    return {
        area: { box, entries },
        index,
    };
}

function buildIncludeRegions(
    regions: IsolatedRegion[],
    ctx: LayoutContext,
    startY: number,
): { regions: PositionedIncludeRegion[]; endY: number } {
    let y = startY;
    const out: PositionedIncludeRegion[] = [];
    for (const region of regions) {
        const label = region.content.roadmap?.title ?? region.sourcePath;
        const box: BoundingBox = {
            x: 0,
            y,
            width: ctx.chartRightX,
            height: 48,
        };
        out.push({
            sourcePath: region.sourcePath,
            label,
            box,
            style: resolveStyle('swimlane', [], ctx.styleCtx),
        });
        y += 48 + 4;
    }
    return { regions: out, endY: y };
}

function buildNowline(
    today: Date | undefined,
    ctx: LayoutContext,
): PositionedNowline | null {
    if (!today) return null;
    const x = xForDate(today, ctx.timeline);
    if (x === null) return null;
    return {
        x,
        topY: ctx.chartTopY,
        bottomY: ctx.chartBottomY,
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
    footnoteIndex: Map<string, number>;
    timeline: ReturnType<typeof buildTimelineScale>;
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

    // Date window + header geometry
    const { startDate, endDate } = computeDateWindow(file, { cal, durations: resolved.content.durations });

    // Determine header position via `default roadmap` / theme.
    const headerStyle = resolveStyle('roadmap', file.roadmapDecl?.properties ?? [], styleCtx);
    const isBeside = headerStyle.headerPosition === 'beside';

    const headerBox = isBeside
        ? { x: 0, y: 0, width: HEADER_BESIDE_WIDTH_PX, height: 0 }
        : { x: 0, y: 0, width, height: HEADER_ABOVE_HEIGHT_PX };

    const chartLeftX = isBeside ? HEADER_BESIDE_WIDTH_PX : 0;
    const chartTopY = isBeside ? 8 : HEADER_ABOVE_HEIGHT_PX + 8;
    const chartRightX = width;

    // Pre-compute timeline to get pixels-per-day.
    const chartWidthAvailable = chartRightX - chartLeftX - 24;
    const ppd = pixelsPerDay(scale, cal);
    const spanDays = Math.max(1, daysBetween(startDate, endDate));
    const naturalWidth = spanDays * ppd;
    const originX = chartLeftX + 16;
    // Use scale/calendar natural width; renderer can clip; content may exceed viewBox width.
    const totalChartWidth = Math.max(chartWidthAvailable, naturalWidth);

    const timelineHeightBudget = 32;
    const timelineY = chartTopY;

    const timeline = buildTimelineScale(
        startDate,
        endDate,
        originX,
        scale,
        cal,
        /* chartHeight filled in after swimlanes */ 0,
        resolveStyle('roadmap', [], styleCtx),
    );
    timeline.box.y = timelineY;

    const ctx: LayoutContext = {
        cal,
        styleCtx,
        durations: resolved.content.durations,
        labels: resolved.content.labels,
        footnoteIndex: new Map(),
        timeline,
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

    // Build swimlanes (order: declared order).
    const laneEntries = [...resolved.content.swimlanes.values()];
    const swimlanes: PositionedSwimlane[] = [];
    let y = ctx.chartTopY;
    let bandIndex = 0;
    for (const lane of laneEntries) {
        const { positioned, usedHeight } = buildSwimlane(lane, y, bandIndex, ctx);
        swimlanes.push(positioned);
        y += usedHeight;
        bandIndex++;
    }

    // Include regions under the swimlanes.
    const { regions: includes, endY: afterIncludesY } = buildIncludeRegions(
        resolved.content.isolatedRegions,
        ctx,
        y + 8,
    );
    y = afterIncludesY;

    ctx.chartBottomY = y;
    timeline.box.height = ctx.chartBottomY - timeline.box.y;

    // Anchors / milestones / dependency edges
    const anchors = buildAnchors(resolved.content.anchors, ctx);
    const milestones = buildMilestones(resolved.content.milestones, ctx);
    const itemsMap = collectItems(laneEntries);
    const edges = buildDependencies(itemsMap, ctx);

    // Now-line (if today is within the window)
    const nowline = buildNowline(options.today, ctx);

    // Finalize footnotes at the bottom
    const foot = buildFootnotes(resolved.content.footnotes, ctx, ctx.chartBottomY);
    ctx.footnoteIndex = foot.index;

    // Header (depends on chart height when beside)
    headerBox.height = headerBox.height || ctx.chartBottomY;
    const header: PositionedHeader = {
        box: headerBox,
        position: headerStyle.headerPosition,
        title: file.roadmapDecl?.title ?? file.roadmapDecl?.name ?? '',
        author: propValue(file.roadmapDecl?.properties ?? [], 'author'),
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
