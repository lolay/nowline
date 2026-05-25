#!/usr/bin/env bash
# Open a GitHub Issue requesting an engines.vscode floor bump.
#
# Args (positional, with optional `--dry-run` flag first):
#   [--dry-run]  Render the issue title + body to stdout and exit; no
#                idempotency check, no gh call. Useful for local diffing.
#   $1  floor    Detected min vscode_version across forks' most-recent
#                eligible releases (e.g. "1.106.0"). From compute-engine-floor.sh.
#   $2  current  Current floor with leading ^/~/= stripped (e.g. "1.105.0").
#                From compute-engine-floor.sh.
#
# Behavior:
#   1. Re-derives per-fork most-recent-eligible releases from
#      .github/*-release-history.json (single source of truth) so the issue
#      body matches the analyzer's decision basis byte-for-byte.
#   2. Renders title + body with single-vs-multi-fork variants (verb
#      agreement, Oxford-comma fork-list joining, per-fork table rows).
#   3. Idempotency: searches `gh issue list --state open` for an open issue
#      with the exact title; if one exists, exits 0 without creating a
#      duplicate. The target floor uniquely determines the title, so reruns
#      stay quiet until the floor advances again.
#   4. `gh issue create` with title + body + labels `agent-triage` +
#      `vscode-engine-bump`. The `agent-triage` label enters the issue into
#      the four-phase agent-triage state machine (see .github/AGENT_TRIAGE.md).
#      `vscode-engine-bump` is the origin/metadata label so issues from this
#      detector are queryable as `is:closed label:vscode-engine-bump label:agent-done`.
#
# The body describes *what* needs to change, not *how* (no merge strategy,
# no CI gating instructions, no auto-merge hint). The issue worker's prompt
# owns execution policy; this script owns *contracted facts*.
#
# Environment:
#   GH_TOKEN / GITHUB_TOKEN   used by `gh` (issues: write scope is enough)
#   GITHUB_SERVER_URL,
#   GITHUB_REPOSITORY,
#   GITHUB_RUN_ID             optional; if all three are set, an audit link
#                             to the workflow run is appended.
#
# Exit codes:
#   0  issue created OR already exists (idempotent no-op)
#   1  unexpected failure
#   2  invalid args (floor missing or non-semver, etc.)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_JSON="$REPO_ROOT/packages/vscode-extension/package.json"
GRACE_DAYS=30

