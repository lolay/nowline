import * as core from '@actions/core';

import { ensureCli } from './cli.js';
import { type ActionInputs, type RunResult, renderOptions } from './inputs.js';
import { renderIfChanged } from './render-if-changed.js';

export async function runFileMode(inputs: ActionInputs): Promise<RunResult> {
    if (!inputs.input || !inputs.output) {
        throw new Error('file mode requires both "input" and "output" inputs');
    }

    await ensureCli(inputs.cliVersion);

    let rendered = 0;
    let failed = 0;
    const changedFiles: string[] = [];

    try {
        core.info(`rendering ${inputs.input} -> ${inputs.output}`);
        const changed = await renderIfChanged({
            ...renderOptions(inputs),
            input: inputs.input,
            output: inputs.output,
        });
        rendered = 1;
        if (changed) {
            changedFiles.push(inputs.output);
        } else {
            core.info(`${inputs.output} unchanged`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        core.error(`failed to render ${inputs.input}: ${message}`);
        failed = 1;
    }

    return { rendered, failed, changedFiles };
}
