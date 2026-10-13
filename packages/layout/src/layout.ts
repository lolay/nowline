import type {
    EntityProperty,
    GroupBlock,
    ItemDeclaration,
    NowlineFile,
    ParallelBlock,
    ResolveResult,
    SwimlaneDeclaration,
} from '@nowline/core';
import { buildWavePlan, isGroupBlock, isItemDeclaration, isParallelBlock } from '@nowline/core';
import { formatIsoDate, parseDate, propValue, propValues } from './dsl-utils.js';
import {
    ChannelGrid,
    collectRoutingObstacles,
    type EdgeRouteRequest,
    routeChannelEdges,
} from './edge-routing.js';
import type { LogoDimensions } from './header-logo.js';
import { localeStrings } from './i18n.js';
import { computeItemInlineDatePins, pickInlineDate } from './inline-date-pin-geometry.js';
import {
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    ITEM_DECORATION_SPILL_GAP_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
    LABEL_CHIP_HEIGHT_PX,
    LABEL_CHIP_ROW_STEP_PX,
    MIN_BAR_WIDTH_FOR_DOT_PX,
    MIN_BAR_WIDTH_FOR_FOOTNOTE_PX,
} from './item-bar-geometry.js';
import { itemArrowSourcePort, itemArrowTargetPort } from './item-port-geometry.js';
import { type LayoutContext, newCursor, type TrackCursor } from './layout-context.js';
import { GroupNode } from './nodes/group-node.js';
import { buildLabelChip, type ItemMeasure, measureItem } from './nodes/item-measure.js';
import { ItemNode, traceItemNode } from './nodes/item-node.js';
import { ParallelNode } from './nodes/parallel-node.js';
import { RoadmapNode } from './nodes/roadmap-node.js';
import type { NonWorkingDisplay } from './non-working-display.js';
import { type RoadmapSchedule, scheduleRoadmap } from './schedule.js';
import { startTermsOf } from './start-terms.js';
import { resolveStyle } from './style-resolution.js';
import { estimateTextWidth } from './text-measure.js';
import type { ThemeName } from './themes/index.js';
import {
    GUTTER_PX,
    ITEM_INSET_PX,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOW_PILL_WIDTH_PX,
    PROGRESS_STRIP_HEIGHT_PX,
} from './themes/shared.js';
import type {
    BoundingBox,
    Point,
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
} from './types.js';
import {
    accumulateWaveMember,
    dateAtX,
    WAVE_EDGE_TOLERANCE_PX,
    waveFloorX,
    wavePinOverrideOf,
    waveRoleOf,
} from './wave-layout.js';

export interface LayoutOptions {
    theme?: ThemeName;
    today?: Date;
    /**
     * Best-effort maximum canvas width in px. Unset (the default) sizes the
     * canvas to its content. When the content is wider, pixels-per-day
     * shrinks to fit, down to `MIN_PIXELS_PER_DAY`; spilled captions and
     * run labels can still widen the canvas past it. See
     * `specs/rendering.md` § Canvas width.
     */
    width?: number;
    /**
     * BCP-47 tag controlling axis labels, the now-pill string, and the
     * quarter prefix. Resolved by the caller (CLI flag → env vars). When
     * undefined, layout falls back to the file's `nowline v1 locale:` and
     * then to `en-US`. See `specs/localization.md`.
     */
    locale?: string;
    /**
     * How a calendar's non-working days are drawn (specs/working-calendar.md
     * §4.2). Overrides the file's `default roadmap non-working:` key; when
     * undefined the key applies, then `hide`.
     */
    nonWorking?: NonWorkingDisplay;
    /**
     * Intrinsic size of the roadmap's `logo:` asset, read by the caller
     * before layout (`loadLogo` in @nowline/renderer). Layout scales it to
     * the `logo-size:` slot inside the header card. Leave it undefined when
     * the file declares no logo or the asset could not be loaded: the
     * header then lays out as if no logo were declared.
     */
    logo?: LogoDimensions;
    /**
     * A day schedule the caller already built for this roadmap
     * (`scheduleRoadmap`, with the wave plan as `schedule.plan`). Layout
     * reuses it when `schedule.resolved` is the very `ResolveResult` passed
     * to `layoutRoadmap`, so a staging step that builds the plan and the
     * schedule once hands them on (specs/scheduler-unification.md §3.6).
     * A schedule built from another `ResolveResult` is ignored and rebuilt.
     * Build it with the same `today` as this call's `today`: the window and
     * the default start date come from it.
     */
    schedule?: RoadmapSchedule;
}

export type LayoutResult = PositionedRoadmap;

