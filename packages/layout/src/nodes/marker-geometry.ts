// Marker-row geometry shared across the marker stack: anchors,
// milestones, and the roadmap-level row packer all read from here so a
// font, gap, or row-height change flows from one place.
//
// Two row-band types live in this file:
//
//   - `MARKER_ROW_PITCH_PX` (26 px): height of a single marker row in
//     the timeline header. The marker band stacks N rows tall when
//     anchors and milestones can't fit on a single row without colliding.
//   - The bare `13` (= PITCH / 2) midpoint that used to sprinkle
//     `roadmap-node.ts` is derived from this constant — bumping the
//     pitch automatically re-centers labels.
//
// Diamond + label box dimensions are reused by every marker (anchor +
// milestone), and the `MARKER_BOLD_WIDTH_FACTOR` corrects the
// pessimistic 0.58 em width estimate for bold milestone labels.

/** Height (px) of a single marker row in the timeline header band. */
export const MARKER_ROW_PITCH_PX = 26;

/**
 * Vertical center offset of a marker row from the top of its band.
 * Always half of `MARKER_ROW_PITCH_PX` — exposed as a derived constant
 * so call sites read as "row 0 center" instead of magic `13`.
 */
export const MARKER_ROW_CENTER_OFFSET_PX = MARKER_ROW_PITCH_PX / 2;

/** Half-width of the diamond glyph drawn at every marker's centerX. */
export const MARKER_DIAMOND_RADIUS_PX = 6;

/** Horizontal gap between the diamond's edge and its label box. */
export const MARKER_LABEL_GAP_PX = 6;

/** Height of the label box (one line of marker label text). */
export const MARKER_LABEL_HEIGHT_PX = 12;

/**
 * Width-estimate surcharge for bold sans-serif marker labels (milestone
 * titles). `estimateTextWidth` is intentionally pessimistic at ~0.58
 * em/char so this small surcharge keeps overlap detection on the safe
 * side without overshooting layout space.
 */
export const MARKER_BOLD_WIDTH_FACTOR = 1.05;
