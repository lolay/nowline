import * as path from 'node:path';
import type { NowlineRc } from './load-config.js';

/** An rc key holds a value of the wrong type. The message names the key. */
export class InvalidRcValueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidRcValueError';
    }
}

export interface AssetRootInputs {
    /** Explicit override: the CLI's `--asset-root`, or the editor's setting. */
    override: string | undefined;
    /** Directory a relative override resolves against (cwd for the CLI). */
    overrideBaseDir: string;
    /** The discovered `.nowlinerc`, with the absolute path it came from. */
    rc: { config: NowlineRc | null; path?: string };
    /** Root when neither override nor rc sets one: the input file's directory. */
    defaultDir: string;
}

export interface ResolvedAssetRoot {
    /** Absolute directory assets resolve against. */
    dir: string;
    source: 'override' | 'rc' | 'default';
}

/**
 * Resolve the asset root: the override, then the `.nowlinerc` `assetRoot`,
 * then `defaultDir`. Empty values count as unset. A relative rc value
 * resolves against the rc file's directory, never the caller's cwd or
 * workspace, so the CLI and the editor read the same rc the same way.
 */
export function resolveAssetRoot(inputs: AssetRootInputs): ResolvedAssetRoot {
    const { override, overrideBaseDir, rc, defaultDir } = inputs;
    if (override) return { dir: path.resolve(overrideBaseDir, override), source: 'override' };
    const raw = rc.config?.assetRoot as unknown;
    if (raw !== undefined && raw !== null && raw !== '' && rc.path) {
        if (typeof raw !== 'string') {
            throw new InvalidRcValueError(
                `invalid .nowlinerc assetRoot "${String(raw)}". Expected a directory path.`,
            );
        }
        return { dir: path.resolve(path.dirname(rc.path), raw), source: 'rc' };
    }
    return { dir: path.resolve(defaultDir), source: 'default' };
}
