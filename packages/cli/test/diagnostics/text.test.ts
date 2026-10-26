// Text diagnostics print the message once: a coded message offers its own
// "did you mean" in the operator's locale, so the header adds no suffix.

import { tr } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { formatDiagnostics } from '../../src/diagnostics/format.js';
import type { CliDiagnostic } from '../../src/diagnostics/model.js';

const args = { key: 'statsu', entity: 'item "one"', suggested: 'status' };
const diag: CliDiagnostic = {
    file: 'r.nowline',
    line: 8,
    column: 40,
    severity: 'warning',
    code: 'NL.W0700',
    message: tr('en-US', 'NL.W0700', args),
    suggestion: 'status',
    data: { code: 'NL.W0700', args: [args] },
};

function text(d: CliDiagnostic, operatorLocale?: string, color = false): string {
    return formatDiagnostics([d], 'text', new Map(), { color, operatorLocale });
}

function count(haystack: string, needle: RegExp): number {
    return haystack.match(new RegExp(needle.source, 'gi'))?.length ?? 0;
}

describe('text diagnostics', () => {
    it('offers the suggestion once', () => {
        expect(text(diag)).toBe(`r.nowline:8:40 warning: ${diag.message}`);
        expect(count(text(diag), /did you mean/)).toBe(1);
    });

    it('offers it once in color too', () => {
        expect(count(text(diag, undefined, true), /did you mean/)).toBe(1);
    });

    it('keeps the suggestion in the operator locale', () => {
        const fr = text(diag, 'fr');
        expect(fr).toBe(`r.nowline:8:40 warning: ${tr('fr', 'NL.W0700', args)}`);
        expect(fr).not.toMatch(/did you mean/i);
        expect(count(fr, /Vouliez-vous dire/)).toBe(1);
    });

    it('offers an uncoded message suggestion once', () => {
        const legacy: CliDiagnostic = {
            ...diag,
            code: 'unknown-reference',
            message: 'Unknown reference "bulid". Did you mean "build"?',
            suggestion: 'build',
            data: undefined,
        };
        expect(text(legacy)).toBe(`r.nowline:8:40 warning: ${legacy.message}`);
    });
});