// Sequence a set of nodes into a single horizontal track. `parallelInside`
// indicates the caller is inside a ParallelBlock and each child occupies a
// fresh sub-track (caller passes a new cursor per call).
function sequenceItem(
    node: ItemDeclaration,
    cursor: TrackCursor,
    ctx: LayoutContext,
    measured?: ItemMeasure,
): PositionedItem {
    const props = node.properties;
    const afterRaw = propValues(props, 'after');
    const beforeRaw = propValues(props, 'before');

    // Resolve start x with the swimlane child precedence: `date:` > `start:`
    // > after-chain > cursor position. A lane or group child's cursor
    // already sits at that start; a direct parallel track's cursor sits at
    // the block's start, so this is where its pin applies.
    let startX = resolvePinnedOrSequentialStart(props, cursor.x, ctx);
    // Wave barrier (specs/waves.md §5.1, §8.4): the floor is one more term
    // in the max, after the pin and `after:` logic, so a pin becomes
    // max(pin, F). Parallel tracks reach this function directly, so this
    // is where their floor applies.
    let wavePinOverride: PositionedItem['wavePinOverride'];
    if (ctx.waves) {
        startX = waveFloorX(node, startX, ctx);
        wavePinOverride = wavePinOverrideOf(node, startX, ctx);
    }
    // NL.I1008 defers to NL.W1001: a pin a wave floor moved reports there.
    const nonWorkingPin =
        wavePinOverride === undefined ? nonWorkingPinOf(props, startX, ctx) : undefined;

    // Under `show` a start that lands in a non-working day moves to the next
    // working day. The floor, the pin override and NL.I1008 above read the
    // unsnapped start, so their ties and texts match `hide`; the identity
    // under `hide`.
    const placedStartX = ctx.scale.startX(startX);
    // Width, style and tint, progress, meta line, chips, caption fit and
    // the bar's growth (specs/layout-phases.md §3.6). A lane or group row
    // track measured the item at this same start to size its row (the
    // cursor sits at `resolveChildStart`, which a pin, an `after:` chain and
    // the wave floor all return unchanged); a parallel track measures here.
    const measure = measured ?? measureItem(node, placedStartX, ctx);
    if (measure.startX !== placedStartX) {
        throw new Error(
            `layout: item "${node.name ?? node.title ?? '(unnamed)'}" was measured at x ${measure.startX} but placed at x ${placedStartX}`,
        );
    }
    const { naturalWidth, style, status, progress, footnoteIndicators, caption } = measure;
    const { metaText, ownerDisplay, capacity, capacityTrailingWidth } = measure.meta;
    const linkInfo = measure.link;
    const hasLinkIcon = linkInfo.icon !== 'none';
    const chipSamples = measure.chips.samples;
    const chipsOutside = measure.chips.outside;
    // Logical extent — what the item "owns" in time (used for chaining,
    // `after:` lookups, dependency-arrow attach points).
    const logicalLeft = placedStartX;
    const logicalRight = placedStartX + naturalWidth;

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

    // The bar box (grown by `measure.barExtra`) and the caption's x. Logical
    // extent (used by chaining and `after:` lookups) stays on
    // logicalLeft/logicalRight; the box is inset from it.
    const titleStr = caption.title;
    const itemNode = new ItemNode(measure);
    const placeCtx = { time: ctx.scale, bands: ctx.bandScale, style };
    const placed = itemNode.place({ x: logicalLeft, y: cursor.y }, placeCtx);
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
    // Measured on the same box width as the other two.
    const iconSpills = caption.iconSpills;
    const footnoteSpillsForNarrow = itemBox.width < MIN_BAR_WIDTH_FOR_FOOTNOTE_PX;
    const textSpills = placed.textSpills || iconSpills;
    // The lines the title paints on (`resolveCaptionTitleLines`).
    const captionLines = caption.lines;

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
    // the title and chip growth, `measure.barExtra`, which `ItemNode`
    // has already applied to the box) and the bottom progress strip
    // moves with the new bottom edge. Chip Y is anchored to the
    // ORIGINAL bandwidth (relative to the bar's top), not to the grown
    // box.height, so row 0 stays where a single-row chip would
    // naturally render and rows 1..N grow downward into the new bar
    // area.
    //
    // When the caption ALSO spills (`textSpills && chipsOutside`),
    // row 0's y drops below the meta baseline so the spilled stack
    // reads `title → meta → chip-row-0 → chip-row-1 → ...` at a
    // single column inside the (now-taller) bar.
    const chipPack = measure.chips.pack;
    // Baseline (px from the bar's top) of the caption's last line: the
    // meta line when present, else the last title line. Chips stacked
    // inside the bar must clear it.
    const captionLastBaseline = caption.lastBaseline;
    const barExtra = measure.barExtra;

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

    const owner = ownerDisplay ?? propValue(props, 'owner');
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
        size: measure.size,
        style,
        inlineDatePins: inlineDatePins.length > 0 ? inlineDatePins : undefined,
    };
    // Wave fields exist only in a roadmap with waves (omitted, never
    // undefined, so wave-free models keep their exact shape).
    const waveRole = waveRoleOf(node, ctx);
    if (waveRole !== undefined) result.waveRole = waveRole;
    if (wavePinOverride !== undefined) result.wavePinOverride = wavePinOverride;
    if (nonWorkingPin !== undefined) result.nonWorkingPin = nonWorkingPin;
    // Register the item object itself, not coordinates sampled from it:
    // the row packer and the marker-band shift may still move this box
    // down, and every attach port is read off the final box (see
    // `item-port-geometry.ts`).
    ctx.placedItems.set(drawKey, result);
    traceItemNode(itemNode, placeCtx, result);
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
    // Unused since F1 (`after:` starts at the lane cursor, not the lane's
    // left edge); `LayoutHelpers.resolveChildStart` still threads it.
    _laneLeftX: number,
    ctx: LayoutContext,
): number {
    return waveFloorX(
        child,
        resolvePinnedOrSequentialStart(child.properties, seqDefault, ctx),
        ctx,
    );
}

