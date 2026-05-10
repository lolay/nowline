// ZIP timestamp normalizer.
//
// XLSX is a ZIP archive. ExcelJS uses JSZip internally, and JSZip's default
// per-entry mtime is `new Date()` — which means two consecutive calls to
// `wb.xlsx.writeBuffer()` produce different bytes whenever the wall clock
// advances between them. The workbook's own `created`/`modified` properties
// are pinned in `index.ts`, but the per-entry ZIP headers are not.
//
// This module overwrites the `last mod time` / `last mod date` fields in
// every Local File Header and Central Directory File Header with a
// deterministic value derived from a fixed Date. CRC32s, compressed sizes,
// and the compressed payloads themselves are not part of those fields, so
// patching is safe and does not require re-deflating any data.
//
// References:
//   - APPNOTE.TXT (ZIP spec) §4.3.7, §4.4.6, §4.5
//   - DOS date/time encoding: APPNOTE.TXT §4.4.6

const SIG_LFH = 0x04034b50; // "PK\x03\x04"
const SIG_CDFH = 0x02014b50; // "PK\x01\x02"
const SIG_EOCD = 0x06054b50; // "PK\x05\x06"

const EXTRA_EXTENDED_TIMESTAMP = 0x5455; // "UT" — Info-ZIP extended timestamp
const EXTRA_NTFS = 0x000a; // NTFS file times

/**
 * Overwrite every per-entry timestamp inside a ZIP buffer with a
 * deterministic value derived from `date`. Mutates `bytes` in place and
 * returns it for chaining.
 *
 * Throws if the buffer is not a well-formed single-disk ZIP (no EOCD found,
 * or the central-directory walk hits a bad signature).
 */
export function normalizeZipTimestamps(bytes: Uint8Array, date: Date): Uint8Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dosTime = toDosTime(date);
    const dosDate = toDosDate(date);
    const unixSeconds = Math.floor(date.getTime() / 1000);

    const eocdOffset = findEocd(view);
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdEnd = cdOffset + cdSize;

    let p = cdOffset;
    while (p < cdEnd) {
        if (view.getUint32(p, true) !== SIG_CDFH) {
            throw new Error(`normalizeZipTimestamps: bad CDFH signature at offset ${p}`);
        }
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const lfhOffset = view.getUint32(p + 42, true);

        view.setUint16(p + 12, dosTime, true);
        view.setUint16(p + 14, dosDate, true);
        patchExtraTimestamps(view, p + 46 + nameLen, extraLen, unixSeconds);

        if (view.getUint32(lfhOffset, true) !== SIG_LFH) {
            throw new Error(`normalizeZipTimestamps: bad LFH signature at offset ${lfhOffset}`);
        }
        const lfhNameLen = view.getUint16(lfhOffset + 26, true);
        const lfhExtraLen = view.getUint16(lfhOffset + 28, true);

        view.setUint16(lfhOffset + 10, dosTime, true);
        view.setUint16(lfhOffset + 12, dosDate, true);
        patchExtraTimestamps(view, lfhOffset + 30 + lfhNameLen, lfhExtraLen, unixSeconds);

        p += 46 + nameLen + extraLen + commentLen;
    }

    return bytes;
}

function patchExtraTimestamps(
    view: DataView,
    start: number,
    length: number,
    unixSeconds: number,
): void {
    let p = start;
    const end = start + length;
    while (p + 4 <= end) {
        const id = view.getUint16(p, true);
        const size = view.getUint16(p + 2, true);
        const dataStart = p + 4;
        const dataEnd = dataStart + size;
        if (dataEnd > end) return;

        if (id === EXTRA_EXTENDED_TIMESTAMP && size >= 5) {
            // Layout: flags(1) | mtime(4) | [atime(4)] | [ctime(4)]
            const flags = view.getUint8(dataStart);
            let off = dataStart + 1;
            if (off + 4 <= dataEnd) {
                view.setUint32(off, unixSeconds, true);
                off += 4;
            }
            if ((flags & 0x02) !== 0 && off + 4 <= dataEnd) {
                view.setUint32(off, unixSeconds, true);
                off += 4;
            }
            if ((flags & 0x04) !== 0 && off + 4 <= dataEnd) {
                view.setUint32(off, unixSeconds, true);
            }
        } else if (id === EXTRA_NTFS && size >= 32) {
            // Layout: reserved(4) | tag1=0x0001 | size1=24 | mtime(8) | atime(8) | ctime(8)
            // Times are Win32 FILETIME (100-ns intervals since 1601-01-01).
            const fileTime = unixSecondsToFiletime(unixSeconds);
            const attrStart = dataStart + 4 + 4; // skip reserved + tag/size
            view.setBigUint64(attrStart + 0, fileTime, true);
            view.setBigUint64(attrStart + 8, fileTime, true);
            view.setBigUint64(attrStart + 16, fileTime, true);
        }

        p = dataEnd;
    }
}

function findEocd(view: DataView): number {
    const len = view.byteLength;
    const minSize = 22;
    const maxComment = 0xffff;
    const searchStart = Math.max(0, len - minSize - maxComment);
    for (let i = len - minSize; i >= searchStart; i--) {
        if (view.getUint32(i, true) === SIG_EOCD) return i;
    }
    throw new Error('normalizeZipTimestamps: end-of-central-directory record not found');
}

function toDosTime(d: Date): number {
    return (
        ((d.getUTCHours() & 0x1f) << 11) |
        ((d.getUTCMinutes() & 0x3f) << 5) |
        (Math.floor(d.getUTCSeconds() / 2) & 0x1f)
    );
}

function toDosDate(d: Date): number {
    // DOS year is offset from 1980; clamp to that floor so any pre-1980 Date
    // produces a valid (zero) field rather than overflowing.
    const year = Math.max(0, d.getUTCFullYear() - 1980);
    return ((year & 0x7f) << 9) | (((d.getUTCMonth() + 1) & 0xf) << 5) | (d.getUTCDate() & 0x1f);
}

const FILETIME_EPOCH_OFFSET = 11644473600n; // seconds between 1601-01-01 and 1970-01-01

function unixSecondsToFiletime(unixSeconds: number): bigint {
    return (BigInt(unixSeconds) + FILETIME_EPOCH_OFFSET) * 10000000n;
}
