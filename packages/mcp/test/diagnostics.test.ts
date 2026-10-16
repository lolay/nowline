// Routed include-resolver diagnostics as MCP diagnostics: the location comes
// from the diagnostic's range when it has one, so it matches the validator's.

import { type ResolveDiagnostic, tr } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { resolveDiagnosticToMcp } from '../src/diagnostics.js';

describe('resolveDiagnosticToMcp', () => {
    const args = { key: 'after', value: 'launch' };
    const diag: ResolveDiagnostic = {
        severity: 'error',
        message: tr('en-US', 'NL.E0302', args),
        sourcePath: '/root/child.nowline',
        line: 7,
        code: 'NL.E0302',
        args: [args],
    };

    it('takes the line and column from the range', () => {
        const range = { start: { line: 7, character: 40 }, end: { line: 7, character: 52 } };
        expect(resolveDiagnosticToMcp({ ...diag, range })).toMatchObject({
            file: '/root/child.nowline',
            line: 8,
            column: 41,
            code: 'NL.E0302',
        });
    });

    it('falls back to column 1 on the line without a range', () => {
        expect(resolveDiagnosticToMcp(diag)).toMatchObject({ line: 8, column: 1 });
    });
});
