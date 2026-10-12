import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { printNowlineFile } from '../../src/convert/printer.js';
import { type JsonAstNode, serializeToJson } from '../../src/convert/schema.js';
import type { NowlineFile } from '../../src/generated/ast.js';
import { getServices } from '../helpers.js';

let counter = 0;

async function canonical(source: string): Promise<string> {
    const { shared } = getServices();
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        source,
        URI.parse(`memory:///printer-${++counter}.nowline`),
    );
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return printNowlineFile(serializeToJson(doc, source).ast);
}

describe('printNowlineFile: roadmap style keys', () => {
    const roadmap = 'roadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n';

    // `non-working` follows `minor-grid` in the canonical key order. A key
    // missing from the order sorts after every listed one, so this also holds
    // before `non-working` is listed; it pins the order against a reshuffle.
    it('prints minor-grid:true before non-working:show', async () => {
        const out = await canonical(
            `config\ndefault roadmap non-working:show minor-grid:true\n${roadmap}`,
        );
        const line = out.split('\n').find((l) => l.includes('default roadmap'));
        expect(line).toBeDefined();
        expect(line).toContain('minor-grid:true');
        expect(line).toContain('non-working:show');
        expect(line?.indexOf('minor-grid:true')).toBeLessThan(
            line?.indexOf('non-working:show') ?? -1,
        );
    });

    it('prints non-working after every other roadmap style key', async () => {
        const out = await canonical(
            `config\ndefault roadmap non-working:show timeline-position:both header-position:above minor-grid:true\n${roadmap}`,
        );
        const line = out.split('\n').find((l) => l.includes('default roadmap')) ?? '';
        const keys = [...line.matchAll(/([\w-]+):/g)].map((m) => m[1]);
        expect(keys).toEqual(['header-position', 'timeline-position', 'minor-grid', 'non-working']);
    });

    it('round-trips the key', async () => {
        const once = await canonical(`config\ndefault roadmap non-working:show\n${roadmap}`);
        expect(once).toContain('default roadmap non-working:show');
        expect(await canonical(once)).toBe(once);
    });
});

describe('printNowlineFile: calendar declarations', () => {
    const roadmap = 'roadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n';

    async function toJson(source: string): Promise<JsonAstNode> {
        const { shared } = getServices();
        const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
            source,
            URI.parse(`memory:///printer-json-${++counter}.nowline`),
        );
        await shared.workspace.DocumentBuilder.build([doc], { validation: false });
        return serializeToJson(doc, source).ast;
    }

    it('orders keys date, every, start, end', async () => {
        const out = await canonical(
            `config\nnon-working x "X" every:[sat, sun] end:2026-03-01 start:2026-01-01\n${roadmap}`,
        );
        expect(out).toContain(
            '\nnon-working x "X" every:[sat, sun] start:2026-01-01 end:2026-03-01\n',
        );
    });

    it('prints the keywords of a declaration as written, not as a type name', async () => {
        const out = await canonical(
            `config\nnon-working a date:2026-01-01\nworking b date:2026-01-02\n${roadmap}`,
        );
        expect(out).toContain('\nnon-working a date:2026-01-01\n');
        expect(out).toContain('\nworking b date:2026-01-02\n');
        expect(out).not.toContain('nonworking');
    });

    it('keeps config entries in source order', async () => {
        const out = await canonical(
            `config\n\nstyle calm\n  bg: blue\n\nnon-working a date:2026-01-01\nworking b date:2026-01-02\ndefault item style:calm\n\n${roadmap}`,
        );
        const heads = out
            .split('\n')
            .filter((l) => /^(style|non-working|working|default) /.test(l))
            .map((l) => l.split(' ')[0]);
        expect(heads).toEqual(['style', 'non-working', 'working', 'default']);
    });

    it('prints a one-element list bare', async () => {
        const out = await canonical(`config\nnon-working h date:[2026-01-01]\n${roadmap}`);
        expect(out).toContain('\nnon-working h date:2026-01-01\n');
        expect(out).not.toContain('date:[');
    });

    // One case per property shape of specs/working-calendar.md §4.
    const shapes: Array<[string, string]> = [
        ['a single date', 'non-working h "Holiday" date:2026-12-25'],
        ['a date list', 'non-working h "Holidays" date:[2026-12-24, 2026-12-25]'],
        ['a range', 'working h "Crunch" start:2026-01-10 end:2026-01-12'],
        ['a recurrence', 'non-working weekend "Weekend" every:[fri, sat]'],
        ['a bounded recurrence', 'non-working every:fri start:2026-01-12 end:2026-01-25'],
        ['a half-open recurrence', 'working every:sat start:2026-01-12'],
        ['no id, title or properties', 'non-working'],
    ];

    for (const [name, declaration] of shapes) {
        const source = `config\n\n${declaration}\n\n${roadmap}`;

        it(`text -> json -> text is stable for ${name}`, async () => {
            const text = await canonical(source);
            expect(text).toContain(`\n${declaration}\n`);
            expect(printNowlineFile(await toJson(text))).toBe(text);
        });

        it(`json -> text -> json is stable for ${name}`, async () => {
            const firstJson = await toJson(await canonical(source));
            const secondJson = await toJson(printNowlineFile(firstJson));
            expect(stripPositions(secondJson)).toEqual(stripPositions(firstJson));
        });
    }
});

function stripPositions(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(stripPositions);
    if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (k === '$position') continue;
            out[k] = stripPositions(v);
        }
        return out;
    }
    return node;
}
