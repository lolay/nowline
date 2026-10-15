// Tick labels in a run of narrowed columns (specs/working-calendar.md §7.2,
// handoff-m2p decision 3 as amended). A bounded recurrence narrows every
// week in its window, so the plain narrow-column rule dropped every label in
// it and left the axis blank for the whole stretch. Inside a run of two or
// more narrowed columns a dropped label now comes back when it fits its
// column plus half of each unlabelled neighbour, so the labels alternate. A
// lone narrowed week keeps the plain rule.
//
// Pixels are relative to `timeline.originX`. At `scale:1w` a business week is
// 40 px under hide and a four-day week 32 px; `Jun 29` is 34.8 px wide.

import { describe, expect, it } from 'vitest';
import { type LayoutOptions, layoutRoadmap, type PositionedRoadmap } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

type Display = 'hide' | 'show';

const SUMMER_FRIDAYS =
    'non-working fridays "Summer Fridays" every:fri start:2026-07-01 end:2026-08-31';

function source(scale: string, declarations: string[], calendar = 'business'): string {
    const config = declarations.length === 0 ? '' : `config\n\n${declarations.join('\n')}\n\n`;
    return `nowline v1

${config}roadmap r "R" start:2026-06-01 scale:${scale} calendar:${calendar}

anchor kickoff "Kickoff" date:2026-06-01
swimlane platform "Platform"
  item api-v2 "API v2" duration:8w
  item data-migration "Data migration" duration:6w
`;
}

async function lay(text: string, nonWorking: Display = 'hide'): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(text);
    const options: LayoutOptions & { nonWorking?: Display } = {
        theme: 'light',
        today: new Date(Date.UTC(2026, 5, 1)),
        nonWorking,
    };
    return layoutRoadmap(file, resolved, options);
}

/** `[x, label]` per tick, x relative to the timeline origin. */
async function ticks(
    scale: string,
    declarations: string[],
    nonWorking: Display = 'hide',
): Promise<Array<[number, string | undefined]>> {
    const model = await lay(source(scale, declarations), nonWorking);
    return model.timeline.ticks.map((t) => [
        Math.round((t.x - model.timeline.originX) * 10) / 10,
        t.label,
    ]);
}

describe('narrow-column runs under hide', () => {
    it('alternates the week labels inside a bounded recurrence at 1w', async () => {
        // Jun 29 to Aug 24 are nine 32 px weeks. Jun 29 sits next to the
        // labelled Jun 22 and stays dropped; Jul 06 borrows from it, and so on.
        // Aug 24 sits next to the restored Aug 17 and stays dropped.
        expect(await ticks('1w', [SUMMER_FRIDAYS])).toEqual([
            [0, 'Jun 01'],
            [40, 'Jun 08'],
            [80, 'Jun 15'],
            [120, 'Jun 22'],
            [160, undefined],
            [192, 'Jul 06'],
            [224, undefined],
            [256, 'Jul 20'],
            [288, undefined],
            [320, 'Aug 03'],
            [352, undefined],
            [384, 'Aug 17'],
            [416, undefined],
            [448, 'Aug 31'],
            [488, 'Sep 07'],
            [528, 'Sep 14'],
            [568, undefined],
        ]);
    });

    it('restores the thinned majors inside the recurrence at the default weeks thinning', async () => {
        // `scale:weeks` labels every 4th week; Jun 29, Jul 27 and Aug 24 are
        // majors in 32 px columns whose neighbours are thinned.
        const labelled = (await ticks('weeks', [SUMMER_FRIDAYS])).filter(([, l]) => l);
        expect(labelled).toEqual([
            [0, 'Jun 01'],
            [160, 'Jun 29'],
            [288, 'Jul 27'],
            [416, 'Aug 24'],
        ]);
    });

    it('keeps the plain rule for a lone narrowed holiday week', async () => {
        // Juneteenth narrows the Jun 15 week to 32 px between two full weeks.
        const juneteenth = 'non-working juneteenth "Juneteenth" date:2026-06-19';
        expect((await ticks('1w', [juneteenth])).slice(0, 5)).toEqual([
            [0, 'Jun 01'],
            [40, 'Jun 08'],
            [80, undefined],
            [112, 'Jun 22'],
            [152, 'Jun 29'],
        ]);
    });

    it('keeps the plain rule for two adjacent narrowed weeks at 1w', async () => {
        // Each of the two has a labelled full week on one side, so neither
        // label can borrow room on both sides.
        const twoWeeks = 'non-working pair "Pair" date:[2026-06-19, 2026-06-26]';
        expect((await ticks('1w', [twoWeeks])).slice(0, 5)).toEqual([
            [0, 'Jun 01'],
            [40, 'Jun 08'],
            [80, undefined],
            [112, undefined],
            [144, 'Jun 29'],
        ]);
    });

    it('still drops labels that cannot fit even with both neighbours empty', async () => {
        // Three days out leaves 16 px weeks: 16 + 8 + 8 is less than 34.8.
        const threeDays =
            'non-working midweek every:[wed, thu, fri] start:2026-07-01 end:2026-08-31';
        const inside = (await ticks('1w', [threeDays])).filter(([x]) => x >= 160 && x < 304);
        expect(inside.length).toBeGreaterThan(5);
        expect(inside.every(([, l]) => l === undefined)).toBe(true);
    });

    it('labels the first working day of each week at the days scale', async () => {
        // A Monday recurrence hides every week start from Jul 6 to Aug 31; the
        // week's label moves to its Tuesday instead of disappearing.
        const mondays = 'non-working mondays every:mon start:2026-07-01 end:2026-08-31';
        const labelled = (await ticks('days', [mondays])).filter(([, l]) => l).map(([, l]) => l);
        expect(labelled).toEqual([
            '6/1',
            '6/8',
            '6/15',
            '6/22',
            '6/29',
            '7/7',
            '7/14',
            '7/21',
            '7/28',
            '8/4',
            '8/11',
            '8/18',
            '8/25',
            '9/1',
            '9/7',
            '9/14',
        ]);
    });
});

describe('narrow-column runs leave other cases unchanged', () => {
    it('labels every week under show, where the recurrence narrows nothing', async () => {
        const shown = await ticks('1w', [SUMMER_FRIDAYS], 'show');
        expect(shown.slice(4, 8)).toEqual([
            [224, 'Jun 29'],
            [280, 'Jul 06'],
            [336, 'Jul 13'],
            [392, 'Jul 20'],
        ]);
        expect(shown.slice(0, -1).every(([, l]) => l !== undefined)).toBe(true);
    });

    it('keeps month and quarter labels, which use the edge-column rule', async () => {
        const months = await ticks('1m', [SUMMER_FRIDAYS]);
        expect(months.map(([, l]) => l)).toEqual(['Jun', 'Jul', 'Aug', 'Sep', undefined]);
        // At 1q the data-migration caption spills past the Q3 axis end, so
        // the axis gains the labelled Q4 column (rendering.md § "Caption cap
        // at the chart's end").
        const quarters = await ticks('1q', [SUMMER_FRIDAYS]);
        expect(quarters.map(([, l]) => l)).toEqual(['Q2 2026', 'Q3 2026', 'Q4 2026', undefined]);
    });

    it('does not move the ticks of a file without declarations', async () => {
        for (const calendar of ['business', 'full']) {
            const model = await lay(source('1w', [], calendar));
            expect(model.timeline.ticks.slice(0, -1).every((t) => t.label !== undefined)).toBe(
                true,
            );
        }
    });
});
