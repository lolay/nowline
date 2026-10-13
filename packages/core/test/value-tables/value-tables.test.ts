// The shared vocabularies (specs/core-ast-utilities.md §3.5): one definition
// each, pinned here, with the validator reading them. A value added to a table
// is accepted by the validator and offered by the editor in the same change.

import { describe, expect, it } from 'vitest';
import { WEEKDAYS as CALENDAR_WEEKDAYS } from '../../src/language/calendar-declarations.js';
import {
    BUILTIN_CAPACITY_ICONS,
    BUILTIN_ICON_NAMES,
    BUILTIN_STATUSES,
    NON_WORKING_DISPLAYS,
    WEEKDAYS,
} from '../../src/language/value-tables.js';
import { errorMessages, parse } from '../helpers.js';

describe('value tables', () => {
    it('pins each table', () => {
        expect(BUILTIN_STATUSES).toEqual([
            'planned',
            'in-progress',
            'active',
            'done',
            'completed',
            'at-risk',
            'blocked',
        ]);
        expect(BUILTIN_CAPACITY_ICONS).toEqual([
            'none',
            'multiplier',
            'person',
            'people',
            'points',
            'time',
        ]);
        expect(BUILTIN_ICON_NAMES).toEqual([
            ...BUILTIN_CAPACITY_ICONS,
            'shield',
            'warning',
            'lock',
            'calendar',
        ]);
        expect(NON_WORKING_DISPLAYS).toEqual(['hide', 'show']);
    });

    it('re-exports the weekday names from calendar-declarations', () => {
        expect(WEEKDAYS).toBe(CALENDAR_WEEKDAYS);
        expect(WEEKDAYS).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    });

    it('reserves every built-in status id', async () => {
        for (const status of BUILTIN_STATUSES) {
            const r = await parse(
                `config\nstatus ${status}\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics).join('\n'), status).toContain(
                `Status id "${status}" collides with the built-in status value`,
            );
        }
    });

    it('reserves every built-in icon name a symbol id can spell', async () => {
        // `person`, `people` and `calendar` are DSL keywords, so they never parse as a symbol id.
        const keywords = new Set(['person', 'people', 'calendar']);
        for (const icon of BUILTIN_ICON_NAMES.filter((name) => !keywords.has(name))) {
            const r = await parse(
                `config\nsymbol ${icon} unicode:"x"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics).join('\n'), icon).toContain(
                `Symbol id "${icon}" collides with a built-in icon name`,
            );
        }
    });

    it('accepts every built-in capacity icon and non-working display', async () => {
        for (const icon of BUILTIN_CAPACITY_ICONS) {
            const r = await parse(
                `config\nstyle s\n  capacity-icon: ${icon}\nroadmap r\nswimlane l\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics), icon).toEqual([]);
        }
        for (const display of NON_WORKING_DISPLAYS) {
            const r = await parse(
                `config\ndefault roadmap non-working:${display}\nroadmap r\nswimlane l\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics), display).toEqual([]);
        }
    });
});
