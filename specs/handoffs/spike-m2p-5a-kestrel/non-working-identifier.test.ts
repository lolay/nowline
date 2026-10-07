import {
    createDefaultCoreModule,
    createDefaultSharedCoreModule,
    EmptyFileSystem,
    inject,
} from 'langium';
import { afterAll, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
    type EntityProperty,
    isDefaultDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isLabelDeclaration,
    isNonWorkingDeclaration,
    isParallelBlock,
    isPersonDeclaration,
    isPersonMemberRef,
    isScaleBlock,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
    isWorkingDeclaration,
    type NowlineFile,
    type SwimlaneContent,
} from '../../src/generated/ast.js';
import {
    NowlineGeneratedModule,
    NowlineGeneratedSharedModule,
} from '../../src/generated/module.js';
import { NowlineModule } from '../../src/language/nowline-module.js';
import { getServices, parse } from '../helpers.js';

// specs/working-calendar.md §4.4 and the m2p handoff (decision 1): `non-working` is the
// first hyphenated keyword and `working` an ordinary English word, so both are gated
// here like `wave` (wave-identifier.test.ts). The EntityName rule and the value-rule
// alternatives re-admit each bare word everywhere a v1 file could already write it.

// Belt-and-braces only, as in wave-identifier.test.ts: the production parser runs LL(k)
// (`maxLookahead: 4`) and logs nothing at parse time. The real gate is the
// 'grammar self-analysis' test at the bottom of this file.
const consoleSpies: MockInstance[] = [];
beforeAll(() => {
    consoleSpies.push(
        vi.spyOn(console, 'warn'),
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'log'),
    );
});
afterAll(() => {
    for (const spy of consoleSpies) spy.mockRestore();
});

function ambiguityMessages(): string[] {
    return consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => args.map(String).join(' '))
        .filter((msg) => /ambigu/i.test(msg));
}

async function parseClean(input: string): Promise<NowlineFile> {
    const r = await parse(input, { validate: false });
    expect(r.lexerErrors).toEqual([]);
    expect(r.parserErrors).toEqual([]);
    expect(ambiguityMessages()).toEqual([]);
    return r.ast;
}

function firstLane(ast: NowlineFile) {
    const lane = ast.roadmapEntries.find(isSwimlaneDeclaration);
    if (!lane) throw new Error('expected a swimlane');
    return lane;
}

function firstItem(content: SwimlaneContent[]) {
    const item = content.find(isItemDeclaration);
    if (!item) throw new Error('expected an item');
    return item;
}

function prop(properties: EntityProperty[], key: string): EntityProperty {
    const p = properties.find((x) => x.key === key);
    if (!p) throw new Error(`expected a ${key}: property`);
    return p;
}

describe('lexing `non-working` and `working`', () => {
    it('lexes both as keywords, hyphenated and longer words as ID, and `word:` as a property key', () => {
        const lexer = getServices().Nowline.parser.Lexer;
        const result = lexer.tokenize(
            'non-working working non-working-team working-group nonworking workings non-working: working: non-workingday',
        );
        expect(result.errors).toEqual([]);
        expect(result.tokens.map((t) => [t.image, t.tokenType.name])).toEqual([
            ['non-working', 'non-working'],
            ['working', 'working'],
            ['non-working-team', 'ID'],
            ['working-group', 'ID'],
            ['nonworking', 'ID'],
            ['workings', 'ID'],
            ['non-working:', 'PROPERTY_KEY_WITH_COLON'],
            ['working:', 'PROPERTY_KEY_WITH_COLON'],
            ['non-workingday', 'ID'],
        ]);
    });
});

