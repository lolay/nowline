// buildTransientDocument: a fresh-URI build leaves nothing behind in the
// Langium workspace (r1.f7), and the returned document keeps what the build
// gave it.

import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { createNowlineServices } from '../../src/language/nowline-module.js';
import { buildTransientDocument } from '../../src/language/transient-document.js';
import { langiumRetention } from '../../src/util/langium-retention.js';

const VALID = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item build "Build" duration:2w
`;

// A duplicate id is a validation error, not a parse error.
const INVALID = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item build "Build" duration:2w
  item build "Build again" duration:1w
`;

const EMPTY = { symbolIndex: 0, referenceIndex: 0, buildState: 0, documents: 0 };

let counter = 0;
const freshUri = () => URI.parse(`memory:///transient-${++counter}.nowline`);

describe('buildTransientDocument', () => {
    it('leaves no index, build-state or document entry behind across builds', async () => {
        const { shared } = createNowlineServices();
        expect(langiumRetention(shared)).toStrictEqual(EMPTY);
        for (let i = 0; i < 25; i++) {
            await buildTransientDocument(shared, VALID, freshUri());
        }
        expect(langiumRetention(shared)).toStrictEqual(EMPTY);
    });

    it('cleans up concurrent builds', async () => {
        const { shared } = createNowlineServices();
        const docs = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                buildTransientDocument(shared, i % 2 ? VALID : INVALID, freshUri()),
            ),
        );
        expect(langiumRetention(shared)).toStrictEqual(EMPTY);
        docs.forEach((doc, i) => {
            expect(doc.diagnostics?.length ?? 0).toBe(i % 2 ? 0 : 1);
        });
    });

    it('returns the built document intact', async () => {
        const { shared } = createNowlineServices();
        const doc = await buildTransientDocument(shared, INVALID, freshUri());
        expect(doc.textDocument.getText()).toBe(INVALID);
        expect(doc.parseResult.value.$type).toBe('NowlineFile');
        expect(doc.parseResult.value.$cstNode?.text).toBe(INVALID);
        expect(doc.parseResult.parserErrors).toEqual([]);
        expect(doc.diagnostics).toHaveLength(1);
    });

    it('skips validation when asked', async () => {
        const { shared } = createNowlineServices();
        const doc = await buildTransientDocument(shared, INVALID, freshUri(), {
            validation: false,
        });
        expect(doc.diagnostics ?? []).toEqual([]);
        expect(langiumRetention(shared)).toStrictEqual(EMPTY);
    });
});
