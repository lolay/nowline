#!/usr/bin/env node
// Sync semver version from packages/mcp/package.json into server.json and
// manifest.json (registry + .mcpb metadata must match the published npm tag).
//
// Usage:
//   node scripts/sync-mcp-metadata.mjs [version]          rewrite stale files
//   node scripts/sync-mcp-metadata.mjs --check [version]  exit 1 if any is stale
//
// The release cut (.github/scripts/bump-version.mjs) runs the write mode and
// commits the result, so on main both files always match package.json.
// `make pack-mcpb` runs --check so a local gate run never rewrites tracked files.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'packages/mcp/package.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const version =
    args.find((arg) => !arg.startsWith('--')) ?? JSON.parse(readFileSync(pkgPath, 'utf8')).version;

if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`sync-mcp-metadata: invalid version '${version}'`);
    process.exit(2);
}

const stale = [];

function syncJson(relPath, mutator) {
    const abs = resolve(root, relPath);
    const original = readFileSync(abs, 'utf8');
    const data = JSON.parse(original);
    const before = JSON.stringify(data);
    mutator(data);
    if (JSON.stringify(data) === before) {
        return;
    }
    if (check) {
        stale.push(relPath);
        return;
    }
    // Rewrite the version strings in place rather than re-serializing, so the
    // file keeps its biome formatting and the release commit diff is just the
    // version. Every "version" key in these files is one the mutator sets; the
    // parse-back check fails loudly if that ever stops being true.
    const updated = original.replace(
        /("version"\s*:\s*")[^"]*(")/g,
        (_, pre, post) => `${pre}${version}${post}`,
    );
    if (!isDeepStrictEqual(JSON.parse(updated), data)) {
        console.error(
            `sync-mcp-metadata: unexpected "version" key in ${relPath}; update this script`,
        );
        process.exit(2);
    }
    writeFileSync(abs, updated);
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

if (stale.length > 0) {
    console.error(
        `sync-mcp-metadata: ${stale.join(', ')} not at ${version}; ` +
            'run `node scripts/sync-mcp-metadata.mjs` and commit the result',
    );
    process.exit(1);
}

console.log(version);
