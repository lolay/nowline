import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Guards the Tier 1 consumer floors in CONTRIBUTING.md § Toolchain & Supported
// Versions. Renovate once raised engines.pnpm and engines.vscode in a grouped
// automerge (#213); these checks fail the gate before that can ship.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(path) {
    return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

function packageJsonPaths() {
    const packages = readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `packages/${entry.name}/package.json`);
    return ['package.json', ...packages];
}

// triage.yaml repeats the floors for `make doctor`, and Renovate has no manager
// for it, so it is the independent copy to compare against.
function triageFloor(tool) {
    const triage = readFileSync(join(repoRoot, 'triage.yaml'), 'utf8');
    const match = triage.match(new RegExp(`- tool: ${tool}\\n\\s+version: "([^"]+)"`));
    assert.ok(match, `triage.yaml has no version for ${tool}`);
    return match[1];
}

function majorMinor(version) {
    const [major, minor] = version
        .replace(/^[\^~=]/, '')
        .split('.')
        .map(Number);
    return { major, minor };
}

function isAtOrBelow(a, b) {
    return a.major < b.major || (a.major === b.major && a.minor <= b.minor);
}

for (const tool of ['node', 'pnpm']) {
    test(`every package.json engines.${tool} matches the triage.yaml floor`, () => {
        const floor = triageFloor(tool);
        for (const path of packageJsonPaths()) {
            assert.equal(readJson(path).engines?.[tool], floor, `${path} engines.${tool}`);
        }
    });
}

test('engines.vscode is installable on the newest release of every tracked fork', () => {
    const engine = readJson('packages/vscode-extension/package.json').engines.vscode;
    const histories = readdirSync(join(repoRoot, '.github')).filter((name) =>
        name.endsWith('-release-history.json'),
    );
    assert.ok(histories.length > 0, 'no .github/*-release-history.json files');

    for (const name of histories) {
        const { fork_name: fork, releases } = readJson(`.github/${name}`);
        if (releases.length === 0) continue;
        const newest = releases
            .map((r) => majorMinor(r.vscode_version))
            .reduce((a, b) => (isAtOrBelow(a, b) ? b : a));
        assert.ok(
            isAtOrBelow(majorMinor(engine), newest),
            `engines.vscode ${engine} is above ${fork}'s newest engine ${newest.major}.${newest.minor}`,
        );
    }
});
