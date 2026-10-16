// Checks on raw gallery builds before publish.mjs touches the disk. In CI a
// privileged job publishes an artifact that pull-request code produced, so
// every manifest field and every file in the raw build is untrusted: ids,
// group ids, slugs and source paths become filesystem paths; shas go to git;
// URLs become links on the site. Pure apart from `checkRawTree`, which only
// reads.

import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const NAME = /^[A-Za-z0-9._-]+$/;
const SHA = /^[0-9a-f]{7,40}$/;
// Line names are keys in builds.json and shown on the site, never paths.
const LINE = /^[A-Za-z0-9._/-]+$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function fail(message) {
    throw new Error(`invalid gallery build: ${message}`);
}

// One path segment: letters, digits, `.`, `_`, `-`, and not `.` or `..`.
export function isSafeName(value) {
    return typeof value === 'string' && NAME.test(value) && value !== '.' && value !== '..';
}

// A relative POSIX path whose every segment is a safe name: no absolute
// paths, no `..`, no empty segments, no backslashes.
export function isSafeRelPath(value) {
    return typeof value === 'string' && value.split('/').every(isSafeName);
}

export function isSha(value) {
    return typeof value === 'string' && SHA.test(value);
}

// Throws unless `value` is a sha git can't read as an option or a range.
export function assertSha(what, value) {
    if (!isSha(value)) fail(`${what} must be 7-40 lowercase hex, got ${JSON.stringify(value)}`);
    return value;
}

// `root` joined with a relative path, confirmed to stay inside `root`.
export function inside(root, ...parts) {
    const base = resolve(root);
    const path = resolve(base, ...parts);
    const rel = relative(base, path);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        fail(`${parts.join('/')} escapes ${base}`);
    }
    return path;
}

// An https URL, or '' for anything else (javascript:, data:, relative...).
// html.mjs and gallery.js apply the same rule again when rendering links.
export function safeUrl(value) {
    if (typeof value !== 'string' || value === '') return '';
    try {
        return new URL(value).protocol === 'https:' ? value : '';
    } catch {
        return '';
    }
}

function optionalUrl(what, value, pattern = null) {
    if (value === undefined || value === null || value === '') return;
    if (!safeUrl(value) || (pattern && !pattern.test(value))) {
        fail(
            `${what} must be an https URL${pattern ? ' of the expected shape' : ''}, got ${JSON.stringify(value)}`,
        );
    }
}

function optionalSha(what, value) {
    if (value === undefined || value === null) return;
    assertSha(what, value);
}

// Validates a build manifest's shape and every field that becomes a path,
// a git argument or a link. With `expectPr` (the PR number the publishing
// workflow knows from its trigger), the manifest must be that PR's build.
export function validateManifest(manifest, { expectPr = null } = {}) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        fail('manifest is not an object');
    }
    if (!isSafeName(manifest.id)) fail(`unsafe build id ${JSON.stringify(manifest.id)}`);
    assertSha('sha', manifest.sha);
    const line = manifest.line ?? 'main';
    if (typeof line !== 'string' || !LINE.test(line) || RESERVED_KEYS.has(line)) {
        fail(`unsafe line ${JSON.stringify(line)}`);
    }
    const pr = manifest.pr ?? null;
    if (pr !== null) {
        if (typeof pr !== 'object' || Array.isArray(pr)) fail('pr is not an object');
        if (!Number.isInteger(pr.number) || pr.number < 1) {
            fail(`pr.number must be a positive integer, got ${JSON.stringify(pr.number)}`);
        }
        if (line !== `pr-${pr.number}`) {
            fail(`a PR #${pr.number} build must be on line pr-${pr.number}, not ${line}`);
        }
        optionalSha('pr.headSha', pr.headSha);
        optionalSha('pr.baseSha', pr.baseSha);
        optionalUrl(
            'pr.url',
            pr.url,
            new RegExp(`^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/${pr.number}$`),
        );
    }
    if (expectPr !== null && pr?.number !== expectPr) {
        fail(
            `expected a build of PR #${expectPr}, got ${pr ? `PR #${pr.number}` : `line ${line}`}`,
        );
    }
    // A build without `pr` on a line named like `pr-12` is a local branch of
    // that name; lib/lines.mjs classifies lines by `pr`, not by name.
    optionalUrl('repoUrl', manifest.repoUrl);
    optionalUrl('runUrl', manifest.runUrl);
    if (!Array.isArray(manifest.groups)) fail('groups is not an array');
    const keys = new Set();
    for (const group of manifest.groups) {
        if (!group || !isSafeName(group.id)) fail(`unsafe group id ${JSON.stringify(group?.id)}`);
        if (!Array.isArray(group.entries)) fail(`group ${group.id} has no entries array`);
        for (const entry of group.entries) {
            if (!entry || !isSafeName(entry.slug)) {
                fail(`unsafe slug ${JSON.stringify(entry?.slug)} in group ${group.id}`);
            }
            const key = `${group.id}/${entry.slug}`;
            if (keys.has(key)) fail(`duplicate entry ${key}`);
            keys.add(key);
            if (!Array.isArray(entry.files) || entry.files.length === 0) {
                fail(`${key} lists no source files`);
            }
            for (const file of entry.files) {
                if (!isSafeRelPath(file)) {
                    fail(`unsafe source path ${JSON.stringify(file)} in ${key}`);
                }
            }
        }
    }
    return manifest;
}

// Walks a raw build directory and refuses anything but plain files and
// directories (a symlink could point anywhere on the runner), then confirms
// every SVG and source file the manifest names is a plain file in it.
export async function checkRawTree(rawDir, manifest) {
    const files = new Set();
    async function walk(dir, prefix) {
        for (const name of await readdir(dir)) {
            const rel = prefix ? `${prefix}/${name}` : name;
            const stat = await lstat(resolve(dir, name));
            if (stat.isDirectory()) await walk(resolve(dir, name), rel);
            else if (stat.isFile()) files.add(rel);
            else fail(`${rel} in the raw build is not a plain file or directory`);
        }
    }
    await walk(resolve(rawDir), '');
    for (const group of manifest.groups) {
        for (const entry of group.entries) {
            const svg = `svg/${group.id}/${entry.slug}.svg`;
            if (!files.has(svg)) fail(`${svg} is missing from the raw build`);
            for (const file of entry.files) {
                if (!files.has(`src/${file}`)) fail(`src/${file} is missing from the raw build`);
            }
        }
    }
}
