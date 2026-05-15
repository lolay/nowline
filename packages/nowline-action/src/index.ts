import * as core from '@actions/core';

import { runFileMode } from './file-mode.js';
import { parseInputs } from './inputs.js';
import { runMarkdownMode } from './markdown-mode.js';

async function main(): Promise<void> {
    try {
        const inputs = parseInputs();
        const result = inputs.mode === 'markdown' ? await runMarkdownMode(inputs) : await runFileMode(inputs);

        core.setOutput('rendered', String(result.rendered));
        core.setOutput('failed', String(result.failed));
        core.setOutput('changed-files', result.changedFiles.join('\n'));

        if (result.failed > 0) {
            core.setFailed(`${result.failed} diagram${result.failed === 1 ? '' : 's'} failed to render`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        core.setFailed(`nowline-action: ${message}`);
    }
}

void main();
