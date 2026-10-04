import { describe, expect, it } from 'vitest';
import { estimateTextWidth, wrapText } from '../src/text-measure.js';

describe('estimateTextWidth', () => {
    it('is length * fontSize * 0.58', () => {
        expect(estimateTextWidth('Technology', 13)).toBeCloseTo(75.4, 6);
        expect(estimateTextWidth('', 13)).toBe(0);
    });
});

describe('wrapText', () => {
    it('returns no lines for empty or whitespace-only text', () => {
        expect(wrapText('', 100, 13)).toEqual([]);
        expect(wrapText('   ', 100, 13)).toEqual([]);
    });

    it('keeps text that fits on one line', () => {
        expect(wrapText('Short title', 200, 13)).toEqual(['Short title']);
    });

    it('wraps greedily at whitespace', () => {
        // 124px budget at 13px: "Technology" is 75.4px, "Technology Selection" is 150.8px.
        expect(wrapText('Technology Selection', 124, 13)).toEqual(['Technology', 'Selection']);
        expect(wrapText('Migrate legacy billing service to new platform', 124, 13)).toEqual([
            'Migrate legacy',
            'billing service',
            'to new platform',
        ]);
    });

    it('never breaks a word, even one wider than the budget', () => {
        expect(wrapText('Internationalization', 50, 13)).toEqual(['Internationalization']);
        expect(wrapText('Go Internationalization', 50, 13)).toEqual(['Go', 'Internationalization']);
    });

    it('normalizes runs of whitespace', () => {
        expect(wrapText('Go    now', 200, 13)).toEqual(['Go now']);
    });

    it('narrows only the first line when firstLineMaxWidth is given', () => {
        // "Plan the rollout" is 120.6px: one line at 124px, but a 115px first
        // line pushes "rollout" down. Line 2 keeps the full 124px budget.
        expect(wrapText('Plan the rollout', 124, 13)).toEqual(['Plan the rollout']);
        expect(wrapText('Plan the rollout', 124, 13, 115)).toEqual(['Plan the', 'rollout']);
        // "Internationalize" (120.6px) fits the 124px later-line budget.
        expect(wrapText('Go Internationalize', 124, 13, 115)).toEqual(['Go', 'Internationalize']);
    });

    it('defaults the first line to the same budget as the rest', () => {
        expect(wrapText('Technology Selection', 124, 13, 124)).toEqual(
            wrapText('Technology Selection', 124, 13),
        );
    });
});
