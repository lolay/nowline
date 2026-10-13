// Intrinsic pixel size of a raster logo, read from the file header so layout
// can size the logo slot before render. Browser-safe: no Buffer, no fs.

export interface ImageSize {
    width: number;
    height: number;
}

/** The raster formats `logo:` accepts. */
export type RasterLogoMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Width and height from a PNG, JPEG or WebP header; undefined when unreadable. */
export function rasterSize(bytes: Uint8Array, mime: RasterLogoMime): ImageSize | undefined {
    const size =
        mime === 'image/png'
            ? pngSize(bytes)
            : mime === 'image/jpeg'
              ? jpegSize(bytes)
              : webpSize(bytes);
    return size && size.width > 0 && size.height > 0 ? size : undefined;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u16be(b: Uint8Array, i: number): number {
    return (b[i] << 8) | b[i + 1];
}

function u32be(b: Uint8Array, i: number): number {
    return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function u16le(b: Uint8Array, i: number): number {
    return b[i] | (b[i + 1] << 8);
}

function u24le(b: Uint8Array, i: number): number {
    return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}

function ascii(b: Uint8Array, i: number, n: number): string {
    return String.fromCharCode(...b.subarray(i, i + n));
}

// The first chunk after the signature is always IHDR: width, height (u32 BE).
function pngSize(b: Uint8Array): ImageSize | undefined {
    if (b.length < 24 || PNG_SIGNATURE.some((v, i) => b[i] !== v)) return undefined;
    if (ascii(b, 12, 4) !== 'IHDR') return undefined;
    return { width: u32be(b, 16), height: u32be(b, 20) };
}

// Walk the marker segments to the first start-of-frame (SOF0..SOF15 minus
// DHT C4, JPG C8 and DAC CC), which carries height then width.
function jpegSize(b: Uint8Array): ImageSize | undefined {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
    let i = 2;
    while (i + 3 < b.length) {
        if (b[i] !== 0xff) return undefined;
        const marker = b[i + 1];
        if (marker === 0xff) {
            i += 1; // fill byte
            continue;
        }
        // Standalone markers carry no length.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
            i += 2;
            continue;
        }
        const length = u16be(b, i + 2);
        const isSof =
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc;
        if (isSof) {
            if (i + 8 >= b.length) return undefined;
            return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
        }
        if (length < 2) return undefined;
        i += 2 + length;
    }
    return undefined;
}

// RIFF container; the first chunk says lossy (VP8), lossless (VP8L) or
// extended (VP8X, which records the canvas size directly).
function webpSize(b: Uint8Array): ImageSize | undefined {
    if (b.length < 16 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return undefined;
    const chunk = ascii(b, 12, 4);
    // Bytes each chunk kind needs to reach its size fields.
    const needed = chunk === 'VP8L' ? 25 : 30;
    if (b.length < needed) return undefined;
    if (chunk === 'VP8 ') {
        if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return undefined;
        return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
        if (b[20] !== 0x2f) return undefined;
        const b1 = b[21];
        const b2 = b[22];
        const b3 = b[23];
        const b4 = b[24];
        return {
            width: 1 + (b1 | ((b2 & 0x3f) << 8)),
            height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
        };
    }
    if (chunk === 'VP8X') {
        return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
    }
    return undefined;
}
