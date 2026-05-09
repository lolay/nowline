#!/usr/bin/env node
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { createNowlineLspServices } from './nowline-lsp-module.js';

/**
 * Boot the Nowline language server over stdio. Used both by the bundled VS
 * Code / Cursor extension (spawned as a Node module via `LanguageClient`) and
 * by the standalone `nowline-lsp` binary editors like Neovim and JetBrains
 * point at via the LSP config.
 */
export function startNowlineServer(): void {
    const connection = createConnection(ProposedFeatures.all);
    const { shared } = createNowlineLspServices({
        connection,
        fileSystemProvider: NodeFileSystem.fileSystemProvider,
    });
    startLanguageServer(shared);
}

// Only auto-start when invoked directly (the binary entrypoint). Importers
// (e.g. tests or in-process embeddings) call `startNowlineServer()` themselves.
const isDirect = (() => {
    if (typeof process === 'undefined' || !process.argv?.[1]) return false;
    try {
        const url = new URL(import.meta.url);
        return url.protocol === 'file:' && url.pathname === process.argv[1];
    } catch {
        return false;
    }
})();
if (isDirect) startNowlineServer();
