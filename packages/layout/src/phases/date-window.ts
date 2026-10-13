// Phase 1, the date window (specs/layout-phases.md §3.2): the roadmap's
// scope (theme, locale, style context, `default roadmap` style) and the
// natural date window, a projection of the day schedule
// (specs/scheduler-unification.md §3.3). Nothing here knows about pixels.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { type CalendarConfig, daysBetween, literalToDays } from '../calendar.js';
import { resolveWorkingCalendar } from '../calendar-resolver.js';
import { propValue } from '../dsl-utils.js';
import { resolveLocale } from '../i18n.js';
import type { LayoutOptions } from '../layout.js';
import { isNonWorkingDisplay, type NonWorkingDisplay } from '../non-working-display.js';
import type { RoadmapSchedule } from '../schedule.js';
import { resolveStyle, type StyleContext } from '../style-resolution.js';
import { type Theme, type ThemeName, themes } from '../themes/index.js';
import type { ResolvedStyle } from '../types.js';
import { resolveScale, tickBoundaryAtOrAfter, type ViewPreset } from '../view-preset.js';
import { daysPerUnit, type WorkingCalendar } from '../working-calendar.js';

/** What every later phase reads about the roadmap as a whole. */
export interface RoadmapScope {
    themeName: ThemeName;
    theme: Theme;
    /** The resolved locale: the surface option, then the directive, then `en-US`. */
    locale: string;
    styleCtx: StyleContext;
    /** `default roadmap`: header position and height, timeline position, minor grid, non-working. */
    roadmapStyle: ResolvedStyle;
}

/**
 * The natural date window and the calendar it is counted in. Item sizes
 * are not part of it: `createLayoutContext` resolves each file's own sizes
 * under `cal`, because an isolated region declares its own.
 */
export interface DateWindow {
    cal: CalendarConfig;
    calendar: WorkingCalendar;
    /** The view preset (`scale:` block): tick unit, pixels per unit, labels. */
    preset: ViewPreset;
    schedule: RoadmapSchedule;
    startDate: Date;
    /** The natural end. Finalize step f2 may extend the axis past it; nothing else moves it. */
    naturalEndDate: Date;
    /** Working days in the natural window. */
    spanDays: number;
    /** Calendar days under `non-working:show`, else `spanDays`. */
    timelineDays: number;
    /** How non-working days are drawn: the surface option, then `default roadmap`. */
    nonWorking: NonWorkingDisplay;
}

export function resolveScope(
    file: NowlineFile,
    resolved: ResolveResult,
    options: LayoutOptions,
): RoadmapScope {
    const themeName: ThemeName = options.theme ?? 'light';
    const theme: Theme = themes[themeName];
    const locale = resolveLocale(options.locale, directiveLocale(file));
    const styleCtx: StyleContext = {
        theme,
        styles: resolved.config.styles,
        defaults: resolved.config.defaults,
        labels: resolved.content.labels,
    };
    // Raw style props (including `timeline-position` and `minor-grid`) are
    // banned on the roadmap declaration itself, so the values come from the
    // level-2 `default roadmap` line in config.
    const roadmapStyle = resolveStyle('roadmap', file.roadmapDecl?.properties ?? [], styleCtx);
    return { themeName, theme, locale, styleCtx, roadmapStyle };
}

export function resolveDateWindow(
    file: NowlineFile,
    resolved: ResolveResult,
    options: LayoutOptions,
    scope: RoadmapScope,
    schedule: RoadmapSchedule,
): DateWindow {
    // The working calendar maps dates to working-day indices for the
    // window, the axis and every placement (specs/working-calendar.md
    // §5, §7.1).
    const { config: cal, working: calendar } = resolveWorkingCalendar(file, resolved);
    const preset = resolveScale(file, resolved.config.scale);
    // Window is content-aware: when `length:` is omitted we derive the end
    // day from the latest dated/sequenced entity (item, anchor, milestone,
    // today's now-line) instead of defaulting to a 180-day desert.
    const { startDate, endDate } = computeDateWindow(file, schedule, options.today, preset);
    // How non-working days are drawn: the surface option, then the file's
    // `default roadmap non-working:` key (resolved to `hide` when absent).
    // It reaches every placement through the time scale.
    const nonWorking = isNonWorkingDisplay(options.nonWorking)
        ? options.nonWorking
        : scope.roadmapStyle.nonWorking;
    // `TimeScale.showsNonWorking`, needed here to size the scale's range.
    const showsNonWorking = nonWorking === 'show' && calendar.hasNonWorkingDays;
    const spanDays = Math.max(1, calendar.workingIndexOf(startDate, endDate));
    // Under `show` every calendar day takes a pixel width of its own, so
    // the chart widens by the non-working days in the window.
    const timelineDays = showsNonWorking ? Math.max(1, daysBetween(startDate, endDate)) : spanDays;
    return {
        cal,
        calendar,
        preset,
        schedule,
        startDate,
        naturalEndDate: endDate,
        spanDays,
        timelineDays,
        nonWorking,
    };
}

