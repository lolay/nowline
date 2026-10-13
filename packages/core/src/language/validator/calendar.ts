// Calendar and scale block, calendar declaration, week and duplicate calendar id checks
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is; the class
// forwards one method per check.

import type { ValidationAcceptor } from 'langium';
import type {
    CalendarBlock,
    NonWorkingDeclaration,
    NowlineFile,
    ScaleBlock,
    WorkingDeclaration,
} from '../../generated/ast.js';
import {
    isCalendarBlock,
    isNonWorkingDeclaration,
    isWorkingDeclaration,
} from '../../generated/ast.js';
import { isRealIsoDate, propKey } from '../../util/props.js';
import type { CalendarDeclarationFacts } from '../calendar-declarations.js';
import {
    CALENDAR_DECLARATION_KEYS,
    classifyCalendarDeclaration,
    isWeekday,
    replacesPresetWeekend,
} from '../calendar-declarations.js';
import { entityTypeLabel } from '../validator-utils.js';
import type { DiagnosticInfo } from './support.js';
import { acceptTr } from './support.js';
import { CALENDAR_FIELDS, INTEGER_RE, SCALE_FIELDS } from './tables.js';

// --- Rule 7 (calendar): calendar block only valid when roadmap calendar:custom ---
// Rule 8: custom calendar requires all four fields.
export function checkCalendarBlockConsistency(file: NowlineFile, accept: ValidationAcceptor): void {
    const calendarBlocks = file.configEntries.filter(isCalendarBlock);
    const calendarProp = file.roadmapDecl?.properties.find((p) => propKey(p) === 'calendar');
    const calendarMode = calendarProp?.value;

    if (calendarBlocks.length > 0 && calendarMode !== 'custom') {
        for (const block of calendarBlocks) {
            accept(
                'error',
                `A "calendar" config block is only valid when the roadmap declares calendar:custom.`,
                { node: block },
            );
        }
    }

    if (calendarMode === 'custom' && calendarBlocks.length === 0) {
        accept(
            'error',
            `calendar:custom requires a "calendar" config block with days-per-week, days-per-month, days-per-quarter, and days-per-year.`,
            { node: file.roadmapDecl!, property: 'properties' },
        );
    }

    if (calendarMode === 'custom' && calendarBlocks.length > 0) {
        for (const block of calendarBlocks) {
            const presentKeys = new Set(block.properties.map((p) => propKey(p)));
            for (const field of CALENDAR_FIELDS) {
                if (!presentKeys.has(field)) {
                    accept(
                        'error',
                        `calendar:custom requires "${field}" in the calendar config block.`,
                        { node: block },
                    );
                }
            }
        }
    }
}

// --- Rule 9: calendar block property values must be positive integers ---
export function checkCalendarBlock(block: CalendarBlock, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const prop of block.properties) {
        const key = propKey(prop);
        if (!CALENDAR_FIELDS.has(key)) {
            accept(
                'error',
                `Unknown calendar property "${key}". Allowed: ${[...CALENDAR_FIELDS].join(', ')}.`,
                { node: prop, property: 'key' },
            );
            continue;
        }
        if (seen.has(key)) {
            accept('error', `Duplicate calendar property "${key}".`, {
                node: prop,
                property: 'key',
            });
        }
        seen.add(key);

        if (!INTEGER_RE.test(prop.value) || parseInt(prop.value, 10) <= 0) {
            accept('error', `"${key}" must be a positive integer, got "${prop.value}".`, {
                node: prop,
                property: 'value',
            });
        }
    }
}

