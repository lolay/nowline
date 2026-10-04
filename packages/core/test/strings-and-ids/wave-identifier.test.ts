import {
    createDefaultCoreModule,
    createDefaultSharedCoreModule,
    EmptyFileSystem,
    inject,
} from 'langium';
import { afterAll, beforeAll, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
    type EntityProperty,
    isAnchorDeclaration,
    isDefaultDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isLabelDeclaration,
    isParallelBlock,
    isPersonDeclaration,
    isPersonMemberRef,
    isScaleBlock,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
    type NowlineFile,
    type SwimlaneContent,
} from '../../src/generated/ast.js';
import {
    NowlineGeneratedModule,
    NowlineGeneratedSharedModule,
} from '../../src/generated/module.js';
import { NowlineModule } from '../../src/language/nowline-module.js';
import { getServices, type ParseOutcome, parse } from '../helpers.js';

// specs/waves.md §4.7: `wave` became a grammar keyword, so the lexer now prefers it
// over ID. The EntityName rule and the `| 'wave'` value-rule alternatives re-admit
// the bare word everywhere a v1 file could already write it.

// Belt-and-braces only: the production parser sets `maxLookahead: 4`, so Langium
// uses Chevrotain's LL(k) strategy, which logs nothing at parse time. The effective
// ambiguity gate is the 'grammar self-analysis' test at the bottom of this file.
// The spies still cover every parse below, in case the lookahead strategy changes.
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

