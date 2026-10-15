#!/usr/bin/env node
// Collect this tree's rendered examples/ and tests/ into one raw gallery
// build: every SVG the render scripts wrote, the `.nowline` sources behind
// them (includes too), content hashes, and the commit they came from.
// scripts/gallery/publish.mjs turns a history of these into the review site.
//
// Usage: node scripts/gallery/collect.mjs <outDir>
//
// Run after `make build`, which renders everything listed in
// scripts/lib/render-manifest.mjs.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GALLERY_GROUPS } from '../lib/render-manifest.mjs';
import { extractLeadingComment, findIncludes, roadmapTitle } from './lib/source.mjs';

export const MANIFEST_SCHEMA = 1;

function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}

// The source plus everything it includes, depth first, each listed once.
async function sourceFiles(repoRoot, sourcePath) {
    const files = [];
    const seen = new Set();
    async function visit(path) {
        if (seen.has(path)) return;
        seen.add(path);
        const text = await readFile(resolve(repoRoot, path), 'utf8');
        files.push({ path, text });
        for (const include of findIncludes(text)) {
            await visit(posix.normalize(posix.join(posix.dirname(path), include)));
        }
    }
    await visit(sourcePath);
    return files;
}

// `commit` is { sha, subject, author, date, ref, runUrl, repoUrl, dirty }.
export async function collect({ repoRoot, outDir, commit, groups = GALLERY_GROUPS }) {
    const missing = groups.flatMap((g) =>
        g.entries.filter((e) => !existsSync(resolve(repoRoot, e.svg))).map((e) => e.svg),
    );
    if (missing.length > 0) {
        throw new Error(`missing renders (run \`make build\` first):\n  ${missing.join('\n  ')}`);
    }
    await rm(outDir, { recursive: true, force: true });
    const written = new Set();
    const manifestGroups = [];
    for (const group of groups) {
        const entries = [];
        for (const entry of group.entries) {
            const files = await sourceFiles(repoRoot, entry.source);
            const svg = await readFile(resolve(repoRoot, entry.svg), 'utf8');
            const svgOut = resolve(outDir, 'svg', group.id, `${entry.slug}.svg`);
            await mkdir(dirname(svgOut), { recursive: true });
            await writeFile(svgOut, svg);
            for (const file of files) {
                if (written.has(file.path)) continue;
                written.add(file.path);
                const srcOut = resolve(outDir, 'src', file.path);
                await mkdir(dirname(srcOut), { recursive: true });
                await writeFile(srcOut, file.text);
            }
            entries.push({
                slug: entry.slug,
                title: roadmapTitle(files[0].text),
                description: entry.description ?? extractLeadingComment(files[0].text),
                theme: entry.theme,
                now: entry.now ?? null,
                volatile: !entry.now,
                source: entry.source,
                files: files.map((f) => f.path),
                svgHash: sha256(svg),
                sourceHash: sha256(files.map((f) => `${f.path}\0${f.text}`).join('\0')),
            });
        }
        manifestGroups.push({ id: group.id, title: group.title, entries });
    }
    const id = commit.dirty
        ? `${commit.sha.slice(0, 12)}-dirty-${commit.date.replace(/[-:]/g, '').slice(0, 15)}`
        : commit.sha.slice(0, 12);
    const manifest = { schema: MANIFEST_SCHEMA, id, ...commit, groups: manifestGroups };
    await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

function git(repoRoot, ...args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function githubRepoUrl(remote) {
    const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
    return match ? `https://github.com/${match[1]}/${match[2]}` : '';
}

// Commit facts from git, with GitHub Actions' environment taking precedence
// for the ref and links. Outside CI, uncommitted edits make a "dirty" build
// stamped with the current time so successive local runs stay distinct.
export function readCommit(repoRoot, env = process.env) {
    const sha = git(repoRoot, 'rev-parse', 'HEAD');
    const [subject, author, date] = git(repoRoot, 'log', '-1', '--format=%s%x00%an%x00%aI').split(
        '\0',
    );
    const server = env.GITHUB_SERVER_URL;
    const repo = env.GITHUB_REPOSITORY;
    let repoUrl = server && repo ? `${server}/${repo}` : '';
    if (!repoUrl) {
        try {
            repoUrl = githubRepoUrl(git(repoRoot, 'remote', 'get-url', 'origin'));
        } catch {
            repoUrl = '';
        }
    }
    const dirty = !env.CI && git(repoRoot, 'status', '--porcelain').length > 0;
    let localAuthor = author;
    if (dirty) {
        try {
            localAuthor = git(repoRoot, 'config', 'user.name') || author;
        } catch {
            localAuthor = author;
        }
    }
    return {
        sha,
        subject: dirty ? `${subject} + uncommitted changes` : subject,
        author: dirty ? localAuthor : author,
        date: dirty ? new Date().toISOString() : date,
        ref: env.GITHUB_REF_NAME || git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'),
        runUrl:
            server && repo && env.GITHUB_RUN_ID
                ? `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
                : '',
        repoUrl,
        dirty,
    };
}

async function main() {
    const outDir = process.argv[2];
    if (!outDir) {
        console.error('usage: node scripts/gallery/collect.mjs <outDir>');
        process.exit(2);
    }
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const manifest = await collect({
        repoRoot,
        outDir: resolve(outDir),
        commit: readCommit(repoRoot),
    });
    const count = manifest.groups.reduce((n, g) => n + g.entries.length, 0);
    console.log(`collected ${count} renders for ${manifest.id} -> ${outDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(err.message ?? err);
        process.exit(1);
    });
}
