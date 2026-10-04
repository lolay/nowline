// Calendar presets. `calendar:business` and `calendar:full` are hardcoded in
// `calendar.ts` and documented in the specs/dsl.md "Preset reference" block.
// These tests pin the quarter length (13 weeks in both presets) and keep the
// runtime values and the spec from drifting apart.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type CalendarConfig, literalToDays, resolveCalendar } from '../src/calendar.js';
import { parseAndResolve } from './helpers.js';

const DSL_SPEC = fileURLToPath(new URL('../../../specs/dsl.md', import.meta.url));

type PresetMode = 'business' | 'full';

async function preset(mode: PresetMode): Promise<CalendarConfig> {
    const { file } = await parseAndResolve(
        `nowline v1\n\nroadmap r start:2026-01-05 calendar:${mode}\n\nswimlane s\n  item a duration:1w\n`,
    );
    return resolveCalendar(file, undefined);
}

/** Read the `days-per-*` entries of one preset from the dsl.md reference block. */
function specPreset(mode: PresetMode): Record<string, number> {
    const lines = readFileSync(DSL_SPEC, 'utf-8').split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith(`// calendar:${mode} (hardcoded`));
    expect(start).toBeGreaterThanOrEqual(0);
    const entries: Record<string, number> = {};
    for (const line of lines.slice(start + 1)) {
        if (line.trim() === 'calendar') continue;
        const m = /^\s+(days-per-[a-z]+):\s*(\d+)\s*$/.exec(line);
        if (!m) break;
        entries[m[1]] = Number(m[2]);
    }
    return entries;
}

describe('calendar presets', () => {
    it('calendar:business counts a quarter as 13 five-day weeks', async () => {
        const cal = await preset('business');
        expect(literalToDays('1q', cal)).toBe(65);
        expect(cal.daysPerQuarter).toBe(13 * cal.daysPerWeek);
    });

    it('calendar:full counts a quarter as 13 seven-day weeks', async () => {
        const cal = await preset('full');
        expect(literalToDays('1q', cal)).toBe(91);
        expect(cal.daysPerQuarter).toBe(13 * cal.daysPerWeek);
    });

    it.each<PresetMode>(['business', 'full'])(
        'calendar:%s matches the specs/dsl.md preset reference',
        async (mode) => {
            const cal = await preset(mode);
            expect({
                'days-per-week': cal.daysPerWeek,
                'days-per-month': cal.daysPerMonth,
                'days-per-quarter': cal.daysPerQuarter,
                'days-per-year': cal.daysPerYear,
            }).toEqual(specPreset(mode));
        },
    );
});
