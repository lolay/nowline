// The Export… command and the preview's Save button read
// `nowline.export.width` through the shared width rule
// (specs/surface-options.md §7, decision 4), on the in-process and CLI paths
// alike. The other options are the preview's; see export-matches-preview.

import { describe, expect, it } from 'vitest';
import { resolveExportWidth } from '../src/preview/option-resolver.js';

describe('resolveExportWidth', () => {
    it('treats 0 as unset so the canvas fits its content', () => {
        expect(resolveExportWidth(0)).toBeUndefined();
    });

    it('passes a width the shared rule accepts', () => {
        expect(resolveExportWidth(320)).toBe(320);
        expect(resolveExportWidth(1200)).toBe(1200);
    });

    it('rejects a width under 320 or not an integer, naming the setting', () => {
        for (const bad of [100, -5, 640.5]) {
            expect(() => resolveExportWidth(bad)).toThrow(
                `Invalid nowline.export.width "${bad}": must be an integer ≥ 320.`,
            );
        }
    });
});
