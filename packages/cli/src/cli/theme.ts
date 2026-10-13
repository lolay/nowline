import { type OptionLayer, resolveOptions, SURFACE_OPTION_SPECS } from '@nowline/config';
import type { ThemeName } from '@nowline/layout';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { formatOptionError } from './options.js';

const THEME_SPECS = { theme: SURFACE_OPTION_SPECS.theme };

/**
 * Resolve the theme for the serve command with the CLI's usual precedence:
 * the `--theme` flag, then the `.nowlinerc` `theme` key, then `light`. Both
 * go through the shared options schema, so matching is case-insensitive and
 * `greyscale` (UK) canonicalizes to `grayscale` (US); an unrecognized value
 * is an input error that names the flag or the rc key it came from. An empty
 * flag counts as not passed. (`render` resolves every option at once through
 * `resolveCliOptions`.)
 */
export function resolveTheme(flag: string | undefined, rcValue: unknown): ThemeName {
    const layers: OptionLayer<'theme'>[] = [
        { source: () => ({ kind: 'flag', name: '--theme' }), values: { theme: flag || undefined } },
        { source: () => ({ kind: 'rc', key: 'theme' }), values: { theme: rcValue } },
    ];
    const { values, errors } = resolveOptions(THEME_SPECS, layers);
    if (errors[0]) throw new CliError(ExitCode.InputError, formatOptionError(errors[0]));
    return values.theme ?? 'light';
}
