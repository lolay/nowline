#!/usr/bin/env node
// Promotes the `## [Unreleased]` section of every tracked CHANGELOG into a
// dated `## [X.Y.Z] - YYYY-MM-DD` section and leaves an empty
// `## [Unreleased]` skeleton in its place. Used by the `cut-release` job in
// .github/workflows/release.yml.
//
// Usage:
//   node .github/scripts/release-changelog.mjs <X.Y.Z>
//
// Behaviour:
//   - Rewrites CHANGELOG.md at the repo root.
//   - Rewrites packages/vscode-extension/CHANGELOG.md.
//   - Prints nothing to stdout (version is an input, not an output).
//   - All progress and error messages go to stderr.
//
// Guards:
//   - Exits 2 if the version argument is missing or not X.Y.Z.
//   - Exits 1 if a target file has no "## [Unreleased]" heading (the file
//     is not in Keep-a-Changelog format — something is structurally wrong).
//   - Exits 1 if a "## [X.Y.Z]" section already exists (double-promotion
//     guard — safe to re-run without clobbering an earlier release).
//   - Proceeds normally when "## [Unreleased]" is empty or has only
//     whitespace — the version section is emitted with no content.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

// The two CHANGELOG files managed by this script.  The root CHANGELOG uses
// `## [0.7.0] - 2026-06-09` headings; the VS Code extension CHANGELOG uses
// `## 0.3.0 — Unreleased`-style historical headings plus a `## [Unreleased]`
// top section — both share the same `## [Unreleased]` marker that this script
// rewrites.
const TARGETS = [
    join(repoRoot, 'CHANGELOG.md'),
    join(repoRoot, 'packages', 'vscode-extension', 'CHANGELOG.md'),
];

// ---------------------------------------------------------------------------
// Pure transformation — exported so tests can call it directly.
// ---------------------------------------------------------------------------

/**
 * Promotes the `## [Unreleased]` section in a Keep-a-Changelog markdown
 * string into a dated `## [<version>] - <date>` section, leaving an empty
 * `## [Unreleased]` skeleton for the next release cycle.
 *
 * @param {string} markdown  Full CHANGELOG file contents.
 * @param {string} version   New release version, e.g. "0.8.0".
 * @param {string} date      Release date in "YYYY-MM-DD" format.
 * @returns {string}         Updated CHANGELOG contents.
 */
export function promoteUnreleased(markdown, version, date) {
    // Match the `## [Unreleased]` heading anchored to the start of a line, so
    // an inline mention in the file's preamble (e.g. the root CHANGELOG's
    // "Contributors append entries to `## [Unreleased]`") is never mistaken
    // for the real section heading.
    const headingMatch = /^## \[Unreleased\][ \t]*$/m.exec(markdown);
    if (!headingMatch) {
        throw new Error(`no "## [Unreleased]" heading found in changelog`);
    }

    // Guard: double-promotion check — bail if a section for this version
    // already exists. Anchored to line start for the same reason as above
    // (`## [vX.Y.Z]` also appears inline in the preamble prose).
    const escaped = version.replace(/[.]/g, '\\.');
    if (new RegExp(`^## \\[${escaped}\\]`, 'm').test(markdown)) {
        throw new Error(
            `section "## [${version}]" already exists — changelog may have been promoted already`,
        );
    }

    const unreleasedIdx = headingMatch.index;
    // Everything after the heading line's text (starts with a newline).
    const afterHeading = markdown.slice(unreleasedIdx + headingMatch[0].length);

    // Find the start of the next second-level heading (## ) so we know where
    // the [Unreleased] body ends.  We match any `## ` heading (not just
    // `## [`) so the VS Code extension CHANGELOG's `## 0.3.0 — Unreleased`
    // entries are also treated as section boundaries.
    const nextSectionMatch = afterHeading.match(/\n## /);

    let body, rest;
    if (nextSectionMatch) {
        // body: content from end-of-heading through the final newline before
        // the next section (index + 1 to include that trailing newline).
        body = afterHeading.slice(0, nextSectionMatch.index + 1);
        rest = afterHeading.slice(nextSectionMatch.index + 1);
    } else {
        // [Unreleased] is the only section.
        body = afterHeading;
        rest = '';
    }

    const header = markdown.slice(0, unreleasedIdx);

    // Compose: empty skeleton + new versioned section with the moved body.
    return `${header}## [Unreleased]\n\n## [${version}] - ${date}${body}${rest}`;
}

// ---------------------------------------------------------------------------
// IO driver — only runs when the script is executed directly.
// ---------------------------------------------------------------------------

function main() {
    const version = process.argv[2];
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
        process.stderr.write(`usage: release-changelog.mjs <X.Y.Z>\n`);
        process.exit(2);
    }

    // Use UTC date so the timestamp is deterministic regardless of the
    // runner's local timezone (release.yml runs on ubuntu-latest/UTC anyway).
    const date = new Date().toISOString().slice(0, 10);

    let exitCode = 0;
    for (const target of TARGETS) {
        const original = readFileSync(target, 'utf8');
        let updated;
        try {
            updated = promoteUnreleased(original, version, date);
        } catch (err) {
            process.stderr.write(`${target}: ${err.message}\n`);
            exitCode = 1;
            continue;
        }
        writeFileSync(target, updated);
        process.stderr.write(`promoted ${target} [Unreleased] -> [${version}] - ${date}\n`);
    }

    if (exitCode !== 0) process.exit(exitCode);
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
