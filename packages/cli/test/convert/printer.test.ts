import { describe, expect, it } from 'vitest';
import { printNowlineFile } from '../../src/convert/printer.js';
import { serializeToJson } from '../../src/convert/schema.js';
import { parseSource } from '../../src/core/parse.js';

async function canonical(source: string): Promise<string> {
    const r = await parseSource(source, 'test.nowline', { validate: true });
    expect(r.hasErrors, r.diagnostics.map((d) => d.message).join('\n')).toBe(false);
    return printNowlineFile(serializeToJson(r.document, source).ast);
}

describe('canonical printer rules', () => {
    it('uses two-space indentation', async () => {
        const out = await canonical(`roadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n`);
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
        expect(out).toMatch(/\n {4}description "hello"/);
    });

    it('preserves locale: on the directive line through a round-trip', async () => {
        const out = await canonical(
            `nowline v1 locale:fr-CA\nroadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n`,
        );
        expect(out).toMatch(/^nowline v1 locale:fr-CA\n/);
    });

    it('directive without properties round-trips byte-stable', async () => {
        const out = await canonical(
            `nowline v1\nroadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n`,
        );
        expect(out).toMatch(/^nowline v1\n/);
        expect(out).not.toMatch(/locale:/);
    });

    it('orders header-position after calendar on default roadmap', async () => {
        const out = await canonical(
            `config\ndefault roadmap header-position:above calendar:full\nroadmap r "R"\nswimlane s "S"\n  item x "X" duration:1w\n`,
        );
        const defaultLine = out.split('\n').find((l) => l.includes('default roadmap'));
        expect(defaultLine).toBeDefined();
        const calIdx = defaultLine!.indexOf('calendar:');
        const hpIdx = defaultLine!.indexOf('header-position:');
        expect(calIdx).toBeGreaterThan(-1);
        expect(hpIdx).toBeGreaterThan(calIdx);
    });
});
