// The Mermaid bridge reads the file's calendar and engine C's durations
// (specs/working-calendar.md §8): a business gantt says `excludes saturday,
// sunday` and counts `Nd` in working days, explicit dates sit on working days
// (Mermaid never checks a task's start against `excludes`), and every item's
// duration is the chart's own day count.
//
// Every expectation is a literal, derived by hand from the presets
// (business 5/22/65/260, full 7/30/91/365) and the custom block below
// (6/26/78/312). 2026-01-05 is a Monday, so 2026-01-10 is a Saturday and
// 2026-01-11 a Sunday. `(guard)` marks a case that is green before and after.

import { describe, expect, it } from 'vitest';
import { exportMermaid } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

type CalendarName = 'business' | 'full' | 'custom';

const CUSTOM_BLOCK = `config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312

`;

function header(calendar: CalendarName, start = '2026-01-05'): string {
    const props = {
        business: `start:${start}`,
        full: `start:${start} calendar:full`,
        custom: `start:${start} calendar:custom`,
    }[calendar];
    const config = calendar === 'custom' ? CUSTOM_BLOCK : '';
    return `nowline v1\n\n${config}roadmap r "R" ${props}\n`;
}

function source(calendar: CalendarName, lanes: string, start?: string): string {
    return `${header(calendar, start)}
size med effort:1w
size xl effort:1m

swimlane s "S"
${lanes}
`;
}

async function mermaidOf(src: string): Promise<string> {
    return exportMermaid(await buildExportInputs(src));
}

/** The comma-separated fields after the task's `:`, status keyword removed. */
function fieldsOf(md: string, id: string): string[] {
    const line = md.split('\n').find((l) => new RegExp(`:\\s*(?:[a-z]+, )?${id}, `).test(l));
    expect(line, `task ${id}`).toBeDefined();
    const fields = line!
        .slice(line!.indexOf(' :') + 2)
        .split(',')
        .map((f) => f.trim());
    if (['done', 'active', 'crit', 'milestone'].includes(fields[0])) fields.shift();
    return fields;
}

/** `[id, start, duration]` of a task. */
const durationOf = (md: string, id: string): string => fieldsOf(md, id)[2];
const startOf = (md: string, id: string): string => fieldsOf(md, id)[1];

describe('exportMermaid — excludes follows the open week', () => {
    it('business: `excludes saturday, sunday` is the line after dateFormat', async () => {
        const md = await mermaidOf(source('business', '  item a "A" duration:1w'));
        const lines = md.split('\n');
        const at = lines.indexOf('    dateFormat YYYY-MM-DD');
        expect(at).toBeGreaterThan(0);
        expect(lines[at + 1]).toBe('    excludes saturday, sunday');
        expect(md.match(/excludes/g)).toHaveLength(1);
    });

    it.each<CalendarName>(['full', 'custom'])('%s: no excludes line (guard)', async (calendar) => {
        const md = await mermaidOf(source(calendar, '  item a "A" duration:1w'));
        expect(md).not.toContain('excludes');
    });

    it('the default calendar is business, so a roadmap with none says excludes', async () => {
        const md = await mermaidOf(
            'nowline v1\n\nroadmap r "R" start:2026-01-05\n\nswimlane s "S"\n  item a "A" duration:1w\n',
        );
        expect(md).toContain('    excludes saturday, sunday');
    });
});

describe('exportMermaid — durations come from the file calendar and engine C', () => {
    it.each<[CalendarName, string, string]>([
        ['business', 'duration:2w', '10d'],
        ['business', 'duration:1q', '65d'],
        ['business', 'duration:1y', '260d'],
        ['business', 'duration:1.5w', '7.5d'],
        ['business', 'duration:1m', '22d'], // (guard: 22 days a month both ways)
        ['business', 'size:med', '5d'],
        ['business', 'size:xl capacity:2', '11d'],
        ['business', 'size:xl capacity:3', '7.33d'],
        ['full', 'duration:4w', '28d'],
        ['full', 'duration:1w', '7d'],
        ['full', 'duration:1q', '91d'],
        ['full', 'size:xl capacity:2', '15d'],
        ['custom', 'duration:1w', '6d'],
        ['custom', 'duration:1q', '78d'],
        ['business', 'duration:3d', '3d'], // (guard)
        ['business', 'size:ghost', '1d'], // (guard)
    ])('%s calendar: %s is %s', async (calendar, props, expected) => {
        const md = await mermaidOf(source(calendar, `  item a "A" ${props}`));
        expect(durationOf(md, 'a')).toBe(expected);
    });

    it('an item with no size or duration keeps the 1d fallback (guard)', async () => {
        const md = await mermaidOf(source('business', '  item a "A"'));
        expect(durationOf(md, 'a')).toBe('1d');
    });

    it('a roadmap without waves still reads durations from the schedule', async () => {
        const md = await mermaidOf(
            source('business', '  item a "A" duration:2w\n  item b "B" size:med'),
        );
        expect(md).not.toContain('section Waves');
        expect(durationOf(md, 'a')).toBe('10d');
        expect(durationOf(md, 'b')).toBe('5d');
    });
});

