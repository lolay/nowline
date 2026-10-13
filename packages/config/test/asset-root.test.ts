import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidRcValueError, resolveAssetRoot } from '../src/index.js';

// Absolute fixture paths: the resolver is pure, so nothing touches disk.
const ROOT = path.resolve('/work');
const OVERRIDE_BASE = path.join(ROOT, 'elsewhere');
const SOURCE_DIR = path.join(ROOT, 'project', 'docs');
const RC_PATH = path.join(ROOT, 'project', '.nowlinerc');

describe('resolveAssetRoot', () => {
    it('falls back to the default directory when neither override nor rc sets it', () => {
        expect(
            resolveAssetRoot({
                override: undefined,
                overrideBaseDir: OVERRIDE_BASE,
                rc: { config: {} },
                defaultDir: SOURCE_DIR,
            }),
        ).toEqual({ dir: SOURCE_DIR, source: 'default' });
    });

    it('resolves a relative rc assetRoot against the rc file directory', () => {
        expect(
            resolveAssetRoot({
                override: undefined,
                overrideBaseDir: OVERRIDE_BASE,
                rc: { config: { assetRoot: 'brand' }, path: RC_PATH },
                defaultDir: SOURCE_DIR,
            }),
        ).toEqual({ dir: path.join(ROOT, 'project', 'brand'), source: 'rc' });
    });

    it('keeps an absolute rc assetRoot as is', () => {
        const abs = path.join(ROOT, 'shared', 'assets');
        const r = resolveAssetRoot({
            override: undefined,
            overrideBaseDir: OVERRIDE_BASE,
            rc: { config: { assetRoot: abs }, path: RC_PATH },
            defaultDir: SOURCE_DIR,
        });
        expect(r.dir).toBe(abs);
    });

    it('an override wins over the rc and resolves against its own base', () => {
        expect(
            resolveAssetRoot({
                override: 'flag-assets',
                overrideBaseDir: OVERRIDE_BASE,
                rc: { config: { assetRoot: 'brand' }, path: RC_PATH },
                defaultDir: SOURCE_DIR,
            }),
        ).toEqual({ dir: path.join(OVERRIDE_BASE, 'flag-assets'), source: 'override' });
    });

    it('treats an empty override and an empty rc value as unset', () => {
        const r = resolveAssetRoot({
            override: '',
            overrideBaseDir: OVERRIDE_BASE,
            rc: { config: { assetRoot: '' }, path: RC_PATH },
            defaultDir: SOURCE_DIR,
        });
        expect(r).toEqual({ dir: SOURCE_DIR, source: 'default' });
    });

    it('a non-string rc assetRoot throws InvalidRcValueError naming the key', () => {
        const call = () =>
            resolveAssetRoot({
                override: undefined,
                overrideBaseDir: OVERRIDE_BASE,
                rc: { config: { assetRoot: 42 }, path: RC_PATH },
                defaultDir: SOURCE_DIR,
            });
        expect(call).toThrow(InvalidRcValueError);
        expect(call).toThrow('invalid .nowlinerc assetRoot "42". Expected a directory path.');
    });

    it('a valid override wins over an invalid rc assetRoot', () => {
        const r = resolveAssetRoot({
            override: 'flag-assets',
            overrideBaseDir: OVERRIDE_BASE,
            rc: { config: { assetRoot: 42 }, path: RC_PATH },
            defaultDir: SOURCE_DIR,
        });
        expect(r.source).toBe('override');
    });
});