// --- Scale block property validation ---
export function checkScaleBlock(block: ScaleBlock, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const prop of block.properties) {
        const key = propKey(prop);
        if (!SCALE_FIELDS.has(key)) {
            accept(
                'error',
                `Unknown scale property "${key}". Allowed: ${[...SCALE_FIELDS].join(', ')}.`,
                { node: prop, property: 'key' },
            );
            continue;
        }
        if (seen.has(key)) {
            accept('error', `Duplicate scale property "${key}".`, {
                node: prop,
                property: 'key',
            });
        }
        seen.add(key);

        if (key === 'label-every') {
            if (!INTEGER_RE.test(prop.value) || parseInt(prop.value, 10) <= 0) {
                accept('error', `"label-every" must be a positive integer, got "${prop.value}".`, {
                    node: prop,
                    property: 'value',
                });
            }
        }
    }
}

// --- NW1-NW3: one `non-working` / `working` declaration (specs/working-calendar.md §6) ---
// Shared by both keywords. The shape is judged over the four own keys only; any other
// key is NL.E0901 on its own, so `date:2026-01-01 style:x` reports just that key.
export function checkCalendarDeclaration(
    decl: NonWorkingDeclaration | WorkingDeclaration,
    accept: ValidationAcceptor,
): void {
    const kind = entityTypeLabel(decl);
    const facts = classifyCalendarDeclaration(decl);
    const { own } = facts;

    for (const prop of decl.properties) {
        if (!CALENDAR_DECLARATION_KEYS.has(propKey(prop))) {
            acceptTr(accept, 'error', { node: prop, property: 'key' }, 'NL.E0901', {
                kind,
                key: propKey(prop),
            });
        }
    }

    if (facts.shape === 'malformed') {
        acceptTr(accept, 'error', { node: decl }, 'NL.E0900', { kind });
    }

    // `date:` elements. A single value is checked by checkPropertyValues.
    const dateProp = own.get('date');
    if (dateProp && dateProp.values.length > 0) {
        dateProp.values.forEach((value, index) => {
            if (!isRealIsoDate(value)) {
                acceptTr(
                    accept,
                    'error',
                    { node: dateProp, property: 'values', index },
                    'NL.E0405',
                    {
                        key: 'date',
                        value,
                    },
                );
            }
        });
    }

    for (const key of ['start', 'end'] as const) {
        const prop = own.get(key);
        // A one-element bracket is the single date; two or more is a list.
        if (prop && prop.values.length > 1) {
            acceptTr(accept, 'error', { node: prop }, 'NL.E0902', { kind, key });
        } else if (prop && prop.values.length === 1 && !isRealIsoDate(prop.values[0])) {
            // checkPropertyValues reads `value` only, so the element is checked here.
            acceptTr(accept, 'error', { node: prop, property: 'values', index: 0 }, 'NL.E0405', {
                key,
                value: prop.values[0],
            });
        }
    }

    const { start, end } = facts;
    if (start && end && end < start) {
        acceptTr(accept, 'error', { node: own.get('end')!, property: 'value' }, 'NL.E0903', {
            start,
            end,
        });
    }

    const everyProp = own.get('every');
    if (everyProp) {
        const seen = new Set<string>();
        const names = everyProp.value !== undefined ? [everyProp.value] : everyProp.values;
        names.forEach((value, index) => {
            const info: DiagnosticInfo =
                everyProp.values.length > 0
                    ? { node: everyProp, property: 'values', index }
                    : { node: everyProp, property: 'value' };
            if (!isWeekday(value)) {
                acceptTr(accept, 'error', info, 'NL.E0904', { value });
            } else if (seen.has(value)) {
                acceptTr(accept, 'error', info, 'NL.E0905', { value });
            }
            seen.add(value);
        });
    }
}

