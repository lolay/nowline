// Pre-layout logo loading (specs/rendering.md § Company Logo Error Handling).
//
// Pipelines call `loadLogo` before layout so layout can size the logo slot
// from the asset's intrinsic aspect ratio. Every failure is a warning, never
// a throw: the caller decides whether `--strict` turns it into an error, and
// a failed load lays out as if no logo were declared.

import type { LogoDimensions } from '@nowline/layout';
import { type RasterLogoMime, rasterSize } from './image-size.js';
import type { AssetResolver } from './svg/render.js';
import { svgIntrinsicSize } from './svg/sanitize.js';

const LOGO_MIME_BY_EXTENSION: Record<string, 'image/svg+xml' | RasterLogoMime> = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
};

function extensionOf(ref: string): string {
    const base = ref.slice(ref.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/**
 * Load the `logo:` asset and read its intrinsic size, to pass to layout as
 * `LayoutOptions.logo`. Returns undefined, after a `warn` call, when the
 * extension is unsupported or the file is missing or unreadable. Returns
 * undefined silently when there is no `ref` or no resolver (a surface with
 * no asset access, such as the embed).
 */
export async function loadLogo(
    ref: string | undefined,
    resolver: AssetResolver | undefined,
    warn: (message: string) => void,
): Promise<LogoDimensions | undefined> {
    if (!ref || !resolver) return undefined;
    const ext = extensionOf(ref);
    const mime = LOGO_MIME_BY_EXTENSION[ext];
    if (!mime) {
        warn(`unsupported logo format: ${ext || '(none)'} (${ref})`);
        return undefined;
    }
    let bytes: Uint8Array;
    try {
        bytes = (await resolver(ref)).bytes;
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        warn(`logo file not found: ${ref} (${reason})`);
        return undefined;
    }
    const size =
        mime === 'image/svg+xml'
            ? svgIntrinsicSize(new TextDecoder().decode(bytes))
            : rasterSize(bytes, mime);
    if (!size) {
        const why =
            mime === 'image/svg+xml'
                ? 'no viewBox and no pixel width/height on the root <svg>'
                : `not a readable ${ext.slice(1).toUpperCase()} header`;
        warn(`logo could not be parsed: ${ref} (${why})`);
        return undefined;
    }
    return size;
}
