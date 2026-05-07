import { describe, expect, it } from 'vitest';
import { parseDocument, services } from '../helpers.js';

describe('NowlineCompletionProvider', () => {
    it('proposes sequencing-eligible ids inside `after:` and excludes swimlanes', async () => {
        const source = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

person sam "Sam Chen"

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
        // anchors and items are sequencing-eligible
        expect(labels).toContain('kickoff');
        expect(labels).toContain('api');
        // swimlanes and persons are NOT sequencing-eligible — kept out by the
        // per-key entity-kind filter so the suggestion list stays focused.
        expect(labels).not.toContain('backend');
        expect(labels).not.toContain('sam');
    });

    it('filters `style:` suggestions to style declarations only', async () => {
        const source = `nowline v1

config

style enterprise-style "Enterprise"
  bg: blue

style risky-style
  fg: red

roadmap demo "Demo" start:2026-01-05 scale:1w

label enterprise "Enterprise"

swimlane backend "Backend"
  item api "API" duration:2w style:`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.CompletionProvider!;
        const list = await provider.getCompletion(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: source.split('\n').length - 1, character: source.split('\n').pop()!.length },
        });
        expect(list).toBeDefined();
        const labels = list!.items.map((i) => i.label);
        expect(labels).toContain('enterprise-style');
        expect(labels).toContain('risky-style');
        // Items, labels, and swimlanes must NOT appear here.
        expect(labels).not.toContain('api');
        expect(labels).not.toContain('enterprise');
        expect(labels).not.toContain('backend');
    });

    it('proposes built-in icons plus user-declared glyphs inside `icon:`', async () => {
        const source = `nowline v1

config

glyph money "Money"
  unicode: "$"

roadmap demo "Demo" start:2026-01-05 scale:1w

swimlane backend "Backend"
  item api "API" duration:2w icon:`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.CompletionProvider!;
        const list = await provider.getCompletion(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: source.split('\n').length - 1, character: source.split('\n').pop()!.length },
        });
        expect(list).toBeDefined();
        const labels = list!.items.map((i) => i.label);
        // user-declared glyph
        expect(labels).toContain('money');
        // built-ins
        expect(labels).toContain('shield');
        expect(labels).toContain('warning');
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
