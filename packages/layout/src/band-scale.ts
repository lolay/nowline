// BandScale — wraps `d3-scale.scaleBand` for the y-axis row stack.
//
// Replaces the magic `ITEM_ROW_HEIGHT = 64` constant with a typed
// primitive that exposes `bandwidth()` (one row's visible height)
// and `step()` (row + inter-row gap). m2.5b's job is to land this
// surface; m2.5c will switch to the measure/place tree where each
// node returns its own intrinsic height and BandScale becomes the
// composition primitive parents stack with.
//
// `BandScale.forRows({ count, range })` matches the d3-scale.scaleBand
// constructor (domain = ['0', '1', ..., 'count-1']) but keeps the
// caller's step/bandwidth fixed when the row count is known up front.
// The current layout pipeline iterates rows lazily, so we also expose
// `BandScale.fixedRow({ bandwidth, step })` which doesn't anchor to a
// finite domain — the swimlane row loop uses this to know
// `bandwidth()` and `step()` without committing to a row count.

import { scaleBand, type ScaleBand } from 'd3-scale';

export interface FixedRowOptions {
    /** Visible height of one row in pixels. */
    bandwidth: number;
    /** Pixels between the top of consecutive rows. Must be >= bandwidth. */
    step: number;
}

export interface BandedRangeOptions {
    /** Number of bands. */
    count: number;
    /** [topY, bottomY]. */
    range: [number, number];
    /** Inner padding ratio (0..1) per d3-scale.scaleBand. Defaults to 0. */
    paddingInner?: number;
    /** Outer padding ratio (0..1) per d3-scale.scaleBand. Defaults to 0. */
    paddingOuter?: number;
}

export class BandScale {
    private readonly bandwidthPx: number;
    private readonly stepPx: number;
    private readonly d3?: ScaleBand<string>;

    private constructor(bandwidth: number, step: number, d3?: ScaleBand<string>) {
        this.bandwidthPx = bandwidth;
        this.stepPx = step;
        this.d3 = d3;
    }

    /**
     * Open-ended row band with a fixed bandwidth + step. Used when
     * the row count is determined by iteration (the v1 swimlane row
     * packer). m2.5c will tighten this once the measure/place tree
     * lets us know row counts ahead of time.
     */
    static fixedRow(opts: FixedRowOptions): BandScale {
        return new BandScale(opts.bandwidth, opts.step);
    }

    /**
     * Closed-domain band that wraps d3-scale.scaleBand. Use when the
     * full set of band ids is known at construction time (e.g. the
     * top-level swimlane stack). The `forward(id)` API resolves an
     * id to its top-y.
     */
    static forRows(opts: BandedRangeOptions): BandScale {
        const ids = Array.from({ length: opts.count }, (_, i) => String(i));
        const d3 = scaleBand<string>()
            .domain(ids)
            .range(opts.range)
            .paddingInner(opts.paddingInner ?? 0)
            .paddingOuter(opts.paddingOuter ?? 0);
        return new BandScale(d3.bandwidth(), d3.step(), d3);
    }

    /** Visible height of one row. */
    bandwidth(): number {
        return this.bandwidthPx;
    }

    /** Row + inter-row gap (top of row N to top of row N+1). */
    step(): number {
        return this.stepPx;
    }

    /** Top-y for a band id (only available on `forRows` instances). */
    forward(id: string): number {
        if (!this.d3) {
            throw new Error('BandScale.forward is only available on closed-domain bands (BandScale.forRows)');
        }
        const y = this.d3(id);
        if (y === undefined) {
            throw new Error(`BandScale: unknown band id "${id}"`);
        }
        return y;
    }
}

/**
 * Default row band for the v1 layout: bandwidth = 56 px (the legacy
 * bar height = ITEM_ROW_HEIGHT - 8), step = 64 px (the legacy row
 * pitch = ITEM_ROW_HEIGHT). Keeps every existing sample byte-stable.
 *
 * m2.5c will derive these from item style + content measurement
 * instead of pinning them to legacy constants.
 */
export const DEFAULT_ROW_BAND_PX = {
    bandwidth: 56,
    step: 64,
} as const;

export function defaultRowBand(): BandScale {
    return BandScale.fixedRow(DEFAULT_ROW_BAND_PX);
}
