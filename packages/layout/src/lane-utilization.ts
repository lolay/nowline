// Lane utilization computation per specs/rendering.md § Lane utilization
// underline.
//
// Walks a positioned lane's children (items, plus the items inside parallel
// and group blocks), collects each contributor's pixel span and capacity load,
// then sweeps the timeline to produce a list of half-open segments
// classified `green | yellow | red` against the lane's resolved capacity and
// thresholds. Adjacent same-classification segments coalesce so the renderer
// paints one rectangle per color band rather than per event boundary.
//
// Pure data in / pure data out — no AST, no theme, no side effects. Lives
// next to `capacity.ts` (the other capacity-helper module) and is tested in
// isolation.

import type {
    DefaultDeclaration,
    SwimlaneDeclaration,
} from '@nowline/core';
import { propValue } from './dsl-utils.js';
import type {
    PositionedItem,
    PositionedTrackChild,
    PositionedLaneUtilization,
    PositionedUtilizationSegment,
    UtilizationClassification,
} from './types.js';

/**
 * Built-in defaults used when neither the lane nor its `default swimlane`
 * declares a threshold. Mirrors specs/dsl.md rule 17d.
 */
export const DEFAULT_UTILIZATION_WARN_FRACTION = 0.8;  // 80%
export const DEFAULT_UTILIZATION_OVER_FRACTION = 1.0;  // 100%

/**
 * One contributor to a lane's load function: a single positioned item with
 * its visual horizontal span and the load it contributes during that span.
 * Children inside `parallel` / `group` blocks contribute individually so
 * concurrent load reads correctly (the parallel block itself spans the union
 * of its children's bars but does not itself add load — only the items do).
 */
interface LoadContributor {
    startX: number;
    endX: number;
    load: number;
}

/**
 * Walk the lane's positioned children and return one `LoadContributor` per
 * item that contributes load. Items inside `parallel` and `group` blocks are
 * descended into recursively; the block envelopes themselves contribute
 * nothing (they are pure containers).
 *
 * `inferItemLoad` mirrors the spec's "Default capacity" table:
 *   - Explicit `capacity:N` → that value.
 *   - Sized item without explicit `capacity:` → 1 (the default for sized
 *     items, matching the duration-derivation default).
 *   - Duration-literal item without `capacity:` → 0 (the bar paints normally
 *     but does not contribute load — this is the legacy "uncounted" item
 *     family from before the size system existed).
 */
export function collectLoadContributors(
    children: PositionedTrackChild[],
): LoadContributor[] {
    const out: LoadContributor[] = [];
    walk(children, out);
    return out;
}

function walk(children: PositionedTrackChild[], out: LoadContributor[]): void {
    for (const child of children) {
        if (child.kind === 'item') {
            const load = inferItemLoad(child);
            if (load > 0 && child.box.width > 0) {
                out.push({
                    startX: child.box.x,
                    endX: child.box.x + child.box.width,
                    load,
                });
            }
        } else if (child.kind === 'parallel' || child.kind === 'group') {
            walk(child.children, out);
        }
    }
}

function inferItemLoad(item: PositionedItem): number {
    if (item.capacity) return item.capacity.value;
    if (item.size) return 1;
    return 0;
}

/**
 * Compute a lane's utilization model. Returns `null` when there is no
 * meaningful underline to paint:
 *   - Lane has no `capacity:` (no denominator → undefined utilization).
 *   - Lane has no items contributing load (collectLoadContributors returns
 *     an empty list).
 *   - Both thresholds resolve to `none` (caller has opted out of every
 *     color band; nothing to paint).
 *
 * The returned `PositionedLaneUtilization` carries the resolved thresholds
 * (in fraction form, or `null` for opt-out) alongside the segments so the
 * renderer can render legends / tooltips without re-resolving anything.
 */
