#!/usr/bin/env node
// Add one raw build (from collect.mjs) to the gallery's history and
// regenerate the whole review site from that history.
//
// Usage: node scripts/gallery/publish.mjs --data <dir> --raw <dir> --site <dir>
//          [--keep 100] [--keep-pr 10] [--open-prs 12,34]
//
// `--data` holds raw builds only (SVGs, sources, manifests) and builds.json,
// which lists each line's build ids newest first (see lib/lines.mjs). Adding
// a build records its baseline (`baseId`) in its data manifest, then applies
// retention: `--keep` builds in main and in each local branch line,
// `--keep-pr` in each `pr-<n>` line, and with `--open-prs` every PR line not
// listed is dropped. Raw builds no line lists are deleted, except a build
// that a retained build in another line compares against.
//
// `--site` is rebuilt from scratch every run, so every page reflects the
// current templates and every build links to its newer neighbours. In CI the
// data dir round-trips through the `gallery-data` branch; locally it
// accumulates under .gallery/.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
    renderBuildIndex,
    renderChangesPage,
    renderComparePage,
    renderEntryPage,
    renderLatestRedirect,
    renderPrBuilds,
    renderRedirect,
    renderRootIndex,
} from './lib/html.mjs';
import {
    chooseBaseline,
    lineOf,
    MAIN_LINE,
    normalizeIndex,
    prNumberOf,
    resolveBaseId,
    retainLines,
} from './lib/lines.mjs';
import {
    compareManifests,
    entryHistory,
    flattenEntries,
    historyNavigation,
    itemNavigation,
} from './lib/model.mjs';

const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'assets');
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Git ancestry for PR baselines: is `ancestor` reachable from `sha`? A
// commit this clone doesn't have (shallow history, a fork) counts as no.
export function gitIsAncestor(repoRoot = REPO_ROOT) {
    return (ancestor, sha) => {
        try {
            execFileSync('git', ['merge-base', '--is-ancestor', ancestor, sha], {
                cwd: repoRoot,
                stdio: 'ignore',
            });
            return true;
        } catch {
            return false;
        }
    };
}

async function readJson(path, fallback) {
    if (!existsSync(path)) return fallback;
    return JSON.parse(await readFile(path, 'utf8'));
}

async function write(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
}

// Every raw build in the data dir, by id.
async function loadAllManifests(dataDir) {
    const manifests = new Map();
    const dir = resolve(dataDir, 'b');
    if (!existsSync(dir)) return manifests;
    for (const id of (await readdir(dir)).sort()) {
        const manifest = await readJson(resolve(dir, id, 'manifest.json'), null);
        if (manifest) manifests.set(id, manifest);
    }
    return manifests;
}

