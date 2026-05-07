export { CLI_VERSION, CLI_BUILD, type CliBuild } from './generated/version.js';
import { CLI_VERSION, CLI_BUILD } from './generated/version.js';

/**
 * Compose the user-visible version string per SemVer build-metadata
 * rules. Released builds print just the SemVer (`0.1.0`); dev builds
 * append the short SHA (and `.dirty` if the working tree had local
 * edits when the binary was built):
 *
 *   release        -> 0.1.0
 *   dev (clean)    -> 0.1.0+abc1234
 *   dev (dirty)    -> 0.1.0+abc1234.dirty
 */
export function fullVersionString(): string {
    if (CLI_BUILD.isRelease || CLI_BUILD.sha === '') {
        return CLI_VERSION;
    }
    const dirty = CLI_BUILD.isDirty ? '.dirty' : '';
    return `${CLI_VERSION}+${CLI_BUILD.sha}${dirty}`;
}
