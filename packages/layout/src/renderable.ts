// Renderable — measure/place tree primitive that the m2.5c rewrite of
// `layout.ts` is built on. Each entity (item, swimlane, group, ...)
// implements this interface and reports its intrinsic size; parents
// stack children using BandScale and the children's reported heights.
//
// The interface intentionally separates two phases:
//
//   1. measure(ctx) -> IntrinsicSize
//      Pure, idempotent. Computes width + height the node WANTS given
//      the available scales and resolved style. No side effects.
//
//   2. place(origin, ctx) -> TPositioned
//      Anchors the node at `origin` and emits its positioned form.
//      Recursively places children inside this call.
//
// `place` may invoke `measure` again — implementations should make
// `measure` cheap. The production nodes (`ItemNode`, `SwimlaneNode`,
// etc. under `nodes/`) follow this pattern: place re-measures, but
// measure is O(content) without I/O.
//
// Which nodes measure (specs/layout-phases.md, §3.6 and §3.7):
//
//   - `ItemNode` implements `Renderable`, and its measure is complete:
//     `measureItem` (`nodes/item-measure.ts`) sizes the bar once, wrapped
//     title and chip growth included, and the row track takes the row
//     pitch from it before the item is placed. Nothing patches a placed
//     item's height afterwards.
//   - Lanes, groups and parallels do not measure. Their height is the
//     result of row packing on x positions, so measuring them would be
//     placing them twice; they stay single-pass (`sequenceRowTrack`).
//     Anchors, milestones, include regions and the footnote panel place
//     directly as well.
//   - `HeaderNode` has `measure()` and `place()` of its own and does not
//     take this signature: it has no time scale or band to measure
//     against. Its logo slot and text inset live there; drawing the logo
//     stays in the renderer.
//   - The roadmap itself is split by phase, not by node: the measure
//     phase (`phases/measure.ts`) sizes the header, the axis and the
//     header rows before any lane is placed, and the finalize phase
//     (`phases/finalize.ts`) runs everything that needs final geometry.

import type { BandScale } from './band-scale.js';
import type { TimeScale } from './time-scale.js';
import type { ResolvedStyle } from './types.js';

export interface Point {
    x: number;
    y: number;
}

export interface IntrinsicSize {
    /**
     * Width the node wants. For time-driven entities (items, the
     * timeline header) this comes from `TimeScale.forward(end) -
     * forward(start)`; for static entities it's content-driven.
     */
    width: number;
    /**
     * Height the node wants. Bubbles up to the parent BandScale,
     * which in v2 uses it to size band slots instead of a fixed
     * `ITEM_ROW_HEIGHT` constant.
     */
    height: number;
}

export interface MeasureContext {
    time: TimeScale;
    bands: BandScale;
    style: ResolvedStyle;
}

export interface PlaceContext extends MeasureContext {
    /**
     * Horizontal extent of the band background that owns this node.
     * Used by swimlanes to draw their full-width tab + band fill;
     * defaults to `time.range` when absent.
     */
    bandX?: number;
    bandWidth?: number;
}

export interface Renderable<TPositioned> {
    /** Stable id for the node (matches the DSL entity id). */
    id: string;
    /** Compute intrinsic size — pure and idempotent. */
    measure(ctx: MeasureContext): IntrinsicSize;
    /** Anchor + emit positioned form. May recurse into children. */
    place(origin: Point, ctx: PlaceContext): TPositioned;
}