// Adds the raw build to the data dir with its baseline, applies retention
// and deletes raw builds nothing keeps. Returns the new index's lines and
// the build's id.
export async function addBuild({
    dataDir,
    rawDir,
    keep = 100,
    keepPr = 10,
    openPrs = null,
    isAncestor = gitIsAncestor(),
}) {
    const manifest = await readJson(resolve(rawDir, 'manifest.json'), null);
    if (!manifest) throw new Error(`no manifest.json in ${rawDir}`);
    const { lines } = normalizeIndex(await readJson(resolve(dataDir, 'builds.json'), null));
    // Republishing an id replaces it wherever it was.
    for (const line of Object.keys(lines)) {
        lines[line] = lines[line].filter((id) => id !== manifest.id);
    }
    const manifests = await loadAllManifests(dataDir);
    manifests.delete(manifest.id);
    const line = lineOf(manifest);
    const baseId = await chooseBaseline({ manifest, lines, manifests, isAncestor });
    const stored = { ...manifest, line, baseId };
    const target = resolve(dataDir, 'b', manifest.id);
    await rm(target, { recursive: true, force: true });
    await cp(rawDir, target, { recursive: true });
    await write(resolve(target, 'manifest.json'), `${JSON.stringify(stored, null, 2)}\n`);
    manifests.set(manifest.id, stored);
    lines[line] = [manifest.id, ...(lines[line] ?? [])];

    const retained = retainLines({ lines, manifests, keep, keepPr, openPrs, currentLine: line });
    for (const id of await readdir(resolve(dataDir, 'b'))) {
        if (!retained.onDisk.has(id)) {
            await rm(resolve(dataDir, 'b', id), { recursive: true, force: true });
        }
    }
    await write(
        resolve(dataDir, 'builds.json'),
        `${JSON.stringify({ lines: retained.lines }, null, 2)}\n`,
    );
    return { id: manifest.id, lines: retained.lines };
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

// Renders every build in the data dir. `lines` is the data index's lines;
// `focusId` picks the build whose page `path` names (default: the newest
// main build). Each build compares against its `baseId`; history and
// older/newer links walk its own line. A build kept only as another line's
// baseline gets pages (they are linked from that line) but no line links.
// The root index (Main, Pull requests, Branches), range compare and site
// builds.json cover every line; `pr/<n>/` redirects to a PR's latest push
// and lists its pushes; latest/ and history/ cover main.
export async function renderSite({ dataDir, siteDir, lines, focusId = null }) {
    const all = await loadAllManifests(dataDir);
    await rm(siteDir, { recursive: true, force: true });
    await cp(ASSETS_DIR, resolve(siteDir, 'assets'), { recursive: true });

    const lineIdsOf = new Map();
    const histories = new Map();
    for (const [line, ids] of Object.entries(lines)) {
        const present = ids.filter((id) => all.has(id));
        const manifests = present.map((id) => all.get(id));
        const byKey = new Map();
        for (const group of groupOrder(manifests)) {
            for (const key of group.keys) byKey.set(key, entryHistory(manifests, key));
        }
        histories.set(line, byKey);
        for (const id of present) lineIdsOf.set(id, { line, ids: present });
    }
    const order = [
        ...Object.values(lines)
            .flat()
            .filter((id) => all.has(id)),
        ...[...all.keys()].filter((id) => !lineIdsOf.has(id)),
    ];

    const rendered = new Map();
    for (const id of order) {
        const build = all.get(id);
        const own = lineIdsOf.get(id) ?? { line: null, ids: [] };
        const at = own.ids.indexOf(id);
        const baseId = resolveBaseId(build, own.ids, all);
        const prev = baseId ? all.get(baseId) : null;
        const comparison = compareManifests(prev, build);
        const flat = flattenEntries(build);
        // Within a PR line, the push before this one (its own line's neighbour).
        const prevPushId = build.pr && at !== -1 ? (own.ids[at + 1] ?? null) : null;
        const prevByKey = new Map(prev ? flattenEntries(prev).map((f) => [f.key, f.entry]) : []);
        const nav = itemNavigation(flat, comparison.statuses);
        const lineHistory = histories.get(own.line) ?? new Map();
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
                    prevPushId,
                    item,
                    result: comparison.statuses.get(item.key),
                    nav: nav.get(item.key),
                    history: historyNavigation(lineHistory.get(item.key) ?? [], build.id),
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
                prevPushId,
                flat,
                comparison,
                older: at === -1 ? null : (own.ids[at + 1] ?? null),
                newer: at > 0 ? own.ids[at - 1] : null,
            }),
        );
        await write(
            resolve(buildDir, 'changes.html'),
            renderChangesPage({ build, prev, prevPushId, flat, comparison, sources: sourcesByKey }),
        );
        await write(resolve(buildDir, 'manifest.json'), `${JSON.stringify(build, null, 2)}\n`);
        rendered.set(id, { manifest: build, comparison });
    }

    const listed = (line) =>
        (lines[line] ?? []).filter((id) => all.has(id)).map((id) => rendered.get(id));
    const mainIds = (lines[MAIN_LINE] ?? []).filter((id) => all.has(id));
    const main = listed(MAIN_LINE);
    // Local branches, most recently pushed first; pull requests, highest number first.
    const branches = Object.keys(lines)
        .filter((line) => line !== MAIN_LINE && prNumberOf(line) === null)
        .map((line) => ({ line, builds: listed(line) }))
        .filter((g) => g.builds.length > 0)
        .sort((a, b) => b.builds[0].manifest.date.localeCompare(a.builds[0].manifest.date));
    const prs = Object.keys(lines)
        .filter((line) => prNumberOf(line) !== null)
        .map((line) => ({ line, number: prNumberOf(line), builds: listed(line) }))
        .filter((g) => g.builds.length > 0)
        .sort((a, b) => b.number - a.number);
    const builds = [...main, ...branches.flatMap((g) => g.builds), ...prs.flatMap((g) => g.builds)];
    for (const [key, rows] of histories.get(MAIN_LINE) ?? []) {
        await write(resolve(siteDir, 'history', `${key}.json`), JSON.stringify(rows));
    }
    for (const { number, builds: pushes } of prs) {
        await write(
            resolve(siteDir, 'pr', String(number), 'builds.html'),
            renderPrBuilds({ number, builds: pushes }),
        );
        await write(
            resolve(siteDir, 'pr', String(number), 'index.html'),
            renderRedirect(`../../b/${pushes[0].manifest.id}/`, `PR #${number}, latest push`),
        );
    }
    await write(resolve(siteDir, 'index.html'), renderRootIndex({ main, branches, prs }));
    await write(
        resolve(siteDir, 'compare.html'),
        renderComparePage({ builds, groups: groupOrder(builds.map((b) => b.manifest)) }),
    );
    await write(
        resolve(siteDir, 'builds.json'),
        `${JSON.stringify(
            builds.map(({ manifest, comparison }) => ({
                id: manifest.id,
                line: lineOf(manifest),
                pr: manifest.pr ?? null,
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
    if (mainIds.length > 0) {
        await write(resolve(siteDir, 'latest', 'index.html'), renderLatestRedirect(mainIds[0]));
    }
    // Pages serves the site as-is; no Jekyll processing.
    await write(resolve(siteDir, '.nojekyll'), '');

    const focus = rendered.get(focusId ?? mainIds[0] ?? order[0]);
    if (!focus) return { id: null, path: '' };
    return {
        id: focus.manifest.id,
        path: `b/${focus.manifest.id}/${focus.comparison.hasChanges ? 'changes.html' : ''}`,
    };
}

export async function publish({
    dataDir,
    rawDir,
    siteDir,
    keep = 100,
    keepPr = 10,
    openPrs = null,
    isAncestor = gitIsAncestor(),
}) {
    const { id, lines } = await addBuild({ dataDir, rawDir, keep, keepPr, openPrs, isAncestor });
    return renderSite({ dataDir, siteDir, lines, focusId: id });
}

const USAGE =
    'usage: node scripts/gallery/publish.mjs --data <dir> --raw <dir> --site <dir> [--keep 100] [--keep-pr 10] [--open-prs 12,34]';

function positiveInt(name, text) {
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1) {
        console.error(`${name} must be a positive integer, got ${text}`);
        process.exit(2);
    }
    return value;
}

async function main() {
    const { values } = parseArgs({
        options: {
            data: { type: 'string' },
            raw: { type: 'string' },
            site: { type: 'string' },
            keep: { type: 'string', default: '100' },
            'keep-pr': { type: 'string', default: '10' },
            'open-prs': { type: 'string' },
        },
    });
    if (!values.data || !values.raw || !values.site) {
        console.error(USAGE);
        process.exit(2);
    }
    // Omitted keeps every PR line; an empty list means no PR is open.
    const openPrs =
        values['open-prs'] === undefined
            ? null
            : values['open-prs']
                  .split(',')
                  .map((n) => n.trim())
                  .filter(Boolean)
                  .map((n) => positiveInt('--open-prs', n));
    const result = await publish({
        dataDir: resolve(values.data),
        rawDir: resolve(values.raw),
        siteDir: resolve(values.site),
        keep: positiveInt('--keep', values.keep),
        keepPr: positiveInt('--keep-pr', values['keep-pr']),
        openPrs,
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
