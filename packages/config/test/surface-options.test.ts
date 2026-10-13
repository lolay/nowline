import { describe, expect, it } from 'vitest';
import {
    ASSET_ROOT_SPEC,
    type NowlineRc,
    type OptionLayer,
    type OptionSource,
    type OptionSpec,
    rcLayer,
    resolveOptions,
    resolveSurfaceOptions,
    SURFACE_OPTION_SPECS,
    SURFACE_RC_KEYS,
    type SurfaceOptionKey,
} from '../src/index.js';

// A fixed instant: 2026-02-09T23:30Z is still Feb 9 in UTC but already
// Feb 10 at +05:30, so a test can tell which zone the default used.
const CLOCK = () => new Date('2026-02-09T23:30:00Z');
const UTC_POLICY = { zone: { kind: 'utc' }, clock: CLOCK } as const;
const DEFAULTS = { theme: 'light' } as const;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const sources = {
    flag: (key: string): OptionSource => ({ kind: 'flag', name: `--${key}` }),
    argument: (key: string): OptionSource => ({ kind: 'argument', name: key }),
    setting: (key: string): OptionSource => ({ kind: 'setting', name: `nowline.preview.${key}` }),
};

function layer(
    kind: keyof typeof sources,
    values: Partial<Record<SurfaceOptionKey, unknown>>,
): OptionLayer {
    return { source: (key) => sources[kind](key), values };
}

function resolve(...layers: OptionLayer[]) {
    return resolveSurfaceOptions(layers, DEFAULTS, UTC_POLICY);
}

const PAGE_SIZE_EXPECTED_DETAIL =
    'expected preset (letter, legal, tabloid, ledger, a1, a2, a3, a4, a5, b3, b4, b5), ' +
    '"content", or <W>x<H><unit> (e.g. 8.5x11in)';

type ParseCase =
    | { raw: unknown; value: unknown }
    | { raw: unknown; detail: string; expected?: readonly string[] };

// Every option's parser, case by case. `value: undefined` is an explicit
// unset: no error, and the option keeps its default.
const PARSE_CASES: Record<SurfaceOptionKey, ParseCase[]> = {
    theme: [
        { raw: 'dark', value: 'dark' },
        { raw: 'Grayscale', value: 'grayscale' },
        { raw: 'GREYSCALE', value: 'grayscale' },
        { raw: 'light', value: 'light' },
        { raw: 'sepia', detail: 'must be a theme name', expected: ['light', 'dark', 'grayscale'] },
        { raw: '', detail: 'must be a theme name', expected: ['light', 'dark', 'grayscale'] },
        { raw: 42, detail: 'must be a theme name', expected: ['light', 'dark', 'grayscale'] },
    ],
    width: [
        { raw: 1200, value: 1200 },
        { raw: 320, value: 320 },
        { raw: '1200', value: 1200 },
        // The CLI's parseInt rule, kept for byte-identical behaviour.
        { raw: '1200px', value: 1200 },
        { raw: ' 900', value: 900 },
        { raw: '', value: undefined },
        { raw: 319, detail: 'must be an integer ≥ 320' },
        { raw: '319', detail: 'must be an integer ≥ 320' },
        { raw: 1200.5, detail: 'must be an integer ≥ 320' },
        { raw: 'abc', detail: 'must be an integer ≥ 320' },
        { raw: true, detail: 'must be an integer ≥ 320' },
    ],
    now: [
        { raw: '2026-02-09', value: utc(2026, 2, 9) },
        { raw: '2026-02-09T23:30:00+05:30', value: utc(2026, 2, 9) },
        { raw: '2026-02-09T23:30:00Z', value: utc(2026, 2, 9) },
        { raw: '2026-02-09T20:00:00-07:00', value: utc(2026, 2, 9) },
        { raw: '2026-02-09T10:00:00', value: utc(2026, 2, 9) },
        { raw: utc(2026, 3, 1), value: utc(2026, 3, 1) },
        { raw: '-', value: undefined },
        {
            raw: 'tomorrow',
            detail: 'must be YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-"',
        },
        { raw: '', detail: 'must be YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-"' },
        {
            raw: new Date(Number.NaN),
            detail: 'must be YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-"',
        },
        { raw: 20260209, detail: 'must be YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-"' },
    ],
    pageSize: [
        { raw: 'a4', value: { kind: 'preset', name: 'a4' } },
        { raw: 'Letter', value: { kind: 'preset', name: 'letter' } },
        { raw: 'content', value: { kind: 'content' } },
        {
            raw: '8.5x11in',
            value: {
                kind: 'custom',
                width: { value: 8.5, unit: 'in' },
                height: { value: 11, unit: 'in' },
            },
        },
        { raw: '', value: undefined },
        { raw: 'huge', detail: PAGE_SIZE_EXPECTED_DETAIL },
        { raw: 5, detail: PAGE_SIZE_EXPECTED_DETAIL },
        {
            raw: '210mmx11in',
            detail: 'mixed units (mm vs in); use the same unit for width and height',
        },
        { raw: '  ', detail: 'empty page size' },
    ],
    nonWorking: [
        { raw: 'hide', value: 'hide' },
        { raw: 'show', value: 'show' },
        { raw: '', value: undefined },
        { raw: 'Show', detail: 'must be a non-working display', expected: ['hide', 'show'] },
        { raw: 'shade', detail: 'must be a non-working display', expected: ['hide', 'show'] },
    ],
};