export function computeLaneUtilization(opts: {
    children: PositionedTrackChild[];
    capacityValue: number;
    warnFraction: number | null;
    overFraction: number | null;
}): PositionedLaneUtilization | null {
    if (opts.capacityValue <= 0) return null;
    if (opts.warnFraction === null && opts.overFraction === null) return null;

    const contributors = collectLoadContributors(opts.children);
    if (contributors.length === 0) return null;

    // Build sorted unique x coordinates from every event boundary.
    const xSet = new Set<number>();
    for (const c of contributors) {
        xSet.add(c.startX);
        xSet.add(c.endX);
    }
    const xs = Array.from(xSet).sort((a, b) => a - b);
    if (xs.length < 2) return null;

    // Per half-open interval [xs[j], xs[j+1]) compute the active load by
    // summing every contributor whose span covers the interval midpoint.
    // O(n²) but n is small (typically <20 items per lane); avoids the
    // bookkeeping of an event-stream sweep without a measurable cost.
    const raw: PositionedUtilizationSegment[] = [];
    for (let j = 0; j < xs.length - 1; j++) {
        const a = xs[j];
        const b = xs[j + 1];
        const mid = (a + b) / 2;
        let load = 0;
        for (const c of contributors) {
            if (c.startX <= mid && mid < c.endX) load += c.load;
        }
        raw.push({
            startX: a,
            endX: b,
            load,
            classification: classifyLoad(load, opts.capacityValue, opts.warnFraction, opts.overFraction),
        });
    }

    // Coalesce adjacent same-classification segments so the renderer paints
    // one rectangle per visible color band rather than per event boundary.
    const segments: PositionedUtilizationSegment[] = [];
    for (const s of raw) {
        const last = segments[segments.length - 1];
        if (last && last.classification === s.classification && last.endX === s.startX) {
            last.endX = s.endX;
            // Keep the first interval's `load` as a representative; the
            // coalesced span may have varying load within a single color
            // band but renderers paint by class, not by exact load.
        } else {
            segments.push({ ...s });
        }
    }

    return {
        segments,
        capacityValue: opts.capacityValue,
        warnFraction: opts.warnFraction,
        overFraction: opts.overFraction,
    };
}

/**
 * Classify a single load value against the lane's resolved capacity and
 * thresholds. Spec § "Load function and segmentation":
 *   - `u < warn-at` → green (healthy; includes `u = 0` so the underline
 *     stays continuous).
 *   - `warn-at ≤ u < over-at` → yellow.
 *   - `u ≥ over-at` → red.
 *
 * `null` thresholds disable that color band: a `null` warnFraction collapses
 * to a binary green / red indicator; a `null` overFraction collapses to
 * green / yellow; both `null` is unreachable here (caller short-circuits
 * upstream).
 */
export function classifyLoad(
    load: number,
    capacity: number,
    warnFraction: number | null,
    overFraction: number | null,
): UtilizationClassification {
    const u = load / capacity;
    if (overFraction !== null && u >= overFraction) return 'red';
    if (warnFraction !== null && u >= warnFraction) return 'yellow';
    return 'green';
}

/**
 * Resolve the lane's effective utilization thresholds, applying the spec's
 * resolution order:
 *
 *   1. Lane's own `utilization-warn-at:` / `utilization-over-at:` properties.
 *   2. The applicable `default swimlane` declaration's properties.
 *   3. Built-in defaults (`warn-at:80%`, `over-at:100%`).
 *
 * Each side resolves independently — a lane can pin only one threshold and
 * inherit the other from defaults / built-ins. The returned `null` means
 * "opted out via `none`" and disables that color band downstream.
 *
 * Malformed values (already reported by the validator) are treated as
 * "unset" — the resolver falls through to the next layer rather than
 * double-reporting.
 */
export function resolveLaneUtilizationThresholds(
    lane: SwimlaneDeclaration,
    defaults: Map<string, DefaultDeclaration>,
): { warn: number | null; over: number | null } {
    const dflt = defaults.get('swimlane');
    const warn = resolveThreshold(
        propValue(lane.properties, 'utilization-warn-at'),
        dflt ? propValue(dflt.properties, 'utilization-warn-at') : undefined,
        DEFAULT_UTILIZATION_WARN_FRACTION,
    );
    const over = resolveThreshold(
        propValue(lane.properties, 'utilization-over-at'),
        dflt ? propValue(dflt.properties, 'utilization-over-at') : undefined,
        DEFAULT_UTILIZATION_OVER_FRACTION,
    );
    return { warn, over };
}

function resolveThreshold(
    laneVal: string | undefined,
    defaultVal: string | undefined,
    builtinFraction: number,
): number | null {
    const raw = laneVal ?? defaultVal;
    const parsed = parseThresholdRaw(raw);
    if (parsed.kind === 'unset') return builtinFraction;
    if (parsed.kind === 'none') return null;
    return parsed.value;
}

type ParsedThreshold =
    | { kind: 'unset' }
    | { kind: 'none' }
    | { kind: 'number'; value: number };

const PERCENT_RE = /^\d+(?:\.\d+)?%$/;
const DECIMAL_FRACTION_RE = /^\d+\.\d+$/;

function parseThresholdRaw(val: string | undefined): ParsedThreshold {
    if (val === undefined) return { kind: 'unset' };
    if (val === 'none') return { kind: 'none' };
    if (PERCENT_RE.test(val)) {
        const n = parseFloat(val) / 100;
        return Number.isFinite(n) && n > 0 ? { kind: 'number', value: n } : { kind: 'unset' };
    }
    if (DECIMAL_FRACTION_RE.test(val)) {
        const n = parseFloat(val);
        return Number.isFinite(n) && n > 0 ? { kind: 'number', value: n } : { kind: 'unset' };
    }
    return { kind: 'unset' };
}
