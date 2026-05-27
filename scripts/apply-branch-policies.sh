#!/usr/bin/env bash
# apply-branch-policies.sh
#
# Idempotently applies the OSS branch ruleset policy on `lolay/nowline`
# (Tier 1: OSS) and `lolay/nowline-action` (Tier 3: Follower).  Run once
# from any machine that has `gh` authenticated with admin scope on the
# lolay org.
#
# The commercial repos are managed by a sibling script in the commercial
# infrastructure repository. Both scripts share the same helper shape but
# each owns only its own tier — OSS source-of-truth lives in this repo,
# commercial source-of-truth lives in the infrastructure repository.
#
# Operator-facing runbook: ops/branch-policies.md (why the policy is
# shaped this way, when to re-run, how to extend, known gaps).  This
# script is the spec; that runbook is the wrapper.
#
# Idempotency: GET rulesets first; PUT by id when a ruleset with the
# target name already exists, POST when none does.  Safe to re-run at
# any time.
#
# App bypass coverage: both repos include the lolay-nowline-release App
# (App ID 3789687) as a bypass actor with bypass_mode: always when the
# App is installed (auto-detected via probe).  The App is currently
# installed on every lolay/nowline* repo; uninstalls degrade gracefully
# to OrgAdmin-only bypass on that repo.
#
#   - lolay/nowline:        bypass actively used after the queued
#                           PAT->App migration on release.yml +
#                           editor-release-monitor.yml ships (see runbook
#                           "Known gaps" section).  Pre-positioned today.
#   - lolay/nowline-action:  no release workflow today; bypass is
#                           pre-positioned for symmetry.

set -euo pipefail

ORG="lolay"
RELEASE_APP_ID=3789687

# ──────────────────────────────────────────────────────────────────────────────
# helpers
# ──────────────────────────────────────────────────────────────────────────────

# upsert_ruleset REPO NAME BODY_FILE
#   If a ruleset named NAME already exists on REPO, PUT it (update).
#   Otherwise POST (create).  Prints the resulting ruleset id.
upsert_ruleset() {
  local repo="$1" name="$2" body_file="$3"
  local existing_id
  existing_id=$(gh api "repos/${repo}/rulesets" \
    --jq ".[] | select(.name == \"${name}\") | .id" 2>/dev/null || true)

  if [[ -n "$existing_id" ]]; then
    echo "  [PUT]  repos/${repo}/rulesets/${existing_id}  (${name})"
    gh api -X PUT "repos/${repo}/rulesets/${existing_id}" \
      --input "$body_file" --jq '.id'
  else
    echo "  [POST] repos/${repo}/rulesets  (${name})"
    gh api -X POST "repos/${repo}/rulesets" \
      --input "$body_file" --jq '.id'
  fi
}

# patch_repo_settings REPO
#   Enables auto-merge, squash-merge, and branch-deletion-on-merge.
patch_repo_settings() {
  local repo="$1"
  echo "  [PATCH] repos/${repo} — allow_auto_merge / squash / delete_branch"
  gh api -X PATCH "repos/${repo}" \
    -F allow_auto_merge=true \
    -F allow_squash_merge=true \
    -F delete_branch_on_merge=true \
    --jq '{allow_auto_merge, allow_squash_merge, delete_branch_on_merge}' \
    | sed 's/^/    /'
}

# probe_release_app_installed REPO
#   Echoes "1" if lolay-nowline-release is installed on REPO, "0" otherwise.
#   Mechanism: try to POST a disabled probe ruleset that uses the App as a
#   bypass actor.  GitHub returns 422 with "must be part of the ruleset
#   source or owner organization" when the App isn't installed; otherwise we
#   get a 201 + ruleset id, which we immediately delete.  Side-effect-free
#   when the call succeeds because the probe ruleset has enforcement:disabled
#   and is removed before the function returns.
probe_release_app_installed() {
  local repo="$1"
  local probe_body probe_file probe_result probe_id
  probe_body=$(cat <<'JSON'
{"name":"_app-install-probe","target":"branch","enforcement":"disabled",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"deletion"}],
 "bypass_actors":[{"actor_id":3789687,"actor_type":"Integration","bypass_mode":"always"}]}
JSON
  )
  probe_file="${TMP}/_app-probe.json"
  printf '%s' "$probe_body" > "$probe_file"
  # gh exits non-zero on 422; we expect that case for "App not installed",
  # so swallow the exit code and inspect the body instead.
  probe_result=$(gh api -X POST "repos/${repo}/rulesets" --input "$probe_file" 2>&1 || true)
  if echo "$probe_result" | grep -q '"id":'; then
    probe_id=$(echo "$probe_result" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
    gh api -X DELETE "repos/${repo}/rulesets/${probe_id}" >/dev/null 2>&1
    echo 1
  else
    echo 0
  fi
}