describe('the declarations parse', () => {
    it('accepts every property shape for both keywords', async () => {
        const ast = await parseClean(
            [
                'config',
                'non-working thanksgiving "Thanksgiving" date:[2026-11-26, 2026-11-27]',
                'non-working "Christmas" date:2026-12-25',
                'non-working shutdown start:2026-12-24 end:2027-01-01',
                'non-working weekend "Weekend" every:[fri, sat]',
                'non-working summer every:fri start:2026-06-01 end:2026-08-31',
                'non-working every:sun end:2026-03-01',
                'working crunch "Crunch Saturday" date:2026-11-28',
                'working every:sat start:2026-02-01',
                'roadmap r start:2026-11-23',
                '',
            ].join('\n'),
        );
        const nonWorking = ast.configEntries.filter(isNonWorkingDeclaration);
        expect(
            nonWorking.map((d) => [
                d.name,
                d.title,
                d.properties.map((p) => [p.key, p.value ?? p.values]),
            ]),
        ).toEqual([
            ['thanksgiving', 'Thanksgiving', [['date', ['2026-11-26', '2026-11-27']]]],
            [undefined, 'Christmas', [['date', '2026-12-25']]],
            [
                'shutdown',
                undefined,
                [
                    ['start', '2026-12-24'],
                    ['end', '2027-01-01'],
                ],
            ],
            ['weekend', 'Weekend', [['every', ['fri', 'sat']]]],
            [
                'summer',
                undefined,
                [
                    ['every', 'fri'],
                    ['start', '2026-06-01'],
                    ['end', '2026-08-31'],
                ],
            ],
            [
                undefined,
                undefined,
                [
                    ['every', 'sun'],
                    ['end', '2026-03-01'],
                ],
            ],
        ]);
        const working = ast.configEntries.filter(isWorkingDeclaration);
        expect(
            working.map((d) => [d.name, d.title, d.properties.map((p) => [p.key, p.value])]),
        ).toEqual([
            ['crunch', 'Crunch Saturday', [['date', '2026-11-28']]],
            [
                undefined,
                undefined,
                [
                    ['every', 'sat'],
                    ['start', '2026-02-01'],
                ],
            ],
        ]);
        expect(ast.roadmapDecl?.name).toBe('r');
    });

    it('keeps `default roadmap non-working:show` a property key (Phase 4)', async () => {
        const ast = await parseClean(
            'config\nnon-working date:2026-01-01\ndefault roadmap non-working:show\nroadmap r\n',
        );
        const def = ast.configEntries.find(isDefaultDeclaration);
        expect(def?.properties.map((p) => [p.key, p.value])).toEqual([['non-working', 'show']]);
        expect(ast.configEntries.filter(isNonWorkingDeclaration)).toHaveLength(1);
    });
});