// Where each parsed option lands in `SurfaceOptions`.
const OPTION_FIELD = {
    theme: 'theme',
    width: 'width',
    now: 'today',
    pageSize: 'pageSize',
    nonWorking: 'nonWorking',
} as const;

// The value an option holds when nothing (valid) set it.
const DEFAULT_FIELD = {
    theme: 'light',
    width: undefined,
    now: utc(2026, 2, 9),
    pageSize: undefined,
    nonWorking: undefined,
} as const;

describe('resolveSurfaceOptions: each option parser', () => {
    for (const [key, cases] of Object.entries(PARSE_CASES) as [SurfaceOptionKey, ParseCase[]][]) {
        describe(key, () => {
            for (const c of cases) {
                const label = c.raw instanceof Date ? `Date(${c.raw.getTime()})` : String(c.raw);
                if ('value' in c) {
                    it(`accepts ${JSON.stringify(label)}`, (): void => {
                        const { options, errors } = resolve(layer('flag', { [key]: c.raw }));
                        expect(errors).toEqual([]);
                        // `-` suppresses the now-line rather than falling back to the clock.
                        const want =
                            c.value === undefined && key !== 'now' ? DEFAULT_FIELD[key] : c.value;
                        expect(options[OPTION_FIELD[key]]).toEqual(want);
                    });
                } else {
                    it(`rejects ${JSON.stringify(label)} with exact error fields`, (): void => {
                        const { options, errors } = resolve(layer('flag', { [key]: c.raw }));
                        const expected = {
                            key,
                            source: { kind: 'flag', name: `--${key}` },
                            raw: c.raw,
                            detail: c.detail,
                            ...(c.expected ? { expected: c.expected } : {}),
                        };
                        expect(errors).toStrictEqual([expected]);
                        expect(options[OPTION_FIELD[key]]).toEqual(DEFAULT_FIELD[key]);
                    });
                }
            }
        });
    }
});

describe('resolveSurfaceOptions: every source kind', () => {
    const BAD: Record<SurfaceOptionKey, unknown> = {
        theme: 'sepia',
        width: 100,
        now: 'soon',
        pageSize: 'huge',
        nonWorking: 'shade',
    };
    const GOOD: Record<SurfaceOptionKey, unknown> = {
        theme: 'dark',
        width: 800,
        now: '2026-03-01',
        pageSize: 'a3',
        nonWorking: 'show',
    };

    for (const kind of Object.keys(sources) as (keyof typeof sources)[]) {
        it(`reads every option from a ${kind} layer`, (): void => {
            const { options, errors } = resolve(layer(kind, GOOD));
            expect(errors).toEqual([]);
            expect(options).toEqual({
                theme: 'dark',
                width: 800,
                today: utc(2026, 3, 1),
                pageSize: { kind: 'preset', name: 'a3' },
                nonWorking: 'show',
            });
        });

        it(`names the ${kind} source in every error, in key order`, (): void => {
            const { errors } = resolve(layer(kind, BAD));
            expect(errors.map((e) => [e.key, e.source, e.raw])).toEqual([
                ['theme', sources[kind]('theme'), 'sepia'],
                ['width', sources[kind]('width'), 100],
                ['now', sources[kind]('now'), 'soon'],
                ['pageSize', sources[kind]('pageSize'), 'huge'],
                ['nonWorking', sources[kind]('nonWorking'), 'shade'],
            ]);
        });
    }

    it('reads the rc keys from a .nowlinerc layer and names them in errors', (): void => {
        const good: NowlineRc = { theme: 'greyscale', width: '640', pdfPageSize: 'legal' };
        expect(resolve(rcLayer(good))).toEqual({
            options: {
                theme: 'grayscale',
                width: 640,
                today: utc(2026, 2, 9),
                pageSize: { kind: 'preset', name: 'legal' },
            },
            errors: [],
        });

        const bad: NowlineRc = { theme: 'sepia', width: 300, pdfPageSize: 'huge' };
        expect(resolve(rcLayer(bad)).errors).toStrictEqual([
            {
                key: 'theme',
                source: { kind: 'rc', key: 'theme' },
                raw: 'sepia',
                detail: 'must be a theme name',
                expected: ['light', 'dark', 'grayscale'],
            },
            {
                key: 'width',
                source: { kind: 'rc', key: 'width' },
                raw: 300,
                detail: 'must be an integer ≥ 320',
            },
            {
                key: 'pageSize',
                source: { kind: 'rc', key: 'pdfPageSize' },
                raw: 'huge',
                detail: PAGE_SIZE_EXPECTED_DETAIL,
            },
        ]);
    });

    it('ignores rc keys the schema does not read (now, nonWorking, pageSize, assetRoot)', (): void => {
        const rc: NowlineRc = {
            now: 'not-a-date',
            nonWorking: 'shade',
            pageSize: 'huge',
            assetRoot: 'assets',
        };
        expect(resolve(rcLayer(rc))).toEqual({
            options: { theme: 'light', today: utc(2026, 2, 9) },
            errors: [],
        });
    });
});

