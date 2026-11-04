import * as core from '@actions/core';
import { normalizeThemeName, resolveToday, THEME_NAMES, type ThemeName } from '@nowline/layout';

import type { RenderOptions } from './cli.js';
import { splitArgs } from './split-args.js';

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
    /** `-` or a date for `--now`; undefined leaves the CLI default (today). */
    now?: string;
    /** Extra CLI arguments, appended after every flag the Action sets. */
    extraArgs: readonly string[];
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

function readNow(): string | undefined {
    const raw = core.getInput('now');
    if (raw === '') return undefined;
    // Layout's parser, the one the CLI's `--now` uses, so the Action accepts
    // exactly what the CLI does and a typo fails here, not mid-render.
    if (raw === '-' || resolveToday({ now: raw })) return raw;
    throw new Error(
        `now must be "-" or a date like 2026-01-15 or 2026-01-15T09:00:00Z (got "${raw}")`,
    );
}

/** The render options every CLI call in a run shares. */
export function renderOptions(inputs: ActionInputs): RenderOptions {
    return {
        format: inputs.format,
        theme: inputs.theme,
        nonWorking: inputs.nonWorking,
        now: inputs.now,
        extraArgs: inputs.extraArgs,
    };
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
        now: readNow(),
        extraArgs: splitArgs(core.getInput('args')),
        cliVersion,
    };
}
