// Include-region chrome geometry — the label tab + content badge +
// source-path bookmark that float across the top edge of an isolated
// `include {}` region's dashed bracket. Both the layout (which needs
// to know the chrome's right edge to shrink-wrap the bracket) and the
// renderer (which paints each element) call `includeChromeGeometry`,
// so the painted footprint and the layout's reserved footprint stay
// in sync. Mirrors `frameTabGeometry`'s "compute placement X for each
// element + derive total width from the cursor" model.
//
// Layout order, left → right:
//
//   [LEFT_INSET] tab(LABEL) (BADGE_GAP) badge (SOURCE_GAP) [HALO_PAD] source [HALO_PAD]
//
// The badge and source-path are optional in spirit but always present
// for current `include` regions; the helper passes `0` widths through
// cleanly should that ever change.

/**
 * Horizontal offset (px) from the include region's bounding-box left
 * edge to the label tab's left edge. Equals the region's outer pad
 * (8 px from `renderIncludeRegion`) plus a 16 px tab inset that keeps
 * the chiclet visually anchored inside the dashed bracket rather than
 * straddling its rounded corner.
 */
export const INCLUDE_CHROME_OFFSET_FROM_BOX_PX = 24;

/** Horizontal inset (px) from the tab's left edge to the label text. */
export const INCLUDE_CHROME_TAB_LEFT_INSET_PX = 10;
/**
 * Horizontal inset (px) from the label text's right edge to the tab's
 * right edge. Same as the left inset so the label appears optically
 * centered inside its chiclet.
 */
export const INCLUDE_CHROME_TAB_RIGHT_INSET_PX = 10;

/**
 * Px-per-char for the label rendered at 11 pt 600w in `FONT_STACK.sans`.
 * Calibrated against system-ui at 11 pt bold (~5.8 px/char actual);
 * 6.0 leaves a small safety margin without producing wide right
 * whitespace inside the chiclet.
 */
export const INCLUDE_CHROME_TAB_LABEL_PER_CHAR_PX = 6;

/**
 * Minimum total chiclet width (px). A floor so tiny labels still
 * produce a chip wide enough to read; the badge/source bookmark sit
 * outside the chiclet so they never push it past this minimum.
 */
export const INCLUDE_CHROME_TAB_MIN_WIDTH_PX = 60;

/** Gap (px) between the chiclet's right edge and the content badge. */
export const INCLUDE_CHROME_BADGE_GAP_PX = 6;
/** Square content-badge tile size (px). */
export const INCLUDE_CHROME_BADGE_SIZE_PX = 18;

/** Gap (px) between the badge's right edge and the source-path text. */
export const INCLUDE_CHROME_SOURCE_GAP_PX = 6;
/**
 * Px-per-char for the source-path rendered at 9 pt in `FONT_STACK.mono`.
 * Calibrated against ui-monospace at 9 pt regular (~5.4 px/char actual);
 * 5.5 leaves a small safety margin so the halo never clips the path.
 */
export const INCLUDE_CHROME_SOURCE_PER_CHAR_PX = 5.5;
/**
 * Halo padding (px) on each side of the source-path text. The halo
 * masks the dashed bracket border that runs through the text's
 * baseline so the path stays legible.
 */
export const INCLUDE_CHROME_SOURCE_HALO_PAD_PX = 3;

export interface IncludeChromeGeometry {
    /** Estimated rendered width (px) of the label text, no min-clamp. */
    labelTextWidth: number;
    /** Estimated rendered width (px) of the source-path text; 0 when no source. */
    sourceTextWidth: number;

    /** Left X (canvas px) of the chiclet rectangle. */
    tabX: number;
    /** Total chiclet width (px), with min-width floor applied. */
    tabWidth: number;
    /** Canvas X (px) where the label text is painted (left-anchored). */
    tabLabelX: number;

    /** Left X (canvas px) of the content-badge tile; 0 when no badge. */
    badgeX: number;
    /** Square content-badge tile size (px); mirrors `INCLUDE_CHROME_BADGE_SIZE_PX`. */
    badgeSize: number;

    /** Left X (canvas px) of the source-path halo rect; 0 when no source. */
    sourceHaloX: number;
    /** Width (px) of the source-path halo rect; 0 when no source. */
    sourceHaloWidth: number;
    /** Canvas X (px) where the source-path text is painted (left-anchored); 0 when no source. */
    sourceTextX: number;

    /**
     * Right edge (canvas px) of the entire chrome strip — used by the
     * layout to size the include region's bounding box so the dashed
     * bracket always encloses its own chrome. Equals the badge's right
     * edge when no source is present, or the halo's right edge when
     * one is.
     */
    chromeRightX: number;
}

/**
 * Single source of truth for the include-region chrome's geometry.
 *
 * `boxX` is the left edge of the include region's bounding box in
 * canvas px. `label` is the chiclet text; `sourcePath` is the
 * breadcrumb beside the badge (pass `''` to omit the bookmark).
 */
export function includeChromeGeometry(
    boxX: number,
    label: string,
    sourcePath: string,
): IncludeChromeGeometry {
    const tabX = boxX + INCLUDE_CHROME_OFFSET_FROM_BOX_PX;
    const tabLabelX = tabX + INCLUDE_CHROME_TAB_LEFT_INSET_PX;

    const labelTextWidth = label.length * INCLUDE_CHROME_TAB_LABEL_PER_CHAR_PX;
    const tabWidth = Math.max(
        INCLUDE_CHROME_TAB_MIN_WIDTH_PX,
        labelTextWidth + INCLUDE_CHROME_TAB_LEFT_INSET_PX + INCLUDE_CHROME_TAB_RIGHT_INSET_PX,
    );

    const badgeX = tabX + tabWidth + INCLUDE_CHROME_BADGE_GAP_PX;
    const badgeRightX = badgeX + INCLUDE_CHROME_BADGE_SIZE_PX;

    let sourceTextWidth = 0;
    let sourceTextX = 0;
    let sourceHaloX = 0;
    let sourceHaloWidth = 0;
    let chromeRightX = badgeRightX;
    if (sourcePath) {
        sourceTextX = badgeRightX + INCLUDE_CHROME_SOURCE_GAP_PX;
        sourceTextWidth = sourcePath.length * INCLUDE_CHROME_SOURCE_PER_CHAR_PX;
        sourceHaloX = sourceTextX - INCLUDE_CHROME_SOURCE_HALO_PAD_PX;
        sourceHaloWidth = sourceTextWidth + INCLUDE_CHROME_SOURCE_HALO_PAD_PX * 2;
        chromeRightX = sourceHaloX + sourceHaloWidth;
    }

    return {
        labelTextWidth,
        sourceTextWidth,
        tabX,
        tabWidth,
        tabLabelX,
        badgeX,
        badgeSize: INCLUDE_CHROME_BADGE_SIZE_PX,
        sourceHaloX,
        sourceHaloWidth,
        sourceTextX,
        chromeRightX,
    };
}
