import { describe, expect, it } from 'vitest';
import { locate, parseDocument, services } from '../helpers.js';

const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API" duration:2w after:kickoff
  item deploy "Deploy" duration:1w after:api
`;

describe('NowlineRenameProvider', () => {
    it('renames a declaration and its references', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.RenameProvider!;
        const edit = await provider.rename(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'api', 0),
            newName: 'api-v2',
        });
        const fileEdits = edit?.changes?.[doc.uri.toString()];
        expect(fileEdits).toBeDefined();
        // Declaration + one reference.
        expect(fileEdits!).toHaveLength(2);
        expect(fileEdits!.every((e) => e.newText === 'api-v2')).toBe(true);
    });

    it('rejects an invalid identifier', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.RenameProvider!;
        await expect(
            provider.rename(doc, {
                textDocument: { uri: doc.uri.toString() },
                position: locate(sample, 'api', 0),
                newName: '1bad',
            }),
        ).rejects.toThrow(/not a valid Nowline identifier/);
    });

    it('returns the rename range for prepareRename on a declaration', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.RenameProvider!;
        const range = await provider.prepareRename(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'api', 0),
        });
        expect(range).toBeDefined();
        expect(range!.start.line).toBeGreaterThan(0);
    });
});
