// sequenceItem — place one item on its track: resolve its start (pins,
// `after:` chains, the wave floor), take its measure (`measureItem`, the
// row track hands in the one it packed the row with), apply the `before:`
// caps, build its `ItemNode` and lay out the chips and the spill column,
// then register it in the context's entity maps.

import type { ItemDeclaration } from '@nowline/core';
import { parseIsoDate, propValue, propValues } from '../dsl-utils.js';
import { computeItemInlineDatePins, pickInlineDate } from '../inline-date-pin-geometry.js';
import {
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
    LABEL_CHIP_HEIGHT_PX,
    LABEL_CHIP_ROW_STEP_PX,
    layoutSpillCluster,
    MIN_BAR_WIDTH_FOR_DOT_PX,
    MIN_BAR_WIDTH_FOR_FOOTNOTE_PX,
} from '../item-bar-geometry.js';
import type { LayoutContext, TrackCursor } from '../layout-context.js';
import { nonWorkingPinOf, resolvePinnedOrSequentialStart } from '../start-rules.js';
import { estimateTextWidth } from '../text-measure.js';
import { PROGRESS_STRIP_HEIGHT_PX } from '../themes/shared.js';
import type { BoundingBox, PositionedItem, PositionedLabelChip } from '../types.js';
import { accumulateWaveMember, waveFloorX, waveRoleOf } from '../wave-layout.js';
import { itemSpanPx } from '../working-span.js';
import { buildLabelChip, type ItemMeasure, measureItem } from './item-measure.js';
import { ItemNode, traceItemNode } from './item-node.js';

/**
 * Place `node` at `cursor` and advance the cursor: `cursor.x` to its
 * duration end.
 * `measured` is the item's measure at the snapped start it is placed at,
 * when the caller (a lane or group row track) already took it to pack the
 * row; a parallel track's child is measured here.
 */
