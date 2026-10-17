// Checks on raw gallery builds before publish.mjs touches the disk. In CI a
// privileged job publishes an artifact that pull-request code produced, so
// every manifest field and every file in the raw build is untrusted: ids,
// group ids, slugs and source paths become filesystem paths; shas go to git;
// URLs become links on the site; the id and line decide which history a
// build joins. Pure apart from `checkRawTree`, which only reads.

import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { idPrefix, MAIN_LINE } from './lines.mjs';

const NAME = /^[A-Za-z0-9._-]+$/;
const SHA = /^[0-9a-f]{7,40}$/;
// Line names are keys in builds.json and shown on the site, never paths.
const LINE = /^[A-Za-z0-9._/-]+$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// What buildId appends for an uncommitted local tree.
const DIRTY_SUFFIX = /^-dirty-\d{8}T\d{6}$/;
const REPO_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

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

function isEmpty(value) {
    return value === undefined || value === null || value === '';
}

// A link that must match `pattern` (built from repoUrl); with no pattern
// (no repoUrl to pin it to) only an empty value passes.
function pinnedUrl(what, value, pattern, shape) {
    if (isEmpty(value)) return;
    if (!safeUrl(value) || !pattern?.test(value)) {
        fail(`${what} must be an https URL of the form ${shape}, got ${JSON.stringify(value)}`);
    }
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The repository links: repoUrl is a github.com repository; runUrl and the
// PR's url sit under it.
function checkLinks(manifest, pr) {
    const repoUrl = isEmpty(manifest.repoUrl) ? '' : manifest.repoUrl;
    if (repoUrl) {
        const match = REPO_URL.exec(repoUrl);
        if (!safeUrl(repoUrl) || !match || !isSafeName(match[1]) || !isSafeName(match[2])) {
            fail(
                `repoUrl must be an https URL of the form https://github.com/<owner>/<repo>, got ${JSON.stringify(repoUrl)}`,
            );
        }
    }
    const base = repoUrl ? escapeRegExp(repoUrl) : null;
    pinnedUrl(
        'runUrl',
        manifest.runUrl,
        base && new RegExp(`^${base}/actions/runs/\\d+(?:/attempts/\\d+)?$`),
        '<repoUrl>/actions/runs/<id>',
    );
    if (pr) {
        pinnedUrl(
            'pr.url',
            pr.url,
            base && new RegExp(`^${base}/pull/${pr.number}$`),
            `<repoUrl>/pull/${pr.number}`,
        );
    }
}

function optionalSha(what, value) {
    if (value === undefined || value === null) return;
    assertSha(what, value);
}

// How far publish trusts the build it is handed, from what the publishing
// workflow knows rather than from the build itself:
//   { pr: n }  a pull request run: the build must be PR n's
//   'main'     a push to main: the build must be a main build, not a PR's
//   'local'    `make gallery` on a developer's own tree: any line
export function assertTrust(trust) {
    if (trust === 'main' || trust === 'local') return trust;
    if (trust && typeof trust === 'object' && Number.isInteger(trust.pr) && trust.pr > 0) {
        return trust;
    }
    throw new Error(
        `publish needs a trust: { pr: <n> } (--pr), 'main' (--trusted-main) or 'local' (--trusted-local), got ${JSON.stringify(trust)}`,
    );
}

function checkTrust(trust, line, pr) {
    const got = pr ? `PR #${pr.number}` : `line ${line}`;
    if (trust === 'main' && (pr || line !== MAIN_LINE)) fail(`expected a main build, got ${got}`);
    if (typeof trust === 'object' && pr?.number !== trust.pr) {
        fail(`expected a build of PR #${trust.pr}, got ${got}`);
    }
}

// The id is bound to the build's line and commit (see buildId): a PR
// build's is `pr-<n>-<head sha>`, so it can't name a main build or another
// PR's; only a PR build's id starts with `pr-`.
function checkId(manifest, line, pr) {
    const { id, sha } = manifest;
    if (pr) {
        if (isEmpty(pr.headSha)) fail(`PR #${pr.number} build has no pr.headSha`);
        if (sha !== pr.headSha) fail(`a PR build's sha must be its pr.headSha, got ${sha}`);
    } else if (id.startsWith('pr-')) {
        fail(`only a PR build's id may start with pr-, got ${JSON.stringify(id)}`);
    }
    const expected = `${idPrefix({ line, pr })}${sha.slice(0, 12)}`;
    const rest = id.startsWith(expected) ? id.slice(expected.length) : null;
    if (rest === '' || (rest !== null && manifest.dirty === true && DIRTY_SUFFIX.test(rest))) {
        return;
    }
    fail(`build id ${JSON.stringify(id)} must be ${expected} for line ${line}`);
}

// Facts the publishing workflow takes from its own event rather than from
// the build: `repoUrl` (the repository it runs in) and `sha` (the commit
// the triggering run built, the head sha for a PR). Each is checked when set.
function checkExpected(manifest, expect) {
    if (expect.repoUrl && manifest.repoUrl !== expect.repoUrl) {
        fail(`expected repoUrl ${expect.repoUrl}, got ${JSON.stringify(manifest.repoUrl)}`);
    }
    if (expect.sha && manifest.sha !== assertSha('expected sha', expect.sha)) {
        fail(`expected a build of ${expect.sha}, got ${manifest.sha}`);
    }
}

// Validates a build manifest's shape and every field that becomes a path,
// a git argument or a link, and binds its id to its line. With `trust` (see
// assertTrust), the build must also be one the publishing workflow expects,
// and with `expect` (see checkExpected), of its repository and commit.
export function validateManifest(manifest, { trust = null, expect = {} } = {}) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        fail('manifest is not an object');
    }
    if (!isSafeName(manifest.id)) fail(`unsafe build id ${JSON.stringify(manifest.id)}`);
    assertSha('sha', manifest.sha);
    const line = manifest.line ?? MAIN_LINE;
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
    }
    if (trust !== null) checkTrust(assertTrust(trust), line, pr);
    checkExpected(manifest, expect);
    // A build without `pr` on a line named like `pr-12` is a local branch of
    // that name; lib/lines.mjs classifies lines by `pr`, not by name.
    checkLinks(manifest, pr);
    checkId(manifest, line, pr);
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

// Every file a (validated) manifest names in its raw build, relative to it:
// each entry's SVG and source files, each once.
export function namedFiles(manifest) {
    const files = new Set();
    for (const group of manifest.groups) {
        for (const entry of group.entries) {
            files.add(`svg/${group.id}/${entry.slug}.svg`);
            for (const file of entry.files) files.add(`src/${file}`);
        }
    }
    return [...files];
}

// Walks a raw build directory and refuses anything but plain files and
// directories (a symlink could point anywhere on the runner), then confirms
// every SVG and source file the manifest names is a plain file in it.
// publish.mjs copies only those files (namedFiles) into the data dir.
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
    for (const file of namedFiles(manifest)) {
        if (!files.has(file)) fail(`${file} is missing from the raw build`);
    }
}
