import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { serializeToJson } from '../../src/convert/schema.js';
import type { NowlineFile } from '../../src/generated/ast.js';
import { getServices } from '../helpers.js';

const SOURCE = 'nowline v1\n\nroadmap r "R" start:2026-01-05\n\nswimlane s\n  item a duration:1w\n';

async function build(uri: string) {
    const { shared } = getServices();
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        SOURCE,
        URI.parse(uri),
    );
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return doc;
}

describe('serializeToJson', () => {
    it('defaults file.uri to the document URI', async () => {
        const doc = await build('memory:///schema-default.nowline');
        expect(serializeToJson(doc, SOURCE).file.uri).toBe(doc.uri.toString());
    });

    it('emits the uri option verbatim, without percent-encoding', async () => {
        const doc = await build('memory:///schema-override.nowline');
        const uri = 'file:///tmp/a dir/é#%.nowline';
        const out = serializeToJson(doc, SOURCE, { uri });
        expect(out.file.uri).toBe(uri);
        // Only the envelope changes; the AST is the same as without the option.
        expect(out.ast).toEqual(serializeToJson(doc, SOURCE).ast);
    });

    it('emits $position by default and omits it when includePositions is false', async () => {
        const doc = await build('memory:///schema-positions.nowline');
        expect(serializeToJson(doc, SOURCE).ast.$position?.start).toEqual({
            line: 1,
            column: 1,
            offset: 0,
        });
        const bare = JSON.stringify(serializeToJson(doc, SOURCE, { includePositions: false }));
        expect(bare).not.toContain('$position');
    });
});
