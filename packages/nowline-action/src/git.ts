import * as core from '@actions/core';
import * as exec from '@actions/exec';

const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

/**
 * Configure the local git identity to GitHub's standard bot identity.
 *
 * Per the action spec, auto-commits land in the consumer's repo as
 * `github-actions[bot]` rather than a Nowline-branded address — matches
 * what 99% of Marketplace actions do and avoids requiring users to set
 * up a custom committer.
 */
export async function configureGitIdentity(): Promise<void> {
    await exec.exec('git', ['config', 'user.email', BOT_EMAIL]);
    await exec.exec('git', ['config', 'user.name', BOT_NAME]);
}

/**
 * Stage `paths` and commit + push if there's an actual diff against HEAD.
 *
 * Returns the list of paths that were staged (empty if nothing changed).
 * Skipping the commit when nothing changed avoids "render nowline diagrams"
 * empty commits cluttering history when the action runs after no-op edits.
 */
export async function commitChanges(paths: string[], message: string): Promise<string[]> {
    if (paths.length === 0) return [];

    await exec.exec('git', ['add', '--', ...paths]);

    const staged = await exec.getExecOutput('git', ['diff', '--cached', '--name-only'], {
        silent: true,
    });
    const stagedPaths = staged.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (stagedPaths.length === 0) {
        core.info('no diff against HEAD; skipping commit');
        return [];
    }

    await exec.exec('git', ['commit', '-m', message]);
    await exec.exec('git', ['push']);
    return stagedPaths;
}
