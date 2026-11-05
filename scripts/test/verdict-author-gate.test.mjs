import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Drives .github/scripts/verdict-author-gate.sh with a stub `gh` on PATH.
// agent-verdict-apply.yml once applied any commenter's verdict with a write
// PAT, so a stranger could push an issue into agent-deep (r1.f4).

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gate = join(repoRoot, '.github', 'scripts', 'verdict-author-gate.sh');
const workflow = join(repoRoot, '.github', 'workflows', 'agent-verdict-apply.yml');

const skip = process.platform === 'win32' && 'the gate runs on Linux runners only';

describe('verdict author gate', { skip }, () => {
    const stubDir = mkdtempSync(join(tmpdir(), 'verdict-gate-'));
    const ghLog = join(stubDir, 'gh.log');
    // Prints FAKE_PERMISSION, or fails like a 404 when it is unset.
    writeFileSync(
        join(stubDir, 'gh'),
        `#!/usr/bin/env bash\necho "$*" >> "${ghLog}"\n[[ -n "\${FAKE_PERMISSION:-}" ]] || exit 1\necho "$FAKE_PERMISSION"\n`,
    );
    chmodSync(join(stubDir, 'gh'), 0o755);
    after(() => rmSync(stubDir, { recursive: true, force: true }));

    function run({ author, type = 'User', association, verdict, permission }) {
        rmSync(ghLog, { force: true });
        const env = {
            PATH: `${stubDir}${delimiter}${process.env.PATH}`,
            COMMENT_AUTHOR: author,
            COMMENT_AUTHOR_TYPE: type,
            COMMENT_ASSOCIATION: association,
            VERDICT: verdict,
            REPO: 'lolay/nowline',
        };
        if (permission) env.FAKE_PERMISSION = permission;
        const result = spawnSync(gate, { env, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        let ghCalls = '';
        try {
            ghCalls = readFileSync(ghLog, 'utf8');
        } catch {}
        return { trusted: result.stdout.trim() === 'trusted=true', ghCalls };
    }

    test('ignores a commenter with no repo association, without an API call', () => {
        for (const association of [
            'NONE',
            'CONTRIBUTOR',
            'FIRST_TIME_CONTRIBUTOR',
            'FIRST_TIMER',
        ]) {
            const { trusted, ghCalls } = run({
                author: 'stranger',
                association,
                verdict: 'agent-deep',
            });
            assert.equal(trusted, false, association);
            assert.equal(ghCalls, '');
        }
    });

    test('accepts a maintainer with write or admin permission', () => {
        for (const permission of ['write', 'admin']) {
            const { trusted, ghCalls } = run({
                author: 'maint',
                association: 'MEMBER',
                verdict: 'agent-deep',
                permission,
            });
            assert.equal(trusted, true, permission);
            assert.match(ghCalls, /repos\/lolay\/nowline\/collaborators\/maint\/permission/);
        }
    });

    test('ignores an associated author without write permission', () => {
        assert.equal(
            run({
                author: 'reader',
                association: 'MEMBER',
                verdict: 'agent-plan',
                permission: 'read',
            }).trusted,
            false,
        );
        assert.equal(
            run({ author: 'reader', association: 'COLLABORATOR', verdict: 'maintainer-pr-safe' })
                .trusted,
            false,
            'a failed permission lookup fails closed',
        );
    });

    test('accepts the Copilot coding agent only for its stop verdicts', () => {
        for (const author of ['Copilot', 'copilot-swe-agent[bot]']) {
            for (const verdict of ['agent-done', 'originator-input', 'maintainer-decide']) {
                assert.equal(
                    run({ author, type: 'Bot', association: 'NONE', verdict }).trusted,
                    true,
                );
            }
            for (const verdict of [
                'agent-plan',
                'agent-deep',
                'agent-exec',
                'maintainer-pr-safe',
            ]) {
                assert.equal(
                    run({ author, type: 'Bot', association: 'NONE', verdict }).trusted,
                    false,
                );
            }
        }
    });

    test('does not treat a user account named like the Copilot bot as Copilot', () => {
        const { trusted } = run({
            author: 'Copilot',
            type: 'User',
            association: 'NONE',
            verdict: 'agent-done',
        });
        assert.equal(trusted, false);
    });

    test('agent-verdict-apply.yml applies a label only after the gate trusts the author', () => {
        const yml = readFileSync(workflow, 'utf8');
        assert.match(yml, /run: \.github\/scripts\/verdict-author-gate\.sh/);
        assert.match(
            yml,
            /COMMENT_ASSOCIATION: \$\{\{ github\.event\.comment\.author_association \}\}/,
        );
        assert.match(
            yml,
            /- name: Apply verdict[^\n]*\n\s+if: steps\.parse\.outputs\.found == 'true' && steps\.author\.outputs\.trusted == 'true'/,
        );
    });
});
