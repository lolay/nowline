import { describe, expect, it } from 'vitest';
import { entityKind } from '../../src/references/ast-utils.js';
import { parseDocument } from '../helpers.js';

describe('entityKind', () => {
    it('labels a NonWorkingDeclaration as non-working, not nonworking', async () => {
        const doc = await parseDocument('config\n\nnon-working h date:2026-12-25\n\nroadmap r\n');
        const [entry] = doc.parseResult.value.configEntries;
        expect(entry.$type).toBe('NonWorkingDeclaration');
        expect(entityKind(entry)).toBe('non-working');
    });

    it('labels a WorkingDeclaration as working', async () => {
        const doc = await parseDocument('config\n\nworking h date:2026-12-25\n\nroadmap r\n');
        const [entry] = doc.parseResult.value.configEntries;
        expect(entry.$type).toBe('WorkingDeclaration');
        expect(entityKind(entry)).toBe('working');
    });

    it('keeps lowercasing the other declaration types', async () => {
        const doc = await parseDocument('config\n\nsymbol star unicode:"x"\n\nroadmap r\n');
        const [entry] = doc.parseResult.value.configEntries;
        expect(entityKind(entry)).toBe('symbol');
    });
});
