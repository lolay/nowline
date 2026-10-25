import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    appendFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Dry-runs the cut-release job in .github/workflows/release.yml (make bump,
// make release-changelog, make release-commit) in a throwaway worktree, minus
// the tag and push. v0.10.0 was tagged without three manifests the bump had
// rewritten, because the commit step's git add list never learned about them
// and nothing ran that step before a release did.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The commit needs an identity and must not trip the caller's signing or hooks.
// MAKEFLAGS and MAKELEVEL come from the `make test` that runs this file; left
// in, the sub-make prints directory banners into the version it echoes.
const env = { ...process.env };
for (const key of ['MAKEFLAGS', 'MFLAGS', 'MAKELEVEL']) {
    delete env[key];
}
Object.assign(env, {
    GIT_AUTHOR_NAME: 'release-cut-test',
    GIT_AUTHOR_EMAIL: 'release-cut-test@example.invalid',
    GIT_COMMITTER_NAME: 'release-cut-test',
    GIT_COMMITTER_EMAIL: 'release-cut-test@example.invalid',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'commit.gpgsign',
    GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'core.hooksPath',
    GIT_CONFIG_VALUE_1: '/dev/null',
});

function run(cwd, command, args) {
    return spawnSync(command, args, { cwd, env, encoding: 'utf8' });
}

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
}

const worktrees = [];

// A worktree at the working tree's state, so a local run tests the edits about
// to be committed, not just HEAD: `git stash create` snapshots changes to
// tracked files without touching the stash list, and new files are copied in.
function makeWorktree() {
    const rev = git(repoRoot, 'stash', 'create') || 'HEAD';
    const dir = mkdtempSync(join(tmpdir(), 'nowline-release-cut-'));
    git(repoRoot, 'worktree', 'add', '--detach', dir, rev);
    worktrees.push(dir);
    const untracked = git(repoRoot, 'ls-files', '--others', '--exclude-standard');
    for (const path of untracked ? untracked.split('\n') : []) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        cpSync(join(repoRoot, path), join(dir, path));
    }
    // One pending fragment per changelog, so the cut has fragments to fold in
    // and delete whatever .changelog/ holds on this branch.
    for (const fragmentDir of ['.changelog', 'packages/vscode-extension/.changelog']) {
        writeFileSync(
            join(dir, fragmentDir, 'release-cut-test.txt'),
            '```release-note:fixed\nRelease cut dry run.\n```\n',
        );
    }
    git(dir, 'add', '.changelog', 'packages/vscode-extension/.changelog');
    git(dir, 'commit', '-q', '-m', 'add release cut test fragments');
    return dir;
}

function bump(dir) {
    const result = run(dir, 'make', ['bump', 'LEVEL=patch']);
    assert.equal(result.status, 0, result.stderr);
    const version = result.stdout.trim().split('\n').at(-1);
    assert.match(version, /^\d+\.\d+\.\d+$/);
    const changelog = run(dir, 'make', ['release-changelog', `VERSION=${version}`]);
    assert.equal(changelog.status, 0, changelog.stderr);
    return version;
}

after(() => {
    for (const dir of worktrees) {
        spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: repoRoot, env });
        rmSync(dir, { recursive: true, force: true });
    }
});

// cut-release runs on ubuntu-latest only, and the Windows CI cells have no
// POSIX make/bash pairing worth fighting for a job that never runs there.
const skip = process.platform === 'win32' && 'cut-release runs on Linux only';

describe('release cut', { skip }, () => {
    test('the release commit carries every file the bump and changelog promotion rewrite', () => {
        const dir = makeWorktree();
        const version = bump(dir);

        const commit = run(dir, 'make', ['release-commit', `VERSION=${version}`]);
        assert.equal(commit.status, 0, commit.stderr);

        assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=no'), '');
        assert.equal(git(dir, 'log', '-1', '--format=%s'), `release v${version}`);
        const sync = run(dir, 'node', ['scripts/sync-mcp-metadata.mjs', '--check']);
        assert.equal(sync.status, 0, sync.stderr);
        assert.ok(!existsSync(join(dir, '.changelog', 'release-cut-test.txt')));
        assert.ok(
            !existsSync(join(dir, 'packages/vscode-extension/.changelog', 'release-cut-test.txt')),
        );
    });

    test('release-commit fails when the cut leaves a tracked file out of the commit', () => {
        const dir = makeWorktree();
        const version = bump(dir);
        // Stands in for a file a future bump rewrites without the git add list
        // learning about it.
        appendFileSync(join(dir, 'README.md'), '\n');

        const commit = run(dir, 'make', ['release-commit', `VERSION=${version}`]);
        assert.notEqual(commit.status, 0);
        assert.match(commit.stderr, /left tracked files unstaged/);
        assert.match(commit.stderr, /README\.md/);
    });
});
