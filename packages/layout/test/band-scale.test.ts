import { describe, it, expect } from 'vitest';
import { BandScale, defaultRowBand } from '../src/band-scale.js';

describe('BandScale', () => {
    describe('fixedRow', () => {
        it('exposes the configured bandwidth and step', () => {
            const band = BandScale.fixedRow({ bandwidth: 56, step: 64 });
            expect(band.bandwidth()).toBe(56);
            expect(band.step()).toBe(64);
        });

        it('throws on forward() — closed-domain operations are not supported', () => {
            const band = BandScale.fixedRow({ bandwidth: 56, step: 64 });
            expect(() => band.forward('0')).toThrow(/closed-domain/);
        });
    });

    describe('forRows', () => {
        it('matches d3-scale.scaleBand bandwidth + step semantics', () => {
            const band = BandScale.forRows({ count: 4, range: [0, 256] });
            // No padding: 4 bands across 256 px → 64 px each, step = 64.
            expect(band.bandwidth()).toBe(64);
            expect(band.step()).toBe(64);
            expect(band.forward('0')).toBe(0);
            expect(band.forward('3')).toBe(192);
        });

        it('paddingInner makes bandwidth shrink relative to step (per d3-scale.scaleBand)', () => {
            const tight = BandScale.forRows({ count: 4, range: [0, 256], paddingInner: 0 });
            const loose = BandScale.forRows({ count: 4, range: [0, 256], paddingInner: 0.25 });
            expect(loose.bandwidth()).toBeLessThan(tight.bandwidth());
            expect(loose.bandwidth() / loose.step()).toBeCloseTo(0.75, 6);
            expect(tight.bandwidth() / tight.step()).toBeCloseTo(1.0, 6);
        });

        it('throws on forward(unknownId)', () => {
            const band = BandScale.forRows({ count: 2, range: [0, 100] });
            expect(() => band.forward('99')).toThrow(/unknown band/);
        });
    });

    describe('defaultRowBand', () => {
        it('matches the legacy ITEM_ROW_HEIGHT 64/56 split byte-stable', () => {
            const band = defaultRowBand();
            expect(band.step()).toBe(64);
            expect(band.bandwidth()).toBe(56);
        });
    });
});