# bypass_actors_json REPO
#   Echoes the JSON `bypass_actors` array for REPO, including the release App
#   as a bypass actor iff probe_release_app_installed returns 1.  Always
#   includes OrganizationAdmin (Gary) with bypass_mode: always.
#   Logs the detection result to stderr.
bypass_actors_json() {
  local repo="$1"
  local installed
  installed=$(probe_release_app_installed "$repo")
  if [[ "$installed" == "1" ]]; then
    echo "  release App: installed — adding to bypass" >&2
    cat <<JSON
[
    { "actor_id": 1,                 "actor_type": "OrganizationAdmin", "bypass_mode": "always" },
    { "actor_id": ${RELEASE_APP_ID}, "actor_type": "Integration",       "bypass_mode": "always" }
  ]
JSON
  else
    echo "  release App: not installed — OrgAdmin-only bypass" >&2
    cat <<'JSON'
[
    { "actor_id": 1, "actor_type": "OrganizationAdmin", "bypass_mode": "always" }
  ]
JSON
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# temporary directory for JSON body files
# ──────────────────────────────────────────────────────────────────────────────
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ──────────────────────────────────────────────────────────────────────────────
# Tier 1 — OSS: lolay/nowline
#
# Required CI contexts taken from .github/workflows/ci.yml's job names.
# Names must match exactly; a renamed job needs the script updated and
# re-run before the next PR or merges block on a missing-but-required
# check.  strict_required_status_checks_policy: true requires the PR
# branch be up-to-date with main before merging — matches the brief
# from the agent-merge flow (see ops/branch-policies.md § 1).
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "=== Tier 1: OSS — ${ORG}/nowline ==="

OSS_BYPASS_JSON=$(bypass_actors_json "${ORG}/nowline")
# NOTE: The release-build-smoke check names below are best-guess based on the
# GitHub Actions convention `<caller-job-name> / <called-job-name>` with
# matrix-cell expansion via `Build ${{ matrix.id }}` (the job name in build.yml).
# Verify actual names via step 1.10 throwaway PR observation after the prep PR
# merges; adjust and re-run this script if the names differ.
cat > "$TMP/nowline.json" <<JSON
{
  "name": "main: CI must pass",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash", "merge", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Lint workflows (actionlint)" },
          { "context": "Build & test (ubuntu-latest, node 22)" },
          { "context": "Build & test (ubuntu-latest, node 26)" },
          { "context": "Build & test (macos-latest, node 26)" },
          { "context": "Build & test (windows-latest, node 26)" },
          { "context": "Embed bundle size gate" },
          { "context": "release-build-smoke / Build bin-macos-arm64" },
          { "context": "release-build-smoke / Build bin-macos-x64" },
          { "context": "release-build-smoke / Build bin-linux-x64" },
          { "context": "release-build-smoke / Build bin-linux-arm64" },
          { "context": "release-build-smoke / Build bin-windows-x64" },
          { "context": "release-build-smoke / Build bin-windows-arm64" },
          { "context": "release-build-smoke / Build pack-npm" },
          { "context": "release-build-smoke / Build pack-vsix" },
          { "context": "release-build-smoke / Build pack-action" },
          { "context": "release-build-smoke / Build pack-embed" }
        ]
      }
    }
  ],
  "bypass_actors": ${OSS_BYPASS_JSON}
}
JSON

upsert_ruleset "${ORG}/nowline" "main: CI must pass" "$TMP/nowline.json"
patch_repo_settings "${ORG}/nowline"

# ──────────────────────────────────────────────────────────────────────────────
# Tier 3 — Follower: lolay/nowline-action
#
# Publish-only repo (Marketplace mirror of `@nowline/action`).  No PR CI
# exists today and no agent-merge flow runs here — agent-triage marks
# this tier permanently out-of-scope.  Bypass list mirrors the OSS body
# via bypass_actors_json so the App can later push to main if a future
# release flow ever needs to (today nothing does).
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "=== Tier 3: Follower — ${ORG}/nowline-action ==="

FOLLOWER_BYPASS_JSON=$(bypass_actors_json "${ORG}/nowline-action")
cat > "$TMP/follower.json" <<JSON
{
  "name": "main: protected (follower)",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash", "merge", "rebase"]
      }
    }
  ],
  "bypass_actors": ${FOLLOWER_BYPASS_JSON}
}
JSON

upsert_ruleset "${ORG}/nowline-action" "main: protected (follower)" "$TMP/follower.json"
patch_repo_settings "${ORG}/nowline-action"

echo ""
echo "=== Done ==="
echo "Verify with:"
echo "  gh api repos/${ORG}/nowline/rulesets"
echo "  gh api repos/${ORG}/nowline-action/rulesets"
echo "  gh api repos/${ORG}/{nowline,nowline-action} --jq '{allow_auto_merge,allow_squash_merge,delete_branch_on_merge}'"
echo "  ./scripts/apply-branch-policies.sh   # re-run; should be a no-op"
