import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    BUNDLED_MONO_PATH,
    BUNDLED_SANS_PATH,
    clearBundledCache,
    FontResolveError,
    resolveFonts,
} from '../../src/fonts/index.js';

afterEach(() => clearBundledCache());

// Minimal stub TTFs — 12-byte SFNT header + the literal 'fvar' tag in a fake
// table record (for VF detection). Bytes are not valid full fonts; the
// resolver only inspects the SFNT header and table-record list to detect VF.
function makeStubTtf(extra: Record<string, Uint8Array> = {}): Uint8Array {
    const tableTags = Object.keys(extra);
    const numTables = tableTags.length;
    const headerBytes = 12 + numTables * 16;
    const tablesBytes = Object.values(extra).reduce((s, b) => s + b.byteLength, 0);
    const out = new Uint8Array(headerBytes + tablesBytes);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x00010000); // sfnt version: TrueType
    view.setUint16(4, numTables);
    view.setUint16(6, 0); // searchRange
    view.setUint16(8, 0); // entrySelector
    view.setUint16(10, 0); // rangeShift
    let offset = headerBytes;
    tableTags.forEach((tag, idx) => {
        const recOffset = 12 + idx * 16;
        const tagBytes = new TextEncoder().encode(tag);
        out.set(tagBytes, recOffset);
        view.setUint32(recOffset + 4, 0); // checksum
        view.setUint32(recOffset + 8, offset);
        view.setUint32(recOffset + 12, extra[tag].byteLength);
        out.set(extra[tag], offset);
        offset += extra[tag].byteLength;
    });
    return out;
}

const NON_VF_TTF = makeStubTtf({
    glyf: new Uint8Array([0, 0, 0, 0]),
});

const VF_TTF = makeStubTtf({
    fvar: new Uint8Array([0, 0, 0, 0]),
    glyf: new Uint8Array([0, 0, 0, 0]),
});

interface MockFs {
    files: Map<string, Uint8Array>;
    fileExists: (p: string) => boolean;
    readFileBytes: (p: string) => Promise<Uint8Array>;
}

function mockFs(files: Record<string, Uint8Array>): MockFs {
    const map = new Map(Object.entries(files));
    return {
        files: map,
        fileExists: (p: string) => map.has(p),
        readFileBytes: async (p: string) => {
            const v = map.get(p);
            if (!v) throw new Error(`mockFs: ENOENT ${p}`);
            return v;
        },
    };
}

