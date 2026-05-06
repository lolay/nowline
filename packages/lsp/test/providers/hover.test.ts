import { describe, expect, it } from 'vitest';
import { locate, parseDocument, services } from '../helpers.js';

const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API v2" duration:2w after:kickoff status:in-progress
`;

describe('NowlineHoverProvider', () => {
    it('renders title, status, duration on the entity declaration', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.HoverProvider!;
        const hover = await provider.getHoverContent(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'api', 0),
        });
        expect(hover).toBeDefined();
        const text = (hover!.contents as { value: string }).value;
        expect(text).toContain('item');
        expect(text).toContain('api');
        expect(text).toContain('API v2');
        expect(text).toContain('status');
        expect(text).toContain('in-progress');
        expect(text).toContain('duration');
        expect(text).toContain('2w');
    });

    it('renders the same hover when invoked from a reference value', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.HoverProvider!;
        const hover = await provider.getHoverContent(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'kickoff', 1),
        });
        expect(hover).toBeDefined();
        const text = (hover!.contents as { value: string }).value;
        expect(text).toContain('anchor');
        expect(text).toContain('kickoff');
    });
});
