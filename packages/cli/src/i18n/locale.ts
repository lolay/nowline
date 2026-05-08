import type { NowlineFile } from '@nowline/core';

// Resolve the operator-locale override from CLI flag, environment, and
// `.nowlinerc`. See `specs/localization.md` for the two-chain model.
//
// Operator locale governs CLI message output: validator diagnostics on
// stderr, `--help`, format errors, verbose logs. It is independent from
// the file's `locale:` directive, which governs the rendered artifact.
//
// Returns the resolved tag plus the source it came from, so verbose
// logging can describe the chain without re-walking it.

const ENV_VARS = ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const;
type EnvVar = (typeof ENV_VARS)[number];

export type LocaleSource = 'flag' | 'env' | 'rc';

export interface ResolvedLocale {
    /** BCP-47 tag, or undefined when no source produced one. */
    tag: string | undefined;
    /** Which input chain produced `tag`. Undefined iff `tag` is undefined. */
    source: LocaleSource | undefined;
    /** When `source === 'env'`, the specific variable that contributed. */
    envVar?: EnvVar;
}

export interface ResolveLocaleInputs {
    /** Value of the `--locale` flag, or undefined. */
    flag: string | undefined;
    /** Process environment, parameterized for testability. */
    env: NodeJS.ProcessEnv;
    /** Optional `.nowlinerc` `locale` key. Slots below env vars. */
    rc?: string | undefined;
}

/**
 * Resolve the operator's locale override.
 *
 * Precedence (highest wins): `--locale` flag > env vars > `.nowlinerc`.
 * POSIX `C` / `POSIX` env values mean "no localization" and are skipped.
 *
 * Returns `{ tag: undefined, source: undefined }` when nothing is set —
 * `operatorLocale` then defaults to `en-US`, while the layout's content
 * chain falls back to whatever the file's `locale:` directive declares.
 */
export function resolveLocaleOverride({ flag, env, rc }: ResolveLocaleInputs): ResolvedLocale {
    if (flag) return { tag: flag, source: 'flag' };
    for (const name of ENV_VARS) {
        const raw = env[name];
        if (!raw) continue;
        const stripped = stripPosixSuffix(raw);
        if (!stripped || stripped === 'C' || stripped === 'POSIX') {
            // POSIX `C` / `POSIX` locale means "no localization." Skip and
            // let the next env var or the rc file take over.
            continue;
        }
        return { tag: normalizePosixToBcp47(stripped), source: 'env', envVar: name };
    }
    if (rc) return { tag: rc, source: 'rc' };
    return { tag: undefined, source: undefined };
}

/**
 * Resolve the operator-facing locale used to format CLI message output.
 * `en-US` when the operator has no signal in the environment.
 */
export function operatorLocale(resolved: ResolvedLocale): string {
    return resolved.tag ?? 'en-US';
}

/**
 * Describe which locale governs the rendered artifact and where the
 * value came from. Used by the `--verbose` log line so an operator can
 * see at a glance whether the file or the operator chain is winning.
 *
 * Precedence mirrors the layout's `resolveLocale`:
 *   file directive > CLI flag > env > `.nowlinerc` > en-US (default).
 */
export function describeContentLocaleSource(
    directive: string | undefined,
    resolved: ResolvedLocale,
): { tag: string; source: string } {
    if (directive) return { tag: directive, source: 'from file directive' };
    if (resolved.tag === undefined) return { tag: 'en-US', source: 'default' };
    switch (resolved.source) {
        case 'flag':
            return { tag: resolved.tag, source: 'from --locale' };
        case 'env':
            return { tag: resolved.tag, source: `from ${resolved.envVar} env var` };
        case 'rc':
            return { tag: resolved.tag, source: 'from .nowlinerc' };
        default:
            return { tag: resolved.tag, source: 'from operator chain' };
    }
}

/**
 * Read the optional `locale:` property from a parsed file's
 * `nowline v1` directive. Returns undefined when the directive is
 * absent, malformed, or omits the property.
 */
export function readDirectiveLocale(file: NowlineFile | undefined): string | undefined {
    const prop = file?.directive?.properties.find((p) => stripColon(p.key) === 'locale');
    return prop?.value || undefined;
}

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

/**
 * POSIX `LANG` values look like `en_US.UTF-8` or `fr_CA@euro`. Strip
 * everything from `.` or `@` onward — Nowline only cares about the
 * language and region.
 */
function stripPosixSuffix(value: string): string {
    const dot = value.indexOf('.');
    const at = value.indexOf('@');
    let end = value.length;
    if (dot !== -1 && dot < end) end = dot;
    if (at !== -1 && at < end) end = at;
    return value.slice(0, end).trim();
}

/**
 * Normalize `fr_CA` to `fr-CA`. POSIX uses `_`; BCP-47 uses `-`.
 * Casing follows BCP-47 conventions: language lowercase, region
 * uppercase 2-letter, but the layout's BCP-47 walker normalizes again
 * defensively, so this is best-effort.
 */
function normalizePosixToBcp47(value: string): string {
    return value.replace('_', '-');
}
