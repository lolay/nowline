// Start terms and wave floors, parsed once for every engine that places an
// item (specs/scheduler-unification.md §3.4): engine C's day walker, engine
// A's pixel walker and its non-working-pin helper, and the wave barrier's
// floor projections. Each caller keeps its own `max` rule and maps the
// parsed dates to its own unit (working-day index or x); only the parsing
// is shared. Pure: no calendar, no scale. Work has no fixed start pin:
// `date:` and `start:` on an item are unknown keys (specs/dsl.md § Item
// Properties, "Pinning is not supported"), so nothing here reads them.

import type { EntityProperty, WavePlan } from '@nowline/core';
import { parseIsoDate, propValues } from './dsl-utils.js';

/** One element of `after:`: an ISO date, or the id of an entity. */
export type AfterTerm = { raw: string; date: Date } | { raw: string; ref: string };

export interface StartTerms {
    /** `after:` elements in source order: an ISO date or an id. */
    after: ReadonlyArray<AfterTerm>;
}

/** The start terms of an item, group or parallel from its properties. */
export function startTermsOf(props: EntityProperty[]): StartTerms {
    const after = propValues(props, 'after').map((raw): AfterTerm => {
        const date = parseIsoDate(raw);
        return date ? { raw, date } : { raw, ref: raw };
    });
    return { after };
}

/**
 * The declaration date of each wave's floor (`null` for a wave without a
 * floor or whose date does not parse), at index `k - 1` for wave `k`. The
 * dates are the plan's unclamped declarations: the day engine maps them with
 * `workingIndexOf`, the pixel engine with `scale.forward`.
 */
export function waveFloorDates(plan: WavePlan): Array<Date | null> {
    return plan.floors.map((f) => (f ? parseIsoDate(f.date) : null));
}
