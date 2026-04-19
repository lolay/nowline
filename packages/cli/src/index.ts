#!/usr/bin/env node
import { defineCommand, runCommand, showUsage } from 'citty';
import { versionCommand } from './commands/version.js';
import { validateCommand } from './commands/validate.js';
import { convertCommand } from './commands/convert.js';
import { initCommand } from './commands/init.js';
import { CLI_VERSION } from './version.js';
import { CliError, ExitCode } from './io/exit-codes.js';

const main = defineCommand({
    meta: {
        name: 'nowline',
        version: CLI_VERSION,
        description: 'Parse, validate, and convert .nowline roadmap files',
    },
    subCommands: {
        version: versionCommand,
        validate: validateCommand,
        convert: convertCommand,
        init: initCommand,
    },
});

// We intentionally bypass citty's runMain because it unconditionally calls
// process.exit(1) on any thrown error, which clobbers our standardized exit
// codes (see io/exit-codes.ts). This wrapper replicates runMain's --help and
// --version handling, then routes thrown CliError instances to the exit code
// they carry.
async function run(): Promise<number> {
    const rawArgs = process.argv.slice(2);
    const helpFlags = ['--help', '-h'];
    const versionFlags = ['--version', '-v'];

    if (rawArgs.some((arg) => helpFlags.includes(arg))) {
        await showUsage(main);
        return ExitCode.Success;
    }
    if (rawArgs.length === 1 && versionFlags.includes(rawArgs[0])) {
        process.stdout.write(`${CLI_VERSION}\n`);
        return ExitCode.Success;
    }

    try {
        await runCommand(main, { rawArgs });
        return ExitCode.Success;
    } catch (err: unknown) {
        if (err instanceof CliError) {
            if (err.message) process.stderr.write(`${err.message}\n`);
            return err.exitCode;
        }
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(`${message}\n`);
        return ExitCode.ValidationError;
    }
}

run().then((code) => {
    process.exit(code);
}).catch((err: unknown) => {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(ExitCode.ValidationError);
});