describe('resolveFonts — explicit flag', () => {
    it('takes a literal absolute path and reports source: flag', async () => {
        // resolveFonts runs flag/env paths through `path.resolve` to normalize,
        // which on Windows turns `/abs/MyFont.ttf` into `D:\\abs\\MyFont.ttf`.
        // Resolve once and key the stub on the same value so the lookup hits
        // on every platform.
        const myFontPath = path.resolve('/abs/MyFont.ttf');
        const fs = mockFs({ [myFontPath]: NON_VF_TTF });
        const result = await resolveFonts({
            fontSans: myFontPath,
            fontMono: myFontPath,
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('flag');
        expect(result.sans.path).toBe(myFontPath);
        expect(result.sans.bytes).toBe(NON_VF_TTF);
        expect(result.sans.isVariableFont).toBe(false);
    });

    it('flags an absent path with FontResolveError', async () => {
        const fs = mockFs({});
        await expect(
            resolveFonts({
                fontSans: '/abs/Missing.ttf',
                fileExists: fs.fileExists,
                readFileBytes: fs.readFileBytes,
                platform: 'linux',
                env: {},
                isStdoutTty: true,
            }),
        ).rejects.toBeInstanceOf(FontResolveError);
    });

    it('detects a variable font and surfaces isVariableFont=true', async () => {
        const sfPath = path.resolve('/abs/SF.ttf');
        const fs = mockFs({ [sfPath]: VF_TTF });
        const result = await resolveFonts({
            fontSans: sfPath,
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'darwin',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.isVariableFont).toBe(true);
    });
});

describe('resolveFonts — env', () => {
    it('NOWLINE_FONT_SANS wins over the probe list', async () => {
        const envFontPath = path.resolve('/abs/EnvFont.ttf');
        const fs = mockFs({
            [envFontPath]: NON_VF_TTF,
            '/System/Library/Fonts/SFNS.ttf': VF_TTF, // probe candidate
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'darwin',
            env: { NOWLINE_FONT_SANS: envFontPath },
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('env');
        expect(result.sans.path).toBe(envFontPath);
    });
});

describe('resolveFonts — headless', () => {
    it('--headless skips probe and lands on bundled', async () => {
        const fs = mockFs({});
        const result = await resolveFonts({
            headless: true,
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('headless');
        expect(result.sans.name).toBe('DejaVu Sans');
        expect(result.mono.source).toBe('headless');
        expect(result.mono.name).toBe('DejaVu Sans Mono');
        expect(result.sansFellBackToBundled).toBe(false); // headless is not "fell back"
        expect(result.monoFellBackToBundled).toBe(false);
    });

    it('NOWLINE_HEADLESS=1 implies headless', async () => {
        const fs = mockFs({});
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: { NOWLINE_HEADLESS: '1' },
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('headless');
    });

    it('CI=true with no TTY auto-headless when not disabled', async () => {
        const fs = mockFs({});
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: { CI: 'true' },
            isStdoutTty: false,
        });
        expect(result.sans.source).toBe('headless');
    });

    it('CI=true with TTY does NOT auto-headless', async () => {
        const fs = mockFs({
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf': NON_VF_TTF,
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: { CI: 'true' },
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('probe');
    });

    it('disableAutoHeadless suppresses the CI heuristic even without a TTY', async () => {
        const fs = mockFs({
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf': NON_VF_TTF,
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            disableAutoHeadless: true,
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: { CI: 'true' },
            isStdoutTty: false,
        });
        expect(result.sans.source).toBe('probe');
    });
});

describe('resolveFonts — macOS probe list', () => {
    it('SFNS.ttf present → first hit, source=probe, name=SF Pro', async () => {
        const fs = mockFs({
            '/System/Library/Fonts/SFNS.ttf': VF_TTF,
            '/System/Library/Fonts/SFNSMono.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'darwin',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('probe');
        expect(result.sans.name).toBe('SF Pro');
        expect(result.sans.path).toBe('/System/Library/Fonts/SFNS.ttf');
        expect(result.mono.name).toBe('SF Mono');
    });

    it('SFNS.ttf missing but Helvetica.ttc present → falls to Helvetica face', async () => {
        const fs = mockFs({
            '/System/Library/Fonts/Helvetica.ttc': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'darwin',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('probe');
        expect(result.sans.name).toBe('Helvetica');
        expect(result.sans.face).toBe('Helvetica');
    });

    it('all macOS candidates absent → bundled fallback marked as fell-back', async () => {
        const fs = mockFs({});
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'darwin',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('bundled');
        expect(result.mono.source).toBe('bundled');
        expect(result.sansFellBackToBundled).toBe(true);
        expect(result.monoFellBackToBundled).toBe(true);
    });
});

describe('resolveFonts — Windows probe list', () => {
    it('Segoe UI present in WINDIR\\Fonts → hits first', async () => {
        const fs = mockFs({
            'C:\\WINDOWS\\Fonts\\segoeui.ttf': NON_VF_TTF,
            'C:\\WINDOWS\\Fonts\\consola.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'win32',
            env: { WINDIR: 'C:\\WINDOWS' },
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('probe');
        expect(result.sans.name).toBe('Segoe UI');
        expect(result.mono.name).toBe('Consolas');
    });

    it('Segoe missing → falls to Arial', async () => {
        const fs = mockFs({
            'C:\\WINDOWS\\Fonts\\arial.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'win32',
            env: { WINDIR: 'C:\\WINDOWS' },
            isStdoutTty: true,
        });
        expect(result.sans.name).toBe('Arial');
    });
});

describe('resolveFonts — Linux probe list (per-distro paths)', () => {
    it('Debian path resolves DejaVu', async () => {
        const fs = mockFs({
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf': NON_VF_TTF,
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('probe');
        expect(result.sans.path).toBe('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
    });

    it('Fedora path resolves DejaVu', async () => {
        const fs = mockFs({
            '/usr/share/fonts/dejavu/DejaVuSans.ttf': NON_VF_TTF,
            '/usr/share/fonts/dejavu/DejaVuSansMono.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.path).toBe('/usr/share/fonts/dejavu/DejaVuSans.ttf');
    });

    it('Arch path resolves DejaVu', async () => {
        const fs = mockFs({
            '/usr/share/fonts/TTF/DejaVuSans.ttf': NON_VF_TTF,
            '/usr/share/fonts/TTF/DejaVuSansMono.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.path).toBe('/usr/share/fonts/TTF/DejaVuSans.ttf');
    });

    it('nothing present → bundled fallback', async () => {
        const fs = mockFs({});
        const result = await resolveFonts({
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('bundled');
    });
});

describe('resolveFonts — alias resolution', () => {
    it('--font-sans sf on macOS resolves to SFNS.ttf', async () => {
        const fs = mockFs({
            '/System/Library/Fonts/SFNS.ttf': VF_TTF,
        });
        const result = await resolveFonts({
            fontSans: 'sf',
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'darwin',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('flag');
        expect(result.sans.name).toBe('SF Pro');
        expect(result.sans.path).toBe('/System/Library/Fonts/SFNS.ttf');
    });

    it('--font-sans dejavu always points at the bundled probe entry on Linux', async () => {
        const fs = mockFs({
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf': NON_VF_TTF,
        });
        const result = await resolveFonts({
            fontSans: 'dejavu',
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        expect(result.sans.source).toBe('flag');
        expect(result.sans.name).toBe('DejaVu Sans');
    });

    it('alias for a non-mapped role throws', async () => {
        const fs = mockFs({});
        await expect(
            resolveFonts({
                fontMono: 'helvetica',
                fileExists: fs.fileExists,
                readFileBytes: fs.readFileBytes,
                platform: 'darwin',
                env: {},
                isStdoutTty: true,
            }),
        ).rejects.toBeInstanceOf(FontResolveError);
    });
});

describe('resolveFonts — bundled fallback determinism', () => {
    it('two consecutive calls return byte-identical bundled bytes', async () => {
        const fs = mockFs({});
        const a = await resolveFonts({
            headless: true,
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        clearBundledCache();
        const b = await resolveFonts({
            headless: true,
            fileExists: fs.fileExists,
            readFileBytes: fs.readFileBytes,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
        });
        // Buffer.compare is O(n) native memcmp; vitest's `toEqual` walks the
        // typed array element-by-element, which on Windows CI workers can push
        // ~740 KB + ~330 KB comparisons past the default 5 s test budget.
        expect(a.sans.bytes.byteLength).toBe(b.sans.bytes.byteLength);
        expect(a.mono.bytes.byteLength).toBe(b.mono.bytes.byteLength);
        expect(Buffer.compare(a.sans.bytes, b.sans.bytes)).toBe(0);
        expect(Buffer.compare(a.mono.bytes, b.mono.bytes)).toBe(0);
    });

    it('bundled DejaVu bytes are non-empty', async () => {
        const result = await resolveFonts({ headless: true });
        expect(result.sans.bytes.byteLength).toBeGreaterThan(100_000);
        expect(result.mono.bytes.byteLength).toBeGreaterThan(100_000);
    });

    it('bundled paths point at the on-disk DejaVu files', () => {
        expect(BUNDLED_SANS_PATH.endsWith('DejaVuSans.ttf')).toBe(true);
        expect(BUNDLED_MONO_PATH.endsWith('DejaVuSansMono.ttf')).toBe(true);
    });
});

describe('resolveFonts — fellBackToBundled flag', () => {
    it('explicit headless does NOT mark fellBack', async () => {
        const result = await resolveFonts({
            headless: true,
            platform: 'linux',
            env: {},
            isStdoutTty: true,
            fileExists: () => false,
            readFileBytes: async () => new Uint8Array(),
        });
        expect(result.sansFellBackToBundled).toBe(false);
    });

    it('non-headless run that lands on bundled marks fellBack', async () => {
        const result = await resolveFonts({
            platform: 'linux',
            env: {},
            isStdoutTty: true,
            fileExists: () => false,
            readFileBytes: async () => new Uint8Array(),
        });
        expect(result.sansFellBackToBundled).toBe(true);
        expect(result.monoFellBackToBundled).toBe(true);
    });
});
