// SF Pro variable-font handling.
//
// Spec: specs/handoffs/m2c.md § 10 "Variable-font handling (SFNS.ttf)".
//
// Detection only — actual VF instancing for PDF embedding lives in
// @nowline/export-pdf, which depends on fontkit directly. The resolver
// surfaces `isVariableFont: true` so consumers know they may need to
// pre-instance.

const FVAR_TAG = 0x66766172; // 'fvar'

/**
 * Returns true when the given TTF/OTF byte buffer carries an `fvar` table —
 * i.e. it is an OpenType variable font with continuous axes.
 */
export function isVariableFontBytes(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sfntVersion = view.getUint32(0);
    // Accept both TrueType ('\x00\x01\x00\x00') and OpenType/CFF ('OTTO').
    const isSfnt = sfntVersion === 0x00010000 || sfntVersion === 0x4f54544f;
    const isCollection = sfntVersion === 0x74746366; // 'ttcf' — handled separately
    if (!isSfnt && !isCollection) return false;
    if (isCollection) return false; // collection: caller should index by face first

    const numTables = view.getUint16(4);
    for (let i = 0; i < numTables; i++) {
        const recordOffset = 12 + i * 16;
        if (recordOffset + 16 > bytes.byteLength) return false;
        const tag = view.getUint32(recordOffset);
        if (tag === FVAR_TAG) return true;
    }
    return false;
}