describe('exportMermaid — explicit dates sit on working days', () => {
    const LANES = '  item a "A" duration:1w';
    const UNDATED = `${LANES}

anchor kick "Kick"

milestone m "M"
`;

    it.each([
        ['Saturday', '2026-01-10'],
        ['Sunday', '2026-01-11'],
    ])('a %s start gives Monday to the lane leader', async (_day, start) => {
        const md = await mermaidOf(source('business', LANES, start));
        expect(startOf(md, 'a')).toBe('2026-01-12');
    });

    it('a Saturday start gives Monday to an undated anchor', async () => {
        const md = await mermaidOf(source('business', UNDATED, '2026-01-10'));
        expect(startOf(md, 'kick')).toBe('2026-01-12');
    });

    it('a Saturday start gives Monday to a milestone with neither date nor after', async () => {
        const md = await mermaidOf(source('business', UNDATED, '2026-01-10'));
        expect(startOf(md, 'm')).toBe('2026-01-12');
    });

    it('a working-day start is untouched (guard)', async () => {
        const md = await mermaidOf(source('business', UNDATED, '2026-01-07'));
        expect(startOf(md, 'a')).toBe('2026-01-07');
        expect(startOf(md, 'kick')).toBe('2026-01-07');
        expect(startOf(md, 'm')).toBe('2026-01-07');
    });

    it('calendar:full keeps a Saturday start (guard)', async () => {
        const md = await mermaidOf(source('full', UNDATED, '2026-01-10'));
        expect(startOf(md, 'a')).toBe('2026-01-10');
        expect(startOf(md, 'kick')).toBe('2026-01-10');
        expect(startOf(md, 'm')).toBe('2026-01-10');
    });

    it('anchors and dated milestones keep their own dates, weekend or not (guard)', async () => {
        const md = await mermaidOf(
            source(
                'business',
                `${LANES}

anchor sat "Sat" date:2026-01-10

milestone sun "Sun" date:2026-01-11
`,
            ),
        );
        expect(startOf(md, 'sat')).toBe('2026-01-10');
        expect(startOf(md, 'sun')).toBe('2026-01-11');
    });
});

describe('exportMermaid — wave-end milestones are points on working days', () => {
    const WAVES = (calendar: CalendarName, one: string): string => `${header(calendar)}
wave one "One"
wave two "Two"

swimlane x
  item x1 duration:${one} wave:one

swimlane y
  item y1 duration:1w wave:two
`;

    it('business: a wave ending Saturday is dated the following Monday', async () => {
        const md = await mermaidOf(WAVES('business', '1w'));
        expect(md).toContain('    One (wave end) :milestone, one, 2026-01-12, 0d');
        expect(md).toContain(':y1, after one, 5d');
    });

    it('business: a wave ending on a working day keeps that date (guard)', async () => {
        // x1 is 3 working days, Mon-Wed, so it ends (exclusive) Thursday 01-08.
        const md = await mermaidOf(WAVES('business', '3d'));
        expect(md).toContain('    One (wave end) :milestone, one, 2026-01-08, 0d');
    });

    it('calendar:full: the wave end is engine C exclusive end, unchanged (guard)', async () => {
        // 5 calendar days from Monday 01-05: ends (exclusive) Saturday 01-10,
        // and the full calendar has no weekend to skip.
        const md = await mermaidOf(WAVES('full', '5d'));
        expect(md).toContain('    One (wave end) :milestone, one, 2026-01-10, 0d');
    });
});
