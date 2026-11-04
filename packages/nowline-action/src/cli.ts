import * as os from 'node:os';
import * as path from 'node:path';

import * as core from '@actions/core';
import * as exec from '@actions/exec';

import type { Theme } from './inputs.js';
import { ACTION_VERSION } from './version.js';

/**
 * Ensure `nowline` is on PATH at the requested version.
 *
 * If `nowline --version` already prints the requested version, skip the
 * install (saves the 5-10s cold-start hit on every run). Otherwise install
 * `@nowline/cli@<version>` into a prefix under `$RUNNER_TEMP` and add its
 * `node_modules/.bin` to PATH, for this step and (via `GITHUB_PATH`) later
 * ones.
 *
 * Not `npm install -g`: on a runner without `actions/setup-node` the global
 * prefix is `/usr/local`, and npm links the CLI's man pages into
 * `/usr/local/share/man`, which the runner user can't write (#243). A local
 * install links no man pages and touches no system directory.
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

    const plan = cliInstallPlan(version, process.env.RUNNER_TEMP || os.tmpdir());
    core.info(`installing @nowline/cli@${version} into ${plan.prefix}`);
    await exec.exec('npm', plan.npmArgs);
    core.addPath(plan.binDir);
    return version;
}

export interface CliInstallPlan {
    /** The directory npm installs into; the CLI lands in its `node_modules`. */
    prefix: string;
    /** Where npm links the `nowline` bin; added to PATH after the install. */
    binDir: string;
    npmArgs: string[];
}

/**
 * Where and how {@link ensureCli} installs the CLI. Pure, so it is
 * unit-testable without running npm.
 */
export function cliInstallPlan(version: string, runnerTemp: string): CliInstallPlan {
    const prefix = path.join(runnerTemp, 'nowline-cli', version);
    return {
        prefix,
        binDir: path.join(prefix, 'node_modules', '.bin'),
        npmArgs: [
            'install',
            '--prefix',
            prefix,
            '--no-audit',
            '--no-fund',
            `@nowline/cli@${version}`,
        ],
    };
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

/** Everything about a render except which file goes in and where it lands. */
export type RenderOptions = Omit<RenderArgs, 'input' | 'output'>;

export interface RenderArgs {
    input: string;
    output: string;
    format: 'svg' | 'png';
    theme: Theme;
    /** Undefined leaves `--non-working` off, so the file's own key applies. */
    nonWorking?: 'hide' | 'show';
    /** `-` or a date; undefined leaves `--now` off, so the CLI draws today. */
    now?: string;
    /** Appended last, so a repeated flag here wins (the CLI keeps the last value). */
    extraArgs?: readonly string[];
}

/**
 * The argument list for `nowline <input> -o <output> -f <format> -t <theme>`,
 * plus `--non-working <mode>` and `--now <date>` only when set, then any
 * extra arguments. A CLI older than the display option rejects an unknown
 * flag, so an unset input must not mention it. Pure, so it is unit-testable
 * without running the CLI.
 */
export function buildRenderArgs(args: RenderArgs): string[] {
    const argv = [args.input, '-o', args.output, '-f', args.format, '-t', args.theme];
    if (args.nonWorking) argv.push('--non-working', args.nonWorking);
    if (args.now) argv.push('--now', args.now);
    if (args.extraArgs) argv.push(...args.extraArgs);
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
