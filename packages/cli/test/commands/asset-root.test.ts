import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAssetRoot } from '../../src/commands/render.js';
import { CliError, ExitCode } from '../../src/io/exit-codes.js';

// Absolute fixture paths: the resolver is pure, so nothing touches disk.
const ROOT = path.resolve('/work');
const CWD = path.join(ROOT, 'elsewhere');
const INPUT_DIR = path.join(ROOT, 'project', 'docs');
const RC_PATH = path.join(ROOT, 'project', '.nowlinerc');

describe('resolveAssetRoot', () => {
    it('defaults to the input directory when neither flag nor rc sets it', () => {
        expect(
            resolveAssetRoot({
                flag: undefined,
                cwd: CWD,
                rc: { config: {} },
                inputDir: INPUT_DIR,
            }),
        ).toEqual({ dir: INPUT_DIR, source: 'input directory' });
    });

    it('resolves a relative rc assetRoot against the rc file directory, not cwd', () => {
        const r = resolveAssetRoot({
            flag: undefined,
            cwd: CWD,
            rc: { config: { assetRoot: 'brand' }, path: RC_PATH },
            inputDir: INPUT_DIR,
        });
        expect(r).toEqual({
            dir: path.join(ROOT, 'project', 'brand'),
            source: '.nowlinerc assetRoot',
        });
    });

    it('keeps an absolute rc assetRoot as is', () => {
        const abs = path.join(ROOT, 'shared', 'assets');
        const r = resolveAssetRoot({
            flag: undefined,
            cwd: CWD,
            rc: { config: { assetRoot: abs }, path: RC_PATH },
            inputDir: INPUT_DIR,
        });
        expect(r.dir).toBe(abs);
    });

    it('--asset-root wins over the rc and resolves against cwd', () => {
        const r = resolveAssetRoot({
            flag: 'flag-assets',
            cwd: CWD,
            rc: { config: { assetRoot: 'brand' }, path: RC_PATH },
            inputDir: INPUT_DIR,
        });
        expect(r).toEqual({ dir: path.join(CWD, 'flag-assets'), source: '--asset-root' });
    });

    it('treats an empty rc assetRoot as unset', () => {
        const r = resolveAssetRoot({
            flag: undefined,
            cwd: CWD,
            rc: { config: { assetRoot: '' }, path: RC_PATH },
            inputDir: INPUT_DIR,
        });
        expect(r.dir).toBe(INPUT_DIR);
    });

    it('a non-string rc assetRoot is an input error naming .nowlinerc', () => {
        let caught: unknown;
        try {
            resolveAssetRoot({
                flag: undefined,
                cwd: CWD,
                rc: { config: { assetRoot: 42 }, path: RC_PATH },
                inputDir: INPUT_DIR,
            });
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(CliError);
        expect(caught).toMatchObject({
            exitCode: ExitCode.InputError,
            message: 'nowline: invalid .nowlinerc assetRoot "42". Expected a directory path.',
        });
    });

    it('a valid --asset-root wins over an invalid rc assetRoot', () => {
        const r = resolveAssetRoot({
            flag: 'flag-assets',
            cwd: CWD,
            rc: { config: { assetRoot: 42 }, path: RC_PATH },
            inputDir: INPUT_DIR,
        });
        expect(r.source).toBe('--asset-root');
    });
});
