import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { printNowlineFile } from '../../src/convert/printer.js';
import { serializeToJson } from '../../src/convert/schema.js';
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
