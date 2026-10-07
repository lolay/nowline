import * as core from '@actions/core';
import * as exec from '@actions/exec';

import { ACTION_VERSION } from './version.js';

/**
 * Ensure `nowline` is on PATH at the requested version.
 *
 * If `nowline version` already prints the requested version, skip the install
 * (saves the 5-10s cold-start hit on every run). Otherwise `npm install -g
 * @nowline/cli@<version>`.
 *
 * The CLI's version output is the SemVer string (e.g. `0.2.0`) for releases or
 * `0.2.0+abc1234[.dirty]` for dev builds. Substring match against the SemVer
 * is sufficient.
 */
export async function ensureCli(requestedVersion?: string): Promise<string> {
    const version = requestedVersion ?? ACTION_VERSION;

    if (await isCliAtVersion(version)) {
        core.debug(`@nowline/cli ${version} already on PATH; skipping install`);
        return version;
    }

    core.info(`installing @nowline/cli@${version}`);
    await exec.exec('npm', ['install', '-g', `@nowline/cli@${version}`]);
    return version;
}

async function isCliAtVersion(version: string): Promise<boolean> {
    try {
        const result = await exec.getExecOutput('nowline', ['--version'], {
            silent: true,
            ignoreReturnCode: true,
        });
        return result.exitCode === 0 && result.stdout.includes(version);
    } catch {
        return false;
    }
}

export interface RenderArgs {
    input: string;
    output: string;
    format: 'svg' | 'png';
    theme: 'light' | 'dark';
    /** Undefined leaves `--non-working` off, so the file's own key applies. */
    nonWorking?: 'hide' | 'show';
}

/**
 * The argument list for `nowline <input> -o <output> -f <format> -t <theme>`,
 * plus `--non-working <mode>` only when it is set. A CLI older than the
 * display option rejects an unknown flag, so an unset input must not mention
 * it. Pure, so it is unit-testable without running the CLI.
 */
export function buildRenderArgs(args: RenderArgs): string[] {
    const argv = [args.input, '-o', args.output, '-f', args.format, '-t', args.theme];
    if (args.nonWorking) argv.push('--non-working', args.nonWorking);
    return argv;
}

/**
 * Run `nowline` with the arguments from {@link buildRenderArgs}.
 *
 * Throws if the CLI exits non-zero. Stdout / stderr stream into the GitHub
 * Actions log via `@actions/exec`'s default behaviour.
 */
export async function renderOnce(args: RenderArgs): Promise<void> {
    await exec.exec('nowline', buildRenderArgs(args));
}
