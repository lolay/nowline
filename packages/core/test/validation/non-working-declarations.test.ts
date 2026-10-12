import { describe, expect, it } from 'vitest';
import { tr } from '../../src/i18n/index.js';
import { describeNode, entityTypeLabel } from '../../src/language/validator-utils.js';
import { parse } from '../helpers.js';

// specs/working-calendar.md §6: validation NW1-NW5 for the `non-working` and
// `working` config declarations. Each code's English text is pinned exactly and
// its French text is rendered from the diagnostic's `{ code, args }` data, as in
// the style and symbol code tests of validation.test.ts.

const NBSP = ' ';
const q = (s: string) => `«${NBSP}${s}${NBSP}»`;

const BODY = 'swimlane s\n  item x duration:1w\n';
const CUSTOM_BLOCK = (daysPerWeek: number) =>
    `calendar\n  days-per-week: ${daysPerWeek}\n  days-per-month: 22\n  days-per-quarter: 65\n  days-per-year: 260\n`;

type Outcome = Awaited<ReturnType<typeof parse>>;
type Coded = { code: string; args: unknown[] };

interface Finding {
    code: string | undefined;
    message: string;
    line: number;
    data: Coded | undefined;
}

// Every diagnostic of the file, errors and warnings alike, so a case asserting
// one finding also proves nothing else fired.
function findings(r: Outcome): Finding[] {
    return r.diagnostics.map((d) => ({
        code: (d.data as Coded | undefined)?.code,
        message: d.message,
        line: d.range.start.line + 1,
        data: d.data as Coded | undefined,
    }));
}

function file(
    declarations: string,
    options: { roadmap?: string; config?: string } = {},
): { source: string; r: Promise<Outcome> } {
    const source = `config\n\n${options.config ?? ''}${declarations}\n\nroadmap r start:2026-01-05${options.roadmap ?? ''}\n${BODY}`;
    return { source, r: parse(source) };
}

async function check(
    declarations: string,
    options: { roadmap?: string; config?: string } = {},
): Promise<Finding[]> {
    return findings(await file(declarations, options).r);
}

function frenchOf(finding: Finding): string {
    const { code, args } = finding.data as { code: 'NL.E0900'; args: [{ kind: string }] };
    return tr('fr', code, ...args);
}

const SHAPE_EN = (kind: string) =>
    `A ${kind} declaration takes date:, or start: and end:, or every: with optional start: and end:.`;
const SHAPE_FR = (kind: string) =>
    `Une déclaration ${kind} prend date:, ou start: et end:, ou every: avec start: et end: facultatifs.`;

describe('NL.E0900: declaration shape (NW1)', () => {
    const cases: Array<[string, string]> = [
        ['no properties', 'non-working h'],
        ['date: with every:', 'non-working h date:2026-01-01 every:fri'],
        ['date: with start:', 'non-working h date:2026-01-01 start:2026-01-02'],
        ['a lone start:', 'non-working h start:2026-01-01'],
        ['a lone end:', 'non-working h end:2026-01-01'],
    ];

    for (const [name, declaration] of cases) {
        it(`reports ${name} once, on the declaration, in English and French`, async () => {
            const [f, ...rest] = await check(declaration);
            expect(rest).toEqual([]);
            expect(f.code).toBe('NL.E0900');
            expect(f.message).toBe(SHAPE_EN('non-working'));
            expect(f.line).toBe(3);
            expect(frenchOf(f)).toBe(SHAPE_FR('non-working'));
        });
    }

    it('names the keyword for a working declaration', async () => {
        const [f, ...rest] = await check('working h');
        expect(rest).toEqual([]);
        expect(f.message).toBe(SHAPE_EN('working'));
        expect(frenchOf(f)).toBe(SHAPE_FR('working'));
    });

    it('accepts an id-less, title-less declaration that has a valid shape', async () => {
        expect(await check('non-working date:2026-01-01')).toEqual([]);
    });
});

