import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARGV_OPTIONS } from '../../src/cli/args.js';
import { renderHelp } from '../../src/cli/help.js';
import { packageRoot } from '../helpers.js';

// Drift gate (r1.f20): every flag the parser accepts is documented in `--help`
// and in `nowline.1`. `--template` shipped in neither. The French page follows
// `nowline.1` through translation-parity.test.ts.

const flags = Object.keys(ARGV_OPTIONS);
const manPage = readFileSync(path.join(packageRoot, 'man', 'nowline.1'), 'utf-8');

describe('flag documentation', () => {
    it.each(flags)('--help documents --%s', (flag) => {
        expect(renderHelp()).toMatch(new RegExp(`--${flag}(?![\\w-])`));
    });

    it.each(flags)('nowline.1 documents --%s', (flag) => {
        expect(manPage).toMatch(new RegExp(`\\bFl (?:\\w , )?-${flag}(?![\\w-])`));
    });
});
