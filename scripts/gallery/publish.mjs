#!/usr/bin/env node
// Add one raw build (from collect.mjs) to the gallery's history and
// regenerate the whole review site from that history.
//
// Usage: node scripts/gallery/publish.mjs --data <dir> --raw <dir> --site <dir> [--keep 100]
//
// `--data` holds raw builds only (SVGs, sources, manifests), newest first in
// builds.json, pruned to `--keep`. `--site` is rebuilt from scratch every
// run, so every page reflects the current templates and every build links to
// its newer neighbours. In CI the data dir round-trips through the
// `gallery-data` branch; locally it accumulates under .gallery/.

import { existsSync } from 'node:fs';
import { appendFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
    renderBuildIndex,
    renderChangesPage,
    renderComparePage,
    renderEntryPage,
    renderLatestRedirect,
    renderRootIndex,
} from './lib/html.mjs';
import {
    compareManifests,
    entryHistory,
    flattenEntries,
    historyNavigation,
    itemNavigation,
} from './lib/model.mjs';

const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'assets');

async function readJson(path, fallback) {
    if (!existsSync(path)) return fallback;
    return JSON.parse(await readFile(path, 'utf8'));
}

async function write(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
}

// Adds the raw build to the data dir and prunes it. Returns ids newest first.
export async function addBuild({ dataDir, rawDir, keep }) {
    const manifest = await readJson(resolve(rawDir, 'manifest.json'), null);
    if (!manifest) throw new Error(`no manifest.json in ${rawDir}`);
    const index = await readJson(resolve(dataDir, 'builds.json'), { builds: [] });
    const target = resolve(dataDir, 'b', manifest.id);
    await rm(target, { recursive: true, force: true });
    await cp(rawDir, target, { recursive: true });
    const ids = [manifest.id, ...index.builds.filter((id) => id !== manifest.id)];
    for (const old of ids.slice(keep)) {
        await rm(resolve(dataDir, 'b', old), { recursive: true, force: true });
    }
    const kept = ids.slice(0, keep);
    await write(resolve(dataDir, 'builds.json'), `${JSON.stringify({ builds: kept }, null, 2)}\n`);
    return kept;
}

async function loadManifests(dataDir, ids) {
    const manifests = [];
    for (const id of ids) {
        const manifest = await readJson(resolve(dataDir, 'b', id, 'manifest.json'), null);
        if (manifest) manifests.push(manifest);
    }
    return manifests;
}

// Every source file behind an entry, with the previous build's text beside
// it. A file only one side has gets null on the other.
async function entrySources(dataDir, build, prev, entry, prevEntry) {
    const read = async (buildId, path) =>
        readFile(resolve(dataDir, 'b', buildId, 'src', path), 'utf8').catch(() => null);
    const paths = [...entry.files];
    for (const path of prevEntry?.files ?? []) {
        if (!paths.includes(path)) paths.push(path);
    }
    const sources = [];
    for (const path of paths) {
        sources.push({
            path,
            text: entry.files.includes(path) ? await read(build.id, path) : null,
            prevText: prevEntry?.files.includes(path) ? await read(prev.id, path) : null,
        });
    }
    return sources;
}

// Keys in reading order: the newest build's order, then anything only older
// builds still carry.
function groupOrder(manifests) {
    const groups = [];
    const byId = new Map();
    for (const manifest of manifests) {
        for (const group of manifest.groups) {
            if (!byId.has(group.id)) {
                const g = { id: group.id, title: group.title, keys: [] };
                byId.set(group.id, g);
                groups.push(g);
            }
            const g = byId.get(group.id);
            for (const entry of group.entries) {
                const key = `${group.id}/${entry.slug}`;
                if (!g.keys.includes(key)) g.keys.push(key);
            }
        }
    }
    return groups;
}