describe('NL.E0901: own keys', () => {
    it('rejects style: on the property, once', async () => {
        const [f, ...rest] = await check('non-working h date:2026-01-01 style:x');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0901');
        expect(f.message).toBe(
            'Unknown non-working property "style". Allowed: date, start, end, every.',
        );
        expect(f.line).toBe(3);
        const { code, args } = f.data as {
            code: 'NL.E0901';
            args: [{ kind: string; key: string }];
        };
        expect(tr('fr', code, ...args)).toBe(
            `Propriété non-working inconnue ${q('style')}. Autorisées${NBSP}: date, start, end, every.`,
        );
    });

    it('rejects wave: too, which the generic unknown-key check skips', async () => {
        const [f, ...rest] = await check('working h date:2026-01-01 wave:w');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0901');
        expect(f.message).toBe(
            'Unknown working property "wave". Allowed: date, start, end, every.',
        );
    });

    it('rejects labels: and link: as well', async () => {
        const found = await check(
            'non-working h date:2026-01-01 labels:a link:https://example.com',
        );
        expect(found.map((f) => [f.code, f.message])).toEqual([
            [
                'NL.E0901',
                'Unknown non-working property "labels". Allowed: date, start, end, every.',
            ],
            ['NL.E0901', 'Unknown non-working property "link". Allowed: date, start, end, every.'],
        ]);
    });
});

describe('NL.E0902: start: and end: take one date', () => {
    it('rejects a list for start:', async () => {
        const [f, ...rest] = await check(
            'non-working h start:[2026-01-01, 2026-01-02] end:2026-01-03',
        );
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0902');
        expect(f.message).toBe('start: on a non-working declaration takes one date, not a list.');
        const { code, args } = f.data as {
            code: 'NL.E0902';
            args: [{ kind: string; key: string }];
        };
        expect(tr('fr', code, ...args)).toBe(
            'start: sur une déclaration non-working prend une seule date, pas une liste.',
        );
    });

    it('rejects a list for end:', async () => {
        const [f, ...rest] = await check('working h start:2026-01-01 end:[2026-01-02, 2026-01-03]');
        expect(rest).toEqual([]);
        expect(f.message).toBe('end: on a working declaration takes one date, not a list.');
    });
});

describe('NL.E0405: every date is checked', () => {
    const invalid = (key: string, value: string) =>
        `Invalid ${key} "${value}". Use ISO 8601 format: YYYY-MM-DD.`;

    it('rejects a month that does not exist in date:', async () => {
        const [f, ...rest] = await check('non-working h date:2026-13-01');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0405');
        expect(f.message).toBe(invalid('date', '2026-13-01'));
    });

    it('rejects one bad element of a date: list, once, on that element', async () => {
        const [f, ...rest] = await check('non-working h date:[2026-01-01, 2026-02-30]');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0405');
        expect(f.message).toBe(invalid('date', '2026-02-30'));
    });

    it('rejects every bad element of a date: list', async () => {
        const found = await check('non-working h date:[2026-13-01, 2026-01-01, 2026-04-31]');
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.E0405', invalid('date', '2026-13-01')],
            ['NL.E0405', invalid('date', '2026-04-31')],
        ]);
    });

    it('rejects an impossible end: through the end key', async () => {
        const [f, ...rest] = await check('non-working h start:2026-01-01 end:2026-02-30');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0405');
        expect(f.message).toBe(invalid('end', '2026-02-30'));
    });

    it('rejects an impossible start:', async () => {
        const [f, ...rest] = await check('non-working h start:2026-02-30 end:2026-03-05');
        expect(rest).toEqual([]);
        expect(f.message).toBe(invalid('start', '2026-02-30'));
    });

    it('renders the French text', async () => {
        const [f] = await check('non-working h date:2026-13-01');
        const { code, args } = f.data as {
            code: 'NL.E0405';
            args: [{ key: string; value: string }];
        };
        expect(tr('fr', code, ...args)).toBe(
            `date invalide ${q('2026-13-01')}. Utilisez le format ISO 8601${NBSP}: AAAA-MM-JJ.`,
        );
    });
});

