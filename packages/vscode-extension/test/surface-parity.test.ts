// The CLI, MCP and the VS Code preview each turn their own inputs (flags, tool
// arguments, settings) into render options. One table of inputs runs through
// all three and must give the same options (specs/surface-options.md §5), so a
// value one surface accepts is accepted by all of them.
//
// The surfaces are reached by source path: the CLI and MCP modules are not
// package exports, and the point is to hold their resolution side by side.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../../cli/src/cli/args.js';
import { resolveCliOptions } from '../../cli/src/cli/options.js';
import { resolveMcpOptions } from '../../mcp/src/options.js';
import { resolvePreviewOptions } from '../src/preview/option-resolver.js';
import type { PreviewSettings } from '../src/preview/preview-panel.js';

/** The option inputs, in each surface's own vocabulary. */
interface Inputs {
    theme?: string;
    width?: number;
    /** `YYYY-MM-DD`, or `-` to suppress the now-line. */
    now?: string;
    /** Zone for the default now-line date; only read when `now` is omitted. */
    timezone?: string;
    nonWorking?: 'hide' | 'show';
}

interface Resolved {
    theme: string;
    width: number | undefined;
    today: Date | undefined;
    nonWorking: string | undefined;
}

const BASE_SETTINGS: PreviewSettings = {
    refreshOn: 'keystroke',
    debounceMs: 250,
    theme: 'auto',
    defaultFit: 'fitPage',
    showMinimap: true,
    locale: '',
    now: 'auto',
    timezone: '',
    nonWorking: 'file',
    strict: false,
    showLinks: true,
    width: 0,
    assetRoot: '',
};

function cliArgv(inputs: Inputs): string[] {
    const argv = ['in.nowline'];
    if (inputs.theme !== undefined) argv.push('--theme', inputs.theme);
    if (inputs.width !== undefined) argv.push(`--width=${inputs.width}`);
    if (inputs.now !== undefined) argv.push('--now', inputs.now);
    if (inputs.timezone !== undefined) argv.push('--timezone', inputs.timezone);
    if (inputs.nonWorking !== undefined) argv.push('--non-working', inputs.nonWorking);
    return argv;
}

function throughCli(inputs: Inputs): Resolved {
    const options = resolveCliOptions(parseArgv(cliArgv(inputs)), null);
    options.assertValid();
    const { theme, width, today, nonWorking } = options.surface;
    return { theme, width, today, nonWorking };
}

function throughMcp(inputs: Inputs): Resolved {
    const { options } = resolveMcpOptions(inputs);
    const { theme, width, today, nonWorking } = options;
    return { theme, width, today, nonWorking };
}

function throughExtension(inputs: Inputs): { resolved: Resolved; problems: number } {
    const settings: PreviewSettings = {
        ...BASE_SETTINGS,
        theme: (inputs.theme ?? 'auto') as PreviewSettings['theme'],
        width: inputs.width ?? 0,
        // The setting spells "no now-line" `none`, and "today" `auto`.
        now: inputs.now === '-' ? 'none' : (inputs.now ?? 'auto'),
        timezone: inputs.timezone ?? '',
        nonWorking: inputs.nonWorking ?? 'file',
    };
    const options = resolvePreviewOptions({
        settings,
        rc: {},
        vscodeLanguage: 'en',
        isDarkTheme: false,
    });
    return {
        resolved: {
            theme: options.theme,
            width: options.width,
            today: options.today ?? undefined,
            nonWorking: options.nonWorking,
        },
        problems: options.problems.length,
    };
}

describe('surface parity: accepted values', () => {
    const cases: Array<{ name: string; inputs: Inputs; expected: Resolved }> = [
        {
            name: 'explicit theme, width, now and non-working display',
            inputs: { theme: 'dark', width: 1200, now: '2026-02-09', nonWorking: 'show' },
            expected: {
                theme: 'dark',
                width: 1200,
                today: new Date(Date.UTC(2026, 1, 9)),
                nonWorking: 'show',
            },
        },
        {
            name: 'the greyscale spelling and mixed case',
            inputs: { theme: 'GreyScale', now: '2026-02-09' },
            expected: {
                theme: 'grayscale',
                width: undefined,
                today: new Date(Date.UTC(2026, 1, 9)),
                nonWorking: undefined,
            },
        },
        {
            name: 'a width exactly at the floor',
            inputs: { theme: 'light', width: 320, now: '2026-02-09' },
            expected: {
                theme: 'light',
                width: 320,
                today: new Date(Date.UTC(2026, 1, 9)),
                nonWorking: undefined,
            },
        },
        {
            name: 'now - suppresses the now-line',
            inputs: { theme: 'light', now: '-', nonWorking: 'hide' },
            expected: { theme: 'light', width: undefined, today: undefined, nonWorking: 'hide' },
        },
    ];

    for (const { name, inputs, expected } of cases) {
        it(`${name}: CLI, MCP and the extension agree`, () => {
            expect(throughCli(inputs)).toEqual(expected);
            expect(throughMcp(inputs)).toEqual(expected);
            const extension = throughExtension(inputs);
            expect(extension.resolved).toEqual(expected);
            expect(extension.problems).toBe(0);
        });
    }
});

describe('surface parity: the default now-line date', () => {
    // 23:30 on Feb 9 in San Francisco: already Feb 10 in UTC and in Tokyo.
    const instant = new Date('2026-02-09T23:30:00-08:00');
    const civil = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

    beforeEach(() => {
        vi.useFakeTimers({ now: instant });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('is the local civil date on every surface when nothing sets it', () => {
        const local = civil(instant.getFullYear(), instant.getMonth(), instant.getDate());
        expect(throughCli({}).today).toEqual(local);
        expect(throughMcp({}).today).toEqual(local);
        expect(throughExtension({}).resolved.today).toEqual(local);
    });

    for (const [timezone, expected] of [
        ['America/Los_Angeles', civil(2026, 1, 9)],
        ['UTC', civil(2026, 1, 10)],
        ['+09:00', civil(2026, 1, 10)],
        ['Asia/Tokyo', civil(2026, 1, 10)],
    ] as const) {
        it(`follows the timezone ${timezone} on every surface`, () => {
            expect(throughCli({ timezone }).today).toEqual(expected);
            expect(throughMcp({ timezone }).today).toEqual(expected);
            expect(throughExtension({ timezone }).resolved.today).toEqual(expected);
        });
    }

    it('lets an explicit now win over the timezone on every surface', () => {
        const inputs = { now: '2026-02-09', timezone: 'Asia/Tokyo' };
        const expected = civil(2026, 1, 9);
        expect(throughCli(inputs).today).toEqual(expected);
        expect(throughMcp(inputs).today).toEqual(expected);
        expect(throughExtension(inputs).resolved.today).toEqual(expected);
    });
});

describe('surface parity: one width rule', () => {
    // 400.5 is left out on purpose: the CLI reads a flag with `parseInt`
    // (`--width 400.5` is 400, as `1200px` is 1200), where a number argument
    // or setting that is not an integer is rejected.
    const rejected = [0.5, 1, 100, 319, -1];

    for (const width of rejected) {
        it(`rejects ${width} on every surface`, () => {
            const inputs: Inputs = { theme: 'light', now: '2026-02-09', width };
            expect(() => throughCli(inputs)).toThrow(/invalid --width/);
            expect(() => throughMcp(inputs)).toThrow(/Invalid width/);
            const extension = throughExtension(inputs);
            // The extension reports a bad width and renders at fit-content.
            expect(extension.resolved.width).toBeUndefined();
            expect(extension.problems).toBe(1);
        });
    }
});
