import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectLayoutInsights, type LayoutInsight, layoutRoadmap } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

describe('collectLayoutInsights', () => {
    it('reports NL.I1000 when a title spills past its bar', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane eng "Engineering"
  item x "This title is far too long to fit inside a one-week bar" duration:1w
`;
        const { file, resolved } = await parseAndResolve(src);
        const layout = layoutRoadmap(file, resolved, { theme: 'light', width: 640 });
        const insights = collectLayoutInsights(layout, { locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.I1000')).toBe(true);
    });

    it('does not report NL.I1000 for a title that wraps inside its bar', async () => {
        // Same title shape as the issue: a 2w bar at scale:2w has a 124px text
        // area, and "Technology Selection" (~151px) wraps to two lines there
        // instead of spilling. A wrapped title makes no spill reservation.
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane eng "Engineering"
  item x "Technology Selection" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const layout = layoutRoadmap(file, resolved, { theme: 'light', width: 640 });
        const insights = collectLayoutInsights(layout, { locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.I1000')).toBe(false);
    });

    it('echoes an id-less item title with its explicit line breaks collapsed to spaces', async () => {
        // A spilled multi-line title raises NL.I1000, and the insight names the item by
        // its title (no id here). The message is one line, not a copy of the break.
        const src = `nowline v1

roadmap r "R" start:2026-04-06 scale:2w

swimlane eng "Engineering"
  item "Internationalization of\\nthe billing service" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const layout = layoutRoadmap(file, resolved, { theme: 'light', width: 640 });
        const insights = collectLayoutInsights(layout, { locale: 'en-US' });
        const spill = insights.find((i) => i.code === 'NL.I1000');
        expect(spill).toBeDefined();
        expect(spill?.message).not.toMatch(/[\r\n]/);
        expect(spill?.message).toContain('"Internationalization of the billing service"');
        expect(spill?.entityId).toBe('Internationalization of the billing service');
        expect(JSON.stringify(spill?.data.args)).not.toContain('\\n');
    });

    it('reports NL.W1000 when today is outside the roadmap window', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-01 length:4w

swimlane a "A"
  item x duration:1w
`;
        const { file, resolved } = await parseAndResolve(src);
        const today = new Date(Date.UTC(2027, 0, 1));
        const layout = layoutRoadmap(file, resolved, { theme: 'light', today });
        const insights = collectLayoutInsights(layout, { today, locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.W1000')).toBe(true);
    });

    it('reports NL.I1002 for a very narrow bar', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05 scale:1d

swimlane eng "Engineering"
  item x "X" duration:1d
`;
        const { file, resolved } = await parseAndResolve(src);
        const layout = layoutRoadmap(file, resolved, { theme: 'light', width: 1280 });
        const insights = collectLayoutInsights(layout, { locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.I1002')).toBe(true);
    });
});

// --- Wave insights (specs/waves.md §6.2 WV15-WV18, §6.4) ---

const WAVE_CODES = new Set(['NL.W1001', 'NL.W1002', 'NL.I1006', 'NL.I1007']);

async function waveInsights(
    source: string,
    locale = 'en-US',
    files?: Record<string, string>,
): Promise<LayoutInsight[]> {
    // `files` resolves includes under `/root` from memory; `source` is then
    // the key of the main file.
    const readFile = files
        ? async (abs: string): Promise<string> => {
              const rel = path.relative('/root', abs).split(path.sep).join('/');
              if (!(rel in files)) throw new Error(`File not found: ${rel}`);
              return files[rel];
          }
        : undefined;
    const { file, resolved } = files
        ? await parseAndResolve(files[source], path.resolve('/root', source), readFile)
        : await parseAndResolve(source);
    const layout = layoutRoadmap(file, resolved);
    return collectLayoutInsights(layout, { locale }).filter((i) => WAVE_CODES.has(i.code));
}

