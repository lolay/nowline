import * as core from '@actions/core';

import { ensureCli, renderOnce } from './cli.js';
import type { ActionInputs, RunResult } from './inputs.js';

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
        await renderOnce({
            input: inputs.input,
            output: inputs.output,
            format: inputs.format,
            theme: inputs.theme,
        });
        rendered = 1;
        changedFiles.push(inputs.output);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        core.error(`failed to render ${inputs.input}: ${message}`);
        failed = 1;
    }

    return { rendered, failed, changedFiles };
}
