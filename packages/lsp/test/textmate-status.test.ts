// The TextMate grammar colors built-in status values on its own, without the
// language server, so its status pattern has to track the validator's
// vocabulary by hand. `BUILTIN_STATUSES` here is the LSP's mirror of the
// validator's set; `providers/completion.test.ts` fails if the two drift, and
// this test fails if the grammar drifts from the mirror.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_STATUSES } from '../src/references/ast-utils.js';

const GRAMMAR = fileURLToPath(
    new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url),
);

interface Pattern {
    name?: string;
    match?: string;
    patterns?: Pattern[];
}

/** Every pattern in the grammar, nested `patterns` included. */
function allPatterns(): Pattern[] {
    const grammar = JSON.parse(readFileSync(GRAMMAR, 'utf-8')) as {
        patterns: Pattern[];
        repository: Record<string, Pattern>;
    };
    const out: Pattern[] = [];
    const walk = (p: Pattern) => {
        out.push(p);
        for (const child of p.patterns ?? []) walk(child);
    };
    for (const p of grammar.patterns) walk(p);
    for (const p of Object.values(grammar.repository)) walk(p);
    return out;
}

function statusRegExp(): RegExp {
    const pattern = allPatterns().find((p) => p.name === 'constant.language.status.nowline');
    expect(pattern?.match).toBeDefined();
    return new RegExp(pattern!.match!);
}

describe('TextMate grammar: built-in statuses', () => {
    const re = statusRegExp();

    it('colors every built-in status the validator accepts, whole', () => {
        for (const status of BUILTIN_STATUSES) {
            expect(`status:${status}`.match(re)?.[0], status).toBe(status);
        }
    });

    it('does not color near-misses or longer ids that start with a status', () => {
        for (const value of [
            'activ',
            'inactive',
            'completed-ish',
            'done-ish',
            'pre-planned',
            'in_progress',
        ]) {
            expect(re.test(`status:${value}`), value).toBe(false);
        }
    });
});
