#!/usr/bin/env bash
# Commits the release cut as `release vX.Y.Z`: the version bump (`make bump`)
# and the changelog promotion (`make release-changelog`). Used by the
# `cut-release` job in .github/workflows/release.yml before it tags and pushes.
#
# Usage:
#   .github/scripts/release-commit.sh X.Y.Z
#
# The git add list names every file bump-version.mjs and changelog.py rewrite.
# When either starts writing a new file and the list doesn't follow, the
# clean-tree check below fails the cut before a tag exists, and
# scripts/test/release-cut.test.mjs fails `make test` before that. v0.10.0 was
# tagged without the plugin manifests that way.
set -euo pipefail

version="${1:?usage: release-commit.sh X.Y.Z}"
cd "$(dirname "$0")/../.."

git add packages/*/package.json packages/mcp/manifest.json packages/mcp/server.json \
    gemini-extension.json plugins/nowline/.claude-plugin/plugin.json plugins/nowline/plugin.json \
    CHANGELOG.md packages/vscode-extension/CHANGELOG.md \
    .changelog packages/vscode-extension/.changelog
git commit -m "release v${version}"

if ! git diff --quiet HEAD; then
    echo "release-commit: the release commit left tracked files unstaged; add them to the git add list in .github/scripts/release-commit.sh" >&2
    git status --short >&2
    exit 1
fi
