#!/usr/bin/env bash
# Re-issue the COPILOT_APP_REFRESH_TOKEN repo secret for cursor-engine-sync.yml.
#
# Run this in two situations:
#
#   1. Initial setup — first time you provision the cursor-engine-sync workflow.
#   2. Recovery — when the workflow fails with `bad_refresh_token`. Causes
#      include: the refresh chain was interrupted mid-rotation, the App was
#      re-created, the OAuth authorization was revoked, or 6 months elapsed
#      since the last successful run.
#
# Required tools: bash, curl, jq, gh (authenticated as a user with admin on
# lolay/nowline).
#
# Required browser session: log into github.com as a user with a Copilot
# Business/Enterprise seat. That user becomes the billable identity for every
# `copilot-swe-agent[bot]` assignment that this workflow makes.
#
# The script never echoes the client secret, code, or refresh token to stdout
# or stderr. The fresh refresh token is piped via stdin into `gh secret set`,
# so it doesn't appear in shell history or `ps` output either. After the
# script exits, run `clear && printf '\033[3J'` if you want to scrub the
# scrollback of the interactive prompts.
#
# Usage:
#     bash scripts/refresh-copilot-app-token.sh
#     APP_SLUG=other-app bash scripts/refresh-copilot-app-token.sh
#
# Env vars (optional):
#     REPO       — owner/name of the repo whose secret to update.
#                  Default: lolay/nowline
#     APP_SLUG   — URL slug of the GitHub App (in
#                  https://github.com/settings/apps/<slug>).
#                  Default: lolay-nowline-copilot-assign
#     SECRET     — name of the repo secret to write the refresh token into.
#                  Default: COPILOT_APP_REFRESH_TOKEN

set -euo pipefail

REPO=${REPO:-lolay/nowline}
APP_SLUG=${APP_SLUG:-lolay-nowline-copilot-assign}
SECRET=${SECRET:-COPILOT_APP_REFRESH_TOKEN}

for tool in curl jq gh; do
    if ! command -v "$tool" >/dev/null; then
        echo "Missing required tool: $tool" >&2
        exit 1
    fi
done

# Verify the gh-cli is talking to github.com and authenticated.
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
    echo "gh CLI not authenticated for github.com. Run: gh auth login" >&2
    exit 1
fi

# Verify we can actually write secrets on the target repo.
if ! gh api "/repos/$REPO" >/dev/null 2>&1; then
    echo "Cannot read $REPO — check repo name and your gh-cli auth." >&2
    exit 1
fi

cat <<INTRO

Refresh COPILOT_APP_REFRESH_TOKEN for $REPO

App settings:    https://github.com/settings/apps/$APP_SLUG
Copilot status:  https://github.com/settings/copilot   (verify you're logged in as a seated user)

You will need three pieces of input:
  1. The App's Client ID (an Iv2... string, shown on the App settings page).
  2. An OAuth authorization code (one-time use; obtained by opening the
     authorize URL below in the browser tab where you're logged in as the
     Copilot-seated user, clicking Authorize, then copying the ?code= value
     from the URL GitHub redirects you to).
  3. The App's Client Secret (Client secrets section of the same App settings
     page; generate a new one if you don't have it handy).

INTRO

read -r -p "Client ID (Iv2...): " CLIENT_ID
if [[ ! "$CLIENT_ID" =~ ^Iv[0-9]+[A-Za-z0-9]+$ ]]; then
    echo "Doesn't look like a Client ID (expected Iv<digits><alnum>)." >&2
    exit 1
fi

AUTH_URL="https://github.com/login/oauth/authorize?client_id=$CLIENT_ID"
echo
echo "Opening authorize URL:"
echo "  $AUTH_URL"
if command -v open >/dev/null; then
    open "$AUTH_URL" 2>/dev/null || true
fi
echo
echo "After clicking Authorize, GitHub redirects to the App's Callback URL"
echo "with ?code=<value>&... in the URL. Copy the code value (everything"
echo "between code= and the next & or end of string)."
echo

read -r -p "Code: " CODE
if [[ -z "$CODE" ]]; then
    echo "Empty code." >&2
    exit 1
fi

# Silent prompt so the secret doesn't echo to the terminal.
read -r -s -p "Client Secret: " CLIENT_SECRET
echo
if [[ -z "$CLIENT_SECRET" ]]; then
    echo "Empty client secret." >&2
    exit 1
fi

echo
echo "Exchanging code for token pair..."

RESPONSE=$(curl -sS -X POST https://github.com/login/oauth/access_token \
    -H "Accept: application/json" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" \
    -d "code=$CODE") || {
    echo "curl failed (network?)" >&2
    unset CLIENT_SECRET CODE RESPONSE
    exit 1
}

if ! jq -e 'has("refresh_token")' >/dev/null <<<"$RESPONSE"; then
    ERR=$(jq -r '.error // "unknown"' <<<"$RESPONSE")
    DESC=$(jq -r '.error_description // ""' <<<"$RESPONSE")
    echo "FAIL: $ERR — $DESC" >&2
    echo >&2
    echo "Common causes:" >&2
    echo "  - 'bad_verification_code': code was already redeemed once (single-use)" >&2
    echo "      or copied from a different App's authorize page. Restart with a" >&2
    echo "      fresh code by reopening the authorize URL." >&2
    echo "  - 'incorrect_client_credentials': Client Secret doesn't match the" >&2
    echo "      Client ID, or the secret was rotated. Generate a new Client" >&2
    echo "      Secret in App settings and try again." >&2
    echo "  - missing 'refresh_token' field: the App doesn't have 'User-to-server" >&2
    echo "      token expiration' enabled — toggle it on in App settings." >&2
    unset CLIENT_SECRET CODE RESPONSE
    exit 1
fi

EXP=$(jq -r .refresh_token_expires_in <<<"$RESPONSE")
DAYS=$(( EXP / 86400 ))
echo "  refresh_token TTL: ${EXP}s (~${DAYS} days)"

if [[ "$EXP" -lt 1000000 ]]; then
    echo
    echo "  WARNING: refresh_token TTL of ${DAYS} days is shorter than expected" >&2
    echo "  (refresh tokens normally live 6 months ≈ 180 days). Double-check" >&2
    echo "  that the App's 'User-to-server token expiration' setting is on." >&2
fi

echo
echo "Storing refresh_token into $REPO secret $SECRET (via stdin)..."
jq -r .refresh_token <<<"$RESPONSE" | gh secret set "$SECRET" -R "$REPO"

unset RESPONSE CLIENT_SECRET CODE CLIENT_ID

echo
echo "Verifying timestamp (should be now):"
gh api "/repos/$REPO/actions/secrets/$SECRET" --jq '{name, updated_at}'

cat <<DONE

Done.

Next steps:
  1. Scrub terminal scrollback:    clear && printf '\033[3J'
  2. Re-dispatch the workflow:     gh workflow run cursor-engine-sync.yml -R $REPO
  3. Watch the run:                gh run watch -R $REPO
DONE