describe('`wave` as a bare word (v1 compatibility)', () => {
    it('lexes `wave` as a keyword but `waves`, `wave-1`, `wavefront` as ID and `wave:` as a property key', () => {
        const lexer = getServices().Nowline.parser.Lexer;
        const result = lexer.tokenize('wave waves wave-1 wavefront wave:');
        expect(result.errors).toEqual([]);
        expect(result.tokens.map((t) => [t.image, t.tokenType.name])).toEqual([
            ['wave', 'wave'],
            ['waves', 'ID'],
            ['wave-1', 'ID'],
            ['wavefront', 'ID'],
            ['wave:', 'PROPERTY_KEY_WITH_COLON'],
        ]);
    });

    it('accepts `item wave`', async () => {
        const ast = await parseClean('roadmap r\nswimlane s\n  item wave duration:1w\n');
        expect(firstItem(firstLane(ast).content).name).toBe('wave');
    });

    it('accepts `item waves` and `item wave-1` as ordinary ids', async () => {
        const ast = await parseClean(
            'roadmap r\nswimlane s\n  item waves duration:1w\n  item wave-1 duration:1w\n',
        );
        const items = firstLane(ast).content.filter(isItemDeclaration);
        expect(items.map((i) => i.name)).toEqual(['waves', 'wave-1']);
    });

    it('accepts `swimlane wave`', async () => {
        const ast = await parseClean('roadmap r\nswimlane wave "Wave"\n  item a duration:1w\n');
        const lane = firstLane(ast);
        expect(lane.name).toBe('wave');
        expect(lane.title).toBe('Wave');
    });

    it('accepts `style wave` in config used as `style:wave`', async () => {
        const ast = await parseClean(
            'config\nstyle wave\n  bg: blue\nroadmap r\nswimlane s\n  item a duration:1w style:wave\n',
        );
        const style = ast.configEntries.find(isStyleDeclaration);
        expect(style?.name).toBe('wave');
        expect(prop(firstItem(firstLane(ast).content).properties, 'style').value).toBe('wave');
    });

    it('accepts `symbol wave`', async () => {
        const ast = await parseClean(
            'config\nsymbol wave unicode:"~" ascii:"~"\nroadmap r\nswimlane s\n  item a duration:1w\n',
        );
        const symbol = ast.configEntries.find(isSymbolDeclaration);
        expect(symbol?.name).toBe('wave');
    });

    it('accepts `person wave` at the top level and as a team member reference', async () => {
        const ast = await parseClean(
            'roadmap r\nperson wave "Wave Smith"\nteam t\n  person wave\nswimlane s\n  item a duration:1w owner:wave\n',
        );
        const person = ast.roadmapEntries.find(isPersonDeclaration);
        expect(person?.name).toBe('wave');
        expect(person?.title).toBe('Wave Smith');
        const team = ast.roadmapEntries.find(isTeamDeclaration);
        const member = team?.content.find(isPersonMemberRef);
        expect(member?.ref).toBe('wave');
        expect(prop(firstItem(firstLane(ast).content).properties, 'owner').value).toBe('wave');
    });

    it('accepts `wave` as the id of every other declaration kind', async () => {
        const ast = await parseClean(
            [
                'roadmap wave "R" start:2026-01-05',
                'anchor wave date:2026-01-05',
                'label wave',
                'size wave effort:1w',
                'status wave',
                'team wave',
                'swimlane s',
                '  parallel wave',
                '    item a duration:1w',
                '    item b duration:1w',
                'swimlane t',
                '  group wave',
                '    item c duration:1w',
                'milestone wave after:a',
                'footnote wave on:a',
                '',
            ].join('\n'),
        );
        expect(ast.roadmapDecl?.name).toBe('wave');
        const named = ast.roadmapEntries.filter((e) => !isSwimlaneDeclaration(e));
        expect(named.map((e) => [e.$type, 'name' in e ? e.name : undefined])).toEqual([
            ['AnchorDeclaration', 'wave'],
            ['LabelDeclaration', 'wave'],
            ['SizeDeclaration', 'wave'],
            ['StatusDeclaration', 'wave'],
            ['TeamDeclaration', 'wave'],
            ['MilestoneDeclaration', 'wave'],
            ['FootnoteDeclaration', 'wave'],
        ]);
        const lanes = ast.roadmapEntries.filter(isSwimlaneDeclaration);
        expect(lanes[0].content.find(isParallelBlock)?.name).toBe('wave');
        expect(lanes[1].content.find(isGroupBlock)?.name).toBe('wave');
    });

    it('accepts `after:wave` and `after:wavefront`', async () => {
        const ast = await parseClean(
            'roadmap r\nswimlane s\n  item wave duration:1w\n  item wavefront duration:1w\n  item a duration:1w after:wave\n  item b duration:1w after:wavefront\n',
        );
        const items = firstLane(ast).content.filter(isItemDeclaration);
        expect(prop(items[2].properties, 'after').value).toBe('wave');
        expect(prop(items[3].properties, 'after').value).toBe('wavefront');
    });

    it('accepts `labels:[wave]`', async () => {
        const ast = await parseClean(
            'roadmap r\nlabel wave "Wave"\nswimlane s\n  item a duration:1w labels:[wave]\n  item b duration:1w labels:[x, wave]\n',
        );
        expect(ast.roadmapEntries.find(isLabelDeclaration)?.name).toBe('wave');
        const items = firstLane(ast).content.filter(isItemDeclaration);
        expect(prop(items[0].properties, 'labels').values).toEqual(['wave']);
        expect(prop(items[1].properties, 'labels').values).toEqual(['x', 'wave']);
    });

    it('accepts `icon:wave` inside a style block', async () => {
        const ast = await parseClean(
            'config\nstyle s\n  icon: wave\nroadmap r\nswimlane l\n  item a duration:1w\n',
        );
        const style = ast.configEntries.find(isStyleDeclaration);
        expect(style?.properties.map((p) => [p.key, p.value])).toEqual([['icon', 'wave']]);
    });

    it('accepts `name: wave` inside a scale block', async () => {
        const ast = await parseClean(
            'config\nscale\n  name: wave\nroadmap r\nswimlane l\n  item a duration:1w\n',
        );
        const scale = ast.configEntries.find(isScaleBlock);
        expect(scale?.properties.map((p) => [p.key, p.value])).toEqual([['name', 'wave']]);
    });

    it('treats `wave:` on an item as a property key', async () => {
        const ast = await parseClean('roadmap r\nswimlane s\n  item x duration:1w wave:alpha\n');
        const p = prop(firstItem(firstLane(ast).content).properties, 'wave');
        expect(p.value).toBe('alpha');
    });

    it('treats `wave:` on a default line as a property key', async () => {
        const ast = await parseClean(
            'config\ndefault item wave:alpha\nroadmap r\nswimlane s\n  item x duration:1w\n',
        );
        const def = ast.configEntries.find(isDefaultDeclaration);
        expect(def?.entityType).toBe('item');
        expect(def?.properties.map((p) => [p.key, p.value])).toEqual([['wave', 'alpha']]);
    });

    it('rejects `default wave` (DefaultEntityType is unchanged)', async () => {
        const r = await parse(
            'config\ndefault wave style:x\nroadmap r\nswimlane s\n  item x duration:1w\n',
            { validate: false },
        );
        expect(r.parserErrors.length).toBeGreaterThan(0);
    });
});

