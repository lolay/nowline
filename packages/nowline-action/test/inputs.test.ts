import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseInputs } from '../src/inputs.js';

const INPUT_KEYS = [
    'INPUT_MODE',
    'INPUT_INPUT',
    'INPUT_OUTPUT',
    'INPUT_FILES',
    'INPUT_OUTPUT-DIR',
    'INPUT_FORMAT',
    'INPUT_THEME',
    'INPUT_CLI-VERSION',
];

function setInputs(values: Record<string, string>): void {
    for (const [key, value] of Object.entries(values)) {
        process.env[`INPUT_${key.toUpperCase()}`] = value;
    }
}

describe('parseInputs', () => {
    beforeEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    afterEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    it('throws when file mode is missing input', () => {
        setInputs({ mode: 'file', output: 'roadmap.svg' });
        expect(() => parseInputs()).toThrow(/"input"/);
    });

    it('throws when file mode is missing output', () => {
        setInputs({ mode: 'file', input: 'roadmap.nowline' });
        expect(() => parseInputs()).toThrow(/"output"/);
    });

    it('returns parsed inputs for a valid file-mode invocation', () => {
        setInputs({
            mode: 'file',
            input: 'roadmap.nowline',
            output: 'roadmap.svg',
            format: 'png',
            theme: 'dark',
        });
        const parsed = parseInputs();
        expect(parsed).toMatchObject({
            mode: 'file',
            input: 'roadmap.nowline',
            output: 'roadmap.svg',
            format: 'png',
            theme: 'dark',
        });
    });

    it('defaults markdown-mode glob and output dir when unset', () => {
        setInputs({ mode: 'markdown' });
        const parsed = parseInputs();
        expect(parsed.files).toBe('**/*.md');
        expect(parsed.outputDir).toBe('.nowline/');
        expect(parsed.format).toBe('svg');
        expect(parsed.theme).toBe('light');
    });

    it('rejects an unknown mode', () => {
        setInputs({ mode: 'pdf' });
        expect(() => parseInputs()).toThrow(/mode must be/);
    });

    it('rejects an unknown format', () => {
        setInputs({ mode: 'markdown', format: 'gif' });
        expect(() => parseInputs()).toThrow(/format must be/);
    });

    it('rejects an unknown theme', () => {
        setInputs({ mode: 'markdown', theme: 'sepia' });
        expect(() => parseInputs()).toThrow(/theme must be/);
    });
});
