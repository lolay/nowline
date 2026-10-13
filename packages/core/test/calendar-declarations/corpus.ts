// Every `non-working` / `working` declaration in the samples and the test
// fixtures, for the m2.s3 equivalence test. Goes with that test.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    isNonWorkingDeclaration,
    isWorkingDeclaration,
    type NonWorkingDeclaration,
    type WorkingDeclaration,
} from '../../src/generated/ast.js';
import { parse } from '../helpers.js';

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

// A declaration line inside a test's source string: the keyword, an optional
// id and title, then at least one `key:value`.
const DECLARATION_LINE =
    /\b(?:non-working|working)(?: [a-z][\w-]*)?(?: "[^"\n]*")?(?: [a-z][\w-]*:(?:\[[^\]\n]*\]|[^\s'"`\\]+))+/g;

/** Declaration lines quoted in every package's tests. */
function fixtureLines(): string[] {
    const lines = new Set<string>();
    for (const pkg of readdirSync(path.join(REPO_ROOT, 'packages')).sort()) {
        const testDir = path.join(REPO_ROOT, 'packages', pkg, 'test');
        if (!statSync(path.join(REPO_ROOT, 'packages', pkg)).isDirectory()) continue;
        try {
            statSync(testDir);
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

export interface CorpusEntry {
    label: string;
    decl: CalendarDeclaration;
}

/** Every calendar declaration of the samples, then of the fixture lines. */
export async function calendarDeclarationCorpus(): Promise<CorpusEntry[]> {
    const out: CorpusEntry[] = [];
    const samples = [
        ...filesUnder(path.join(REPO_ROOT, 'examples'), true, '.nowline'),
        ...filesUnder(path.join(REPO_ROOT, 'tests'), false, '.nowline'),
    ];
    for (const file of samples) {
        const { ast } = await parse(readFileSync(file, 'utf8'), { validate: false });
        for (const entry of ast.configEntries) {
            if (isNonWorkingDeclaration(entry) || isWorkingDeclaration(entry)) {
                out.push({ label: path.relative(REPO_ROOT, file), decl: entry });
            }
        }
    }
    for (const line of fixtureLines()) {
        const { ast } = await parse(
            `config\n\n${line}\n\nroadmap r start:2026-01-05\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        for (const entry of ast.configEntries) {
            if (isNonWorkingDeclaration(entry) || isWorkingDeclaration(entry)) {
                out.push({ label: line, decl: entry });
            }
        }
    }
    return out;
}