describe('resolveSurfaceOptions: precedence', () => {
    it('takes the first layer that holds a value', (): void => {
        const { options } = resolve(
            layer('flag', { theme: 'grayscale' }),
            layer('setting', { theme: 'dark', width: 900 }),
            rcLayer({ theme: 'light', width: 1200, pdfPageSize: 'a4' }),
        );
        expect(options.theme).toBe('grayscale');
        expect(options.width).toBe(900);
        expect(options.pageSize).toEqual({ kind: 'preset', name: 'a4' });
    });

    it('falls through undefined and null to a lower layer', (): void => {
        const { options, errors } = resolve(
            layer('flag', { theme: undefined, width: null }),
            rcLayer({ theme: 'dark', width: 700 }),
        );
        expect(errors).toEqual([]);
        expect(options.theme).toBe('dark');
        expect(options.width).toBe(700);
    });

    it('lets a valid higher layer hide a bad lower one', (): void => {
        const { options, errors } = resolve(
            layer('flag', { theme: 'dark', width: '1000', now: '2026-05-01' }),
            layer('setting', { theme: 'sepia', width: 1, now: 'soon', nonWorking: 'show' }),
            rcLayer({ theme: 'nope', width: 'wide', pdfPageSize: 'huge' }),
        );
        // pageSize had no higher value, so the rc's bad one is the winner.
        expect(errors.map((e) => e.key)).toEqual(['pageSize']);
        expect(options).toEqual({
            theme: 'dark',
            width: 1000,
            today: utc(2026, 5, 1),
            nonWorking: 'show',
        });
    });

    it('reports a bad higher value and never reads the valid lower one', (): void => {
        const { options, errors } = resolve(
            layer('argument', { width: 10 }),
            rcLayer({ width: 1200 }),
        );
        expect(errors).toStrictEqual([
            {
                key: 'width',
                source: { kind: 'argument', name: 'width' },
                raw: 10,
                detail: 'must be an integer ≥ 320',
            },
        ]);
        expect(options.width).toBeUndefined();
    });

    it('treats an empty width or page size as unset, hiding lower layers', (): void => {
        const { options, errors } = resolve(
            layer('flag', { width: '', pageSize: '' }),
            rcLayer({ width: 300, pdfPageSize: 'huge' }),
        );
        expect(errors).toEqual([]);
        expect(options.width).toBeUndefined();
        expect(options.pageSize).toBeUndefined();
    });

    it('uses the caller default theme when no layer sets one', (): void => {
        const { options } = resolveSurfaceOptions([], { theme: 'dark' }, UTC_POLICY);
        expect(options.theme).toBe('dark');
    });
});

describe('resolveSurfaceOptions: the now policy', () => {
    it('defaults to the civil date in the policy zone', (): void => {
        const kolkata = resolveSurfaceOptions([], DEFAULTS, {
            zone: { kind: 'offset', ms: 330 * 60_000 },
            clock: CLOCK,
        });
        expect(kolkata.options.today).toEqual(utc(2026, 2, 10));
        expect(resolve().options.today).toEqual(utc(2026, 2, 9));
    });

    it('uses the clock when a bad now is reported', (): void => {
        const { options, errors } = resolve(layer('flag', { now: 'soon' }));
        expect(errors).toHaveLength(1);
        expect(options.today).toEqual(utc(2026, 2, 9));
    });

    it('ignores the zone and clock once a layer sets now', (): void => {
        const clock = () => {
            throw new Error('clock must not be read');
        };
        const policy = { zone: { kind: 'offset', ms: 330 * 60_000 }, clock } as const;
        const pinned = resolveSurfaceOptions(
            [layer('flag', { now: '2026-01-15' })],
            DEFAULTS,
            policy,
        );
        expect(pinned.options.today).toEqual(utc(2026, 1, 15));
        const hidden = resolveSurfaceOptions([layer('flag', { now: '-' })], DEFAULTS, policy);
        expect(hidden.options).not.toHaveProperty('today');
    });
});

