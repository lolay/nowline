import * as core from '@actions/core';
import { normalizeThemeName, THEME_NAMES, type ThemeName } from '@nowline/layout';

export type Mode = 'file' | 'markdown';
export type Format = 'svg' | 'png';
export type Theme = ThemeName;
/** A non-working display. Duplicates layout's `NonWorkingDisplay`, which the Action could now import as it does themes. */
export type NonWorking = 'hide' | 'show';

export interface ActionInputs {
    mode: Mode;
    input?: string;
    output?: string;
    files: string;
    outputDir: string;
    format: Format;
    theme: Theme;
    /** Undefined when the input is empty, so the file's own key still applies. */
    nonWorking?: NonWorking;
    cliVersion?: string;
}

export interface RunResult {
    rendered: number;
    failed: number;
    changedFiles: string[];
}

function readMode(): Mode {
    const raw = core.getInput('mode') || 'file';
    if (raw !== 'file' && raw !== 'markdown') {
        throw new Error(`mode must be "file" or "markdown" (got "${raw}")`);
    }
    return raw;
}

function readFormat(): Format {
    const raw = core.getInput('format') || 'svg';
    if (raw !== 'svg' && raw !== 'png') {
        throw new Error(`format must be "svg" or "png" (got "${raw}")`);
    }
    return raw;
}

function readTheme(): Theme {
    const raw = core.getInput('theme') || 'light';
    // Layout's parser, bundled (tree-shaken to a few hundred bytes), so the
    // Action accepts exactly the themes the lock-step CLI renders.
    const theme = normalizeThemeName(raw);
    if (!theme) {
        const choices = THEME_NAMES.map((name) => `"${name}"`).join(', ');
        throw new Error(`theme must be one of ${choices} (got "${raw}")`);
    }
    return theme;
}

function readNonWorking(): NonWorking | undefined {
    const raw = core.getInput('non-working');
    if (raw === '') return undefined;
    if (raw !== 'hide' && raw !== 'show') {
        throw new Error(`non-working must be "hide" or "show" (got "${raw}")`);
    }
    return raw;
}

export function parseInputs(): ActionInputs {
    const mode = readMode();
    const input = core.getInput('input') || undefined;
    const output = core.getInput('output') || undefined;
    const files = core.getInput('files') || '**/*.md';
    const outputDir = core.getInput('output-dir') || '.nowline/';
    const cliVersion = core.getInput('cli-version') || undefined;

    if (mode === 'file') {
        if (!input) throw new Error('file mode requires the "input" input');
        if (!output) throw new Error('file mode requires the "output" input');
    }

    return {
        mode,
        input,
        output,
        files,
        outputDir,
        format: readFormat(),
        theme: readTheme(),
        nonWorking: readNonWorking(),
        cliVersion,
    };
}
