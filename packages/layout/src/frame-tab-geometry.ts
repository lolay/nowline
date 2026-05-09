// Frame-tab chiclet geometry — the rounded label tab that overhangs a
// swimlane's frame. Both the layout (collision math) and the renderer
// (drawing) call `frameTabGeometry` so the chiclet's painted footprint
// matches the bounding box layout reserves for it, and so the same
// helper computes WHERE inside the chiclet each text element lands.
//
// Design note: this helper separates two concerns that used to be
// conflated in a single set of "column widths":
//
//   * Text-end positions (`titleX`, `ownerX`, `badgeX`) are computed
//     from estimated actual text widths plus a small explicit
//     `FRAME_TAB_INNER_GAP_PX`. The renderer paints elements at these
//     X coordinates directly — no second placement pass.
//
//   * Chiclet width (`tabW`) is computed from the right edge of the
//     last painted element plus `FRAME_TAB_RIGHT_INSET_PX`, with a
//     small minimum so a 2–3 char solo title still produces a usable
//     chip. This means short labels naturally shrink-wrap their
//     chiclet rather than reserving a wide whitespace column.
//
// The per-char width factors are calibrated to actual avg-char-width
// of the system sans-serif stack at the relevant font sizes / weights.
// They lean slightly conservative (~5 % over actual) so the chiclet
// never visually clips its label even when the runtime font's metrics
// exceed the calibration target.

/**
 * Px-per-char for a 12 pt 600-weight title in `FONT_STACK.sans`.
 * Calibrated against system-ui at 12 pt bold (~6.3 px/char actual);
 * 6.5 leaves a small safety margin without producing a wide gap to
 * the owner / badge that follows.
 */
export const FRAME_TAB_TITLE_PX_PER_CHAR = 6.5;

/**
 * Px-per-char for a 10 pt regular owner suffix in `FONT_STACK.sans`.
 * Calibrated against system-ui at 10 pt regular (~5 px/char actual).
 */
export const FRAME_TAB_OWNER_PX_PER_CHAR = 5;

/**
 * Visible gap (px) between adjacent text elements inside the chiclet:
 * title→owner, owner→badge, and (no-owner) title→badge. Small enough
 * to read as a single chip but big enough that the eye can still
 * separate the tokens.
 */
export const FRAME_TAB_INNER_GAP_PX = 6;

/** Horizontal inset (px) from the chiclet's left edge to the title text. */
export const FRAME_TAB_LEFT_INSET_PX = 12;

/** Horizontal inset (px) from the rightmost element's right edge to the chiclet's right edge. */
export const FRAME_TAB_RIGHT_INSET_PX = 12;

/**
 * Minimum total chiclet width (px). Acts as a floor so very short
 * solo titles ("Q1", "Mob") don't produce a tiny chip that's hard to
 * notice. Owner / badge presence almost always pushes the chiclet
 * past this floor on its own.
 */
export const FRAME_TAB_MIN_WIDTH_PX = 56;

/** Horizontal offset (px) from the swimlane box's left edge to the tab's left edge. */
export const FRAME_TAB_OFFSET_FROM_BOX_PX = 10;

export interface FrameTabGeometry {
    /** Estimated rendered width (px) of the title text, no min-clamp. */
    titleTextWidth: number;
    /** Estimated rendered width (px) of the owner suffix; 0 when no owner. */
    ownerTextWidth: number;
    /** Width (px) of the capacity badge as supplied by the caller; 0 when none. */
    capacityBadgeWidth: number;
    /** Width (px) of the footnote indicator text as supplied by the caller; 0 when none. */
    footnoteIndicatorWidth: number;

    /** Canvas X (px) where the title text is painted. */
    titleX: number;
    /** Canvas X (px) where the owner text is painted; 0 when no owner. */
    ownerX: number;
    /** Canvas X (px) where the capacity badge starts; 0 when no badge. */
    badgeX: number;
    /**
     * Canvas X (px) for the right edge of the footnote indicator text
     * (use with `text-anchor: end`); 0 when no footnote. Sits inside
     * the chiclet just before the right inset.
     */
    footnoteRightX: number;

    /** Left X (canvas px) of the chiclet rectangle. */
    tabX: number;
    /** Total chiclet width (px). */
    tabW: number;
    /** Right X (canvas px) of the chiclet — convenience for layout collisions. */
    rightX: number;
}

/**
 * Single source of truth for the swimlane chiclet's geometry.
 *
 * `capacityBadgeWidth` and `footnoteIndicatorWidth` are supplied by
 * the caller — they depend on resolved icon shape / footnote-indicator
 * string which neither the layout nor the renderer wants to duplicate.
 * Pass 0 (or omit) when the lane has no capacity badge / footnote
 * indicators to render.
 *
 * Layout order inside the chiclet, left → right:
 *
 *     [LEFT_INSET] title (INNER_GAP) owner (INNER_GAP) badge (INNER_GAP) footnote [RIGHT_INSET]
 *
 * Each element is optional except title; gaps are inserted only between
 * present elements.
 */
export function frameTabGeometry(
    boxX: number,
    title: string,
    owner: string | undefined,
    capacityBadgeWidth: number = 0,
    footnoteIndicatorWidth: number = 0,
): FrameTabGeometry {
    const tabX = boxX + FRAME_TAB_OFFSET_FROM_BOX_PX;
    const titleX = tabX + FRAME_TAB_LEFT_INSET_PX;

    const titleTextWidth = title.length * FRAME_TAB_TITLE_PX_PER_CHAR;
    let cursorX = titleX + titleTextWidth;

    let ownerTextWidth = 0;
    let ownerX = 0;
    if (owner) {
        ownerTextWidth = `owner: ${owner}`.length * FRAME_TAB_OWNER_PX_PER_CHAR;
        ownerX = cursorX + FRAME_TAB_INNER_GAP_PX;
        cursorX = ownerX + ownerTextWidth;
    }

    let badgeX = 0;
    if (capacityBadgeWidth > 0) {
        badgeX = cursorX + FRAME_TAB_INNER_GAP_PX;
        cursorX = badgeX + capacityBadgeWidth;
    }

    let footnoteRightX = 0;
    if (footnoteIndicatorWidth > 0) {
        // Footnote indicator paints with `text-anchor: end`, so its
        // X is the RIGHT edge of the text. Add the gap before it and
        // its own width to the running content cursor.
        footnoteRightX = cursorX + FRAME_TAB_INNER_GAP_PX + footnoteIndicatorWidth;
        cursorX = footnoteRightX;
    }

    const contentW = cursorX - tabX + FRAME_TAB_RIGHT_INSET_PX;
    const tabW = Math.max(FRAME_TAB_MIN_WIDTH_PX, contentW);

    return {
        titleTextWidth,
        ownerTextWidth,
        capacityBadgeWidth,
        footnoteIndicatorWidth,
        titleX,
        ownerX,
        badgeX,
        footnoteRightX,
        tabX,
        tabW,
        rightX: tabX + tabW,
    };
}