describe('NL.E0903: end: before start: (NW2)', () => {
    it('rejects an end before the start', async () => {
        const [f, ...rest] = await check('non-working h start:2026-01-10 end:2026-01-09');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0903');
        expect(f.message).toBe('end: 2026-01-09 is before start: 2026-01-10.');
        expect(f.line).toBe(3);
        const { code, args } = f.data as {
            code: 'NL.E0903';
            args: [{ end: string; start: string }];
        };
        expect(tr('fr', code, ...args)).toBe('end: 2026-01-09 précède start: 2026-01-10.');
    });

    it('accepts an end equal to the start', async () => {
        expect(await check('non-working h start:2026-01-10 end:2026-01-10')).toEqual([]);
    });

    it('applies to a recurrence window as well', async () => {
        const [f, ...rest] = await check('non-working h every:fri start:2026-02-01 end:2026-01-01');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0903');
    });
});

describe('NL.E0904 and NL.E0905: weekday names (NW3)', () => {
    it('rejects a word that is not a weekday', async () => {
        const [f, ...rest] = await check('non-working h every:funday');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0904');
        expect(f.message).toBe(
            'Invalid weekday "funday". Use sun, mon, tue, wed, thu, fri or sat.',
        );
        const { code, args } = f.data as { code: 'NL.E0904'; args: [{ value: string }] };
        expect(tr('fr', code, ...args)).toBe(
            `Jour de semaine invalide ${q('funday')}. Utilisez sun, mon, tue, wed, thu, fri ou sat.`,
        );
    });

    it('rejects each bad name in a list', async () => {
        const found = await check('non-working h every:[fri, sunday, moon]');
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.E0904', 'Invalid weekday "sunday". Use sun, mon, tue, wed, thu, fri or sat.'],
            ['NL.E0904', 'Invalid weekday "moon". Use sun, mon, tue, wed, thu, fri or sat.'],
        ]);
    });

    it('rejects a weekday listed twice', async () => {
        const [f, ...rest] = await check('non-working h every:[sat, sat]');
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0905');
        expect(f.message).toBe('Weekday "sat" is listed more than once.');
        const { code, args } = f.data as { code: 'NL.E0905'; args: [{ value: string }] };
        expect(tr('fr', code, ...args)).toBe(`Le jour ${q('sat')} apparaît plusieurs fois.`);
    });
});

describe('NL.E0906: an unbounded stretch with no working day (NW3)', () => {
    const MESSAGE =
        'This leaves no working day in the week with no end date. Keep at least one weekday working.';
    const WEEKDAYS = '[mon, tue, wed, thu, fri]';

    it('rejects Monday to Friday off on business, where the preset closes Sat and Sun', async () => {
        const [f, ...rest] = await check(`non-working h every:${WEEKDAYS}`);
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0906');
        expect(f.message).toBe(MESSAGE);
        expect(f.line).toBe(3);
        const { code } = f.data as { code: 'NL.E0906' };
        expect(tr('fr', code)).toBe(
            'Il ne reste aucun jour ouvré dans la semaine sans date de fin. Gardez au moins un jour ouvré.',
        );
    });

    it('rejects a half-open recurrence that closes the last working days', async () => {
        const [f, ...rest] = await check(`non-working h every:${WEEKDAYS} start:2026-01-01`);
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0906');
        expect(f.line).toBe(3);
    });

    it('rejects all seven days off on the full calendar', async () => {
        const found = await check('non-working h every:[sun, mon, tue, wed, thu, fri, sat]', {
            roadmap: ' calendar:full',
        });
        expect(found.map((f) => f.code)).toEqual(['NL.E0906']);
    });

    it('reports each open-ended non-working declaration', async () => {
        const found = await check(
            `non-working a every:${WEEKDAYS}\nnon-working b every:[sat, sun]\nworking c date:2026-01-01`,
        );
        expect(found.map((f) => [f.code, f.line])).toEqual([
            ['NL.E0906', 3],
            ['NL.E0906', 4],
        ]);
    });

    it('accepts a closed window that closes all seven days', async () => {
        expect(
            await check(
                'non-working h every:[sun, mon, tue, wed, thu, fri, sat] start:2026-12-24 end:2027-01-01',
            ),
        ).toEqual([]);
    });

    it('accepts a weekend that replaces the preset weekend, and warns NL.W0705', async () => {
        const found = await check(`non-working weekend every:${WEEKDAYS}`);
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.W0705', 'days-per-week is 5, but the week leaves 2 working days.'],
        ]);
    });

    it('accepts a weekday that an open-ended working declaration keeps', async () => {
        const found = await check(`non-working a every:${WEEKDAYS}\nworking b every:mon`);
        expect(found.map((f) => f.code)).toEqual(['NL.W0705']);
    });
});

