// layoutRoadmap — the package's layout entry point: builds (or reuses) the
// day schedule and hands the roadmap to `RoadmapNode`, which runs the four
// layout phases (specs/layout-phases.md §3.1).

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { buildWavePlan } from '@nowline/core';
import type { LogoDimensions } from './header-logo.js';
import { RoadmapNode } from './nodes/roadmap-node.js';
import type { NonWorkingDisplay } from './non-working-display.js';
import { type RoadmapSchedule, scheduleRoadmap } from './schedule.js';
import type { ThemeName } from './themes/index.js';
import type { PositionedRoadmap } from './types.js';

export interface LayoutOptions {
    theme?: ThemeName;
    today?: Date;
    /**
     * Best-effort maximum canvas width in px. Unset (the default) sizes the
     * canvas to its content. When the content is wider, pixels-per-day
     * shrinks to fit, down to `MIN_PIXELS_PER_DAY`; spilled captions and
     * run labels can still widen the canvas past it. See
     * `specs/rendering.md` § Canvas width.
     */
    width?: number;
    /**
     * BCP-47 tag controlling axis labels, the now-pill string, and the
     * quarter prefix. Resolved by the caller (CLI flag → env vars). When
     * undefined, layout falls back to the file's `nowline v1 locale:` and
     * then to `en-US`. See `specs/localization.md`.
     */
    locale?: string;
    /**
     * How a calendar's non-working days are drawn (specs/working-calendar.md
     * §4.2). Overrides the file's `default roadmap non-working:` key; when
     * undefined the key applies, then `hide`.
     */
    nonWorking?: NonWorkingDisplay;
    /**
     * Intrinsic size of the roadmap's `logo:` asset, read by the caller
     * before layout (`loadLogo` in @nowline/renderer). Layout scales it to
     * the `logo-size:` slot inside the header card. Leave it undefined when
     * the file declares no logo or the asset could not be loaded: the
     * header then lays out as if no logo were declared.
     */
    logo?: LogoDimensions;
    /**
     * A day schedule the caller already built for this roadmap
     * (`scheduleRoadmap`, with the wave plan as `schedule.plan`). Layout
     * reuses it when `schedule.resolved` is the very `ResolveResult` passed
     * to `layoutRoadmap`, so a staging step that builds the plan and the
     * schedule once hands them on (specs/scheduler-unification.md §3.6).
     * A schedule built from another `ResolveResult` is ignored and rebuilt.
     * Build it with the same `today` as this call's `today`: the window and
     * the default start date come from it.
     */
    schedule?: RoadmapSchedule;
}

export type LayoutResult = PositionedRoadmap;

export function layoutRoadmap(
    file: NowlineFile,
    resolved: ResolveResult,
    options: LayoutOptions = {},
): LayoutResult {
    // The wave plan and the day schedule (engine C) are built once per
    // layout, unless the caller already built them for this very
    // `ResolveResult` (specs/scheduler-unification.md §3.6). The schedule
    // carries the plan (`schedule.plan`, undefined without waves); engine A
    // reads it for the barrier passes and the date window is a projection of
    // the schedule.
    const schedule =
        options.schedule?.resolved === resolved
            ? options.schedule
            : scheduleRoadmap(file, resolved, {
                  today: options.today,
                  plan: buildWavePlan(resolved) ?? null,
              });
    return new RoadmapNode().place(file, resolved, options, schedule);
}