export async function renderSite({ dataDir, siteDir, ids }) {
    const manifests = await loadManifests(dataDir, ids);
    await rm(siteDir, { recursive: true, force: true });
    await cp(ASSETS_DIR, resolve(siteDir, 'assets'), { recursive: true });

    const histories = new Map();
    for (const group of groupOrder(manifests)) {
        for (const key of group.keys) histories.set(key, entryHistory(manifests, key));
    }

    const builds = [];
    for (let i = 0; i < manifests.length; i++) {
        const build = manifests[i];
        const prev = manifests[i + 1] ?? null;
        const comparison = compareManifests(prev, build);
        const flat = flattenEntries(build);
        const prevByKey = new Map(prev ? flattenEntries(prev).map((f) => [f.key, f.entry]) : []);
        const nav = itemNavigation(flat, comparison.statuses);
        const buildDir = resolve(siteDir, 'b', build.id);
        const sourcesByKey = new Map();

        for (const item of flat) {
            await cp(
                resolve(dataDir, 'b', build.id, 'svg', `${item.key}.svg`),
                resolve(buildDir, `${item.key}.svg`),
            );
            const prevEntry = prevByKey.get(item.key);
            const sources = await entrySources(dataDir, build, prev, item.entry, prevEntry);
            sourcesByKey.set(item.key, sources);
            await write(
                resolve(buildDir, `${item.key}.html`),
                renderEntryPage({
                    build,
                    prev,
                    item,
                    result: comparison.statuses.get(item.key),
                    nav: nav.get(item.key),
                    history: historyNavigation(histories.get(item.key), build.id),
                    sources,
                    hasChanges: comparison.hasChanges,
                }),
            );
        }
        await write(
            resolve(buildDir, 'index.html'),
            renderBuildIndex({
                build,
                prev,
                flat,
                comparison,
                older: prev?.id ?? null,
                newer: manifests[i - 1]?.id ?? null,
            }),
        );
        await write(
            resolve(buildDir, 'changes.html'),
            renderChangesPage({ build, prev, flat, comparison, sources: sourcesByKey }),
        );
        await write(resolve(buildDir, 'manifest.json'), `${JSON.stringify(build, null, 2)}\n`);
        builds.push({ manifest: build, comparison });
    }

    for (const [key, rows] of histories) {
        await write(resolve(siteDir, 'history', `${key}.json`), JSON.stringify(rows));
    }
    await write(resolve(siteDir, 'index.html'), renderRootIndex({ builds }));
    await write(
        resolve(siteDir, 'compare.html'),
        renderComparePage({ builds, groups: groupOrder(manifests) }),
    );
    await write(
        resolve(siteDir, 'builds.json'),
        `${JSON.stringify(
            builds.map(({ manifest, comparison }) => ({
                id: manifest.id,
                sha: manifest.sha,
                subject: manifest.subject,
                author: manifest.author,
                date: manifest.date,
                ref: manifest.ref,
                counts: comparison.counts,
            })),
            null,
            2,
        )}\n`,
    );
    if (builds.length > 0) {
        await write(
            resolve(siteDir, 'latest', 'index.html'),
            renderLatestRedirect(builds[0].manifest.id),
        );
    }
    // Pages serves the site as-is; no Jekyll processing.
    await write(resolve(siteDir, '.nojekyll'), '');

    const newest = builds[0];
    if (!newest) return { id: null, path: '' };
    return {
        id: newest.manifest.id,
        path: `b/${newest.manifest.id}/${newest.comparison.hasChanges ? 'changes.html' : ''}`,
    };
}

export async function publish({ dataDir, rawDir, siteDir, keep = 100 }) {
    const ids = await addBuild({ dataDir, rawDir, keep });
    return renderSite({ dataDir, siteDir, ids });
}

async function main() {
    const { values } = parseArgs({
        options: {
            data: { type: 'string' },
            raw: { type: 'string' },
            site: { type: 'string' },
            keep: { type: 'string', default: '100' },
        },
    });
    if (!values.data || !values.raw || !values.site) {
        console.error(
            'usage: node scripts/gallery/publish.mjs --data <dir> --raw <dir> --site <dir> [--keep 100]',
        );
        process.exit(2);
    }
    const keep = Number.parseInt(values.keep, 10);
    if (!Number.isInteger(keep) || keep < 1) {
        console.error(`--keep must be a positive integer, got ${values.keep}`);
        process.exit(2);
    }
    const result = await publish({
        dataDir: resolve(values.data),
        rawDir: resolve(values.raw),
        siteDir: resolve(values.site),
        keep,
    });
    console.log(`published ${result.id} -> ${resolve(values.site, result.path)}`);
    if (process.env.GITHUB_OUTPUT) {
        await appendFile(process.env.GITHUB_OUTPUT, `path=${result.path}\n`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(err.stack ?? err.message ?? err);
        process.exit(1);
    });
}
