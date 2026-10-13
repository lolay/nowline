// `classifyCalendarDeclaration` from `@nowline/core/internal` against hover's
// `undrawnTitleNote` (specs/core-ast-utilities.md §5): a note exactly for a
// titled half-bounded or bounded recurrence, over every declaration in the
// samples and the test fixtures. The test goes with hover's own reading,
// which m2.s3 replaces.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    isNonWorkingDeclaration,
    isWorkingDeclaration,
    type NonWorkingDeclaration,
    type WorkingDeclaration,
} from '@nowline/core';
import { classifyCalendarDeclaration } from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { undrawnTitleNote } from '../../src/providers/hover.js';
import { parseDocument } from '../helpers.js';

type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

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
        const doc = await parseDocument(readFileSync(file, 'utf8'));
        for (const decl of calendarDeclarations(doc.parseResult.value.configEntries)) {
            out.push([path.relative(REPO_ROOT, file), decl]);
        }
    }
    for (const line of fixtureLines()) {
        const doc = await parseDocument(
            `config\n\n${line}\n\nroadmap r start:2026-01-05\nswimlane s\n  item x duration:1w\n`,
        );
        for (const decl of calendarDeclarations(doc.parseResult.value.configEntries)) {
            out.push([line, decl]);
        }
    }
    return out;
}

const entries = await corpus();

describe('classifyCalendarDeclaration agrees with undrawnTitleNote', () => {
    it('covers the samples, the fixtures and some titled recurrences', (): void => {
        expect(entries.filter(([label]) => label.endsWith('.nowline')).length).toBeGreaterThan(5);
        expect(entries.length).toBeGreaterThan(60);
        expect(entries.filter(([, decl]) => undrawnTitleNote(decl)).length).toBeGreaterThan(0);
    });

    it.each(entries)('%s', (_label, decl): void => {
        const { shape } = classifyCalendarDeclaration(decl);
        const undrawn =
            !!decl.title && (shape === 'half-bounded-recurrence' || shape === 'bounded-recurrence');
        expect(undrawnTitleNote(decl) !== undefined).toBe(undrawn);
    });
});
