// Share-link generation for the "Share on Nowline" anchor that the
// auto-scan loop appends after each rendered SVG, and that the MCP
// render/export tools return as a `shareUrl`.
//
// Single source of truth for the share-link grammar (normative — defined
// in specs/embed.md):
//   #text=base64url(zlib(utf8(source)))
//   #url=<https-url>
//
// zlib = RFC 1950 via fflate zlibSync (byte-compatible with native
// CompressionStream('deflate')); base64url strips padding and maps
// +→- /→_.
//
// Sync, single code path, works in every browser and in Node — no
// feature-detect, no runtime branch. This is the leaf both @nowline/embed
// and @nowline/mcp import so the encoder never forks.

import { zlibSync } from 'fflate';

export const DEFAULT_SHARE_BASE = 'https://free.nowline.io/open';

/**
 * The `share` initialize option selects where share links point.
 *
 * - `true` — use DEFAULT_SHARE_BASE (the default).
 * - `string` — a base URL with optional path; built via the URL API so
 *   `https://foo.com/open` → `https://foo.com/open#text=…`.
 * - `false` / `'none'` — disable the share anchor entirely.
 * - `{ textUrl, remoteUrl }` — escape hatch for non-hash URL shapes;
 *   `{text}` substituted with the base64url payload, `{url}` with the
 *   percent-encoded source URL.
 */
export type ShareOption = boolean | 'none' | string | { textUrl: string; remoteUrl: string };

/**
 * Encode source text → `#text=<base64url(zlib(utf8(source)))>`.
 *
 * The return value includes the `#text=` key so callers can use it
 * directly as a URL fragment.
 *
 * Sync, single code path, no feature-detect.
 */
export function encodeText(source: string): string {
    return `#text=${_encodePayload(source)}`;
}

/** base64url(zlib(utf8(source))) without the `#text=` prefix. */
function _encodePayload(source: string): string {
    const bytes = new TextEncoder().encode(source);
    const compressed = zlibSync(bytes);
    // Convert Uint8Array to binary string for btoa. Chunked to avoid
    // call-stack limits on large payloads.
    const chunk = 0x8000; // 32 KB — safe below JS engine stack limits
    let bin = '';
    for (let i = 0; i < compressed.length; i += chunk) {
        bin += String.fromCharCode(...compressed.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface BuildShareLinkOptions {
    /** The roadmap source text (used to build the #text= fragment). */
    source: string;
    /**
     * Resolved source URL for the block (per-block → global → undefined).
     * Only `https:` URLs are emitted as `#url=`; anything else falls
     * back to the inline `#text=` encoding.
     */
    sourceUrl?: string | undefined;
    /** The `share` option from InitializeOptions. */
    share: ShareOption;
}

/**
 * Build the full "Share on Nowline" URL for a rendered block.
 *
 * Returns `null` when `share` is `false` or `'none'`, signalling that
 * no anchor should be rendered.
 */
export function buildShareLink({ source, sourceUrl, share }: BuildShareLinkOptions): string | null {
    if (share === false || share === 'none') {
        return null;
    }

    if (typeof share === 'object') {
        // Template mode: { textUrl, remoteUrl }
        if (sourceUrl !== undefined && _isHttps(sourceUrl)) {
            return share.remoteUrl.replace('{url}', encodeURIComponent(sourceUrl));
        }
        return share.textUrl.replace('{text}', _encodePayload(source));
    }

    // share === true → DEFAULT_SHARE_BASE; share is a string → custom base URL
    const base = share === true ? DEFAULT_SHARE_BASE : share;
    const url = new URL(base);

    if (sourceUrl !== undefined && _isHttps(sourceUrl)) {
        url.hash = `url=${encodeURIComponent(sourceUrl)}`;
    } else {
        url.hash = `text=${_encodePayload(source)}`;
    }

    return url.toString();
}

function _isHttps(url: string): boolean {
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}
