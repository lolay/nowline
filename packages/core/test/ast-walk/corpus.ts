// The inputs the `ast-walk.ts` equivalence tests run over: every sample under
// `examples/` and `tests/` (the files the G1 gate renders), the wave
// worked examples, and inline fixtures for the shapes the samples do not stress
// (duplicate ids, nested teams, deep group/parallel nesting, description lines,
// unnamed entries).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NowlineFile } from '../../src/generated/ast.js';
import { parse } from '../helpers.js';
import * as waveFixtures from '../validation/wave-fixtures.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function nowlineFilesUnder(dir: string, recursive: boolean): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir).sort()) {
        const abs = path.join(dir, name);
        if (statSync(abs).isDirectory()) {
            if (recursive) out.push(...nowlineFilesUnder(abs, true));
        } else if (name.endsWith('.nowline')) {
            out.push(abs);
        }
    }
    return out;
}

/** Repo-relative paths of `examples/**` and `tests/*.nowline`, as the gates list them. */
export function samplePaths(): string[] {
    return [
        ...nowlineFilesUnder(path.join(REPO_ROOT, 'examples'), true),
        ...nowlineFilesUnder(path.join(REPO_ROOT, 'tests'), false),
    ].map((abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/'));
}

export function readSample(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

const INLINE_FIXTURES: Record<string, string> = {
    'empty file': '',
    'roadmap only': 'roadmap r\n',
    'duplicate item ids': 'roadmap r\nswimlane s\n  item x duration:1w\n  item x duration:2w\n',
    'duplicate ids across kinds':
        'roadmap r\nperson sam "Sam"\nperson sam "Sam again"\nteam sam\nswimlane sam\n  item sam duration:1w\n',
    'person inside a team':
        'roadmap r\nteam eng "Engineering"\n  person sam\nswimlane s\n  item x duration:1w\n',
    'nested teams': [
        'roadmap r',
        'person ann "Ann"',
        'team eng "Engineering" size:big',
        '  description "All of it."',
        '  team plat "Platform" size:small',
        '    person ann',
        '    team infra "Infra"',
        '  team mobile "Mobile"',
        'team ops',
        'swimlane s owner:plat',
        '  item x duration:1w owner:ann',
        '',
    ].join('\n'),
    'parallel in group':
        'roadmap r\nswimlane s\n  group g "G"\n    parallel p\n      item a duration:1w\n      item b duration:1w\n',
    'group in parallel':
        'roadmap r\nswimlane s\n  parallel p\n    group g1\n      item a duration:1w\n    group g2\n      item b duration:1w\n',
    'group in parallel in group': [
        'roadmap r',
        'swimlane s',
        '  description "Lane note."',
        '  group outer "Outer" style:hot',
        '    description "Group note."',
        '    item a "A" duration:1w',
        '    parallel mid',
        '      item b duration:1w',
        '      group inner',
        '        description "Inner note."',
        '        item c duration:1w',
        '        item "Untitled" duration:1w',
        '  item d duration:1w',
        '    description "About d."',
        'swimlane t',
        '  item a "A again" duration:1w',
        '',
    ].join('\n'),
    'every roadmap entry kind': [
        'nowline v1',
        '',
        'config',
        '',
        'scale',
        '  name: weekly',
        '',
        'style hot',
        '  fg: red',
        '',
        'symbol star unicode:"x"',
        '',
        'default item shadow:subtle',
        '',
        'non-working h date:2026-12-25',
        '',
        'working w date:2026-12-26',
        '',
        'roadmap plan "Plan" start:2026-01-05',
        '',
        'person ann "Ann"',
        'team eng "Engineering"',
        '  person ann',
        'anchor kick date:2026-01-05',
        'label risky "Risky" style:hot',
        'size big duration:3w',
        'status blocked "Blocked"',
        'wave first "First"',
        'swimlane web "Web"',
        '  item a "A" duration:1w wave:first',
        'milestone ship "Ship" date:2026-03-01',
        'footnote fn "Note" on:a',
        '  description "Footnote text."',
        '',
    ].join('\n'),
};

export interface CorpusEntry {
    name: string;
    source: string;
}

/** Inline fixtures: the wave worked examples plus the shapes listed above. */
export function inlineFixtures(): CorpusEntry[] {
    const waves = Object.entries(waveFixtures)
        .filter(([key, value]) => /^EXAMPLE_/.test(key) && typeof value === 'string')
        .map(([key, value]) => ({ name: `wave-fixtures ${key}`, source: value as string }));
    const own = Object.entries(INLINE_FIXTURES).map(([name, source]) => ({
        name: `inline ${name}`,
        source,
    }));
    return [...waves, ...own];
}

/** Samples and inline fixtures, every one as a source string. */
export function corpus(): CorpusEntry[] {
    return [...samplePaths().map((p) => ({ name: p, source: readSample(p) })), ...inlineFixtures()];
}

/** Parse without validation: the walk runs on whatever the parser produced. */
export async function parseFile(source: string): Promise<NowlineFile> {
    return (await parse(source, { validate: false })).ast;
}
