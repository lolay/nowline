import { describe, it, expect } from 'vitest';
import { applyName, defaultOutputPath, slugify } from '../../src/commands/init.js';
import { TEMPLATES } from '../../src/generated/templates.js';

describe('init — template processing', () => {
    it('substitutes --name into the roadmap title', () => {
        const original = TEMPLATES.minimal;
        const out = applyName(original, 'My Awesome Plan');
        expect(out).toMatch(/roadmap minimal "My Awesome Plan"/);
    });

    it('preserves existing keyed properties on the roadmap line', () => {
        const template = 'roadmap demo "Demo" start:2026-01-01\n';
        const out = applyName(template, 'Renamed');
        expect(out).toBe('roadmap demo "Renamed" start:2026-01-01\n');
    });

    it('defaults the filename to a slug of --name', () => {
        expect(defaultOutputPath('My Plan!', 'minimal')).toBe('my-plan.nowline');
        expect(defaultOutputPath(undefined, 'product')).toBe('product.nowline');
    });

    it('slugifies unusual input', () => {
        expect(slugify('Hello, World!')).toBe('hello-world');
        expect(slugify('  multiple   spaces  ')).toBe('multiple-spaces');
        expect(slugify('')).toBe('nowline');
    });
});
