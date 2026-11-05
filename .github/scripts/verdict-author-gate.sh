#!/usr/bin/env bash
# Decide whether the author of a verdict comment may move the agent state
# machine. Called by .github/workflows/agent-verdict-apply.yml after the parse
# step finds a marker and before any label is applied.
#
# agent-verdict-apply.yml applies labels with GH_AW_AGENT_TOKEN, a write PAT,
# so the resulting labeled event carries the PAT owner as actor and passes
# gh-aw's role gate on the next phase. Without this check any commenter could
# push an issue into agent-plan / agent-deep or stamp maintainer-pr-safe on a
# PR, bypassing the agent-intake trust gate (r1.f4).
#
# Trusted authors:
#   - Maintainers: author_association OWNER, MEMBER or COLLABORATOR, confirmed
#     by the collaborators permission API as admin or write. Association alone
#     also admits read-only org members and collaborators. gh-aw phase
#     orchestrators land here: their safe-outputs comments are posted with
#     GH_AW_GITHUB_TOKEN, so the comment author is that PAT's owner. (gh-aw's
#     GITHUB_TOKEN fallback posts as github-actions[bot], but GitHub does not
#     fire issue_comment workflows for GITHUB_TOKEN events, so that identity
#     never reaches this script.)
#   - The Copilot coding agent (COPILOT_LOGINS, type Bot), limited to the
#     stop verdicts its implement-phase instructions allow (COPILOT_VERDICTS:
#     the empty-diff fallback pair, and maintainer-decide when make pre-commit
#     can't pass in scope). The session reads attacker-writable issue text, so
#     it gets no verdict that advances the flow.
#     Keep COPILOT_LOGINS in sync with copilot-pr-stamp.yml.
#
# Inputs (env): COMMENT_AUTHOR, COMMENT_AUTHOR_TYPE, COMMENT_ASSOCIATION,
# VERDICT, REPO, and GH_TOKEN for the permission lookup.
#
# Output: trusted=true|false to stdout and, when set, $GITHUB_OUTPUT. Always
# exits 0 on a decision; an untrusted author gets no follow-up comment, so the
# PAT can't be used to amplify spam. A failed permission lookup fails closed.

set -euo pipefail

COPILOT_LOGINS="Copilot copilot-swe-agent[bot]"
COPILOT_VERDICTS="agent-done originator-input maintainer-decide"

: "${COMMENT_AUTHOR:?}" "${COMMENT_AUTHOR_TYPE:?}" "${COMMENT_ASSOCIATION:?}" "${VERDICT:?}" "${REPO:?}"

in_list() {
    printf '%s' " $2 " | grep -qF " $1 "
}

decide() {
    echo "trusted=$1"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "trusted=$1" >> "$GITHUB_OUTPUT"
    fi
    echo "$2" >&2
    exit 0
}

if [[ "$COMMENT_AUTHOR_TYPE" == "Bot" ]] && in_list "$COMMENT_AUTHOR" "$COPILOT_LOGINS"; then
    if in_list "$VERDICT" "$COPILOT_VERDICTS"; then
        decide true "Copilot coding agent '$COMMENT_AUTHOR' may emit '$VERDICT'."
    fi
    decide false "Copilot coding agent '$COMMENT_AUTHOR' may only emit: $COPILOT_VERDICTS; ignoring '$VERDICT'."
fi

case "$COMMENT_ASSOCIATION" in
    OWNER | MEMBER | COLLABORATOR) ;;
    *) decide false "Author '$COMMENT_AUTHOR' has association '$COMMENT_ASSOCIATION'; verdicts need a maintainer. Ignoring." ;;
esac

permission=$(gh api "repos/$REPO/collaborators/$COMMENT_AUTHOR/permission" --jq '.permission' 2>/dev/null) || permission=""
case "$permission" in
    admin | write) decide true "Author '$COMMENT_AUTHOR' ($COMMENT_ASSOCIATION) has '$permission' permission." ;;
    *) decide false "Author '$COMMENT_AUTHOR' ($COMMENT_ASSOCIATION) has permission '${permission:-<lookup failed>}'; verdicts need write. Ignoring." ;;
esac
