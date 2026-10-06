// The file's calendar, resolved once for every consumer (specs/working-
// calendar.md §8): the layout, engine C and the three exporters read the
// same `CalendarConfig` (duration arithmetic) and `WorkingCalendar`
// (non-working days), so the chart and every export agree on what `1w` is.
//
// It lives apart from `calendar.ts` because `working-calendar.ts` already
// imports values from there; building a `WorkingCalendar` in `calendar.ts`
// would close a value-import cycle.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { type CalendarConfig, resolveCalendar } from './calendar.js';
import { fromCalendarConfig, type WorkingCalendar } from './working-calendar.js';

export interface ResolvedCalendar {
    /** The preset or `calendar` block day counts. */
    config: CalendarConfig;
    /** The working calendar the preset implies. */
    working: WorkingCalendar;
}

/**
 * Resolve the calendar a roadmap declares (`calendar:` on the roadmap plus
 * the `config` block's `calendar` section); business when it declares none.
 */
export function resolveWorkingCalendar(
    file: NowlineFile,
    resolved: ResolveResult,
): ResolvedCalendar {
    const config = resolveCalendar(file, resolved.config.calendar);
    return { config, working: fromCalendarConfig(config) };
}
