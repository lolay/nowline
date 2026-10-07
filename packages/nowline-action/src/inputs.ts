import * as core from '@actions/core';

export type Mode = 'file' | 'markdown';
export type Format = 'svg' | 'png';
export type Theme = 'light' | 'dark';
/** A non-working display. Core and layout keep their own copies; the Action cannot depend on them. */
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
    if (raw !== 'light' && raw !== 'dark') {
        throw new Error(`theme must be "light" or "dark" (got "${raw}")`);
    }
    return raw;
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