describe.each(['non-working', 'working'])('`%s` as a bare word (v1 compatibility)', (word) => {
    it('accepts `item <word>`', async () => {
        const ast = await parseClean(`roadmap r\nswimlane s\n  item ${word} duration:1w\n`);
        expect(firstItem(firstLane(ast).content).name).toBe(word);
    });

    it('accepts `swimlane <word>`', async () => {
        const ast = await parseClean(`roadmap r\nswimlane ${word} "Lane"\n  item a duration:1w\n`);
        expect(firstLane(ast).name).toBe(word);
    });

    it('accepts `style <word>` in config used as `style:<word>`', async () => {
        const ast = await parseClean(
            `config\nstyle ${word}\n  bg: blue\nroadmap r\nswimlane s\n  item a duration:1w style:${word}\n`,
        );
        expect(ast.configEntries.find(isStyleDeclaration)?.name).toBe(word);
        expect(prop(firstItem(firstLane(ast).content).properties, 'style').value).toBe(word);
    });

    it('accepts `symbol <word>`', async () => {
        const ast = await parseClean(
            `config\nsymbol ${word} unicode:"~" ascii:"~"\nroadmap r\nswimlane s\n  item a duration:1w\n`,
        );
        expect(ast.configEntries.find(isSymbolDeclaration)?.name).toBe(word);
    });

    it('accepts `person <word>` at the top level and as a team member reference', async () => {
        const ast = await parseClean(
            `roadmap r\nperson ${word} "Pat"\nteam t\n  person ${word}\nswimlane s\n  item a duration:1w owner:${word}\n`,
        );
        expect(ast.roadmapEntries.find(isPersonDeclaration)?.name).toBe(word);
        const member = ast.roadmapEntries.find(isTeamDeclaration)?.content.find(isPersonMemberRef);
        expect(member?.ref).toBe(word);
        expect(prop(firstItem(firstLane(ast).content).properties, 'owner').value).toBe(word);
    });

    it('accepts `<word>` as the id of every other declaration kind', async () => {
        const ast = await parseClean(
            [
                `roadmap ${word} "R" start:2026-01-05`,
                `anchor ${word} date:2026-01-05`,
                `label ${word}`,
                `size ${word} effort:1w`,
                `status ${word}`,
                `team ${word}`,
                `wave ${word}`,
                'swimlane s',
                `  parallel ${word}`,
                '    item a duration:1w',
                '    item b duration:1w',
                'swimlane t',
                `  group ${word}`,
                '    item c duration:1w',
                `milestone ${word} after:a`,
                `footnote ${word} on:a`,
                '',
            ].join('\n'),
        );
        expect(ast.roadmapDecl?.name).toBe(word);
        const named = ast.roadmapEntries.filter((e) => !isSwimlaneDeclaration(e));
        expect(named.map((e) => [e.$type, 'name' in e ? e.name : undefined])).toEqual([
            ['AnchorDeclaration', word],
            ['LabelDeclaration', word],
            ['SizeDeclaration', word],
            ['StatusDeclaration', word],
            ['TeamDeclaration', word],
            ['WaveDeclaration', word],
            ['MilestoneDeclaration', word],
            ['FootnoteDeclaration', word],
        ]);
        const lanes = ast.roadmapEntries.filter(isSwimlaneDeclaration);
        expect(lanes[0].content.find(isParallelBlock)?.name).toBe(word);
        expect(lanes[1].content.find(isGroupBlock)?.name).toBe(word);
    });

    it('accepts `<word>` as the id of a non-working and a working declaration', async () => {
        const ast = await parseClean(
            `config\nnon-working ${word} date:2026-01-01\nworking ${word} date:2026-01-03\nroadmap r\n`,
        );
        expect(ast.configEntries.find(isNonWorkingDeclaration)?.name).toBe(word);
        expect(ast.configEntries.find(isWorkingDeclaration)?.name).toBe(word);
    });

    it('accepts `after:<word>`, `labels:[<word>]` and `wave:<word>`', async () => {
        const ast = await parseClean(
            `roadmap r\nlabel ${word} "L"\nwave ${word}\nswimlane s\n  item ${word} duration:1w\n  item a duration:1w after:${word} labels:[x, ${word}] wave:${word}\n`,
        );
        expect(ast.roadmapEntries.find(isLabelDeclaration)?.name).toBe(word);
        const items = firstLane(ast).content.filter(isItemDeclaration);
        expect(prop(items[1].properties, 'after').value).toBe(word);
        expect(prop(items[1].properties, 'labels').values).toEqual(['x', word]);
        expect(prop(items[1].properties, 'wave').value).toBe(word);
    });

    it('accepts `icon: <word>` inside a style block', async () => {
        const ast = await parseClean(
            `config\nstyle s\n  icon: ${word}\nroadmap r\nswimlane l\n  item a duration:1w\n`,
        );
        const style = ast.configEntries.find(isStyleDeclaration);
        expect(style?.properties.map((p) => [p.key, p.value])).toEqual([['icon', word]]);
    });

    it('accepts `name: <word>` inside a scale block', async () => {
        const ast = await parseClean(
            `config\nscale\n  name: ${word}\nroadmap r\nswimlane l\n  item a duration:1w\n`,
        );
        const scale = ast.configEntries.find(isScaleBlock);
        expect(scale?.properties.map((p) => [p.key, p.value])).toEqual([['name', word]]);
    });

    it('treats `<word>:` on an item and on a default line as a property key', async () => {
        const ast = await parseClean(
            `config\ndefault item ${word}:x\nroadmap r\nswimlane s\n  item a duration:1w ${word}:y\n`,
        );
        const def = ast.configEntries.find(isDefaultDeclaration);
        expect(def?.properties.map((p) => [p.key, p.value])).toEqual([[word, 'x']]);
        expect(prop(firstItem(firstLane(ast).content).properties, word).value).toBe('y');
    });

    it('rejects `default <word>` (DefaultEntityType is unchanged)', async () => {
        const r = await parse(`config\ndefault ${word} style:x\nroadmap r\n`, {
            validate: false,
        });
        expect(r.parserErrors.length).toBeGreaterThan(0);
    });
});

