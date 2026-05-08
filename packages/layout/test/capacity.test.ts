import { describe, expect, it } from 'vitest';
import {
    parseCapacityValue,
    formatCapacityNumber,
    resolveCapacityIcon,
    estimateCapacitySuffixWidth,
    type ResolvedCapacityIcon,
} from '../src/capacity.js';
import type { SymbolDeclaration } from '@nowline/core';

// Tests pin the layout-side contract the renderer (m6/m7) and the
// overload sweep (m8) read. Pure helpers, no AST, so each test is
// fast and self-contained.
describe('parseCapacityValue', () => {
    it('parses positive integers', () => {
        expect(parseCapacityValue('5')).toBe(5);
        expect(parseCapacityValue('1')).toBe(1);
        expect(parseCapacityValue('12000')).toBe(12000);
    });

    it('parses positive decimals', () => {
        expect(parseCapacityValue('0.5')).toBe(0.5);
        expect(parseCapacityValue('1.25')).toBe(1.25);
        expect(parseCapacityValue('2.5')).toBe(2.5);
    });

    it('converts percent literals to decimals (sugar)', () => {
        expect(parseCapacityValue('50%')).toBe(0.5);
        expect(parseCapacityValue('100%')).toBe(1);
        expect(parseCapacityValue('12.5%')).toBe(0.125);
    });

    it('returns null for missing, malformed, or zero values', () => {
        expect(parseCapacityValue(undefined)).toBeNull();
        expect(parseCapacityValue('')).toBeNull();
        expect(parseCapacityValue('-5')).toBeNull();
        expect(parseCapacityValue('5x')).toBeNull();
        expect(parseCapacityValue('abc')).toBeNull();
        expect(parseCapacityValue('0')).toBeNull();
        expect(parseCapacityValue('0.0')).toBeNull();
        expect(parseCapacityValue('0%')).toBeNull();
    });
});

describe('formatCapacityNumber', () => {
    it('renders integers as integers', () => {
        expect(formatCapacityNumber(5)).toBe('5');
        expect(formatCapacityNumber(1)).toBe('1');
        expect(formatCapacityNumber(100)).toBe('100');
    });

    it('trims trailing zeros from decimals', () => {
        expect(formatCapacityNumber(0.5)).toBe('0.5');
        expect(formatCapacityNumber(1.25)).toBe('1.25');
        expect(formatCapacityNumber(2.5)).toBe('2.5');
    });

    it('handles float drift from percent conversion', () => {
        // parseCapacityValue('30%') = 0.3; native fp gives 0.30000000000004 etc.
        expect(formatCapacityNumber(parseCapacityValue('30%')!)).toBe('0.3');
        expect(formatCapacityNumber(parseCapacityValue('33%')!)).toBe('0.33');
    });
});

describe('resolveCapacityIcon', () => {
    const noSymbols = new Map<string, SymbolDeclaration>();

    it('returns null for "none"', () => {
        expect(resolveCapacityIcon('none', noSymbols)).toBeNull();
    });

    it('returns built-in tag for known names', () => {
        expect(resolveCapacityIcon('multiplier', noSymbols)).toEqual({
            kind: 'builtin',
            name: 'multiplier',
        });
        expect(resolveCapacityIcon('person', noSymbols)).toEqual({
            kind: 'builtin',
            name: 'person',
        });
        expect(resolveCapacityIcon('points', noSymbols)).toEqual({
            kind: 'builtin',
            name: 'points',
        });
    });

    it('treats unknown values as inline literals', () => {
        // Unicode literal — Langium ValueConverter strips quotes upstream.
        expect(resolveCapacityIcon('💰', noSymbols)).toEqual({
            kind: 'literal',
            text: '💰',
        });
        expect(resolveCapacityIcon('★', noSymbols)).toEqual({
            kind: 'literal',
            text: '★',
        });
    });

    it('dereferences custom symbol ids to their unicode payload', () => {
        const symbol = {
            $type: 'SymbolDeclaration',
            name: 'budget',
            properties: [
                { key: 'unicode:', value: '💰' },
                { key: 'ascii:', value: '$' },
            ],
        } as unknown as SymbolDeclaration;
        const symbols = new Map<string, SymbolDeclaration>([['budget', symbol]]);
        expect(resolveCapacityIcon('budget', symbols)).toEqual({
            kind: 'literal',
            text: '💰',
        });
    });

    it('falls back to the bare id when a custom symbol is missing unicode (defensive)', () => {
        const symbol = {
            $type: 'SymbolDeclaration',
            name: 'broken',
            properties: [],
        } as unknown as SymbolDeclaration;
        const symbols = new Map<string, SymbolDeclaration>([['broken', symbol]]);
        // Should not crash; renderer paints the id as a literal so the bug
        // is visible rather than silent.
        expect(resolveCapacityIcon('broken', symbols)).toEqual({
            kind: 'literal',
            text: 'broken',
        });
    });
});

describe('estimateCapacitySuffixWidth', () => {
    const fontSize = 11;
    const charPx = fontSize * 0.58;

    it('multiplier glyph contributes one char width and no separator', () => {
        const icon: ResolvedCapacityIcon = { kind: 'builtin', name: 'multiplier' };
        // "5×": 1 char number + 1 char glyph = 2 chars
        expect(estimateCapacitySuffixWidth('5', icon, fontSize)).toBeCloseTo(
            2 * charPx,
        );
    });

    it('built-in SVG glyph adds 0.1em separator + 1em glyph', () => {
        const icon: ResolvedCapacityIcon = { kind: 'builtin', name: 'person' };
        // "5 [person]": 1 char number + 0.1em + 1em = 1*charPx + 1.1*fontSize
        expect(
            estimateCapacitySuffixWidth('5', icon, fontSize),
        ).toBeCloseTo(charPx + 1.1 * fontSize);
    });

    it('literal glyph adds 0.1em separator + 1em glyph', () => {
        const icon: ResolvedCapacityIcon = { kind: 'literal', text: '💰' };
        expect(
            estimateCapacitySuffixWidth('5', icon, fontSize),
        ).toBeCloseTo(charPx + 1.1 * fontSize);
    });

    it('null icon (no glyph) is just the number width', () => {
        expect(estimateCapacitySuffixWidth('5', null, fontSize)).toBeCloseTo(
            charPx,
        );
        expect(estimateCapacitySuffixWidth('100', null, fontSize)).toBeCloseTo(
            3 * charPx,
        );
    });
});