export function sequenceItem(
    node: ItemDeclaration,
    cursor: TrackCursor,
    ctx: LayoutContext,
    measured?: ItemMeasure,
): PositionedItem {
    const props = node.properties;
    const afterRaw = propValues(props, 'after');
    const beforeRaw = propValues(props, 'before');

    // Resolve start x with the swimlane child rule: the latest of the
    // after-chain and the cursor position. A lane or group child's cursor
    // already sits at that start; a direct parallel track's cursor sits at
    // the block's start, so this is where its `after:` applies.
    let startX = resolvePinnedOrSequentialStart(props, cursor.x, ctx);
    // Wave barrier (specs/waves.md §5.1, §8.4): the floor is one more term
    // in the max, after the `after:` logic. Parallel tracks reach this
    // function directly, so this is where their floor applies.
    if (ctx.waves) startX = waveFloorX(node, startX, ctx);
    const nonWorkingPin = nonWorkingPinOf(props, startX, ctx);

    // Under `show` a start that lands in a non-working day moves to the next
    // working day. The floor and NL.I1008 above read the unsnapped start,
    // so their ties and texts match `hide`; the identity under `hide`.
    const placedStartX = ctx.scale.startX(startX);
    // Width, style and tint, progress, meta line, chips, caption fit and
    // the bar's growth (specs/layout-phases.md §3.6). A lane or group row
    // track measured the item at this same start to size its row (the
    // cursor sits at `resolveChildStart`, which an `after:` chain and the
    // wave floor both return unchanged); a parallel track measures here.
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
    // Logical extent: the item's span in time; the bar box is inset from it
    // by its seams (specs/true-width-layout.md §3.1).
    const logicalLeft = placedStartX;
    const logicalRight = placedStartX + naturalWidth;
    // Duration end: where the item ends in time. The time paths take it
    // (the cursor, `after:` references, the wave barrier), so what follows
    // starts on its date, as in engine C; the bar is drawn inside it
    // (specs/true-width-layout.md §3.1).
    const durationEndX = placedStartX + itemSpanPx(ctx, placedStartX, measure.durationDays);

    // Handle `before:` — item must end by the earliest cap. Each cap is
    // either an entity id (looked up in entityLeftEdges) or an inline ISO
    // date literal (resolved through the time scale). The validator enforces
    // "at most one inline date per direction" so at most one element per
    // before-list will hit the date path. The cap is a time path: the item
    // overflows when its duration end passes it; the red tail runs to the
    // painted end.
    let hasOverflow = false;
    let overflowBox: BoundingBox | undefined;
    let overflowAnchorId: string | undefined;
    if (beforeRaw.length > 0) {
        let earliestCapX: number | undefined;
        let earliestCapRef: string | undefined;
        for (const ref of beforeRaw) {
            const inlineDate = parseIsoDate(ref);
            const capX = inlineDate
                ? (ctx.scale.forwardWithinDomain(inlineDate) ?? undefined)
                : ctx.entityLeftEdges.get(ref);
            if (capX === undefined) continue;
            if (earliestCapX === undefined || capX < earliestCapX) {
                earliestCapX = capX;
                earliestCapRef = ref;
            }
        }
        if (earliestCapX !== undefined && durationEndX > earliestCapX) {
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

    // The bar box (grown by `measure.barExtra`) and the caption's x, inset
    // from the logical extent logicalLeft/logicalRight.
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
    let captionSpillWidth: number | null = null;
    if (textSpills) {
        // The widest title LINE: a multi-line spill is as wide as its
        // longest line, not as the raw string (newlines included). A
        // caption capped at the chart's end arrives with its lines already
        // truncated (`measureItem`).
        const titleW = Math.max(
            ...captionLines.map((line) => estimateTextWidth(line, ITEM_CAPTION_TITLE_FONT_SIZE_PX)),
        );
        // Spill column width is the wider of the title and the *full* meta
        // line (text + capacity suffix). `capacityTrailingWidth` is 0 when
        // no capacity suffix is rendered, so this stays a no-op for items
        // without `capacity:`.
        const metaW = (metaText ? estimateTextWidth(metaText, 11) : 0) + capacityTrailingWidth;
        captionSpillWidth = Math.max(titleW, metaW);
    }
    const spill = layoutSpillCluster({
        barRightX: itemBox.x + itemBox.width,
        iconSpills,
        captionWidth: captionSpillWidth,
        footnoteCount: footnoteSpills ? footnoteIndicators.length : 0,
        dotSpills,
    });
    const { iconSpillX, footnoteSpillStartX, dotSpillCx } = spill;
    const decorationsRightX = Math.max(itemBox.x + itemBox.width, spill.rightX);

    const id = node.name;
    // Reference-target edges resolve `after:` / `before:` lookups, so only
    // EXPLICIT ids register here — an id-less item never becomes a
    // referenceable target. Entity edges live in LOGICAL space so chained
    // items / `after:` references sit on the column boundary, not on the
    // visually inset bar edge. The visible 12 px gutter between bars then
    // becomes a clean attach corridor. The right edge is the duration end:
    // `after:` is a time path (decision 6). Items attach their arrows off
    // their final box (`placedItems`), never off this map.
    if (id) {
        ctx.entityLeftEdges.set(id, logicalLeft);
        ctx.entityRightEdges.set(id, durationEndX);
    }
    // A member's end feeds its wave's barrier: its duration end, the lane
    // cursor's advance in `sequenceRowTrack`, never a group box or a
    // caption spill (specs/waves.md §8.4).
    accumulateWaveMember(node, durationEndX, ctx);
    // Drawing / flow maps key on a registration handle EVERY item has: the
    // explicit id when present, else a synthetic, non-referenceable handle
    // (see `syntheticItemKey`). This lets a title-only item register its own
    // dependency-arrow target geometry and join flow-key dedup without
    // entering the human-referenceable namespace above. The item itself is
    // registered in `ctx.placedItems` once it is built (below); its arrow
    // and slack-arrow attach points are derived from its final box later.
    const drawKey = id ?? syntheticItemKey(node);
    ctx.itemFlowKey.set(drawKey, ctx.currentFlowKey);

    // A parallel track joins, and its container's bracket spans, from
    // `cursor.startX` to `cursor.x`.
    cursor.startX = logicalLeft;
    cursor.x = durationEndX;
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
        dateSpan: { startX: logicalLeft, endX: logicalRight },
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
    if (nonWorkingPin !== undefined) result.nonWorkingPin = nonWorkingPin;
    // The caption cap at the chart's end truncated a title line; the full
    // title stays the bar's tooltip.
    if (caption.truncated) result.titleTruncated = true;
    // A background item carries its localized hover line from placement
    // on (specs/waves.md §9.3); members and wave-free items carry none.
    if (waveRole === 'background' && ctx.waves) {
        result.waveTooltip = ctx.waves.backgroundTooltip;
    }
    // Register the item object itself, not coordinates sampled from it:
    // the row packer and the marker-band shift may still move this box
    // down, and every attach port is read off the final box (see
    // `item-port-geometry.ts`).
    ctx.placedItems.set(drawKey, result);
    traceItemNode(itemNode, placeCtx, result);
    return result;
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
export function syntheticItemKey(node: ItemDeclaration): string {
    const start = node.$cstNode?.range.start;
    return `#item@${start ? start.line + 1 : 0}:${start ? start.character + 1 : 0}`;
}
