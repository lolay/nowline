// Engine B (`computeContentEndDay`, via `computeDateWindow`): the date window
// covers the wave barriers (specs/waves.md §5.3 `length:`, §8.5).

import * as path from 'node:path';
import { buildWavePlan, type NowlineFile, type ResolveResult } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { resolveCalendar, resolveSizes } from '../src/calendar.js';
import { computeDateWindow } from '../src/layout.js';
import { resolveScale } from '../src/view-preset.js';
import { fromCalendarConfig } from '../src/working-calendar.js';
import { parseAndResolve } from './helpers.js';

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

// The window is counted in working days: the business calendar skips
// weekends, `calendar:full` (the identity path) counts every day.
function window(file: NowlineFile, resolved: ResolveResult): { days: number; endDate: string } {
    const cal = resolveCalendar(file, resolved.config.calendar);
    const calendar = fromCalendarConfig(cal);
    const sizes = resolveSizes(resolved.content.sizes, cal);
    const scale = resolveScale(file, resolved.config.scale);
    const { startDate, endDate } = computeDateWindow(
        file,
        { cal, sizes, calendar },
        resolved,
        undefined,
        scale,
        buildWavePlan(resolved),
    );
    return { days: calendar.workingIndexOf(startDate, endDate), endDate: isoDay(endDate) };
}

function windowDays(file: NowlineFile, resolved: ResolveResult): number {
    return window(file, resolved).days;
}

async function windowOf(source: string): Promise<number> {
    const { file, resolved } = await parseAndResolve(source);
    return windowDays(file, resolved);
}

async function windowEndOf(source: string): Promise<string> {
    const { file, resolved } = await parseAndResolve(source);
    return window(file, resolved).endDate;
}

const EXAMPLE_1 = `nowline v1

roadmap launch-plan "Launch plan" start:2026-01-05 scale:1w LENGTH

wave discover "Discover"
wave build "Build"
wave launch "Launch"

swimlane web "Web"
  item web-research "UX research" duration:2w wave:discover
  item web-build "Checkout v2" duration:3w wave:build
  item web-launch "Launch page" duration:1w wave:launch
swimlane api "API"
  item api-spike "API spike" duration:1w wave:discover
  item api-build "Payments API" duration:4w wave:build
  item api-launch "Rate limits" duration:1w wave:launch
swimlane data "Data"
  item data-audit "Data audit" duration:3w wave:discover
  item data-build "Pipeline" duration:2w wave:build
  item data-launch "Dashboards" duration:2w wave:launch
`;

