import type { RunResult } from './inputs.js';

export interface ActionOutputs {
    rendered: string;
    failed: string;
    'changed-files': string;
    changed: 'true' | 'false';
}

/** The action's outputs as the strings `core.setOutput` receives. */
export function buildOutputs(result: RunResult): ActionOutputs {
    return {
        rendered: String(result.rendered),
        failed: String(result.failed),
        'changed-files': result.changedFiles.join('\n'),
        changed: result.changedFiles.length > 0 ? 'true' : 'false',
    };
}
