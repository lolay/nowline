export * from 'vscode-languageserver-protocol';
export * from 'vscode-languageserver-types';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const server = require('vscode-languageserver');

export const SemanticTokensBuilder = server.SemanticTokensBuilder;
export const TextDocuments = server.TextDocuments;
export const NotebookDocuments = server.NotebookDocuments;
export const ProposedFeatures = server.ProposedFeatures;
