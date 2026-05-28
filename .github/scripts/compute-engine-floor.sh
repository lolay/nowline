#!/usr/bin/env bash
# Compute the safe engines.vscode floor across every tracked VS Code fork.
#
# For each `.github/*-release-history.json`:
#   1. Filter to releases with `released_at <= now - 30 days` (the grace
#      window — gives the user population time to update).
#   2. Pick the most recent eligible release per fork.
#   3. Read its `vscode_version`.
# The floor is the semver-min of those per-fork versions: an extension pinned
# to that floor is installable on every fork's latest stable that has been out
# for 30+ days.
#
# Outputs three key=value pairs, both to stdout and (if defined) to
# $GITHUB_OUTPUT, for downstream workflow steps:
#   floor=X.Y.Z      Safe semver floor (empty if no fork has any eligible
#                    release — e.g., on a fresh seed where everything is
#                    newer than the grace window).
#   current=A.B.C    Current engines.vscode in packages/vscode-extension/package.json,
#                    with leading ^/~/= stripped.
#   bump_needed=true Iff floor is non-empty AND semver-greater-than current.
#                    Lets the workflow gate the issue-creation step without
#                    reimplementing semver comparison in YAML.
#
# Pure compute: never mutates the repo, never opens issues. Safe to run on any
# checkout. No network access required.
#
# Usage:
#   .github/scripts/compute-engine-floor.sh
#
# Exit codes:
#   0  success
#   1  unexpected failure (missing history file, malformed JSON, …)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG_JSON="$REPO_ROOT/packages/vscode-extension/package.json"
GRACE_DAYS=30

log() { printf '[compute-floor] %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

for tool in jq python3; do
    command -v "$tool" >/dev/null 2>&1 || die "missing dependency: $tool"
done

[[ -f "$PKG_JSON" ]] || die "package.json not found: $PKG_JSON"

shopt -s nullglob
histories=("$REPO_ROOT"/.github/*-release-history.json)
shopt -u nullglob
[[ ${#histories[@]} -gt 0 ]] || die "no *-release-history.json files under .github/"

cutoff="$(python3 -c "
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=$GRACE_DAYS)).isoformat().replace('+00:00','Z'))
")"
log "grace cutoff (released_at <= cutoff is eligible): $cutoff"

declare -a candidates=()
for history in "${histories[@]}"; do
    fork_name="$(jq -r '.fork_name // empty' "$history")"
    [[ -n "$fork_name" ]] || die "missing .fork_name in $history"

    eligible="$(jq -r --arg c "$cutoff" '
        [.releases[] | select(.released_at <= $c)]
        | sort_by(.released_at)
        | last
        | .vscode_version // ""
    ' "$history")"

    if [[ -z "$eligible" || "$eligible" == "null" ]]; then
        log "$fork_name: no eligible release (all entries newer than $GRACE_DAYS days)"
        continue
    fi
    log "$fork_name: most-recent-eligible vscode_version=$eligible"
    candidates+=("$eligible")
done

# semver-min over the candidate set (ignores pre-release suffixes).
if [[ ${#candidates[@]} -eq 0 ]]; then
    floor=""
else
    floor="$(python3 -c "
import sys
def key(v):
    return tuple(int(p) for p in v.split('-',1)[0].split('.')[:3])
print(min(sys.argv[1:], key=key))
" "${candidates[@]}")"
fi

current_spec="$(jq -r '.engines.vscode // empty' "$PKG_JSON")"
[[ -n "$current_spec" ]] || die "engines.vscode missing in $PKG_JSON"
current="${current_spec#^}"
current="${current#~}"
current="${current#=}"

# Floors round to `^MAJOR.MINOR.0` (patch always 0 — extension floors are
# never patch-specific). So `bump_needed` compares MAJOR.MINOR, not full
# semver: a 1.105.0 → 1.105.2 delta is a no-op at the floor level.
if [[ -z "$floor" ]]; then
    bump_needed=false
else
    bump_needed="$(python3 -c "
import sys
def major_minor(v):
    return tuple(int(p) for p in v.split('-',1)[0].split('.')[:2])
print('true' if major_minor(sys.argv[1]) > major_minor(sys.argv[2]) else 'false')
" "$floor" "$current")"
fi

emit_kv() {
    local key="$1" val="$2"
    printf '%s=%s\n' "$key" "$val"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        printf '%s=%s\n' "$key" "$val" >> "$GITHUB_OUTPUT"
    fi
}

emit_kv floor "$floor"
emit_kv current "$current"
emit_kv bump_needed "$bump_needed"
