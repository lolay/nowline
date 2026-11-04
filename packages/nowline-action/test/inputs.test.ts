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
    'INPUT_NON-WORKING',
    'INPUT_NOW',
    'INPUT_ARGS',
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

    it('accepts the grayscale theme', () => {
        setInputs({ mode: 'markdown', theme: 'grayscale' });
        expect(parseInputs().theme).toBe('grayscale');
    });

    it('canonicalizes greyscale and case like the CLI', () => {
        setInputs({ mode: 'markdown', theme: 'Greyscale' });
        expect(parseInputs().theme).toBe('grayscale');
    });

    it('rejects an unknown theme and names every accepted one', () => {
        setInputs({ mode: 'markdown', theme: 'sepia' });
        expect(() => parseInputs()).toThrow(
            'theme must be one of "light", "dark", "grayscale" (got "sepia")',
        );
    });
});

describe('parseInputs: non-working', () => {
    beforeEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    afterEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    it('leaves nonWorking undefined when the input is unset', () => {
        setInputs({ mode: 'markdown' });
        expect(parseInputs().nonWorking).toBeUndefined();
    });

    it('treats an empty input (the action.yml default) as unset', () => {
        setInputs({ mode: 'markdown', 'non-working': '' });
        expect(parseInputs().nonWorking).toBeUndefined();
    });

    it('accepts show and hide', () => {
        setInputs({ mode: 'markdown', 'non-working': 'show' });
        expect(parseInputs().nonWorking).toBe('show');
        setInputs({ mode: 'markdown', 'non-working': 'hide' });
        expect(parseInputs().nonWorking).toBe('hide');
    });

    it('rejects an unknown value', () => {
        setInputs({ mode: 'markdown', 'non-working': 'maybe' });
        expect(() => parseInputs()).toThrow(/non-working must be "hide" or "show" \(got "maybe"\)/);
    });
});

describe('parseInputs: now', () => {
    beforeEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    afterEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    it('leaves now undefined when the input is empty, so the CLI draws today', () => {
        setInputs({ mode: 'markdown', now: '' });
        expect(parseInputs().now).toBeUndefined();
    });

    it('accepts - to suppress the now-line', () => {
        setInputs({ mode: 'markdown', now: '-' });
        expect(parseInputs().now).toBe('-');
    });

    it('accepts a bare date and an ISO instant verbatim', () => {
        setInputs({ mode: 'markdown', now: '2026-01-15' });
        expect(parseInputs().now).toBe('2026-01-15');
        setInputs({ mode: 'markdown', now: '2026-01-15T09:00:00Z' });
        expect(parseInputs().now).toBe('2026-01-15T09:00:00Z');
    });

    it('rejects a non-date and an impossible day', () => {
        setInputs({ mode: 'markdown', now: 'today' });
        expect(() => parseInputs()).toThrow(/now must be "-" or a date .*\(got "today"\)/);
        setInputs({ mode: 'markdown', now: '2026-02-30' });
        expect(() => parseInputs()).toThrow(/got "2026-02-30"/);
    });
});

describe('parseInputs: args', () => {
    beforeEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    afterEach(() => {
        for (const key of INPUT_KEYS) delete process.env[key];
    });

    it('is empty when the input is empty', () => {
        setInputs({ mode: 'markdown' });
        expect(parseInputs().extraArgs).toEqual([]);
    });

    it('splits on whitespace, newlines included', () => {
        setInputs({ mode: 'markdown', args: '--now -\n  --width 1200' });
        expect(parseInputs().extraArgs).toEqual(['--now', '-', '--width', '1200']);
    });

    it('keeps a quoted value with spaces as one argument', () => {
        setInputs({ mode: 'markdown', args: `--locale "en US" --x 'a b' ""` });
        expect(parseInputs().extraArgs).toEqual(['--locale', 'en US', '--x', 'a b', '']);
    });

    it('rejects an unclosed quote', () => {
        setInputs({ mode: 'markdown', args: '--x "oops' });
        expect(() => parseInputs()).toThrow(/unclosed " quote/);
    });
});
