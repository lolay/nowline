// Bundle entry for the Nowline language server inside the VS Code extension.
// We re-export and invoke @nowline/lsp's startNowlineServer so esbuild can
// inline the entire server (including @nowline/core, langium, and
// vscode-languageserver) into a single dist/server.cjs file.

import { startNowlineServer } from '@nowline/lsp/server';

startNowlineServer();
