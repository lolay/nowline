import { describe, expect, it } from 'vitest';
import { services } from './helpers.js';

describe('createNowlineLspServices', () => {
    it('wires the language container with LSP services', () => {
        const { shared, Nowline } = services();
        expect(shared).toBeDefined();
        expect(Nowline).toBeDefined();
        expect(Nowline.lsp.DefinitionProvider).toBeDefined();
        expect(Nowline.lsp.ReferencesProvider).toBeDefined();
        expect(Nowline.lsp.RenameProvider).toBeDefined();
        expect(Nowline.lsp.HoverProvider).toBeDefined();
        expect(Nowline.lsp.DocumentSymbolProvider).toBeDefined();
        expect(Nowline.lsp.CompletionProvider).toBeDefined();
        expect(Nowline.lsp.FoldingRangeProvider).toBeDefined();
    });

    it('keeps the Nowline validator from @nowline/core registered on the LSP container', () => {
        const { Nowline } = services();
        expect(Nowline.validation.NowlineValidator).toBeDefined();
    });
});
