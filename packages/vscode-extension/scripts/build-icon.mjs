#!/usr/bin/env node
// Renders the repo-root branding mark into a square PNG that the VS Code
// Marketplace can use as the extension icon (top-level "icon" in package.json).
// VS Code only accepts PNG at the top level (SVG is allowed only for
// contributes.languages[].icon), and the marketplace minimum is 128x128.
// Output is written into dist/, which is gitignored but shipped inside the
// .vsix, so the binary never lives in source control.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const pkgRoot = resolve(here, '..');

const source = resolve(repoRoot, 'branding', 'favicon.svg');
const target = resolve(pkgRoot, 'dist', 'icons', 'icon.png');
const size = 256;

function isUpToDate() {
    try {
        const sourceMtime = statSync(source).mtimeMs;
        const targetMtime = statSync(target).mtimeMs;
        return targetMtime >= sourceMtime;
    } catch {
        return false;
    }
}

if (isUpToDate()) {
    console.log(`icon up to date: ${target}`);
    process.exit(0);
}

const svg = readFileSync(source);
const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0, 0, 0, 0)',
});
const png = resvg.render().asPng();

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`rendered icon: ${source} -> ${target} (${size}x${size})`);
