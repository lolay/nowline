import { describe, expect, it } from 'vitest';
import { locate, parseDocument, services } from '../helpers.js';

const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API" duration:2w after:kickoff
  item deploy "Deploy" duration:1w after:api before:cutoff
  item cutoff "Cutoff" duration:1w
`;

describe('NowlineReferencesProvider', () => {
    it('finds every usage of an item id and its declaration', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.ReferencesProvider!;
        const refs = await provider.findReferences(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'api', 0),
            context: { includeDeclaration: true },
        });
        // Declaration + one `after:api` usage.
        expect(refs).toHaveLength(2);
    });

    it('omits the declaration when includeDeclaration is false', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.ReferencesProvider!;
        const refs = await provider.findReferences(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'api', 1),
            context: { includeDeclaration: false },
        });
        expect(refs).toHaveLength(1);
    });

    it('finds usages from the reference site itself', async () => {
        const doc = await parseDocument(sample);
        const provider = services().Nowline.lsp.ReferencesProvider!;
        // Position cursor on "kickoff" inside `after:kickoff`.
        const refs = await provider.findReferences(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(sample, 'kickoff', 1),
            context: { includeDeclaration: true },
        });
        expect(refs).toHaveLength(2);
    });

    it('finds usages of a config-section style declaration', async () => {
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
        const provider = services().Nowline.lsp.ReferencesProvider!;
        const refs = await provider.findReferences(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(styleSample, 'flagged', 0),
            context: { includeDeclaration: true },
        });
        // Declaration + two `style:flagged` references.
        expect(refs).toHaveLength(3);
    });
});
