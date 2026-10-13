// `classifyCalendarDeclaration` from `@nowline/core/internal` against the
// calendar resolver's `declarationRule` (specs/core-ast-utilities.md §5): a
// rule exactly for the well-formed declarations, with the same dates and
// weekdays, over every declaration in the samples and the test fixtures. The
// test goes with `declarationRule`'s own reading, which m2.s3 replaces.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    isNonWorkingDeclaration,
    isWorkingDeclaration,
    type NonWorkingDeclaration,
    type WorkingDeclaration,
} from '@nowline/core';
import { classifyCalendarDeclaration, isWeekday } from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { declarationRule } from '../src/calendar-resolver.js';
import { formatIsoDate } from '../src/dsl-utils.js';
import { parseAndResolve } from './helpers.js';

type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function filesUnder(dir: string, recursive: boolean, suffix: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir).sort()) {
        if (name === 'node_modules' || name === 'dist') continue;
        const abs = path.join(dir, name);
        if (statSync(abs).isDirectory()) {
            if (recursive) out.push(...filesUnder(abs, true, suffix));
        } else if (name.endsWith(suffix)) {
            out.push(abs);
        }
    }
    return out;
}

const DECLARATION_LINE =
    /\b(?:non-working|working)(?: [a-z][\w-]*)?(?: "[^"\n]*")?(?: [a-z][\w-]*:(?:\[[^\]\n]*\]|[^\s'"`\\]+))+/g;

function fixtureLines(): string[] {
    const lines = new Set<string>();
    for (const pkg of readdirSync(path.join(REPO_ROOT, 'packages')).sort()) {
        const testDir = path.join(REPO_ROOT, 'packages', pkg, 'test');
        try {
            if (!statSync(testDir).isDirectory()) continue;
        } catch {
            continue;
        }
        for (const file of filesUnder(testDir, true, '.ts')) {
            for (const match of readFileSync(file, 'utf8').matchAll(DECLARATION_LINE)) {
                lines.add(match[0]);
            }
        }
    }
    return [...lines];
}

function calendarDeclarations(entries: readonly unknown[]): CalendarDeclaration[] {
    return entries.filter(
        (e): e is CalendarDeclaration => isNonWorkingDeclaration(e) || isWorkingDeclaration(e),
    );
}

async function corpus(): Promise<[string, CalendarDeclaration][]> {
    const out: [string, CalendarDeclaration][] = [];
    const samples = [
        ...filesUnder(path.join(REPO_ROOT, 'examples'), true, '.nowline'),
        ...filesUnder(path.join(REPO_ROOT, 'tests'), false, '.nowline'),
    ];
    for (const file of samples) {
        const { file: ast } = await parseAndResolve(
            readFileSync(file, 'utf8'),
            file,
            async () => '',
        );
        for (const decl of calendarDeclarations(ast.configEntries)) {
            out.push([path.relative(REPO_ROOT, file), decl]);
        }
    }
    for (const line of fixtureLines()) {
        const { file: ast } = await parseAndResolve(
            `config\n\n${line}\n\nroadmap r start:2026-01-05\nswimlane s\n  item x duration:1w\n`,
        );
        for (const decl of calendarDeclarations(ast.configEntries)) out.push([line, decl]);
    }
    return out;
}

const entries = await corpus();

describe('classifyCalendarDeclaration agrees with declarationRule', () => {
    it('covers the samples and the fixtures', (): void => {
        expect(entries.filter(([label]) => label.endsWith('.nowline')).length).toBeGreaterThan(5);
        expect(entries.length).toBeGreaterThan(60);
    });

    it.each(entries)('%s', (_label, decl): void => {
        const facts = classifyCalendarDeclaration(decl);
        const rule = declarationRule(decl);
        const every = facts.own.get('every');
        const names = every ? (every.value !== undefined ? [every.value] : every.values) : [];
        // The resolver's own table also answers for a name `Object.prototype`
        // holds (`every:constructor`); the classifier does not.
        if (names.some((name) => !isWeekday(name) && name in {})) {
            expect(facts.wellFormed).toBe(false);
            return;
        }
        expect(rule !== undefined).toBe(facts.wellFormed);
        if (!rule) return;
        expect(rule.dates?.map(formatIsoDate)).toEqual(facts.dates);
        expect(rule.start && formatIsoDate(rule.start)).toBe(facts.start);
        expect(rule.end && formatIsoDate(rule.end)).toBe(facts.end);
        expect(rule.every).toEqual(facts.weekdays && new Set(facts.weekdays));
    });
});
