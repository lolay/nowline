// The Export… command and the preview's Save button go through the same
// option rules as the preview: one width rule (specs/surface-options.md §7,
// decision 4) and one asset-root chain, on the in-process and CLI paths alike.

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveExportAssetRoot, resolveExportWidth } from '../src/preview/option-resolver.js';

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

describe('resolveExportAssetRoot', () => {
    const rcPath = path.join(path.sep, 'proj', '.nowlinerc');

    it('uses the setting when it is set', () => {
        expect(resolveExportAssetRoot('/assets', { assetRoot: 'brand' }, rcPath)).toBe('/assets');
    });

    it('falls back to the rc assetRoot, relative to the rc file', () => {
        expect(resolveExportAssetRoot('', { assetRoot: 'brand' }, rcPath)).toBe(
            path.join(path.sep, 'proj', 'brand'),
        );
    });

    it('leaves the source directory to the caller when neither is set', () => {
        expect(resolveExportAssetRoot('', {}, undefined)).toBeUndefined();
    });
});
