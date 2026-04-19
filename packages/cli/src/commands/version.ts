import { defineCommand } from 'citty';
import { CLI_VERSION } from '../version.js';

export const versionCommand = defineCommand({
    meta: {
        name: 'version',
        description: 'Print the nowline version and exit',
    },
    run() {
        process.stdout.write(`${CLI_VERSION}\n`);
    },
});
