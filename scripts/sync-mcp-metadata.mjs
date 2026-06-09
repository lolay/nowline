#!/usr/bin/env node
// Sync semver version from packages/mcp/package.json into server.json and
// manifest.json (registry + .mcpb metadata must match the published npm tag).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'packages/mcp/package.json');
const version = process.argv[2] ?? JSON.parse(readFileSync(pkgPath, 'utf8')).version;

if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`sync-mcp-metadata: invalid version '${version}'`);
    process.exit(2);
}

function syncJson(relPath, mutator) {
    const abs = resolve(root, relPath);
    const data = JSON.parse(readFileSync(abs, 'utf8'));
    mutator(data);
    writeFileSync(abs, `${JSON.stringify(data, null, 4)}\n`);
    console.log(`sync-mcp-metadata: ${relPath} → ${version}`);
}

syncJson('packages/mcp/server.json', (server) => {
    server.version = version;
    if (server.packages?.[0]) {
        server.packages[0].version = version;
    }
});

syncJson('packages/mcp/manifest.json', (manifest) => {
    manifest.version = version;
});

console.log(version);
