import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from '../helpers.js';

const repoRoot = new URL('../../../../', import.meta.url);

describe('example files', () => {
    for (const name of ['minimal', 'teams', 'product', 'continuation']) {
        it(`parses ${name}.nowline without errors`, async () => {
            const text = readFileSync(new URL(`examples/${name}.nowline`, repoRoot), 'utf-8');
            const { lexerErrors, parserErrors } = await parse(text, { validate: false });
            expect(lexerErrors, lexerErrors.join('\n')).toEqual([]);
            expect(parserErrors, parserErrors.join('\n')).toEqual([]);
        });
    }
});