function resolvePinnedOrSequentialStart(
    props: EntityProperty[],
    seqDefault: number,
    ctx: LayoutContext,
): number {
    const { pin, after } = startTermsOf(props);
    if (pin) {
        const xd = ctx.scale.forwardWithinDomain(pin.date);
        if (xd !== null) return xd;
    }
    if (after.length > 0) {
        let maxEnd = seqDefault;
        for (const term of after) {
            if ('date' in term) {
                const xd = ctx.scale.forwardWithinDomain(term.date);
                if (xd !== null) maxEnd = Math.max(maxEnd, xd);
                continue;
            }
            const endX = ctx.entityRightEdges.get(term.ref);
            if (endX !== undefined) maxEnd = Math.max(maxEnd, endX);
        }
        return maxEnd;
    }
    return seqDefault;
}

/**
 * The pin on a non-working day that set an item's start (NL.I1008,
 * specs/working-calendar.md §6), for an item placed at `startX`. The pin
 * follows the start precedence of `resolvePinnedOrSequentialStart`:
 * `date:`, then `start:`, then the inline date of `after:`. It reports only
 * when it set the start, that is when the item starts at the pin's x
 * (within the edge tolerance): a later `after:` ref, the lane cursor or a
 * wave floor that pushed the item past it never reports. A pin on a
 * working day or outside the date window reports nothing.
 */
function nonWorkingPinOf(
    props: EntityProperty[],
    startX: number,
    ctx: LayoutContext,
): PositionedItem['nonWorkingPin'] {
    if (!ctx.calendar.hasNonWorkingDays) return undefined;
    const pin = startPinOf(props);
    if (!pin || ctx.calendar.isWorkingDay(pin.date)) return undefined;
    const pinX = ctx.scale.forwardWithinDomain(pin.date);
    if (pinX === null || Math.abs(startX - pinX) >= WAVE_EDGE_TOLERANCE_PX) return undefined;
    return { key: pin.key, pin: pin.raw, start: formatIsoDate(dateAtX(startX, ctx)) };
}

/** The dated pin that can set an item's start, by the start precedence. */
function startPinOf(
    props: EntityProperty[],
): { key: 'date' | 'start' | 'after'; raw: string; date: Date } | undefined {
    const { pin, after } = startTermsOf(props);
    if (pin) return pin;
    for (const term of after) {
        if ('date' in term) return { key: 'after', raw: term.raw, date: term.date };
    }
    return undefined;
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

/**
 * The now-line on the final scale. `chartRightX` is the final canvas right
 * edge; a pill that would cross it flips to flag mode.
 */
function buildNowline(
    today: Date | undefined,
    ctx: LayoutContext,
    locale: string,
    chartRightX: number,
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
    } else if (x + halfPill > chartRightX) {
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
    // The wave plan and the day schedule (engine C) are built once per
    // layout, unless the caller already built them for this very
    // `ResolveResult` (specs/scheduler-unification.md §3.6). The schedule
    // carries the plan (`schedule.plan`, undefined without waves); engine A
    // reads it for the barrier passes and the date window is a projection of
    // the schedule.
    const schedule =
        options.schedule?.resolved === resolved
            ? options.schedule
            : scheduleRoadmap(file, resolved, {
                  today: options.today,
                  plan: buildWavePlan(resolved) ?? null,
              });
    return new RoadmapNode().place(file, resolved, options, schedule, {
        sequenceItem,
        sequenceOne,
        resolveChildStart,
        newCursor,
        estimateTextWidth,
        collectItems,
        buildDependencies,
        buildNowline,
    });
}
