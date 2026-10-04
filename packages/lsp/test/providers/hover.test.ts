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

    it('surfaces a status alias as written rather than canonicalizing it', async () => {
        const source = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

swimlane backend "Backend"
  item api "API v2" duration:2w status:active
`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.HoverProvider!;
        const hover = await provider.getHoverContent(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(source, 'api', 0),
        });
        expect(hover).toBeDefined();
        const text = (hover!.contents as { value: string }).value;
        expect(text).toContain('`status:` active');
        expect(text).not.toContain('in-progress');
    });

    it('hovers a custom status value but not a built-in alias', async () => {
        // Built-ins have no declaration to resolve, so hover stays silent on
        // the value itself; a custom `status` declaration resolves and hovers.
        const source = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

status review "In review"

swimlane backend "Backend"
  item api "API" duration:2w status:review
  item web "Web" duration:2w status:completed
`;
        const doc = await parseDocument(source);
        const provider = services().Nowline.lsp.HoverProvider!;
        // Cursor one character into the value of `status:<value>`.
        const hoverOnStatus = (value: string) => {
            const at = locate(source, `status:${value}`);
            return provider.getHoverContent(doc, {
                textDocument: { uri: doc.uri.toString() },
                position: { line: at.line, character: at.character + 'status:'.length + 1 },
            });
        };

        const custom = await hoverOnStatus('review');
        expect(custom).toBeDefined();
        expect((custom!.contents as { value: string }).value).toContain('In review');

        expect(await hoverOnStatus('completed')).toBeUndefined();
    });
});
