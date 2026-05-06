import { describe, expect, it } from 'vitest';
import { locate, parseDocument, services } from '../helpers.js';

const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API" duration:2w after:kickoff
  item deploy "Deploy" duration:1w after:api
`;

describe('NowlineDefinitionProvider', () => {
    it('jumps from "after:kickoff" to the kickoff anchor', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'kickoff', 1), // skip the declaration occurrence
        });
        expect(links).toHaveLength(1);
        const target = links![0];
        expect(target.targetUri).toBe(doc.uri.toString());
        const declRange = locate(sample, 'kickoff', 0);
        expect(target.targetSelectionRange.start.line).toBe(declRange.line);
        expect(target.targetSelectionRange.start.character).toBe(declRange.character);
    });

    it('jumps from "after:api" to the api item', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'api', 1),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(sample, 'api', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('returns nothing when the cursor is on a property key', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'after:'),
        });
        expect(links).toBeUndefined();
    });
});