describe('computeDateWindow — wave barriers (engine B)', () => {
    it('Example 1: the window ends at E_n (W9), not at the unbarriered W7', async () => {
        // calendar:business: one week is 5 working days.
        expect(await windowOf(EXAMPLE_1.replace(' LENGTH', ''))).toBe(9 * 5);
        // 45 working days from Mon Jan 5 end on Mon Mar 9 (9 calendar weeks).
        expect(await windowEndOf(EXAMPLE_1.replace(' LENGTH', ''))).toBe('2026-03-09');
    });

    it('a wave pushed past an explicit length: grows the window', async () => {
        // length:8w is a minimum: E_launch = W9 runs past it.
        expect(await windowOf(EXAMPLE_1.replace(' LENGTH', ' length:8w'))).toBe(9 * 5);
        // Without waves the same content ends at W7, inside length:8w.
        const noWaves = EXAMPLE_1.replace(' LENGTH', ' length:8w')
            .replace(/^wave .*\n/gm, '')
            .replace(/ wave:\w+/g, '');
        expect(await windowOf(noWaves)).toBe(8 * 5);
        // The pushed-out window ends Mon Mar 9, the unpushed 8w one Mon Mar 2.
        expect(await windowEndOf(EXAMPLE_1.replace(' LENGTH', ' length:8w'))).toBe('2026-03-09');
        expect(await windowEndOf(noWaves)).toBe('2026-03-02');
    });

    it('length: counts working days, so 6w is a 30-day window ending Feb 16', async () => {
        const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w length:6w

swimlane a "A"
  item a1 "A1" duration:1w
`;
        expect(await windowOf(source)).toBe(6 * 5);
        expect(await windowEndOf(source)).toBe('2026-02-16');
    });

    it('Example 11: the floor gap and the last wave end are inside the window', async () => {
        const source = `nowline v1

roadmap budget-floor "Budget-held rollout" start:2026-01-05 scale:1w calendar:full

anchor fy-budget "FY budget release" date:2026-02-02

wave plan "Plan"
wave execute "Execute" after:fy-budget

swimlane a
  item a1 duration:2w wave:plan
  item a2 duration:5w wave:execute
swimlane b
  item b1 duration:3w wave:plan
  item b2 duration:7w wave:execute

milestone exec-done "Execute complete" date:2026-03-16 after:execute
`;
        // E_execute = W11; the dated milestone alone would stop at W10.
        expect(await windowOf(source)).toBe(11 * 7);
        // calendar:full is the identity path: 77 calendar days from Mon Jan 5.
        expect(await windowEndOf(source)).toBe('2026-03-23');
    });

    it('an empty trailing wave held by a floor keeps its start in the window', async () => {
        const source = `nowline v1

roadmap tail "Tail" start:2026-01-05 scale:1w calendar:full

wave w1 "Wave 1"
wave w2 "Later" after:2026-03-02

swimlane a
  item a1 duration:1w wave:w1
`;
        // S_2 = E_2 = W8 from the floor.
        expect(await windowOf(source)).toBe(8 * 7);
        expect(await windowEndOf(source)).toBe('2026-03-02');
    });

    it('a roadmap ending on a month scale counts business months by the real calendar', async () => {
        // Content ending Fri Jan 30 stops at Feb 1's index (20), not March's.
        const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1m

swimlane a "A"
  item a1 "A1" duration:4w
`;
        expect(await windowOf(source)).toBe(20);
        expect(await windowEndOf(source)).toBe('2026-02-02');
    });

    it('Example 19: an isolated region joins the barrier (domain ends at W6)', async () => {
        const files: Record<string, string> = {
            'ios.nowline': [
                'nowline v1',
                '',
                'roadmap ios-app "iOS" start:2026-01-05 scale:1w',
                '',
                'wave w1 "Wave 1"',
                'wave w2 "Wave 2"',
                '',
                'swimlane ios',
                '  item ios-offline duration:4w wave:w1',
                '  item ios-push duration:1w wave:w2',
                '',
            ].join('\n'),
            'portfolio.nowline': [
                'nowline v1',
                '',
                'include "./ios.nowline" roadmap:isolate',
                '',
                'roadmap portfolio "Portfolio" start:2026-01-05 scale:1w',
                '',
                'wave w1 "Wave 1"',
                'wave w2 "Wave 2"',
                '',
                'swimlane platform',
                '  item pf-api duration:2w wave:w1',
                '  item pf-scale duration:2w wave:w2',
                '',
            ].join('\n'),
        };
        const readFile = async (abs: string): Promise<string> => {
            const rel = path.relative('/root', abs).split(path.sep).join('/');
            if (!(rel in files)) throw new Error(`File not found: ${rel}`);
            return files[rel];
        };
        const { file, resolved } = await parseAndResolve(
            files['portfolio.nowline'],
            path.resolve('/root', 'portfolio.nowline'),
            readFile,
        );
        expect(resolved.diagnostics).toEqual([]);
        // pf-scale waits for the region's ios-offline: W4-W6. Without the
        // barrier the content would end at W5 (ios-push).
        expect(windowDays(file, resolved)).toBe(6 * 5);
        expect(window(file, resolved).endDate).toBe('2026-02-16');
    });
});
