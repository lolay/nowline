#!/usr/bin/env node
import { parseArgv } from './cli/args.js';
import { renderHelp, renderVersion } from './cli/help.js';
import { renderHandler } from './commands/render.js';
import { serveHandler } from './commands/serve.js';
import { initHandler } from './commands/init.js';
import { CliError, ExitCode } from './io/exit-codes.js';

async function run(): Promise<number> {
    const argv = process.argv.slice(2);

    let parsed;
    try {
        parsed = parseArgv(argv);
    } catch (err) {
        return handleError(err);
    }

    if (parsed.mode === 'help') {
        process.stdout.write(renderHelp());
        return ExitCode.Success;
    }
    if (parsed.mode === 'version') {
        process.stdout.write(renderVersion());
        return ExitCode.Success;
    }

    try {
        if (parsed.mode === 'init') {
            await initHandler({ args: parsed });
        } else if (parsed.mode === 'serve') {
            await serveHandler({ args: parsed });
        } else {
            await renderHandler({ args: parsed });
        }
        return ExitCode.Success;
    } catch (err) {
        return handleError(err);
    }
}

function handleError(err: unknown): number {
    if (err instanceof CliError) {
        if (err.message) process.stderr.write(`${err.message}\n`);
        return err.exitCode;
    }
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`${message}\n`);
    return ExitCode.ValidationError;
}

run()
    .then((code) => {
        process.exit(code);
    })
    .catch((err: unknown) => {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(`${message}\n`);
        process.exit(ExitCode.ValidationError);
    });