// Example 9 with a2 pinned below the w2 floor.
const PINNED = `nowline v1

roadmap dates "Dates vs barriers" start:2026-01-05 scale:1w calendar:full

anchor budget "Budget release" date:2026-02-09

wave w1 "Integrate"
wave w2 "Launch"

swimlane infra
  item i1 duration:4w wave:w1
  item i2 duration:2w wave:w2 after:budget
swimlane apps
  item a1 duration:1w wave:w1
  item a2 duration:2w wave:w2 date:2026-01-19
`;

describe('collectLayoutInsights — waves', () => {
    it('reports NL.W1001 when a wave floor moves a date: pin (Example 9 pin variant)', async () => {
        const insights = await waveInsights(PINNED);
        expect(insights).toHaveLength(1);
        const [w] = insights;
        expect(w.code).toBe('NL.W1001');
        expect(w.severity).toBe('warning');
        expect(w.lspSeverity).toBe(2);
        expect(w.entityId).toBe('a2');
        expect(w.message).toBe(
            'Item "a2" is pinned to 2026-01-19 (date:), but wave "w2" cannot start until 2026-02-02; the item starts at the wave start.',
        );
        expect(w.data.args).toEqual({
            name: 'a2',
            pin: '2026-01-19',
            key: 'date',
            wave: 'w2',
            start: '2026-02-02',
        });
    });

    it('reports NL.W1001 in French', async () => {
        const [w] = await waveInsights(PINNED, 'fr');
        expect(w.code).toBe('NL.W1001');
        expect(w.message).toContain('2026-01-19');
        expect(w.message).not.toContain('is pinned to');
    });

    it('reports NL.W1001 for an item inside an isolated region', async () => {
        const waveHeader = (id: string, title: string): string[] => [
            `roadmap ${id} "${title}" start:2026-01-05 scale:1w calendar:full`,
            '',
            'wave w1 "Wave 1"',
            'wave w2 "Wave 2"',
            '',
        ];
        const insights = await waveInsights('portfolio.nowline', 'en-US', {
            'ios.nowline': [
                'nowline v1',
                '',
                ...waveHeader('ios-app', 'iOS'),
                'swimlane ios',
                '  item ios-offline duration:4w wave:w1',
                '  item ios-push duration:1w wave:w2 date:2026-01-12',
                '',
            ].join('\n'),
            'portfolio.nowline': [
                'nowline v1',
                '',
                'include "./ios.nowline" roadmap:isolate',
                '',
                ...waveHeader('portfolio', 'Portfolio'),
                'swimlane platform',
                '  item pf-api duration:2w wave:w1',
                '  item pf-scale duration:2w wave:w2',
                '',
            ].join('\n'),
        });
        expect(insights.map((i) => i.message)).toEqual([
            'Item "ios-push" is pinned to 2026-01-12 (date:), but wave "w2" cannot start until 2026-02-02; the item starts at the wave start.',
        ]);
        expect(insights[0].entityId).toBe('ios-push');
    });

    it('reports NL.W1002 when the barrier driver hits its pass cap (Example 13)', async () => {
        const insights = await waveInsights(`nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w2
  item a2 duration:1w wave:w1
  item a3 duration:1w wave:w1
`);
        expect(insights).toHaveLength(1);
        expect(insights[0].code).toBe('NL.W1002');
        expect(insights[0].severity).toBe('warning');
        expect(insights[0].entityId).toBeUndefined();
        expect(insights[0].message).toBe(
            'Wave barriers did not settle after 3 layout passes, so the drawn schedule may not respect the wave order. The roadmap probably has an ordering conflict that validation did not catch.',
        );
    });

    it('reports NL.I1006 once for one empty wave (Example 12)', async () => {
        const insights = await waveInsights(`nowline v1

roadmap placeholder "Placeholder" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Hardening (TBD)"
wave w3 "Wave 3"

swimlane a
  item a1 duration:2w wave:w1
  item a3 duration:1w wave:w3
swimlane b
  item b1 duration:1w wave:w1
  item b3 duration:2w wave:w3
`);
        expect(insights).toHaveLength(1);
        expect(insights[0].code).toBe('NL.I1006');
        expect(insights[0].severity).toBe('info');
        expect(insights[0].lspSeverity).toBe(3);
        expect(insights[0].entityId).toBe('w2');
        expect(insights[0].message).toBe(
            'Wave "w2" has no items, so it spans no time; it is drawn as a marker in the wave strip and listed in the wave legend.',
        );
    });

    it('reports NL.I1006 once for several empty waves', async () => {
        const insights = await waveInsights(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"
wave w3 "Wave 3"
wave w4 "Wave 4"

swimlane a
  item a1 duration:2w wave:w1
  item a4 duration:1w wave:w4
`);
        expect(insights).toHaveLength(1);
        expect(insights[0].code).toBe('NL.I1006');
        expect(insights[0].entityId).toBeUndefined();
        expect(insights[0].data.args).toEqual({ reason: 'many', names: ['w2', 'w3'] });
        expect(insights[0].message).toBe(
            'Waves "w2", "w3" have no items, so they span no time; they are drawn as markers in the wave strip and listed in the wave legend.',
        );
    });

    it('reports NL.I1006 once when every wave is empty', async () => {
        const insights = await waveInsights(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"

swimlane a
  item a1 duration:2w
`);
        expect(insights).toHaveLength(1);
        expect(insights[0].data.args).toEqual({ reason: 'all', names: ['discover', 'build'] });
        expect(insights[0].message).toBe(
            'None of the declared waves ("discover", "build") has items yet. The wave strip shows a placeholder until work is assigned with wave:<id>.',
        );
    });

    // The next two tests run under calendar:full, the identity path. They are
    // kept as identity guards: the insight reads each milestone's own date
    // (`overrunDate`) off the model, not back off its x, and for a calendar
    // with no non-working days that must match what x-readback used to give,
    // mid-week and on a fractional ppd. The business-calendar cases, where
    // x-readback would be wrong, live in working-day-schedule.test.ts.
    it('reports NL.I1007 when a wave overruns a dated milestone (Example 11)', async () => {
        const insights = await waveInsights(`nowline v1

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
`);
        expect(insights).toHaveLength(1);
        expect(insights[0].code).toBe('NL.I1007');
        expect(insights[0].severity).toBe('info');
        expect(insights[0].entityId).toBe('exec-done');
        expect(insights[0].message).toBe(
            'Milestone "exec-done" (2026-03-16) is overrun: wave "execute" ends 2026-03-23.',
        );
    });

    it('NL.I1007 reads the milestone date back exactly: mid-week, fractional ppd, packed row', async () => {
        // scale:2w gives a non-integer pixels-per-day, 2026-01-14 is a
        // Wednesday, and two milestones on one date force the marker-row
        // packer to move one of them down. The insight's date must still be
        // each milestone's own `date:`.
        const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:2w calendar:full

wave w1 "One"
wave w2 "Two"

swimlane a
  item a1 duration:3w wave:w1
  item a2 duration:1w wave:w2

milestone m1 "First gate" date:2026-01-14 after:w1
milestone m2 "Second gate" date:2026-01-14 after:w1
milestone m3 "Third gate" date:2026-01-23 after:w2
`;
        const { file, resolved } = await parseAndResolve(source);
        const layout = layoutRoadmap(file, resolved);
        expect(layout.timeline.pixelsPerDay % 1).not.toBe(0);
        const ys = layout.milestones.map((m) => m.center.y);
        expect(new Set(ys).size).toBeGreaterThan(1);
        const insights = await waveInsights(source);
        expect(insights.map((i) => i.message)).toEqual([
            'Milestone "m1" (2026-01-14) is overrun: wave "w1" ends 2026-01-26.',
            'Milestone "m2" (2026-01-14) is overrun: wave "w1" ends 2026-01-26.',
            'Milestone "m3" (2026-01-23) is overrun: wave "w2" ends 2026-02-02.',
        ]);
    });

    it('reports no wave insights for a roadmap whose waves are met and filled', async () => {
        const insights = await waveInsights(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:full

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:1w wave:w2

milestone done date:2026-02-02 after:w2
`);
        expect(insights).toEqual([]);
    });
});
