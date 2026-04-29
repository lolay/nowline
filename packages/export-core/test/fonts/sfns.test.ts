import { describe, expect, it } from 'vitest';
import { isVariableFontBytes } from '../../src/fonts/sfns.js';

function buildSfntHeader(numTables: number): Uint8Array {
    const header = new Uint8Array(12);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x00010000); // TrueType
    view.setUint16(4, numTables);
    return header;
}

function buildTableRecord(tag: string): Uint8Array {
    const record = new Uint8Array(16);
    const tagBytes = new TextEncoder().encode(tag);
    record.set(tagBytes.slice(0, 4));
    return record;
}

function compose(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((s, p) => s + p.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.byteLength;
    }
    return out;
}

describe('isVariableFontBytes', () => {
    it('returns true when the SFNT table list contains an fvar record', () => {
        const bytes = compose(buildSfntHeader(2), buildTableRecord('fvar'), buildTableRecord('glyf'));
        expect(isVariableFontBytes(bytes)).toBe(true);
    });

    it('returns false on a regular TTF without fvar', () => {
        const bytes = compose(buildSfntHeader(2), buildTableRecord('cmap'), buildTableRecord('glyf'));
        expect(isVariableFontBytes(bytes)).toBe(false);
    });

    it('returns false on TTC collections', () => {
        const ttc = new Uint8Array(12);
        const view = new DataView(ttc.buffer);
        view.setUint32(0, 0x74746366); // 'ttcf'
        expect(isVariableFontBytes(ttc)).toBe(false);
    });

    it('returns false on garbage bytes', () => {
        expect(isVariableFontBytes(new Uint8Array([1, 2, 3]))).toBe(false);
        expect(isVariableFontBytes(new Uint8Array(0))).toBe(false);
    });

    it('accepts OTTO (CFF-flavored OpenType)', () => {
        const otto = new Uint8Array(12);
        const view = new DataView(otto.buffer);
        view.setUint32(0, 0x4f54544f); // 'OTTO'
        view.setUint16(4, 1);
        const out = compose(otto, buildTableRecord('fvar'));
        expect(isVariableFontBytes(out)).toBe(true);
    });
});
