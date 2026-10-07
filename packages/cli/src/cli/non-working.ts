import { type NonWorkingDisplay, parseNonWorkingDisplay } from '@nowline/layout';
import { CliError, ExitCode } from '../io/exit-codes.js';

/**
 * Validate a raw `--non-working` value for the render and serve commands.
 *
 * Unset (or an empty string) stays `undefined`, so the file's
 * `default roadmap non-working:` key still applies; only an explicit
 * `hide` or `show` overrides it. Anything else is an input error.
 */
export function parseNonWorkingArg(raw: string | undefined): NonWorkingDisplay | undefined {
    try {
        return parseNonWorkingDisplay(raw);
    } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --non-working "${raw}". Expected hide or show.`,
        );
    }
}