describe('NL.W0705: days-per-week against the week (NW4)', () => {
    it('warns on the days-per-week property of a custom calendar with no declarations', async () => {
        const { source, r } = file('', {
            roadmap: ' calendar:custom',
            config: CUSTOM_BLOCK(6),
        });
        const found = findings(await r);
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.W0705', 'days-per-week is 6, but the week leaves 7 working days.'],
        ]);
        const propertyLine = source.split('\n').findIndex((l) => l.includes('days-per-week')) + 1;
        expect(found[0].line).toBe(propertyLine);
        const { code, args } = found[0].data as {
            code: 'NL.W0705';
            args: [{ daysPerWeek: number; working: number }];
        };
        expect(tr('fr', code, ...args)).toBe(
            'days-per-week vaut 6, mais la semaine laisse 7 jours ouvrés.',
        );
    });

    it('warns on the declaration when business has no calendar: property and Saturday works', async () => {
        const { source, r } = file('working h every:sat');
        const found = findings(await r);
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.W0705', 'days-per-week is 5, but the week leaves 6 working days.'],
        ]);
        const declarationLine = source.split('\n').findIndex((l) => l.startsWith('working h')) + 1;
        expect(found[0].line).toBe(declarationLine);
    });

    it('warns on the roadmap calendar: property when there is no custom block', async () => {
        const { source, r } = file('non-working fridays every:fri', { roadmap: ' calendar:full' });
        const found = findings(await r);
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.W0705', 'days-per-week is 7, but the week leaves 6 working days.'],
        ]);
        const roadmapLine = source.split('\n').findIndex((l) => l.startsWith('roadmap')) + 1;
        expect(found[0].line).toBe(roadmapLine);
    });

    it('warns on the roadmap declaration when no open-ended declaration or block exists', async () => {
        const { source, r } = file('non-working weekend date:2026-01-10');
        const found = findings(await r);
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.W0705', 'days-per-week is 5, but the week leaves 7 working days.'],
        ]);
        const roadmapLine = source.split('\n').findIndex((l) => l.startsWith('roadmap')) + 1;
        expect(found[0].line).toBe(roadmapLine);
    });

    it('warns for custom 5 with no every: declaration', async () => {
        const found = await check('', { roadmap: ' calendar:custom', config: CUSTOM_BLOCK(5) });
        expect(found.map((f) => [f.code, f.message])).toEqual([
            ['NL.W0705', 'days-per-week is 5, but the week leaves 7 working days.'],
        ]);
    });

    it('is quiet for business with no declarations', async () => {
        expect(await check('')).toEqual([]);
    });

    it('is quiet for full with no declarations', async () => {
        expect(await check('', { roadmap: ' calendar:full' })).toEqual([]);
    });

    it('is quiet for Example C, a Friday and Saturday weekend on business', async () => {
        expect(await check('non-working weekend "Weekend" every:[fri, sat]')).toEqual([]);
    });

    it('is quiet for custom 7', async () => {
        expect(await check('', { roadmap: ' calendar:custom', config: CUSTOM_BLOCK(7) })).toEqual(
            [],
        );
    });

    it('is quiet for custom 5 closed on Saturday and Sunday', async () => {
        expect(
            await check('non-working every:[sat, sun]', {
                roadmap: ' calendar:custom',
                config: CUSTOM_BLOCK(5),
            }),
        ).toEqual([]);
    });

    it('is quiet for dated and bounded declarations, which are exceptions to the week', async () => {
        expect(
            await check(
                'non-working a date:2026-01-10\nnon-working b every:fri start:2026-02-01 end:2026-03-01',
            ),
        ).toEqual([]);
    });
});