log() { printf '[open-engine-bump-issue] %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

dry_run=0
if [[ "${1:-}" == "--dry-run" ]]; then
    dry_run=1
    shift
fi

required_tools=(jq python3)
[[ $dry_run -eq 1 ]] || required_tools+=(gh)
for tool in "${required_tools[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || die "missing dependency: $tool"
done

if [[ $# -ne 2 ]]; then
    echo "usage: $0 [--dry-run] <floor> <current>" >&2
    exit 2
fi
floor="$1"
current="$2"
[[ "$floor"   =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "error: floor not semver: $floor" >&2; exit 2; }
[[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "error: current not semver: $current" >&2; exit 2; }

IFS='.' read -r floor_major floor_minor _ <<<"${floor%%-*}"
target_spec="^${floor_major}.${floor_minor}.0"

current_spec="$(jq -r '.engines.vscode // empty' "$PKG_JSON")"
[[ -n "$current_spec" ]] || die "engines.vscode missing in $PKG_JSON"

cutoff="$(python3 -c "
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc) - timedelta(days=$GRACE_DAYS)).isoformat().replace('+00:00','Z'))
")"

shopt -s nullglob
histories=("$REPO_ROOT"/.github/*-release-history.json)
shopt -u nullglob
[[ ${#histories[@]} -gt 0 ]] || die "no *-release-history.json files under .github/"

declare -a fork_names=()
declare -a table_rows=()
for history in "${histories[@]}"; do
    fork_name="$(jq -r '.fork_name // empty' "$history")"
    [[ -n "$fork_name" ]] || die "missing .fork_name in $history"

    # Tab-delimited so bash's default IFS-`read` splits cleanly without an
    # `IFS=$'\x01' read … <<<` herestring, which silently mis-handles control
    # bytes under macOS's bash 3.2.
    row_data="$(jq -r --arg c "$cutoff" '
        [.releases[] | select(.released_at <= $c)]
        | sort_by(.released_at)
        | last
        | if . == null then "" else "\(.version)\t\(.released_at[:10])\t\(.vscode_version)" end
    ' "$history")"

    if [[ -z "$row_data" ]]; then
        log "$fork_name: no eligible release; excluding from issue"
        continue
    fi

    v_release=""; v_date=""; v_engine=""
    IFS=$'\t' read -r v_release v_date v_engine <<<"$row_data"
    fork_names+=("$fork_name")
    table_rows+=("| $fork_name | \`$v_release\` | $v_date | \`$v_engine\` |")
done

[[ ${#fork_names[@]} -gt 0 ]] \
    || die "no eligible forks; compute-engine-floor should have returned floor= and we shouldn't be here"

# Verb agreement (singular "has" vs plural "have") + list joining
# (Oxford comma for 3+, plain "and" for 2, single name for 1).
# bash 3.2 (macOS default) lacks `${arr[-1]}`; use a computed index.
fork_count=${#fork_names[@]}
case $fork_count in
    1)
        fork_list="${fork_names[0]}"
        fork_verb="has"
        ;;
    2)
        fork_list="${fork_names[0]} and ${fork_names[1]}"
        fork_verb="have"
        ;;
    *)
        # Oxford comma: "A, B, and C". We can't use `IFS=', '` with
        # `${arr[*]}` because that only uses the first character of IFS as
        # the join separator (so we'd get "A,B"); use a printf reduction
        # instead.
        last_idx=$(( fork_count - 1 ))
        rest_joined="$(printf '%s, ' "${fork_names[@]:0:$last_idx}")"
        rest_joined="${rest_joined%, }"
        fork_list="$rest_joined, and ${fork_names[$last_idx]}"
        fork_verb="have"
        ;;
esac

title="chore(vscode-extension): bump engines.vscode floor to $target_spec"

audit_footer=""
if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
    audit_footer=$'\n'"- Workflow run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

# Render body in Python (env-vars in, stdout out). This keeps shell quoting
# out of the template — backticks, brackets, and pipes are all literal here.
body="$(
    FORK_LIST="$fork_list" \
    FORK_VERB="$fork_verb" \
    FLOOR="$floor" \
    CURRENT_SPEC="$current_spec" \
    TARGET_SPEC="$target_spec" \
    TABLE_ROWS="$(printf '%s\n' "${table_rows[@]}")" \
    AUDIT_FOOTER="$audit_footer" \
    python3 <<'PY'
import os
fork_list   = os.environ["FORK_LIST"]
fork_verb   = os.environ["FORK_VERB"]
floor       = os.environ["FLOOR"]
current_spec = os.environ["CURRENT_SPEC"]
target_spec = os.environ["TARGET_SPEC"]
table_rows  = os.environ["TABLE_ROWS"].rstrip()
audit_footer = os.environ["AUDIT_FOOTER"]

body = f"""## Why

{fork_list} {fork_verb} been shipping VS Code engine `{floor}` or higher for at least 30 days. The `engines.vscode` floor in [`packages/vscode-extension/package.json`](packages/vscode-extension/package.json) should be raised from `{current_spec}` to `{target_spec}` so it reflects what users on every tracked fork's latest stable can actually install.

The new floor is computed as the **min `vscode_version`** across every tracked fork's most-recent stable release whose `released_at` is at least 30 days old, then pinned to `^MAJOR.MINOR.0` (floors are never patch-specific). The detected min is `{floor}`, which rounds to `{target_spec}`.

## Required changes

In [`packages/vscode-extension/package.json`](packages/vscode-extension/package.json):

- `engines.vscode`: `{current_spec}` → `{target_spec}`
- `devDependencies["@types/vscode"]`: must match the new `engines.vscode` (the two are intentionally locked together)

After editing, refresh `pnpm-lock.yaml` so the change reflects in the lockfile.

Do **not** bump any other `engines.*` field, any other dependency, or files outside `packages/vscode-extension/` and `pnpm-lock.yaml`.

## Source data

| Fork | Latest stable ≥30 days old | Released (UTC) | VS Code engine |
|------|---------------------------|----------------|----------------|
{table_rows}

Only forks with at least one release older than the 30-day grace window are listed; forks with all releases inside the window do not constrain the floor on this run.

## Audit

- Source data lives in [`.github/*-release-history.json`](.github/) and is updated daily by `.github/workflows/editor-release-monitor.yml`.
- The analyzer (this issue's author) is `.github/workflows/vscode-extension-engine-bump.yml` and reuses `scripts/compute-engine-floor.sh` for the floor math.{audit_footer}

<!-- engine-floor-bump:target={target_spec};current={current_spec} -->
"""
print(body, end="")
PY
)"

if [[ $dry_run -eq 1 ]]; then
    printf '=== TITLE ===\n%s\n\n=== BODY ===\n%s\n' "$title" "$body"
    exit 0
fi

# Idempotency: search by exact title among open issues. The `in:title` query
# is a substring match, so we additionally filter the JSON result by exact
# string equality to be safe against title-prefix collisions.
existing_count="$(gh issue list --state open --search "in:title \"$title\"" --json title --jq "[.[] | select(.title == \"$title\")] | length" 2>/dev/null || echo "0")"
if [[ "$existing_count" != "0" ]]; then
    log "open issue already exists with title \"$title\"; skipping"
    exit 0
fi

log "creating issue: $title"
gh issue create \
    --title "$title" \
    --body "$body" \
    --label "agent-triage,vscode-engine-bump"
