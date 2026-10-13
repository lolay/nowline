// The CLI, MCP and the VS Code preview each turn their own inputs (flags, tool
// arguments, settings) into render options. One table of inputs runs through
// all three and must give the same options (specs/surface-options.md §5), so a
// value one surface accepts is accepted by all of them.
//
// The surfaces are reached by source path: the CLI and MCP modules are not
// package exports, and the point is to hold their resolution side by side.

import { describe, expect, it } from 'vitest';
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
    const { options } = resolveMcpOptions(inputs, { zone: { kind: 'utc' } });
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
