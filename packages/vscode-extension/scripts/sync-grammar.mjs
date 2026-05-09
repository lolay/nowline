#!/usr/bin/env node
// Mirrors monorepo-level assets (TextMate grammar, root LICENSE) into this
// package so the .vsix ships a self-contained copy. The single sources of
// truth remain at the repo root: grammars/nowline.tmLanguage.json and
// LICENSE.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const pkgRoot = resolve(here, '..');

const assets = [
    {
        label: 'grammar',
        from: resolve(repoRoot, 'grammars', 'nowline.tmLanguage.json'),
        to: resolve(pkgRoot, 'syntaxes', 'nowline.tmLanguage.json'),
    },
    {
        label: 'license',
        from: resolve(repoRoot, 'LICENSE'),
        to: resolve(pkgRoot, 'LICENSE'),
    },
];

for (const asset of assets) {
    if (!existsSync(asset.from)) {
        console.error(`${asset.label} source not found: ${asset.from}`);
        process.exit(1);
    }
    mkdirSync(dirname(asset.to), { recursive: true });
    copyFileSync(asset.from, asset.to);
    console.log(`synced ${asset.label}: ${asset.from} -> ${asset.to}`);
}
