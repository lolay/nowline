import { describe, expect, it } from 'vitest';

import { buildOutputs } from '../src/outputs.js';

describe('buildOutputs', () => {
    it('reports changed when any file changed', () => {
        expect(buildOutputs({ rendered: 2, failed: 0, changedFiles: ['a.svg', 'b.md'] })).toEqual({
            rendered: '2',
            failed: '0',
            'changed-files': 'a.svg\nb.md',
            changed: 'true',
        });
    });

    it('reports unchanged when nothing changed', () => {
        expect(buildOutputs({ rendered: 1, failed: 0, changedFiles: [] })).toEqual({
            rendered: '1',
            failed: '0',
            'changed-files': '',
            changed: 'false',
        });
    });
});