describe('NL.E0907: duplicate declaration ids (NW5)', () => {
    it('reports the second of two non-working declarations with one id', async () => {
        const [f, ...rest] = await check(
            'non-working h date:2026-01-01\nnon-working h date:2026-01-02',
        );
        expect(rest).toEqual([]);
        expect(f.code).toBe('NL.E0907');
        expect(f.message).toBe('Duplicate non-working id "h".');
        expect(f.line).toBe(4);
        const { code, args } = f.data as {
            code: 'NL.E0907';
            args: [{ kind: string; name: string }];
        };
        expect(tr('fr', code, ...args)).toBe(`Identifiant non-working ${q('h')} en double.`);
    });

    it('reports two working declarations with one id', async () => {
        const [f, ...rest] = await check('working h date:2026-01-01\nworking h date:2026-01-02');
        expect(rest).toEqual([]);
        expect(f.message).toBe('Duplicate working id "h".');
    });

    it('accepts a non-working and a working declaration that share an id', async () => {
        expect(await check('non-working h date:2026-01-01\nworking h date:2026-01-01')).toEqual([]);
    });

    it('accepts declarations with no id', async () => {
        expect(await check('non-working date:2026-01-01\nnon-working date:2026-01-02')).toEqual([]);
    });
});

describe('properties on other entities', () => {
    it('keeps NL.W0700 for every: on an item', async () => {
        const r = await parse('roadmap r\nswimlane s\n  item x duration:1w every:mon\n');
        const found = findings(r);
        expect(found.map((f) => f.code)).toEqual(['NL.W0700']);
        expect(found[0].message).toMatch(/^Unknown property "every" on item "x"\. /);
    });

    it('keeps NL.W0700 and adds NL.E0405 for end:nope on an item', async () => {
        const r = await parse('roadmap r\nswimlane s\n  item x duration:1w end:nope\n');
        const found = findings(r);
        expect(found.map((f) => f.code).sort()).toEqual(['NL.E0405', 'NL.W0700']);
        expect(found.find((f) => f.code === 'NL.E0405')?.message).toBe(
            'Invalid end "nope". Use ISO 8601 format: YYYY-MM-DD.',
        );
        expect(found.find((f) => f.code === 'NL.W0700')?.message).toMatch(
            /^Unknown property "end" on item "x"\. /,
        );
    });
});

describe('valid shapes', () => {
    it('accepts every property shape of the spike without a diagnostic', async () => {
        const found = await check(
            [
                'non-working thanksgiving "Thanksgiving" date:[2026-11-26, 2026-11-27]',
                'non-working "Christmas" date:2026-12-25',
                'non-working shutdown start:2026-12-24 end:2027-01-01',
                'non-working summer every:fri start:2026-06-01 end:2026-08-31',
                'non-working every:sun end:2026-03-01',
                'working crunch "Crunch Saturday" date:2026-11-28',
                'working every:sat start:2026-02-01 end:2026-03-01',
            ].join('\n'),
        );
        expect(found).toEqual([]);
    });

    it('accepts a one-element list for start: and end: as the single date', async () => {
        expect(await check('non-working h start:[2026-01-01] end:[2026-01-02]')).toEqual([]);
    });
});

describe('type label', () => {
    it('labels a NonWorkingDeclaration non-working, not nonworking', () => {
        expect(entityTypeLabel({ $type: 'NonWorkingDeclaration' })).toBe('non-working');
        expect(entityTypeLabel({ $type: 'WorkingDeclaration' })).toBe('working');
        expect(describeNode({ $type: 'NonWorkingDeclaration', name: 'h' })).toBe('non-working "h"');
    });

    it('uses the hyphenated keyword in every message', async () => {
        const found = await check('non-working h');
        expect(found[0].message).toContain('A non-working declaration');
        expect(found[0].message).not.toContain('nonworking');
    });
});
