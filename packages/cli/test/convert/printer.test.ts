import { describe, it, expect } from 'vitest';
import { parseSource } from '../../src/core/parse.js';
import { serializeToJson } from '../../src/convert/schema.js';
import { printNowlineFile } from '../../src/convert/printer.js';

async function canonical(source: string): Promise<string> {
    const r = await parseSource(source, 'test.nowline', { validate: true });
    expect(r.hasErrors, r.diagnostics.map((d) => d.message).join('\n')).toBe(false);
    return printNowlineFile(serializeToJson(r.document, source).ast);
}

describe('canonical printer rules', () => {
    it('uses two-space indentation', async () => {
        const out = await canonical(
            `roadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n`,
        );
        expect(out).toContain('\n  item x');
    });

    it('orders keyed properties canonically (duration before status before labels)', async () => {
        const out = await canonical(
            `roadmap r "R"\nswimlane s "S"\n  item x "X" labels:e status:done duration:1w\n`,
        );
        const itemLine = out.split('\n').find((l) => l.includes('item x'));
        expect(itemLine).toBeDefined();
        const durationIdx = itemLine!.indexOf('duration:');
        const statusIdx = itemLine!.indexOf('status:');
        const labelsIdx = itemLine!.indexOf('labels:');
        expect(durationIdx).toBeLessThan(statusIdx);
        expect(statusIdx).toBeLessThan(labelsIdx);
    });

    it('renders single-element lists as bare, multi-element lists in brackets', async () => {
        const out = await canonical(
            `roadmap r "R"\nswimlane s "S"\n  item a "A" duration:1w labels:enterprise\n  item b "B" duration:1w labels:[enterprise, security]\n`,
        );
        expect(out).toContain('labels:enterprise');
        expect(out).toContain('labels:[enterprise, security]');
    });

    it('renders description as a sub-directive on its own indented line', async () => {
        const out = await canonical(
            `roadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n    description "hello"\n`,
        );
        expect(out).toMatch(/\n    description "hello"/);
    });
});
