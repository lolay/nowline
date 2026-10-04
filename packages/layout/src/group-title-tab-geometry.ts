// Group title chiclet geometry — the filled label tab a styled group
// paints flush in its bounding box's upper-left corner. Layout (the
// chiclet top-pad reservation, the inline-date glyph clearance) and the
// renderer (drawing) both call these helpers, so the painted chiclet and
// the space layout keeps clear of it can't drift apart.
//
// Coordinate convention: widths are absolute px; the chiclet's left edge
// is always the group box's left edge (no overhang, see
// specs/rendering.md "Group (styled)").

import { GROUP_TITLE_TAB_CHAR_WIDTH_PX, GROUP_TITLE_TAB_PAD_X_PX } from './themes/shared.js';

/**
 * True when a group paints its filled box. A filled group with a title
 * also paints the title chiclet; an unfilled one renders bracket-style
 * (or not at all) and has no chiclet.
 */
export function groupHasFill(bg: string): boolean {
    return bg !== 'none' && bg !== '#ffffff';
}

/** Width (px) of the title chiclet sized to `title`. */
export function groupTitleTabWidth(title: string): number {
    return title.length * GROUP_TITLE_TAB_CHAR_WIDTH_PX + 2 * GROUP_TITLE_TAB_PAD_X_PX;
}
