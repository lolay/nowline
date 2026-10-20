// Frame-tab chiclet geometry — the rounded label tab that overhangs a
// swimlane's frame. Layout calls `frameTabGeometry` once per lane, with
// the owner's display title, uses it for the collision math and carries
// it on `PositionedSwimlane.tab`; the renderer draws from that, so the
// chiclet's painted footprint is the box layout reserved for it, and the
// same helper computes WHERE inside the chiclet each text element lands.
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
// The width factors are calibrated to the system sans-serif stack at
// the relevant font sizes / weights. Title and owner use per-character
// width classes rather than one average: a flat average let wide text
// ("Headcount", "Sam Chen") overrun its estimate by most of the inner
// gap while narrow text ("Sprint pts") reserved a wide hole.

/** Font size (px) of the 600-weight title in `FONT_STACK.sans`. */
export const FRAME_TAB_TITLE_FONT_SIZE_PX = 12;

/** Font size (px) of the regular-weight owner name in `FONT_STACK.sans`. */
export const FRAME_TAB_OWNER_FONT_SIZE_PX = 10;

// Width classes, in em. Calibrated against system-ui (Inter) at 12px
// semibold, the widest common resolution of the stack, so other system
// fonts land at or slightly inside the estimate.
const NARROW_EM = 0.28;
const SEMI_NARROW_EM = 0.4;
const WIDE_EM = 0.9;
const CAPITAL_OR_DIGIT_EM = 0.7;
const DEFAULT_EM = 0.6;
const NARROW_CHARS = new Set(" ijlI.,:;!'|`");
const SEMI_NARROW_CHARS = new Set('frt()[]{}/\\1-_"');
const WIDE_CHARS = new Set('mwMW@%');

// Regular weight draws about 5 % narrower per em than semibold, which
// the classes are calibrated to (Inter at 10px regular).
const REGULAR_WEIGHT_SCALE = 0.95;

function estimateClassedEm(text: string): number {
    let em = 0;
    for (const ch of text) {
        if (NARROW_CHARS.has(ch)) em += NARROW_EM;
        else if (SEMI_NARROW_CHARS.has(ch)) em += SEMI_NARROW_EM;
        else if (WIDE_CHARS.has(ch)) em += WIDE_EM;
        else if (/[A-Z0-9]/.test(ch)) em += CAPITAL_OR_DIGIT_EM;
        else em += DEFAULT_EM;
    }
    return em;
}

/** Estimated rendered width (px) of a frame-tab title. */
export function estimateFrameTabTitleWidth(title: string): number {
    return estimateClassedEm(title) * FRAME_TAB_TITLE_FONT_SIZE_PX;
}

/** Estimated rendered width (px) of a frame-tab owner name, without its glyph. */
export function estimateFrameTabOwnerWidth(owner: string): number {
    return estimateClassedEm(owner) * FRAME_TAB_OWNER_FONT_SIZE_PX * REGULAR_WEIGHT_SCALE;
}

/**
 * Size (px) of the person / people glyph that leads the owner name. One
 * em of the 10 pt owner text, like the lane capacity badge's glyph.
 */
export const FRAME_TAB_OWNER_GLYPH_PX = 10;

/** Gap (px) between the owner glyph and the owner name. */
export const FRAME_TAB_OWNER_GLYPH_GAP_PX = 3;

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
    /**
     * Estimated rendered width (px) of the owner suffix, glyph and name
     * together; 0 when no owner.
     */
    ownerTextWidth: number;
    /** Width (px) of the capacity badge as supplied by the caller; 0 when none. */
    capacityBadgeWidth: number;
    /** Width (px) of the footnote indicator text as supplied by the caller; 0 when none. */
    footnoteIndicatorWidth: number;

    /** Canvas X (px) where the title text is painted. */
    titleX: number;
    /** Canvas X (px) where the owner glyph is painted; 0 when no owner. */
    ownerX: number;
    /** Canvas X (px) where the owner name is painted, past the glyph; 0 when no owner. */
    ownerTextX: number;
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
 * Single source of truth for the swimlane chiclet's geometry. Layout
 * calls it once per lane and carries the result on
 * `PositionedSwimlane.tab`; the renderer draws from that.
 *
 * `capacityBadgeWidth` and `footnoteIndicatorWidth` are supplied by
 * the caller — they depend on resolved icon shape / footnote-indicator
 * string which neither the layout nor the renderer wants to duplicate.
 * Pass 0 (or omit) when the lane has no capacity badge / footnote
 * indicators to render.
 *
 * Layout order inside the chiclet, left → right:
 *
 *     [LEFT_INSET] title (INNER_GAP) glyph owner (INNER_GAP) badge (INNER_GAP) footnote [RIGHT_INSET]
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

    const titleTextWidth = estimateFrameTabTitleWidth(title);
    let cursorX = titleX + titleTextWidth;

    let ownerTextWidth = 0;
    let ownerX = 0;
    let ownerTextX = 0;
    if (owner) {
        ownerTextWidth =
            FRAME_TAB_OWNER_GLYPH_PX +
            FRAME_TAB_OWNER_GLYPH_GAP_PX +
            estimateFrameTabOwnerWidth(owner);
        ownerX = cursorX + FRAME_TAB_INNER_GAP_PX;
        ownerTextX = ownerX + FRAME_TAB_OWNER_GLYPH_PX + FRAME_TAB_OWNER_GLYPH_GAP_PX;
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
        ownerTextX,
        badgeX,
        footnoteRightX,
        tabX,
        tabW,
        rightX: tabX + tabW,
    };
}
