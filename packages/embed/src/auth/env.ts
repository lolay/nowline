/**
 * Build-time environment helpers for `@nowline/embed`.
 *
 * `__NOWLINE_EMBED_ENV__` is substituted at bundle time by esbuild's
 * `define` (see `packages/embed/scripts/bundle.mjs`). The substitution
 * lets the prod minified bundle dead-code-eliminate the dev auth gate
 * and its Firebase imports — when the constant folds to the literal
 * string `"prod"`, every `IS_DEV` branch becomes `false` and esbuild's
 * minifier strips the dynamic-import site that pulls in `firebase/app`
 * + `firebase/auth`.
 *
 * The `typeof` guards keep this module safe to import under vitest,
 * where esbuild's define never runs and the identifier is undeclared.
 */

declare const __NOWLINE_EMBED_ENV__: string;
declare const __NOWLINE_EMBED_VERSION__: string;
declare const __NOWLINE_EMBED_SHA__: string;

export type EmbedEnv = 'dev' | 'prod';

export const EMBED_ENV: EmbedEnv =
    typeof __NOWLINE_EMBED_ENV__ !== 'undefined' && __NOWLINE_EMBED_ENV__ === 'dev'
        ? 'dev'
        : 'prod';

export const IS_DEV: boolean = EMBED_ENV === 'dev';
export const IS_PROD: boolean = EMBED_ENV === 'prod';

export const EMBED_VERSION: string =
    typeof __NOWLINE_EMBED_VERSION__ !== 'undefined' ? __NOWLINE_EMBED_VERSION__ : '0.0.0';

export const EMBED_SHA: string =
    typeof __NOWLINE_EMBED_SHA__ !== 'undefined' ? __NOWLINE_EMBED_SHA__ : 'unknown';

export const PROD_ORIGIN = 'https://embed.nowline.io';
export const DEV_ORIGIN = 'https://embed.nowline.dev';

export const PROD_SHARE_BASE = 'https://free.nowline.io/open';
export const DEV_SHARE_BASE = 'https://free.nowline.dev/open';
export const DEFAULT_SHARE_BASE = IS_DEV ? DEV_SHARE_BASE : PROD_SHARE_BASE;
