import * as core from '@actions/core';

export type Mode = 'file' | 'markdown';
export type Format = 'svg' | 'png';
export type Theme = 'light' | 'dark';

export interface ActionInputs {
    mode: Mode;
    input?: string;
    output?: string;
    files: string;
    outputDir: string;
    format: Format;
    theme: Theme;
    cliVersion?: string;
    commit: boolean;
    commitMessage: string;
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

function readBoolean(name: string, fallback: boolean): boolean {
    const raw = core.getInput(name);
    if (raw === '') return fallback;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new Error(`${name} must be "true" or "false" (got "${raw}")`);
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
        cliVersion,
        commit: readBoolean('commit', false),
        commitMessage: core.getInput('commit-message') || 'render nowline diagrams [skip ci]',
    };
}
