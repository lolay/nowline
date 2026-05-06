import { describe, expect, it } from 'vitest';
import { parseDocument, services } from '../helpers.js';

describe('NowlineCompletionProvider', () => {
    it('proposes referenceable ids inside `after:`', async () => {
        const source = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API" duration:2w after:`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.CompletionProvider!;
        const list = await provider.getCompletion(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: source.split('\n').length - 1, character: source.split('\n').pop()!.length },
        });
        expect(list).toBeDefined();
        const labels = list!.items.map((i) => i.label);
        expect(labels).toContain('kickoff');
        expect(labels).toContain('api');
        expect(labels).toContain('backend');
    });

    it('proposes built-in status values inside `status:`', async () => {
        const source = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

swimlane backend "Backend"
  item api "API" duration:2w status:`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.CompletionProvider!;
        const list = await provider.getCompletion(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: source.split('\n').length - 1, character: source.split('\n').pop()!.length },
        });
        expect(list).toBeDefined();
        const labels = list!.items.map((i) => i.label);
        expect(labels).toEqual(expect.arrayContaining(['planned', 'in-progress', 'done', 'at-risk', 'blocked']));
    });

    it('proposes custom status declarations alongside the built-ins', async () => {
        const source = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

status review "In review"

swimlane backend "Backend"
  item api "API" duration:2w status:`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.CompletionProvider!;
        const list = await provider.getCompletion(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: source.split('\n').length - 1, character: source.split('\n').pop()!.length },
        });
        expect(list).toBeDefined();
        const labels = list!.items.map((i) => i.label);
        expect(labels).toContain('review');
        expect(labels).toContain('done');
    });
});