// Compute a sensible [startDate, endDate] window from the roadmap's day
// schedule (`scheduleRoadmap`, specs/scheduler-unification.md §3.3).
//
// Precedence:
//   1. An explicit `length:` is a minimum span; content (including wave
//      barriers E_n and every S_k) past it grows the window to the next
//      tick boundary.
//   2. Otherwise we derive the end day from the actual content extent
//      (`schedule.extent.contentEndDay`: latest lane cursor, anchor date,
//      milestone date/after, wave edge) and today's now-line if it falls
//      past the content. This keeps the rendered chart from defaulting to
//      a 180-day desert when the content only spans a few weeks.
//   3. As a last resort (no content + no length), fall back to a small
//      4-week placeholder so an empty roadmap still draws a sensible axis.
//
// The start is `schedule.startDate`: the roadmap's `start:`, else `today`
// (see `scheduleRoadmap`). Every day count is a working-day index from the
// start (specs/working-calendar.md §5) under the schedule's calendar. A
// calendar with no non-working day keeps calendar-day arithmetic.
//
// Exported for tests; not part of the package surface.
export function computeDateWindow(
    file: NowlineFile,
    schedule: RoadmapSchedule,
    today: Date | undefined,
    scale: ViewPreset,
): { startDate: Date; endDate: Date } {
    const props = file.roadmapDecl?.properties ?? [];
    const { config: cal, working: calendar } = schedule.calendar;
    const { startDate } = schedule;
    const lengthRaw = propValue(props, 'length');
    let minDays = 0;
    if (lengthRaw) {
        const days = literalToDays(lengthRaw, cal);
        if (days > 0) {
            minDays = days;
        }
    }
    // An explicit `length:` bounds the now-line: a far-future `today` must
    // not stretch a deliberately-sized roadmap (that case stays out of range
    // and surfaces as an NL.W1000 insight). Content overflow — items,
    // anchors, milestones — still grows the window below via `padded`, with
    // `length:` acting purely as the floor. Without `length:`, `today`
    // extends the window so the now-line is always in range.
    let contentDays = schedule.extent.contentEndDay;
    if (today && !(minDays > 0)) {
        const t = calendar.workingIndexOf(startDate, today);
        if (t > 0) contentDays = Math.max(contentDays, t);
    }
    const tickDays = daysPerUnit(scale.unit, cal);
    // Round up to the smallest tick boundary that is `>= contentDays`. When
    // the latest content lands exactly on a tick boundary the chart ends
    // exactly there (no extra trailing tick); otherwise we extend to the
    // next tick so the right edge always sits on a labelled column. For
    // month / quarter / year scales the boundary is a real month /
    // quarter / year start, not a multiple of `days-per-month` etc.
    const padded = tickBoundaryAtOrAfter(
        startDate,
        contentDays > 0 ? contentDays : 4 * cal.daysPerWeek,
        scale.unit,
        tickDays,
        calendar,
    );
    const finalDays = Math.max(minDays, padded);
    return {
        startDate,
        endDate: calendar.dateAtWorkingIndex(startDate, Math.max(1, finalDays)),
    };
}

// Read the optional `locale:` property from the file's `nowline` directive.
// Layout receives an already-parsed AST, so this is a cheap lookup with no
// validation work — that's the validator's job in `@nowline/core`.
function directiveLocale(file: NowlineFile): string | undefined {
    const prop = file.directive?.properties.find((p) => stripColon(p.key) === 'locale');
    return prop?.value;
}

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}
