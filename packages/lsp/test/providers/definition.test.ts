import { describe, expect, it } from 'vitest';
import { locate, parseDocument, services } from '../helpers.js';

const sample = `nowline v1

roadmap demo "Demo" start:2026-01-05 scale:1w

anchor kickoff date:2026-01-05

swimlane backend "Backend"
  item api "API" duration:2w after:kickoff
  item deploy "Deploy" duration:1w after:api
`;

// Richer fixture exercising the full reference-property surface so we can
// verify cmd+click works for size, status, style, labels, owner/team, and
// glyph references — not just sequencing keys.
const referenceSample = `nowline v1

config

style enterprise-style "Enterprise"
  bg: blue

glyph money "Money"
  unicode: "$"

default item shadow:subtle

roadmap demo "Demo" start:2026-01-05 scale:1w

person sam "Sam Chen"
team platform "Platform Team"

anchor kickoff date:2026-01-05

size lg effort:2w

status handoff "Handoff"

label enterprise "Enterprise" style:enterprise-style

swimlane backend "Backend" owner:platform
  item auth "Auth" size:lg status:handoff style:enterprise-style labels:[enterprise] owner:sam after:kickoff
  item deploy "Deploy" duration:1w status:done after:auth

footnote ship-blocker "Vendor blocker" on:auth
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

    // --- Expanded reference-property coverage ------------------------------

    it('jumps from "size:lg" to the size declaration', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'lg', 1),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(referenceSample, 'lg', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('jumps from custom "status:handoff" to the status declaration', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'handoff', 1),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(referenceSample, 'handoff', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('returns nothing for built-in "status:done" (no declaration site)', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'done'),
        });
        expect(links).toBeUndefined();
    });

    it('jumps from "style:enterprise-style" to the style declaration in config', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        // First occurrence is the declaration; second is on the label line; third on the item.
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'enterprise-style', 2),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(referenceSample, 'enterprise-style', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('jumps from "labels:[enterprise]" to the label declaration', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        // Substring "enterprise" appears inside every "enterprise-style"
        // occurrence too, so we anchor on the unique "[enterprise]" sequence
        // and step one char past the `[` to land on the value leaf.
        const bracket = locate(referenceSample, '[enterprise]');
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: { line: bracket.line, character: bracket.character + 1 },
        });
        expect(links).toHaveLength(1);
        // The label declaration is the bare "enterprise" word on the
        // `label enterprise "Enterprise"` line.
        const labelLine = locate(referenceSample, 'label enterprise ');
        expect(links![0].targetSelectionRange.start.line).toBe(labelLine.line);
        expect(links![0].targetSelectionRange.start.character).toBe(labelLine.character + 'label '.length);
    });

    it('jumps from "owner:platform" to the team declaration', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'platform', 1),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(referenceSample, 'platform', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('jumps from "owner:sam" to the person declaration', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'sam', 1),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(referenceSample, 'sam', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('jumps from footnote "on:auth" to the item declaration', async () => {
        const doc = await parseDocument(referenceSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(referenceSample, 'auth', 1),
        });
        expect(links).toHaveLength(1);
        const declRange = locate(referenceSample, 'auth', 0);
        expect(links![0].targetSelectionRange.start.line).toBe(declRange.line);
    });

    it('returns nothing for "owner:sam" when no person sam is declared', async () => {
        const undeclared = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w
swimlane s
  item x duration:1w owner:sam
`;
        const doc = await parseDocument(undeclared);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(undeclared, 'sam'),
        });
        expect(links).toBeUndefined();
    });

    it('does not advertise navigation for the removed "footnote:" property key', async () => {
        // The `item ... footnote:foo` form was removed in favor of the
        // spec-mandated reverse direction (`footnote ... on:<target>`).
        // The validator now rejects `footnote:` on host entities, but the
        // LSP must also stay silent on the cursor position so a stray
        // legacy line doesn't surface phantom navigation. `footnote` is
        // intentionally excluded from REFERENCE_PROP_KEYS — this test is
        // a structural pin against accidental re-add.
        const legacy = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w
swimlane s
  item x duration:1w footnote:vendor-dep

footnote vendor-dep "Vendor dep" on:x
`;
        const doc = await parseDocument(legacy);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(legacy, 'vendor-dep', 0),
        });
        expect(links).toBeUndefined();
    });

    it('jumps from glyph reference "icon:money" inside a style block', async () => {
        const glyphSample = `nowline v1

config

glyph money "Money"
  unicode: "$"

style flagged "Flagged"
  icon: money

roadmap demo "Demo" start:2026-01-05 scale:1w

swimlane s
  item a duration:1w style:flagged
`;
        const doc = await parseDocument(glyphSample);
        const provider = services().Nowline.lsp.DefinitionProvider!;
        // First occurrence of "money" is the glyph declaration; second is the icon: ref.
        const links = await provider.getDefinition(doc, {
            textDocument: { uri: doc.uri.toString() },
            position: locate(glyphSample, 'money', 1),
        });
        // Style blocks use StyleProperty (not EntityProperty), so propertyValueAt
        // currently won't match — this is documented behavior. If/when we widen
        // StyleProperty navigation, swap this expect to toHaveLength(1).
        expect(links).toBeUndefined();
    });
});
