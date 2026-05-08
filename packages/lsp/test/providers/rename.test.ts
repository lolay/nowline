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

    it('renames a config-section style declaration and every reference', async () => {
        // Verifies that lifting findDeclarationRange into ast-utils picks up
        // declarations that live in `configEntries` (style / symbol) rather
        // than `roadmapEntries`.
        const styleSample = `nowline v1

config

style flagged "Flagged"
  bg: red

roadmap demo "Demo" start:2026-01-05 scale:1w

label danger "Danger" style:flagged

swimlane backend "Backend"
  item api "API" duration:2w style:flagged
`;
        const doc = await parseDocument(styleSample);
        const provider = services().Nowline.lsp.RenameProvider!;
        const edit = await provider.rename(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(styleSample, 'flagged', 0), // declaration site
            newName: 'priority',
        });
        const fileEdits = edit?.changes?.[doc.uri.toString()];
        expect(fileEdits).toBeDefined();
        // Declaration + two references (label and item).
        expect(fileEdits!).toHaveLength(3);
        expect(fileEdits!.every((e) => e.newText === 'priority')).toBe(true);
    });
});
