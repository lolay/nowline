// adaptResolveDiagnostic: a routed resolver diagnostic's range sets the column
// and span; without one, the span covers the line's text.

import { type ResolveDiagnostic, tr } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { adaptResolveDiagnostic } from '../../src/diagnostics/adapt.js';

const args = { key: 'after', value: 'launch' };
const diag: ResolveDiagnostic = {
    severity: 'error',
    message: tr('en-US', 'NL.E0302', args),
    sourcePath: '/root/child.nowline',
    line: 1,
    code: 'NL.E0302',
    args: [args],
};
const contents = 'swimlane p "P"\n  item alpha duration:3w after:launch  \n';

describe('adaptResolveDiagnostic', () => {
    it('uses the range for the column and span when there is one', () => {
        const range = { start: { line: 1, character: 25 }, end: { line: 1, character: 37 } };
        const d = adaptResolveDiagnostic({ ...diag, range }, 'child.nowline', contents);
        expect([d.line, d.column]).toEqual([2, 26]);
        expect(d.span).toEqual({ start: { line: 2, column: 26 }, end: { line: 2, column: 38 } });
        expect(d.data).toEqual({ code: 'NL.E0302', args: [args] });
    });

    it("falls back to the line's text without a range", () => {
        const d = adaptResolveDiagnostic(diag, 'child.nowline', contents);
        expect([d.line, d.column]).toEqual([2, 3]);
        expect(d.span).toEqual({ start: { line: 2, column: 3 }, end: { line: 2, column: 38 } });
    });

    it('has no span without a range or the file text', () => {
        expect(adaptResolveDiagnostic(diag, 'child.nowline').span).toBeUndefined();
    });
});
