import { describe, expect, it } from 'vitest';
import { parseDocument, services } from '../helpers.js';

const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API" duration:2w
  parallel work
    item search "Search" duration:3w
    item index "Index" duration:3w

milestone beta "Beta" after:api
`;

describe('NowlineDocumentSymbolProvider', () => {
    it('produces a roadmap → swimlane → item outline tree', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.DocumentSymbolProvider!;
        const symbols = await provider.getSymbols(doc, {
            textDocument: { uri: doc.uri.toString() },
        });
        expect(symbols).toHaveLength(1);
        const roadmap = symbols[0];
        expect(roadmap.name).toBe('demo');
        expect(roadmap.children).toBeDefined();
        const childKinds = roadmap.children!.map((c) => c.name);
        expect(childKinds).toContain('kickoff');
        expect(childKinds).toContain('backend');
        expect(childKinds).toContain('beta');
    });

    it('nests parallel children under their swimlane', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.DocumentSymbolProvider!;
        const [roadmap] = await provider.getSymbols(doc, {
            textDocument: { uri: doc.uri.toString() },
        });
        const lane = roadmap.children!.find((c) => c.name === 'backend');
        expect(lane).toBeDefined();
        expect(lane!.children).toBeDefined();
        const itemNames = lane!.children!.map((c) => c.name);
        expect(itemNames).toContain('api');
        expect(itemNames).toContain('work');
        const parallel = lane!.children!.find((c) => c.name === 'work');
        expect(parallel!.children!.map((c) => c.name)).toEqual(['search', 'index']);
    });
});
