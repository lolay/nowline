import { normalizeThemeName, THEME_NAMES, type ThemeName } from '@nowline/layout';
import { CliError, ExitCode } from '../io/exit-codes.js';

/**
 * Validate a raw `--theme` value for the render and serve commands.
 *
 * Unset defaults to `light`. Matching is case-insensitive and `greyscale`
 * (UK) canonicalizes to `grayscale` (US). The accepted names come from
 * layout's `THEME_NAMES`, so a new theme needs no change here.
 */
export function parseThemeArg(raw: string | undefined): ThemeName {
    if (!raw) return 'light';
    const theme = normalizeThemeName(raw);
    if (!theme) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --theme "${raw}". Expected ${formatChoices(THEME_NAMES)}.`,
        );
    }
    return theme;
}

// `a`, `a or b`, `a, b, or c`.
function formatChoices(names: readonly string[]): string {
    if (names.length <= 2) return names.join(' or ');
    return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}