// --- NW3 / NW4: the open-ended week of the root file ---
// Mirrors `resolveWorkingCalendar` in @nowline/layout for the file alone: an include's
// declarations are not visible here, so they never feed the week (documented limit).
export function checkCalendarWeek(file: NowlineFile, accept: ValidationAcceptor): void {
    const roadmap = file.roadmapDecl;
    // A file with no roadmap is an include; the roadmap that pulls it in owns the calendar.
    if (!roadmap) return;

    const declarations = file.configEntries.filter(isCalendarDeclaration);
    const usable = declarations
        .map((decl) => ({ decl, facts: classifyCalendarDeclaration(decl) }))
        .filter(({ facts }) => facts.wellFormed);
    const weekdaysOf = (facts: CalendarDeclarationFacts): number[] => facts.weekdays ?? [];
    const openEnded = usable.filter(({ facts }) => facts.shape === 'open-recurrence');

    const calendarProp = roadmap.properties.find((p) => propKey(p) === 'calendar');
    const block = file.configEntries.find(isCalendarBlock);
    const isCustom = calendarProp?.value === 'custom' && block !== undefined;
    const isFull = calendarProp?.value === 'full';
    const daysPerWeekProp = isCustom
        ? block.properties.find((p) => propKey(p) === 'days-per-week')
        : undefined;
    const declaredDays = parseInt(daysPerWeekProp?.value ?? '', 10);
    const daysPerWeek = isCustom
        ? Number.isFinite(declaredDays) && declaredDays > 0
            ? declaredDays
            : BUSINESS_DAYS_PER_WEEK
        : isFull
          ? 7
          : BUSINESS_DAYS_PER_WEEK;

    // The preset weekend, unless a non-working declaration is named `weekend`.
    const replacesWeekend = replacesPresetWeekend(declarations);
    const open = new Set<number>(!isCustom && !isFull && !replacesWeekend ? [0, 6] : []);
    for (const { decl, facts } of openEnded) {
        if (isNonWorkingDeclaration(decl)) {
            for (const day of weekdaysOf(facts)) open.add(day);
        }
    }
    for (const { decl, facts } of openEnded) {
        if (isWorkingDeclaration(decl)) {
            for (const day of weekdaysOf(facts)) open.delete(day);
        }
    }

    if (open.size === 7) {
        for (const { decl } of openEnded) {
            if (isNonWorkingDeclaration(decl)) {
                acceptTr(accept, 'error', { node: decl }, 'NL.E0906');
            }
        }
    }
    for (const { decl, facts } of usable) {
        if (!isNonWorkingDeclaration(decl) || facts.shape !== 'half-bounded-recurrence') {
            continue;
        }
        const days = new Set([...open, ...weekdaysOf(facts)]);
        if (days.size === 7) acceptTr(accept, 'error', { node: decl }, 'NL.E0906');
    }

    const working = 7 - open.size;
    // With no working day left the error above is the finding.
    if (working === 0 || working === daysPerWeek) return;
    const info: DiagnosticInfo = isCustom
        ? daysPerWeekProp
            ? { node: daysPerWeekProp, property: 'value' }
            : { node: block }
        : calendarProp
          ? { node: calendarProp }
          : openEnded.length > 0
            ? { node: openEnded[0].decl }
            : { node: roadmap };
    acceptTr(accept, 'warning', info, 'NL.W0705', { daysPerWeek, working });
}

// --- NW5: duplicate declaration ids in one file, per keyword ---
export function checkDuplicateCalendarDeclarationIds(
    file: NowlineFile,
    accept: ValidationAcceptor,
): void {
    const seen = new Map<string, NonWorkingDeclaration | WorkingDeclaration>();
    for (const entry of file.configEntries) {
        if (!isCalendarDeclaration(entry) || !entry.name) continue;
        const key = `${entry.$type}:${entry.name}`;
        if (seen.has(key)) {
            acceptTr(accept, 'error', { node: entry, property: 'name' }, 'NL.E0907', {
                kind: entityTypeLabel(entry),
                name: entry.name,
            });
        } else {
            seen.set(key, entry);
        }
    }
}

const BUSINESS_DAYS_PER_WEEK = 5;

type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

function isCalendarDeclaration(node: unknown): node is CalendarDeclaration {
    return isNonWorkingDeclaration(node) || isWorkingDeclaration(node);
}