describe('a config line followed by a non-working or working line', () => {
    it.each(['non-working', 'working'])(
        'a named `style` line keeps the next `%s` line as a declaration',
        async (word) => {
            const ast = await parseClean(
                `config\nstyle s\n  bg: blue\n${word} x date:2026-01-01\nroadmap r\n`,
            );
            expect(ast.configEntries.map((e) => e.$type)).toEqual([
                'StyleDeclaration',
                word === 'working' ? 'WorkingDeclaration' : 'NonWorkingDeclaration',
            ]);
        },
    );

    it('a declaration with only properties does not absorb the next line', async () => {
        const ast = await parseClean(
            'config\nnon-working date:2026-01-01\nworking date:2026-01-03\nnon-working every:sat\nroadmap r\n',
        );
        expect(ast.configEntries.map((e) => [e.$type, 'name' in e ? e.name : undefined])).toEqual([
            ['NonWorkingDeclaration', undefined],
            ['WorkingDeclaration', undefined],
            ['NonWorkingDeclaration', undefined],
        ]);
    });

    // Known residual ambiguity, the same class as waves (specs/waves.md §4.7): a config
    // declaration written as its keyword alone takes the next line's keyword as its id.
    // A bare `style` or `symbol` is already NL.E0301; a bare `non-working` or `working`
    // is an NW1 shape error.
    it.each([
        ['style', 'StyleDeclaration'],
        ['symbol', 'SymbolDeclaration'],
        ['non-working', 'NonWorkingDeclaration'],
        ['working', 'WorkingDeclaration'],
    ])(
        'residual: a bare `%s` line takes `non-working` from the next line as its id',
        async (bare, type) => {
            const r = await parse(`config\n${bare}\nnon-working x date:2026-01-01\nroadmap r\n`, {
                validate: false,
            });
            const first = r.ast.configEntries[0];
            expect(first?.$type).toBe(type);
            expect('name' in first ? first.name : undefined).toBe('non-working');
        },
    );
});

describe('grammar self-analysis', () => {
    // Langium skips Chevrotain's grammar validations by default, so an ambiguous
    // alternation introduced by a keyword would otherwise go unreported. Build the
    // parser with validations on, using the same lookahead config as production.
    it('reports no parser definition errors with validations enabled', () => {
        const productionConfig = NowlineModule.parser?.ParserConfig;
        if (typeof productionConfig !== 'function') throw new Error('expected a ParserConfig');
        const shared = inject(
            createDefaultSharedCoreModule(EmptyFileSystem),
            NowlineGeneratedSharedModule,
        );
        const services = inject(createDefaultCoreModule({ shared }), NowlineGeneratedModule, {
            ...NowlineModule,
            parser: {
                ...NowlineModule.parser,
                ParserConfig: () => ({ ...productionConfig({} as never), skipValidations: false }),
            },
        });
        // Chevrotain throws "Parser Definition Errors detected" from performSelfAnalysis.
        expect(() => services.parser.LangiumParser).not.toThrow();
        const r = services.parser.LangiumParser.parse(
            'config\nnon-working x "X" date:2026-01-01\nworking y every:sat start:2026-01-01\nroadmap r\n',
        );
        expect(r.parserErrors).toEqual([]);
    });
});
