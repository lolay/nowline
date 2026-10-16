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
//
// Each build belongs to a line (see lib/lines.mjs): `main`, `pr-<n>`, or the
// local branch. In CI a pull request is checked out as its merge commit, so
// the workflow passes the PR's own facts in GALLERY_* variables (see
// readCommit); locally the line is the current git branch.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GALLERY_GROUPS } from '../lib/render-manifest.mjs';
import { buildId, MAIN_LINE } from './lib/lines.mjs';
import { extractLeadingComment, findIncludes, roadmapTitle } from './lib/source.mjs';

// 2 added `line` and `pr`, and publish adds `baseId`. Schema 1 manifests
// (m1) read as main-line builds.
export const MANIFEST_SCHEMA = 2;

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

// `commit` is { sha, subject, author, date, ref, runUrl, repoUrl, dirty,
// line, pr }, as readCommit returns it; `line` defaults to main and `pr` to
// null. A PR build's `sha` is the PR head, not the merge commit CI built.
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
    const facts = { ...commit, line: commit.line || MAIN_LINE, pr: commit.pr ?? null };
    const manifest = {
        schema: MANIFEST_SCHEMA,
        id: buildId(facts),
        ...facts,
        groups: manifestGroups,
    };
    await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

function git(repoRoot, ...args) {
    return execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function githubRepoUrl(remote) {
    const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
    return match ? `https://github.com/${match[1]}/${match[2]}` : '';
}

// The PR facts the CI workflow passes, or null outside a PR build.
function readPr(env) {
    const number = Number.parseInt(env.GALLERY_PR_NUMBER ?? '', 10);
    if (!Number.isInteger(number) || number < 1) return null;
    return {
        number,
        title: env.GALLERY_PR_TITLE ?? '',
        url: env.GALLERY_PR_URL ?? '',
        headRef: env.GALLERY_HEAD_REF ?? '',
        headSha: env.GALLERY_HEAD_SHA || null,
        baseSha: env.GALLERY_BASE_SHA || null,
    };
}

// Subject, author and date of one commit, or null when this checkout
// doesn't have it (a shallow PR merge checkout lacks the head commit).
function commitFacts(repoRoot, rev) {
    try {
        const [subject, author, date] = git(
            repoRoot,
            'log',
            '-1',
            '--format=%s%x00%an%x00%aI',
            rev,
            '--',
        ).split('\0');
        return { subject, author, date };
    } catch {
        return null;
    }
}

// Commit facts from git, with GitHub Actions' environment taking precedence
// for the ref and links, and the gallery workflow's GALLERY_* variables
// taking precedence over both:
//   GALLERY_LINE        the line (default `pr-<n>` for a PR, else the branch)
//   GALLERY_PR_NUMBER, GALLERY_PR_TITLE, GALLERY_PR_URL, GALLERY_HEAD_REF,
//   GALLERY_HEAD_SHA, GALLERY_BASE_SHA
//                       the PR; a set number makes this a PR build, whose
//                       sha is the head sha rather than the merge commit
//   GALLERY_AUTHOR, GALLERY_DATE
//                       the person and time shown for the build
// Outside CI, uncommitted edits make a "dirty" build stamped with the current
// time so successive local runs stay distinct.
export function readCommit(repoRoot, env = process.env) {
    const head = git(repoRoot, 'rev-parse', 'HEAD');
    const pr = readPr(env);
    const sha = env.GALLERY_HEAD_SHA || head;
    const headFacts = commitFacts(repoRoot, 'HEAD');
    const facts = (sha === head ? headFacts : commitFacts(repoRoot, sha)) ?? {
        subject: pr?.title || headFacts.subject,
        author: headFacts.author,
        date: headFacts.date,
    };
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
    let localAuthor = facts.author;
    if (dirty) {
        try {
            localAuthor = git(repoRoot, 'config', 'user.name') || facts.author;
        } catch {
            localAuthor = facts.author;
        }
    }
    const branch = git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD');
    const ref = pr?.headRef || env.GITHUB_REF_NAME || branch;
    let line = env.GALLERY_LINE || (pr ? `pr-${pr.number}` : ref);
    if (line === 'HEAD') line = 'detached';
    return {
        sha,
        subject: dirty ? `${facts.subject} + uncommitted changes` : facts.subject,
        author: env.GALLERY_AUTHOR || (dirty ? localAuthor : facts.author),
        date: env.GALLERY_DATE || (dirty ? new Date().toISOString() : facts.date),
        ref,
        runUrl:
            server && repo && env.GITHUB_RUN_ID
                ? `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
                : '',
        repoUrl,
        dirty,
        line,
        pr,
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
    console.log(
        `collected ${count} renders for ${manifest.id} (line ${manifest.line}) -> ${outDir}`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(err.message ?? err);
        process.exit(1);
    });
}