describe('roadmap line followed by a wave line', () => {
    async function roadmapThenWave(roadmapLine: string): Promise<ParseOutcome> {
        return parse(`${roadmapLine}\nwave w1 "W1"\nswimlane s\n  item x duration:1w wave:w1\n`, {
            validate: false,
        });
    }

    it.each([
        ['roadmap r "R"', 'r', 'R'],
        ['roadmap "R"', undefined, 'R'],
        ['roadmap r', 'r', undefined],
    ])('`%s` keeps the next line as wave w1', async (line, name, title) => {
        const r = await roadmapThenWave(line);
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.roadmapDecl?.$type).toBe('RoadmapDeclaration');
        expect(r.ast.roadmapDecl?.name).toBe(name);
        expect(r.ast.roadmapDecl?.title).toBe(title);
        const waves = r.ast.roadmapEntries.filter(isWaveDeclaration);
        expect(waves.map((w) => [w.name, w.title])).toEqual([['w1', 'W1']]);
    });

    // Known residual ambiguity (specs/waves.md §4.7 "Residual ambiguity"): a
    // top-level declaration written as its keyword alone is already invalid
    // (NL.E0301). The parser runs LL(k) lookahead (`maxLookahead: 4`), so the
    // optional id slot greedily takes `wave` from the next line, whether or not
    // that wave line has an id. v1 behaved the same, because `wave` was an ID.
    it('residual: a bare `roadmap` line takes `wave` as its id', async () => {
        const r = await roadmapThenWave('roadmap');
        expect(r.ast.roadmapDecl?.name).toBe('wave');
        expect(r.ast.roadmapEntries.filter(isWaveDeclaration)).toEqual([]);
        expect(r.parserErrors.length).toBeGreaterThan(0);
    });

    it('residual: a bare top-level declaration followed by `wave "Title"` absorbs it', async () => {
        const r = await parse('roadmap r\nanchor\nwave "Title"\n', { validate: false });
        expect(r.parserErrors).toEqual([]);
        const anchor = r.ast.roadmapEntries.find(isAnchorDeclaration);
        expect(anchor?.name).toBe('wave');
        expect(anchor?.title).toBe('Title');
        expect(r.ast.roadmapEntries.filter(isWaveDeclaration)).toEqual([]);
    });

    it('residual: a bare `swimlane` line takes `wave` from a following `wave w1`', async () => {
        const r = await parse('roadmap r\nswimlane\nwave w1\n', { validate: false });
        expect(r.parserErrors.length).toBeGreaterThan(0);
        expect(r.ast.roadmapEntries.find(isSwimlaneDeclaration)?.name).toBe('wave');
        expect(r.ast.roadmapEntries.filter(isWaveDeclaration)).toEqual([]);
    });

    it('a declaration with only properties does not absorb the next `wave` line', async () => {
        const ast = await parseClean(
            'roadmap start:2026-01-05\nanchor date:2026-01-05\nwave w1 "W1"\n',
        );
        expect(ast.roadmapDecl?.name).toBeUndefined();
        expect(ast.roadmapEntries.find(isAnchorDeclaration)?.name).toBeUndefined();
        const waves = ast.roadmapEntries.filter(isWaveDeclaration);
        expect(waves.map((w) => [w.name, w.title])).toEqual([['w1', 'W1']]);
    });
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
        const r = services.parser.LangiumParser.parse('roadmap r\nwave w1 "W1"\n');
        expect(r.parserErrors).toEqual([]);
    });
});