describe('the rc key table', () => {
    it('records each option rc key, and assetRoot as a spec of its own', (): void => {
        expect(SURFACE_RC_KEYS).toEqual({
            theme: 'theme',
            width: 'width',
            now: undefined,
            pageSize: 'pdfPageSize',
            nonWorking: undefined,
            assetRoot: 'assetRoot',
        });
        expect(Object.keys(SURFACE_OPTION_SPECS)).toEqual([
            'theme',
            'width',
            'now',
            'pageSize',
            'nonWorking',
        ]);
    });

    it('turns a .nowlinerc into a layer over the rc-backed options only', (): void => {
        const rc = rcLayer({ theme: 'dark', width: 500, pdfPageSize: 'a5', assetRoot: 'x' });
        expect(rc.values).toEqual({ theme: 'dark', width: 500, pageSize: 'a5' });
        expect(rc.source('pageSize')).toEqual({ kind: 'rc', key: 'pdfPageSize' });
    });
});

describe('surface-registered option specs', () => {
    // A stand-in for a CLI-only key: lower-case orientation, empty = unset.
    const orientation: OptionSpec<'portrait' | 'landscape'> = {
        rcKey: 'pdfOrientation',
        parse: (raw) =>
            raw === '' || raw === 'portrait' || raw === 'landscape'
                ? { ok: true, value: raw === '' ? undefined : raw }
                : { ok: false, detail: 'unknown', expected: ['portrait', 'landscape'] },
    };
    const CLI_SPECS = { orientation };

    type Key = SurfaceOptionKey | 'orientation';
    const flags: OptionLayer<Key> = {
        source: (key) => ({ kind: 'flag', name: `--${key}` }),
        values: { theme: 'dark', orientation: 'landscape' },
    };

    it('resolves a surface table over the same layers as the shared one', (): void => {
        const rc = rcLayer({ width: 900, pdfOrientation: 'portrait' });
        const cliRc = rcLayer({ width: 900, pdfOrientation: 'portrait' }, CLI_SPECS);
        const shared = resolveSurfaceOptions([flags, rc], DEFAULTS, UTC_POLICY);
        const own = resolveOptions(CLI_SPECS, [flags, cliRc]);
        expect(shared.options.theme).toBe('dark');
        expect(shared.options.width).toBe(900);
        expect(own).toEqual({ values: { orientation: 'landscape' }, errors: [] });
    });

    it('reports a registered key with the rc key it came from', (): void => {
        const cliRc = rcLayer({ pdfOrientation: 'sideways' }, CLI_SPECS);
        expect(resolveOptions(CLI_SPECS, [cliRc]).errors).toStrictEqual([
            {
                key: 'orientation',
                source: { kind: 'rc', key: 'pdfOrientation' },
                raw: 'sideways',
                detail: 'unknown',
                expected: ['portrait', 'landscape'],
            },
        ]);
    });

    it('leaves a key with no value in any layer out of the result', (): void => {
        expect(resolveOptions(CLI_SPECS, [])).toEqual({ values: {}, errors: [] });
    });
});

describe('the assetRoot spec', () => {
    const specs = { assetRoot: ASSET_ROOT_SPEC };

    it('reads the assetRoot rc key as written', () => {
        const { values, errors } = resolveOptions(specs, [rcLayer({ assetRoot: 'assets' }, specs)]);
        expect(values).toEqual({ assetRoot: 'assets' });
        expect(errors).toEqual([]);
    });

    it('treats an empty string as unset', () => {
        const { values, errors } = resolveOptions(specs, [rcLayer({ assetRoot: '' }, specs)]);
        expect(values).toEqual({});
        expect(errors).toEqual([]);
    });

    it('reports a value that is not a path, naming the rc key', () => {
        const { values, errors } = resolveOptions(specs, [rcLayer({ assetRoot: 5 }, specs)]);
        expect(values).toEqual({});
        expect(errors).toEqual([
            {
                key: 'assetRoot',
                source: { kind: 'rc', key: 'assetRoot' },
                raw: 5,
                detail: 'must be a directory path',
            },
        ]);
    });

    it('lets a flag beat the rc value and hides a bad rc value under it', () => {
        const flag = {
            source: (): OptionSource => ({ kind: 'flag', name: '--asset-root' }),
            values: { assetRoot: 'flagged' },
        };
        const { values, errors } = resolveOptions(specs, [flag, rcLayer({ assetRoot: 5 }, specs)]);
        expect(values).toEqual({ assetRoot: 'flagged' });
        expect(errors).toEqual([]);
    });
});
