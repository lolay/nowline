// Resolves the --root argument into a real absolute path.
//
// Claude Desktop's .mcpb variable substitution is single-pass: a `user_config`
// default like "${HOME}/Downloads" can reach the server with `${HOME}` still
// unexpanded when the user installs the bundle without opening the directory
// picker (the optional field's raw default is used verbatim for the
// `${user_config.*}` substitution, and the nested token is never re-expanded).
// To stay robust regardless of host behavior we expand the mcpb special tokens,
// a leading `~`, and generic environment variables here.
//
// Spec: specs/mcp.md ".mcpb bundle packaging".

import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/**
 * Expands `--root` into an absolute path, or returns `undefined` when no
 * usable root was provided (undefined or empty — e.g. an optional `.mcpb`
 * directory field left blank, which the host passes as an empty string).
 *
 * Handled tokens:
 * - mcpb specials: `${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`, `${DOWNLOADS}`,
 *   `${pathSeparator}`, `${/}`
 * - generic environment variables: `${NAME}` / `$NAME` (uppercase)
 * - a leading `~` / `~/`
 */
export function expandRootPath(raw: string | undefined): string | undefined {
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;

    const home = homedir();
    const specials: Record<string, string> = {
        HOME: home,
        DESKTOP: join(home, 'Desktop'),
        DOCUMENTS: join(home, 'Documents'),
        DOWNLOADS: join(home, 'Downloads'),
    };

    let out = trimmed;

    // mcpb path-separator tokens.
    out = out.replace(/\$\{pathSeparator\}/g, sep).replace(/\$\{\/\}/g, sep);

    // ${NAME} / $NAME — mcpb special dirs first, then generic env vars.
    out = out.replace(
        /\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g,
        (match, braced: string | undefined, bare: string | undefined) => {
            const name = braced ?? bare ?? '';
            if (name in specials) return specials[name];
            const env = process.env[name];
            return env !== undefined ? env : match;
        },
    );

    // Leading ~ / ~/.
    if (out === '~') {
        out = home;
    } else if (out.startsWith('~/') || out.startsWith(`~${sep}`)) {
        out = join(home, out.slice(2));
    }

    return resolve(out);
}
