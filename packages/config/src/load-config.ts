import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

/**
 * Shape of the `.nowlinerc` file consumed by the CLI today and (post-m3d)
 * by the VS Code/Cursor extension. Keys are intentionally optional — the
 * file is sparse and any key may be absent.
 */
export interface NowlineRc {
    quiet?: boolean;
    format?: string;
    theme?: string;
    defaultFormat?: string;
    width?: number;
    pdfPageSize?: string;
    pdfOrientation?: string;
    pdfMargin?: string;
    fontSans?: string;
    fontMono?: string;
    headlessFonts?: boolean;
    locale?: string;
    [key: string]: unknown;
}

export interface LoadConfigResult {
    config: NowlineRc;
    /** Absolute path of the rc file that was discovered, when present. */
    path?: string;
}

export interface LoadConfigOptions {
    readFile?: (absPath: string) => Promise<string>;
    fileExists?: (absPath: string) => Promise<boolean>;
    filename?: string;
    root?: string;
}

const CONFIG_FILENAME = '.nowlinerc';

/**
 * Walk up from `startDir` looking for `.nowlinerc`. Returns the parsed
 * config and the absolute path it came from, or an empty config when no
 * file is found before hitting the filesystem root.
 */
export async function loadConfig(
    startDir: string,
    options: LoadConfigOptions = {},
): Promise<LoadConfigResult> {
    const readFile = options.readFile ?? ((p) => fs.readFile(p, 'utf-8'));
    const fileExists = options.fileExists ?? defaultFileExists;
    const filename = options.filename ?? CONFIG_FILENAME;
    const root = options.root ? path.resolve(options.root) : path.parse(startDir).root;

    let dir = path.resolve(startDir);
    const rootAbs = path.resolve(root);

    while (true) {
        const candidate = path.join(dir, filename);
        if (await fileExists(candidate)) {
            const contents = await readFile(candidate);
            return { config: parseConfig(contents, candidate), path: candidate };
        }
        if (dir === rootAbs) break;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    return { config: {} };
}

export function parseConfig(contents: string, source: string): NowlineRc {
    const trimmed = contents.trim();
    if (trimmed === '') return {};
    const parsed = parseJsonOrYaml(trimmed, source);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(
            `Invalid ${path.basename(source)}: top-level must be an object (${source})`,
        );
    }
    return parsed as NowlineRc;
}

/**
 * Layer flag values on top of a parsed config. `undefined` flag values
 * leave the underlying config key untouched — useful for "missing CLI
 * flag" semantics. Returned object is a shallow merge.
 */
export function mergeConfig<T extends NowlineRc>(config: NowlineRc, flags: Partial<T>): T {
    const merged: NowlineRc = { ...config };
    for (const [key, value] of Object.entries(flags)) {
        if (value === undefined) continue;
        merged[key] = value as unknown;
    }
    return merged as T;
}

function parseJsonOrYaml(contents: string, source: string): unknown {
    if (contents.startsWith('{') || contents.startsWith('[')) {
        try {
            return JSON.parse(contents);
        } catch (err) {
            throw new Error(`Invalid JSON in ${source}: ${errMessage(err)}`);
        }
    }
    try {
        return yaml.load(contents, { filename: source });
    } catch (err) {
        throw new Error(`Invalid YAML in ${source}: ${errMessage(err)}`);
    }
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

async function defaultFileExists(absPath: string): Promise<boolean> {
    try {
        await fs.access(absPath);
        return true;
    } catch {
        return false;
    }
}
