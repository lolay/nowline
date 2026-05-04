// Frame-tab chiclet geometry — the rounded label tab that overhangs a
// swimlane's frame. Layout pre-computes the chiclet's right edge so the
// row-packer can decide whether the first item should sit at the
// chiclet's TOP_Y (clear of the chiclet) or be pushed below it; the
// renderer paints the chiclet using the SAME math.
//
// The character-width factors are deliberately conservative — they
// over-estimate so the chiclet never visually clips its label even
// when the actual font metrics exceed our estimate.

/** Conservative px-per-char for a 12 pt bold-ish title in `FONT_STACK.sans`. */
export const FRAME_TAB_TITLE_PX_PER_CHAR = 7;

/** Conservative px-per-char for a 10 pt regular owner suffix. */
export const FRAME_TAB_OWNER_PX_PER_CHAR = 5.6;

/** Minimum title-text column width inside the chiclet. */
export const FRAME_TAB_TITLE_MIN_WIDTH_PX = 40;

/** Minimum owner-suffix column width when an owner is present. */
export const FRAME_TAB_OWNER_MIN_WIDTH_PX = 60;

/** Horizontal internal padding (left + right combined) inside the chiclet. */
export const FRAME_TAB_INTERNAL_PADDING_PX = 24;

/** Horizontal offset (px) from the swimlane box's left edge to the tab's left edge. */
export const FRAME_TAB_OFFSET_FROM_BOX_PX = 10;

export interface FrameTabGeometry {
    /** Width of the title text column (inside the chiclet). */
    titleWidth: number;
    /** Width of the owner suffix column (0 when no owner). */
    ownerWidth: number;
    /** Internal horizontal padding for the chiclet (left + right). */
    padding: number;
    /** Left X (canvas px) of the chiclet rectangle. */
    tabX: number;
    /** Total chiclet width (px). */
    tabW: number;
    /** Right X (canvas px) of the chiclet — convenience for layout collisions. */
    rightX: number;
}

/**
 * Single source of truth for the swimlane chiclet's geometry. Both the
 * layout (collision math) and the renderer (drawing) call this so the
 * chiclet never clips its label and never overlaps the first item.
 */
export function frameTabGeometry(
    boxX: number,
    title: string,
    owner: string | undefined,
): FrameTabGeometry {
    const titleWidth = Math.max(FRAME_TAB_TITLE_MIN_WIDTH_PX, title.length * FRAME_TAB_TITLE_PX_PER_CHAR);
    const ownerWidth = owner
        ? Math.max(FRAME_TAB_OWNER_MIN_WIDTH_PX, ('owner: ' + owner).length * FRAME_TAB_OWNER_PX_PER_CHAR)
        : 0;
    const padding = FRAME_TAB_INTERNAL_PADDING_PX;
    const tabX = boxX + FRAME_TAB_OFFSET_FROM_BOX_PX;
    const tabW = titleWidth + ownerWidth + padding;
    return { titleWidth, ownerWidth, padding, tabX, tabW, rightX: tabX + tabW };
}
