// Start terms and wave floors, parsed once for every engine that places an
// item (specs/scheduler-unification.md §3.4): engine C's day walker, engine
// A's pixel walker and its non-working-pin and wave-pin helpers, and the wave
// barrier's floor projections. Each caller keeps its own `max` rule and maps
// the parsed dates to its own unit (working-day index or x); only the parsing
// is shared. Pure: no calendar, no scale.

import type { EntityProperty, WavePlan } from '@nowline/core';
import { parseDate, propValue, propValues } from './dsl-utils.js';

/** One element of `after:`: an ISO date, or the id of an entity. */
export type AfterTerm = { raw: string; date: Date } | { raw: string; ref: string };

export interface StartTerms {
    /** `date:` when it parses, else `start:` when it parses (`date:` wins). */
    pin?: { key: 'date' | 'start'; raw: string; date: Date };
    /** `after:` elements in source order: an ISO date or an id. */
    after: ReadonlyArray<AfterTerm>;
}

/** The start terms of an item, group or parallel from its properties. */
export function startTermsOf(props: EntityProperty[]): StartTerms {
    let pin: StartTerms['pin'];
    for (const key of ['date', 'start'] as const) {
        const raw = propValue(props, key);
        const date = parseDate(raw);
        if (raw !== undefined && date) {
            pin = { key, raw, date };
            break;
        }
    }
    const after = propValues(props, 'after').map((raw): AfterTerm => {
        const date = parseDate(raw);
        return date ? { raw, date } : { raw, ref: raw };
    });
    return pin ? { pin, after } : { after };
}

/**
 * The declaration date of each wave's floor (`null` for a wave without a
 * floor or whose date does not parse), at index `k - 1` for wave `k`. The
 * dates are the plan's unclamped declarations: the day engine maps them with
 * `workingIndexOf`, the pixel engine with `scale.forward`.
 */
export function waveFloorDates(plan: WavePlan): Array<Date | null> {
    return plan.floors.map((f) => (f ? parseDate(f.date) : null));
}
